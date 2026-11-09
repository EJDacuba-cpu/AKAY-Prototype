<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecordDraft;
use App\Models\Medicine;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ClinicalDraftSlotPreflight;
use App\Services\FollowUpTaskSyncService;
use App\Services\HealthRecordDraftPruner;
use App\Services\HealthRecordDraftService;
use App\Services\ReferralCreationService;
use App\Services\StaffRoles;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use LogicException;
use Mockery\MockInterface;
use RuntimeException;
use Tests\TestCase;

class HealthRecordDraftFinalizationTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhuA;

    private RuralHealthUnit $rhuB;

    private BarangayHealthCenter $bhcA;

    private BarangayHealthCenter $bhcB;

    private User $owner;

    private User $sameBhcUser;

    private User $otherBhcUser;

    private Patient $patientA;

    private Patient $patientSameBhc;

    private Patient $patientB;

    private Medicine $medicine;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rhuA = RuralHealthUnit::create(['name' => 'Finalization RHU A']);
        $this->rhuB = RuralHealthUnit::create(['name' => 'Finalization RHU B']);
        $this->seedAvailableProvider($this->rhuA);
        $this->seedAvailableProvider($this->rhuB);
        $this->bhcA = BarangayHealthCenter::create([
            'name' => 'Finalization BHC A',
            'rural_health_unit_id' => $this->rhuA->id,
        ]);
        $this->bhcB = BarangayHealthCenter::create([
            'name' => 'Finalization BHC B',
            'rural_health_unit_id' => $this->rhuB->id,
        ]);
        $this->owner = $this->user('Draft Owner', 'final-owner@example.test', $this->bhcA->id);
        $this->sameBhcUser = $this->user(
            'Same BHC BHW',
            'final-same@example.test',
            $this->bhcA->id
        );
        $this->otherBhcUser = $this->user(
            'Other BHC BHW',
            'final-other@example.test',
            $this->bhcB->id
        );
        $this->patientA = $this->patient('Final', 'Patient A', $this->bhcA->id);
        $this->patientSameBhc = $this->patient(
            'Binding',
            'Patient A2',
            $this->bhcA->id
        );
        $this->patientB = $this->patient('Other', 'Patient B', $this->bhcB->id);
        $this->medicine = Medicine::create([
            'name' => 'Atomic Medicine',
            'category' => 'Basic Medicines',
            'quantity' => 20,
            'low_stock_threshold' => 2,
            'unit' => 'tablets',
            'availability_status' => 'Available',
            'barangay_health_center_id' => $this->bhcA->id,
            'created_by' => $this->owner->id,
        ]);
        $this->medicine->expiryGroups()->create([
            'expiration_date' => now()->addYear()->toDateString(),
            'available_quantity' => 20,
            'quarantined_quantity' => 0,
        ]);
    }

    public function test_draft_consumption_failure_rolls_back_official_record_inventory_and_audits(): void
    {
        $draftId = $this->createDraft();
        $ciphertext = HealthRecordDraft::where('public_id', $draftId)
            ->value('encrypted_payload');
        DB::unprepared(<<<'SQL'
            CREATE TRIGGER fail_health_record_draft_consumption
            BEFORE UPDATE OF status ON health_record_drafts
            WHEN NEW.status = 'consumed'
            BEGIN
                SELECT RAISE(ABORT, 'forced draft consumption failure');
            END
        SQL);

        $this->finalize($draftId, (string) Str::uuid(), $this->officialPayload())
            ->assertStatus(500);

        $draft = HealthRecordDraft::where('public_id', $draftId)->firstOrFail();
        $this->assertSame(HealthRecordDraft::STATUS_ACTIVE, $draft->status);
        $this->assertSame($ciphertext, $draft->encrypted_payload);
        $this->assertNull($draft->consumed_health_record_id);
        $this->assertSame(20, $this->medicine->fresh()->quantity);
        $this->assertDatabaseCount('health_records', 0);
        $this->assertDatabaseCount('health_record_medicines', 0);
        $this->assertDatabaseCount('medicine_inventory_transactions', 0);
        $this->assertDatabaseCount('audit_logs', 1);
    }

    public function test_clinical_recovery_keys_are_retired_by_successful_finalization(): void
    {
        [$draftId, $uuid, $key] = $this->clinicalRecoveryDraft();
        $this->finalize($draftId, (string) Str::uuid(), [...$this->officialPayload(), 'consultation_uuid' => $uuid])->assertCreated();
        $this->assertDatabaseHas('clinical_recovery_identities', ['consultation_uuid' => $uuid, 'status' => 'consumed']);
        $this->assertDatabaseHas('form_draft_recovery_keys', ['public_id' => $key['key_id'], 'status' => 'consumed', 'encrypted_key' => null]);
    }

    public function test_clinical_recovery_discard_blocks_old_identity_but_allows_fresh_work(): void
    {
        [$draftId, $uuid, $key] = $this->clinicalRecoveryDraft();
        $this->deleteJson('/api/health-record-drafts/'.$draftId)->assertNoContent();
        $this->assertDatabaseHas('clinical_recovery_identities', ['consultation_uuid' => $uuid, 'status' => 'discarded']);
        $this->assertDatabaseHas('form_draft_recovery_keys', ['public_id' => $key['key_id'], 'status' => 'discarded', 'encrypted_key' => null]);
        $input = [...$this->draftRequest($this->draftPayload()), 'consultation_uuid' => $uuid];
        $this->postJson('/api/health-record-drafts', $input)->assertConflict();
        $this->postJson('/api/health-record-drafts', [...$input, 'consultation_uuid' => (string) Str::uuid()])->assertCreated();
    }

    public function test_clinical_recovery_expiry_retires_keys_before_background_pruning(): void
    {
        [$draftId, $uuid, $key] = $this->clinicalRecoveryDraft();
        HealthRecordDraft::where('public_id', $draftId)->update(['expires_at' => now()->subSecond()]);
        $this->getJson('/api/health-record-drafts/'.$draftId)->assertNotFound();
        $this->assertDatabaseHas('clinical_recovery_identities', ['consultation_uuid' => $uuid, 'status' => 'expired']);
        $this->assertDatabaseHas('form_draft_recovery_keys', ['public_id' => $key['key_id'], 'status' => 'expired', 'encrypted_key' => null]);
    }

    private function clinicalRecoveryDraft(): array
    {
        $uuid = (string) Str::uuid();
        $id = $this->actingAs($this->owner, 'sanctum')->postJson('/api/health-record-drafts', [...$this->draftRequest($this->draftPayload()), 'consultation_uuid' => $uuid])->assertCreated()->json('data.id');
        $key = $this->postJson('/api/form-drafts/device-key', ['form_type' => 'consultation', 'mode' => 'edit', 'context_key' => 'patient:'.$this->patientA->id, 'transaction_uuid' => $uuid])->assertOk()->json('data');

        return [$id, $uuid, $key];
    }

    public function test_scheduled_expiry_retires_clinical_keys_and_survives_row_pruning(): void
    {
        [$draftId, $uuid, $key] = $this->clinicalRecoveryDraft();
        HealthRecordDraft::where('public_id', $draftId)->update(['expires_at' => now()->subSecond()]);
        $this->assertSame(1, app(HealthRecordDraftPruner::class)->prune()['expired']);
        $this->assertDatabaseHas('form_draft_recovery_keys', ['public_id' => $key['key_id'], 'status' => 'expired', 'encrypted_key' => null]);
        HealthRecordDraft::where('public_id', $draftId)->update(['updated_at' => now()->subDays(8)]);
        $this->assertSame(1, app(HealthRecordDraftPruner::class)->prune()['pruned']);
        $this->postJson('/api/health-record-drafts', [...$this->draftRequest($this->draftPayload()), 'consultation_uuid' => $uuid])->assertConflict();
    }

    public function test_device_only_finalization_retires_identity_and_preserves_successful_retry(): void
    {
        $uuid = (string) Str::uuid();
        $input = ['form_type' => 'consultation', 'mode' => 'edit', 'context_key' => 'patient:'.$this->patientA->id, 'transaction_uuid' => $uuid];
        $key = $this->actingAs($this->owner, 'sanctum')->postJson('/api/form-drafts/device-key', $input)->assertOk()->json('data');
        $idempotency = (string) Str::uuid();
        $payload = [...$this->officialPayload(), 'consultation_uuid' => $uuid];
        $this->withHeader('Idempotency-Key', $idempotency)->postJson('/api/health-records', $payload)->assertCreated();
        $this->assertDatabaseHas('form_draft_recovery_keys', ['public_id' => $key['key_id'], 'status' => 'consumed', 'encrypted_key' => null]);
        $this->withHeader('Idempotency-Key', $idempotency)->postJson('/api/health-records', $payload)->assertOk();
        $this->assertDatabaseCount('health_records', 1);
        $this->postJson('/api/form-drafts/device-key', $input)->assertConflict();
    }

    public function test_finalization_cannot_switch_to_a_different_consultation_identity(): void
    {
        [$draftId, $uuid] = $this->clinicalRecoveryDraft();
        $this->finalize($draftId, (string) Str::uuid(), [...$this->officialPayload(), 'consultation_uuid' => (string) Str::uuid()])->assertConflict();
        $this->assertDatabaseCount('health_records', 0);
        $this->assertDatabaseHas('clinical_recovery_identities', ['consultation_uuid' => $uuid, 'status' => 'active']);
    }

    public function test_failed_finalization_keeps_device_recovery_and_draft_active(): void
    {
        [$draftId, $uuid, $key] = $this->clinicalRecoveryDraft();
        DB::unprepared(<<<'SQL'
            CREATE TRIGGER fail_recovery_consumption
            BEFORE UPDATE OF status ON health_record_drafts
            WHEN NEW.status = 'consumed'
            BEGIN
                SELECT RAISE(ABORT, 'forced draft consumption failure');
            END
        SQL);
        $this->finalize($draftId, (string) Str::uuid(), [...$this->officialPayload(), 'consultation_uuid' => $uuid])->assertStatus(500);
        $this->assertDatabaseCount('health_records', 0);
        $this->assertDatabaseHas('health_record_drafts', ['public_id' => $draftId, 'status' => 'active']);
        $this->assertDatabaseHas('clinical_recovery_identities', ['consultation_uuid' => $uuid, 'status' => 'active']);
        $this->assertNotNull(DB::table('form_draft_recovery_keys')->where('public_id', $key['key_id'])->value('encrypted_key'));
    }

    public function test_clinical_key_can_be_reopened_only_by_its_current_authorized_owner(): void
    {
        [$draftId, $uuid, $key] = $this->clinicalRecoveryDraft();
        $path = '/api/form-drafts/clinical-key/'.$key['key_id'];
        $this->postJson($path)->assertOk()->assertJsonPath('data.key_material', $key['key_material']);
        $this->actingAs($this->sameBhcUser, 'sanctum')->postJson($path)->assertNotFound();
        $this->actingAs($this->otherBhcUser, 'sanctum')->postJson($path)->assertNotFound();
        $this->actingAs($this->owner, 'sanctum')->deleteJson('/api/health-record-drafts/'.$draftId)->assertNoContent();
        $this->postJson($path)->assertConflict()->assertJsonPath('code', 'CLINICAL_RECOVERY_ENDED');
    }

    public function test_legacy_checkpoint_migration_reauthorizes_patient_and_filters_restricted_history(): void
    {
        $this->owner->update(['permissions' => StaffRoles::defaults('encoder')]);
        $input = [
            'form_type' => 'consultation', 'mode' => 'edit', 'context_key' => 'patient:'.$this->patientA->id,
            'transaction_uuid' => (string) Str::uuid(),
            'payload' => [...$this->draftPayload(), 'backgroundUpdate' => ['sections' => [], 'baseRevisions' => []]],
        ];
        $response = $this->actingAs($this->owner->fresh(), 'sanctum')->postJson('/api/form-drafts/clinical-migrate', $input)->assertOk();
        $this->assertArrayNotHasKey('backgroundUpdate', $response->json('data.payload'));
        $this->assertSame($input['payload']['chiefComplaint'], $response->json('data.payload.chiefComplaint'));
        $this->assertDatabaseCount('health_record_drafts', 0);
        $this->actingAs($this->otherBhcUser, 'sanctum')->postJson('/api/form-drafts/clinical-migrate', $input)->assertForbidden();
    }

    public function test_device_only_clinical_discard_is_owner_bound_and_idempotent(): void
    {
        $input = ['form_type' => 'consultation', 'mode' => 'edit', 'context_key' => 'patient:'.$this->patientA->id, 'transaction_uuid' => (string) Str::uuid()];
        $key = $this->actingAs($this->owner, 'sanctum')->postJson('/api/form-drafts/device-key', $input)->assertOk()->json('data');
        $body = [...$input, 'key_id' => $key['key_id']];
        $this->actingAs($this->sameBhcUser, 'sanctum')->postJson('/api/form-drafts/clinical-discard', $body)->assertNotFound();
        $this->actingAs($this->owner, 'sanctum')->postJson('/api/form-drafts/clinical-discard', $body)->assertNoContent();
        $this->postJson('/api/form-drafts/clinical-discard', $body)->assertNoContent();
        $this->assertDatabaseHas('form_draft_recovery_keys', ['public_id' => $key['key_id'], 'status' => 'discarded', 'encrypted_key' => null]);
        $this->postJson('/api/health-record-drafts', [...$this->draftRequest($this->draftPayload()), 'consultation_uuid' => $input['transaction_uuid']])->assertConflict();
    }

    public function test_device_discard_cannot_bypass_a_shared_server_draft_editor(): void
    {
        [$draftId, $uuid, $key] = $this->clinicalRecoveryDraft();
        $this->postJson('/api/form-drafts/clinical-discard', ['form_type' => 'consultation', 'mode' => 'edit', 'context_key' => 'patient:'.$this->patientA->id, 'transaction_uuid' => $uuid, 'key_id' => $key['key_id']])->assertConflict();
        $this->assertDatabaseHas('health_record_drafts', ['public_id' => $draftId, 'status' => 'active']);
    }

    public function test_versioned_discard_cannot_remove_a_newer_clinical_revision(): void
    {
        [$draftId, $uuid, $key] = $this->clinicalRecoveryDraft();
        $this->deleteJson('/api/health-record-drafts/'.$draftId, ['version' => 2])->assertConflict();
        $this->assertDatabaseHas('health_record_drafts', ['public_id' => $draftId, 'status' => 'active', 'version' => 1]);
        $this->assertDatabaseHas('clinical_recovery_identities', ['consultation_uuid' => $uuid, 'status' => 'active']);
        $this->deleteJson('/api/health-record-drafts/'.$draftId, ['version' => 1])->assertNoContent();
    }

    public function test_different_users_and_new_uuids_cannot_split_one_patients_active_consultation(): void
    {
        [$draftId] = $this->clinicalRecoveryDraft();
        $this->actingAs($this->sameBhcUser, 'sanctum')->postJson('/api/health-record-drafts', [...$this->draftRequest($this->draftPayload()), 'consultation_uuid' => (string) Str::uuid()])
            ->assertConflict()->assertJsonPath('code', 'DRAFT_CONSULTATION_EXISTS')->assertJsonPath('draft_id', $draftId);
        $this->assertDatabaseCount('health_record_drafts', 1);
    }

    public function test_database_rejects_a_second_active_clinical_slot_even_with_a_different_uuid(): void
    {
        [$draftId] = $this->clinicalRecoveryDraft();
        $duplicate = HealthRecordDraft::where('public_id', $draftId)->firstOrFail()->replicate();
        $duplicate->public_id = (string) Str::uuid();
        $duplicate->consultation_uuid = (string) Str::uuid();
        $this->expectException(QueryException::class);
        $duplicate->save();
    }

    public function test_legacy_duplicate_preflight_reports_identifiers_without_deleting_or_exposing_payloads(): void
    {
        [$draftId] = $this->clinicalRecoveryDraft();
        DB::statement('DROP INDEX IF EXISTS clinical_draft_active_bhc_patient');
        $duplicate = HealthRecordDraft::where('public_id', $draftId)->firstOrFail()->replicate();
        $duplicate->public_id = (string) Str::uuid();
        $duplicate->consultation_uuid = (string) Str::uuid();
        $duplicate->save();
        $report = app(ClinicalDraftSlotPreflight::class)->conflicts();
        $this->assertCount(1, $report);
        $this->assertEqualsCanonicalizing([$draftId, $duplicate->public_id], $report[0]['draft_ids']);
        $this->assertArrayNotHasKey('encrypted_payload', $report[0]);
        $this->assertDatabaseCount('health_record_drafts', 2);
        $migration = require database_path('migrations/2026_11_08_000002_guard_active_clinical_draft_slots.php');
        try {
            $migration->up();
            $this->fail('Conflicting legacy drafts must block the unique-slot migration.');
        } catch (RuntimeException $exception) {
            $this->assertStringContainsString('health-record-drafts:preflight-slots', $exception->getMessage());
            $this->assertDatabaseCount('health_record_drafts', 2);
        }
    }

    public function test_clinical_create_rechecks_history_permission_after_acquiring_the_user_lock(): void
    {
        $this->owner->update(['permissions' => [...StaffRoles::defaults('encoder'), 'clinical.history']]);
        $this->actingAs($this->owner->fresh(), 'sanctum');
        $revoked = false;
        DB::listen(function ($query) use (&$revoked) {
            if ($revoked || ! str_contains(strtolower($query->sql), 'insert') || ! str_contains($query->sql, 'clinical_recovery_identities')) {
                return;
            }
            $revoked = true;
            DB::table('users')->where('id', $this->owner->id)->update(['permissions' => json_encode(StaffRoles::defaults('encoder'), JSON_THROW_ON_ERROR)]);
        });
        $this->postJson('/api/health-record-drafts', [...$this->draftRequest([
            ...$this->draftPayload(),
            'backgroundUpdate' => ['sections' => ['medical' => ['currentDiseases' => [['note' => 'Partial history']]]], 'baseRevisions' => ['medical' => 0]],
        ]), 'consultation_uuid' => (string) Str::uuid()])->assertForbidden();
        $this->assertTrue($revoked);
        $this->assertDatabaseCount('health_record_drafts', 0);
    }

    public function test_exact_patient_draft_lookup_returns_only_authorized_metadata_and_an_empty_slot(): void
    {
        [$draftId] = $this->clinicalRecoveryDraft();
        $this->getJson('/api/health-record-drafts/lookup?patient_id='.$this->patientA->id)->assertOk()
            ->assertJsonPath('data.id', $draftId)->assertJsonMissingPath('data.payload')->assertJsonMissingPath('data.encrypted_payload');
        $this->getJson('/api/health-record-drafts/lookup?patient_id='.$this->patientSameBhc->id)->assertOk()->assertJsonPath('data', null);
        $this->actingAs($this->otherBhcUser, 'sanctum')->getJson('/api/health-record-drafts/lookup?patient_id='.$this->patientA->id)->assertUnprocessable();
    }

    public function test_legacy_consultation_identity_cannot_be_poisoned_by_another_facility(): void
    {
        [$draftId, $uuid, $key] = $this->clinicalRecoveryDraft();
        DB::table('clinical_recovery_identities')->where('consultation_uuid', $uuid)->delete();
        $this->actingAs($this->otherBhcUser, 'sanctum')->postJson('/api/health-record-drafts', [...$this->draftRequest(['chiefComplaint' => 'Other facility input']), 'patient_id' => $this->patientB->id, 'consultation_uuid' => $uuid])->assertConflict();
        $this->assertDatabaseCount('health_record_drafts', 1);
        $this->actingAs($this->owner, 'sanctum')->postJson('/api/form-drafts/clinical-key/'.$key['key_id'])->assertOk();
        $this->assertDatabaseHas('health_record_drafts', ['public_id' => $draftId, 'status' => 'active']);
    }

    public function test_legacy_official_record_without_a_tombstone_blocks_identity_recreation(): void
    {
        $uuid = (string) Str::uuid();
        $this->actingAs($this->owner, 'sanctum')->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [...$this->officialPayload(), 'consultation_uuid' => $uuid])->assertCreated();
        DB::table('clinical_recovery_identities')->where('consultation_uuid', $uuid)->delete();
        $this->postJson('/api/health-record-drafts', [...$this->draftRequest($this->draftPayload()), 'consultation_uuid' => $uuid])->assertConflict();
        $this->assertDatabaseCount('health_record_drafts', 0);
        $this->assertDatabaseCount('health_records', 1);
    }

    public function test_pruning_legacy_terminal_draft_preserves_its_identity_tombstone(): void
    {
        [$draftId, $uuid, $key] = $this->clinicalRecoveryDraft();
        HealthRecordDraft::where('public_id', $draftId)->update(['status' => 'discarded', 'encrypted_payload' => null, 'updated_at' => now()->subDays(8)]);
        DB::table('clinical_recovery_identities')->where('consultation_uuid', $uuid)->delete();
        $this->assertSame(1, app(HealthRecordDraftPruner::class)->prune()['pruned']);
        $this->assertDatabaseHas('clinical_recovery_identities', ['consultation_uuid' => $uuid, 'status' => 'discarded']);
        $this->assertDatabaseHas('form_draft_recovery_keys', ['public_id' => $key['key_id'], 'encrypted_key' => null]);
        $this->postJson('/api/health-record-drafts', [...$this->draftRequest($this->draftPayload()), 'consultation_uuid' => $uuid])->assertConflict();
    }

    public function test_clinical_draft_limit_is_per_owner_and_not_a_global_cap(): void
    {
        config(['health_record_drafts.max_active_per_user' => 1]);
        $this->createDraft();
        $input = [...$this->draftRequest($this->draftPayload()), 'patient_id' => $this->patientSameBhc->id];
        $this->actingAs($this->sameBhcUser, 'sanctum')->postJson('/api/health-record-drafts', $input)->assertCreated();
        $third = $this->patient('Limit', 'Third patient', $this->bhcA->id);
        $this->postJson('/api/health-record-drafts', [...$input, 'patient_id' => $third->id])->assertUnprocessable();
    }

    public function test_finalization_lock_service_requires_an_open_transaction(): void
    {
        $draftId = $this->createDraft();
        $service = app(HealthRecordDraftService::class);
        DB::partialMock()
            ->shouldReceive('transactionLevel')
            ->once()
            ->andReturn(0);

        $this->expectException(LogicException::class);
        $this->expectExceptionMessage('requires the official health-record transaction');
        $service->lockForOfficialSave(
            $this->owner,
            $draftId,
            $this->patientA->id,
            'General Consultation'
        );
    }

    public function test_referral_failure_rolls_back_official_work_and_keeps_encrypted_draft(): void
    {
        $draftId = $this->createDraft();
        $ciphertext = HealthRecordDraft::where('public_id', $draftId)
            ->value('encrypted_payload');
        $this->mock(ReferralCreationService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('create')
                ->once()
                ->andThrow(new RuntimeException('forced referral failure'));
        });
        $payload = [
            ...$this->officialPayload(),
            // A referral requires a BHC Assessment (HealthRecordRequest.php:460).
            'diagnosis' => 'Needs RHU assessment',
            'needs_referral' => true,
            'referral' => [
                'reason_for_referral' => 'Requires RHU assessment.',
                'urgency_level' => 'Routine',
            ],
        ];

        $this->finalize($draftId, (string) Str::uuid(), $payload)
            ->assertStatus(500);

        $this->assertDraftRemainsActive($draftId, $ciphertext);
        $this->assertSame(20, $this->medicine->fresh()->quantity);
        $this->assertDatabaseCount('health_records', 0);
        $this->assertDatabaseCount('medicine_inventory_transactions', 0);
        $this->assertDatabaseCount('referrals', 0);
        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_follow_up_failure_rolls_back_official_work_and_keeps_draft_active(): void
    {
        $draftId = $this->createDraft();
        $ciphertext = HealthRecordDraft::where('public_id', $draftId)
            ->value('encrypted_payload');
        $this->mock(FollowUpTaskSyncService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('lockTaskForProcessing')->once()->andReturnNull();
            // store() also locks additional tasks before syncRecord (HealthRecordController.php:232).
            $mock->shouldReceive('lockAdditionalTasks')->once()->andReturn(collect());
            $mock->shouldReceive('syncRecord')
                ->once()
                ->andThrow(new RuntimeException('forced follow-up failure'));
        });

        $this->finalize($draftId, (string) Str::uuid(), $this->officialPayload())
            ->assertStatus(500);

        $this->assertDraftRemainsActive($draftId, $ciphertext);
        $this->assertSame(20, $this->medicine->fresh()->quantity);
        $this->assertDatabaseCount('health_records', 0);
        $this->assertDatabaseCount('medicine_inventory_transactions', 0);
        $this->assertDatabaseCount('follow_up_tasks', 0);
    }

    public function test_two_finalization_attempts_create_one_record_while_same_key_replays(): void
    {
        $draftId = $this->createDraft();
        $key = (string) Str::uuid();
        $payload = $this->officialPayload();

        $created = $this->finalize($draftId, $key, $payload)->assertCreated();
        $recordId = $created->json('data.id');
        $this->finalize($draftId, $key, $payload)
            ->assertOk()
            ->assertJsonPath('idempotent_replay', true)
            ->assertJsonPath('result.health_record_id', $recordId);
        $this->finalize($draftId, $key, [
            ...$payload,
            'chief_complaint' => 'Changed replay payload.',
        ])->assertConflict()->assertJsonPath(
            'code',
            'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH'
        );
        $this->finalize($draftId, (string) Str::uuid(), $payload)
            ->assertConflict()
            ->assertJsonPath('code', 'DRAFT_ALREADY_CONSUMED');

        $this->assertDatabaseCount('health_records', 1);
        $this->assertDatabaseCount('health_record_medicines', 1);
        $this->assertDatabaseCount('medicine_inventory_transactions', 1);
        $this->assertSame(18, $this->medicine->fresh()->quantity);
        $this->assertDatabaseHas('health_record_drafts', [
            'public_id' => $draftId,
            'status' => HealthRecordDraft::STATUS_CONSUMED,
            'consumed_health_record_id' => $recordId,
            'encrypted_payload' => null,
        ]);
    }

    public function test_body_findings_keep_region_side_and_location_through_draft_and_finalization(): void
    {
        $draftId = $this->createDraft([
            ...$this->draftPayload(),
            'bodyFindings' => [
                ['id' => 'f1', 'region' => 'chest', 'side' => 'back', 'location' => 'Upper spine', 'finding' => 'Rash', 'note' => '2 days'],
                ['id' => 'f2', 'region' => 'left_leg', 'location' => 'Knee', 'finding' => 'Swelling'],
            ],
        ]);

        $draft = $this->actingAs($this->owner, 'sanctum')
            ->getJson("/api/health-record-drafts/$draftId")
            ->assertOk()
            ->assertJsonPath('data.payload.bodyFindings.0.region', 'chest')
            ->assertJsonPath('data.payload.bodyFindings.0.side', 'back')
            ->assertJsonPath('data.payload.bodyFindings.0.location', 'Upper spine')
            ->assertJsonPath('data.payload.bodyFindings.1.region', 'left_leg')
            ->assertJsonPath('data.payload.bodyFindings.1.location', 'Knee')
            ->assertJsonMissingPath('data.payload.bodyFindings.1.side');

        $recordId = $this->finalize($draftId, (string) Str::uuid(), [
            ...$this->officialPayload(),
            'body_findings' => [
                ['id' => 'f1', 'region' => 'chest', 'side' => 'back', 'location' => 'Upper spine', 'finding' => 'Rash', 'note' => '2 days'],
                ['id' => 'f2', 'region' => 'left_leg', 'side' => 'front', 'location' => 'Knee', 'finding' => 'Swelling'],
            ],
        ], ['X-Draft-Version' => (string) $draft->json('data.version')])->assertCreated()->json('data.id');

        $this->actingAs($this->owner, 'sanctum')
            ->getJson("/api/health-records/$recordId")
            ->assertOk()
            ->assertJsonPath('data.body_findings.0.region', 'chest')
            ->assertJsonPath('data.body_findings.0.side', 'back')
            ->assertJsonPath('data.body_findings.0.location', 'Upper spine')
            ->assertJsonPath('data.body_findings.1.region', 'left_leg')
            ->assertJsonPath('data.body_findings.1.side', 'front')
            ->assertJsonPath('data.body_findings.1.location', 'Knee');
    }

    public function test_draft_binding_and_terminal_states_are_enforced_before_official_creation(): void
    {
        $patientMismatch = $this->createDraft();
        $this->finalize($patientMismatch, (string) Str::uuid(), [
            ...$this->officialPayload(),
            'patient_id' => $this->patientSameBhc->id,
        ])->assertUnprocessable()->assertJsonValidationErrors('draft');

        $classificationMismatch = $patientMismatch;
        $this->finalize($classificationMismatch, (string) Str::uuid(), [
            'patient_id' => $this->patientA->id,
            'category' => 'Maternal',
            'chief_complaint' => 'Atomic finalization visit.',
        ])->assertUnprocessable()->assertJsonValidationErrors('draft');

        $otherOwnerDraft = $patientMismatch;
        $this->actingAs($this->sameBhcUser, 'sanctum')
            ->withHeaders($this->officialHeaders((string) Str::uuid(), $otherOwnerDraft))
            ->postJson('/api/health-records', [
                'patient_id' => $this->patientA->id,
                'category' => 'General Consultation',
                // chief_complaint is required on POST (HealthRecordRequest.php:281).
                'chief_complaint' => 'Atomic finalization visit.',
            ])
            // A shared BHC encounter: the colleague finds it but does not hold its edit lease.
            ->assertConflict();

        $otherFacilityDraft = $patientMismatch;
        $this->actingAs($this->otherBhcUser, 'sanctum')
            ->withHeaders($this->officialHeaders((string) Str::uuid(), $otherFacilityDraft))
            ->postJson('/api/health-records', [
                'patient_id' => $this->patientB->id,
                'category' => 'General Consultation',
                'chief_complaint' => 'Atomic finalization visit.',
            ])
            ->assertNotFound();

        $expiredDraft = $patientMismatch;
        HealthRecordDraft::where('public_id', $expiredDraft)->update([
            'expires_at' => now()->subMinute(),
        ]);
        $expiredCiphertext = HealthRecordDraft::where('public_id', $expiredDraft)
            ->value('encrypted_payload');
        $this->finalize($expiredDraft, (string) Str::uuid(), $this->officialPayload())
            ->assertConflict()
            ->assertJsonPath('code', 'DRAFT_FINALIZATION_CONFLICT');
        $this->assertDraftRemainsActive($expiredDraft, $expiredCiphertext);

        $discardedDraft = $this->createDraft();
        $this->actingAs($this->owner, 'sanctum')
            ->deleteJson("/api/health-record-drafts/{$discardedDraft}")
            ->assertNoContent();
        $this->finalize($discardedDraft, (string) Str::uuid(), $this->officialPayload())
            ->assertConflict()
            ->assertJsonPath('code', 'DRAFT_FINALIZATION_CONFLICT');

        $this->assertDatabaseCount('health_records', 0);
        $this->assertSame(20, $this->medicine->fresh()->quantity);
    }

    public function test_custom_header_validation_and_absent_header_ordinary_save_contract(): void
    {
        $this->actingAs($this->owner, 'sanctum')
            ->withHeaders($this->officialHeaders((string) Str::uuid(), 'not-a-uuid'))
            ->postJson('/api/health-records', [
                'patient_id' => $this->patientA->id,
                'category' => 'General Consultation',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('draft_public_id');

        $this->flushHeaders();
        $this->actingAs($this->owner, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson('/api/health-records', [
                'patient_id' => $this->patientA->id,
                'category' => 'General Consultation',
                // chief_complaint is required on POST (HealthRecordRequest.php:281).
                'chief_complaint' => 'Atomic finalization visit.',
            ])
            ->assertCreated();

        $this->assertDatabaseCount('health_records', 1);
        $this->assertDatabaseCount('health_record_drafts', 0);
    }

    public function test_twenty_active_drafts_are_allowed_and_twenty_first_is_rejected(): void
    {
        $this->assertSame(20, config('health_record_drafts.max_active_per_user'));
        for ($index = 1; $index <= 20; $index++) {
            $this->createDraft(['diagnosis' => "Allowed draft {$index}"], patient: $this->patient('Limit', 'Patient '.$index, $this->bhcA->id));
        }

        $this->actingAs($this->owner, 'sanctum')
            ->postJson('/api/health-record-drafts', $this->draftRequest([
                'diagnosis' => 'Twenty-first draft.',
            ]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('draft');
        $this->assertDatabaseCount('health_record_drafts', 20);
    }

    public function test_consumed_and_expired_drafts_do_not_count_against_active_limit(): void
    {
        config(['health_record_drafts.max_active_per_user' => 1]);
        $consumed = $this->createDraft();
        HealthRecordDraft::where('public_id', $consumed)->update([
            'status' => HealthRecordDraft::STATUS_CONSUMED,
            'encrypted_payload' => null,
        ]);

        $expired = $this->createDraft(['diagnosis' => 'Will expire.']);
        HealthRecordDraft::where('public_id', $expired)->update([
            'expires_at' => now()->subMinute(),
        ]);

        $active = $this->createDraft(['diagnosis' => 'Allowed active draft.']);

        $this->assertDatabaseHas('health_record_drafts', [
            'public_id' => $active,
            'status' => HealthRecordDraft::STATUS_ACTIVE,
        ]);
        $this->assertSame(3, HealthRecordDraft::count());
    }

    public function test_payload_limit_accepts_within_limit_and_rejects_above_without_truncation(): void
    {
        $withinHistory = array_fill(0, 29, [
            'pregnancyNo' => '1',
            'placeOfDelivery' => 'BHC',
            'year' => '2025',
            'notes' => str_repeat('W', 8800),
        ]);
        $withinPayload = [
            'maternalData' => ['previousPregnancyHistory' => $withinHistory],
        ];
        $this->assertLessThanOrEqual(
            262144,
            strlen(json_encode($withinPayload, JSON_THROW_ON_ERROR))
        );
        $draftId = $this->createDraft($withinPayload, 'Maternal');
        $this->actingAs($this->owner, 'sanctum')
            ->getJson("/api/health-record-drafts/{$draftId}")
            ->assertOk()
            ->assertJsonPath(
                'data.payload.maternalData.previousPregnancyHistory.28.notes',
                str_repeat('W', 8800)
            );

        $abovePayload = [
            'maternalData' => ['previousPregnancyHistory' => array_fill(0, 30, [
                'pregnancyNo' => '1',
                'placeOfDelivery' => 'BHC',
                'year' => '2025',
                'notes' => str_repeat('A', 9000),
            ])],
        ];
        $this->assertGreaterThan(
            262144,
            strlen(json_encode($abovePayload, JSON_THROW_ON_ERROR))
        );
        $this->actingAs($this->owner, 'sanctum')
            ->postJson('/api/health-record-drafts', $this->draftRequest(
                $abovePayload,
                'Maternal'
            ))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('payload');
        $this->assertDatabaseCount('health_record_drafts', 1);
    }

    public function test_named_write_rate_limit_rejects_request_above_configured_limit(): void
    {
        $this->assertSame(30, config('health_record_drafts.write_rate_limit_per_minute'));
        config(['health_record_drafts.max_active_per_user' => 100]);
        for ($index = 1; $index <= 30; $index++) {
            $this->createDraft(['diagnosis' => "Rate draft {$index}"], patient: $this->patient('Rate', 'Patient '.$index, $this->bhcA->id));
        }

        $this->actingAs($this->owner, 'sanctum')
            ->postJson('/api/health-record-drafts', $this->draftRequest([
                'diagnosis' => 'Rate limited draft.',
            ]))
            ->assertTooManyRequests();
        $this->assertDatabaseCount('health_record_drafts', 30);
    }

    public function test_draft_list_is_paginated_at_fifteen_and_request_cannot_exceed_bound(): void
    {
        $service = app(HealthRecordDraftService::class);
        for ($index = 1; $index <= 20; $index++) {
            $service->create($this->owner, [...$this->draftRequest([
                'diagnosis' => "Paged draft {$index}",
            ]), 'patient_id' => $this->patient('Paging', 'Patient '.$index, $this->bhcA->id)->id]);
        }

        $this->actingAs($this->owner, 'sanctum')
            ->getJson('/api/health-record-drafts')
            ->assertOk()
            ->assertJsonCount(15, 'data.data')
            ->assertJsonPath('data.per_page', 15)
            ->assertJsonPath('data.total', 20)
            ->assertJsonPath('data.last_page', 2)
            ->assertJsonMissingPath('data.data.0.payload');
        $this->actingAs($this->owner, 'sanctum')
            ->getJson('/api/health-record-drafts?per_page=1000&page=2')
            ->assertOk()
            ->assertJsonCount(5, 'data.data')
            ->assertJsonPath('data.per_page', 15);
    }

    private function createDraft(
        ?array $payload = null,
        string $classification = 'General Consultation',
        ?Patient $patient = null,
    ): string {
        return $this->actingAs($this->owner, 'sanctum')
            ->postJson('/api/health-record-drafts', [...$this->draftRequest(
                $payload ?? $this->draftPayload(),
                $classification
            ), 'patient_id' => $patient?->id ?? $this->patientA->id])
            ->assertCreated()
            ->json('data.id');
    }

    private function finalize(string $draftId, string $key, array $payload, array $extraHeaders = [])
    {
        // Finalizing from a draft requires the draft's current version (HealthRecordDraftService.php:367).
        $version = (string) HealthRecordDraft::where('public_id', $draftId)->value('version');

        return $this->actingAs($this->owner, 'sanctum')
            ->withHeaders([
                ...$this->officialHeaders($key, $draftId),
                ...($version !== '' ? ['X-Draft-Version' => $version] : []),
                ...$extraHeaders,
            ])
            ->postJson('/api/health-records', $payload);
    }

    private function officialHeaders(string $key, string $draftId): array
    {
        return [
            'Idempotency-Key' => $key,
            'X-Health-Record-Draft-ID' => $draftId,
        ];
    }

    private function officialPayload(): array
    {
        return [
            'patient_id' => $this->patientA->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Atomic finalization visit.',
            // Only an item marked given deducts stock (HealthRecordController.php:298).
            'dispensed_medicines' => [[
                'medicine_id' => $this->medicine->id,
                'quantity' => 2,
                'confirmed_given' => true,
            ]],
        ];
    }

    private function draftPayload(): array
    {
        return [
            'chiefComplaint' => 'Draft complaint.',
            'diagnosis' => 'Draft diagnosis.',
            'dispensedMedicines' => [[
                'medicineId' => $this->medicine->id,
                'quantity' => 2,
            ]],
        ];
    }

    private function draftRequest(
        array $payload,
        string $classification = 'General Consultation'
    ): array {
        return [
            'patient_id' => $this->patientA->id,
            'classification' => $classification,
            'payload' => $payload,
        ];
    }

    private function assertDraftRemainsActive(string $draftId, string $ciphertext): void
    {
        $draft = HealthRecordDraft::where('public_id', $draftId)->firstOrFail();
        $this->assertSame(HealthRecordDraft::STATUS_ACTIVE, $draft->status);
        $this->assertSame($ciphertext, $draft->encrypted_payload);
        $this->assertNull($draft->consumed_health_record_id);
    }

    private function patient(string $firstName, string $lastName, int $bhcId): Patient
    {
        return Patient::create([
            'first_name' => $firstName,
            'last_name' => $lastName,
            'sex' => 'Female',
            'barangay_health_center_id' => $bhcId,
        ]);
    }

    private function user(string $name, string $email, int $bhcId): User
    {
        return User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHC,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhcId,
            'permissions' => StaffRoles::defaults('midwife'),
        ]);
    }
}
