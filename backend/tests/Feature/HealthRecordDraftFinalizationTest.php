<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecordDraft;
use App\Models\Medicine;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\FollowUpTaskSyncService;
use App\Services\HealthRecordDraftService;
use App\Services\ReferralCreationService;
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
            'needs_referral' => true,
            'referral' => [
                'reason_for_referral' => 'Requires RHU assessment.',
                'urgency_level' => 'Normal',
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
            $mock->shouldReceive('findActiveMatchingTask')->once()->andReturnNull();
            $mock->shouldReceive('lockTaskForProcessing')->once()->andReturnNull();
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

    public function test_draft_binding_and_terminal_states_are_enforced_before_official_creation(): void
    {
        $patientMismatch = $this->createDraft();
        $this->finalize($patientMismatch, (string) Str::uuid(), [
            ...$this->officialPayload(),
            'patient_id' => $this->patientSameBhc->id,
        ])->assertUnprocessable()->assertJsonValidationErrors('draft');

        $classificationMismatch = $this->createDraft();
        $this->finalize($classificationMismatch, (string) Str::uuid(), [
            'patient_id' => $this->patientA->id,
            'category' => 'Maternal',
        ])->assertUnprocessable()->assertJsonValidationErrors('draft');

        $otherOwnerDraft = $this->createDraft();
        $this->actingAs($this->sameBhcUser, 'sanctum')
            ->withHeaders($this->officialHeaders((string) Str::uuid(), $otherOwnerDraft))
            ->postJson('/api/health-records', [
                'patient_id' => $this->patientA->id,
                'category' => 'General Consultation',
            ])
            ->assertNotFound();

        $otherFacilityDraft = $this->createDraft();
        $this->actingAs($this->otherBhcUser, 'sanctum')
            ->withHeaders($this->officialHeaders((string) Str::uuid(), $otherFacilityDraft))
            ->postJson('/api/health-records', [
                'patient_id' => $this->patientB->id,
                'category' => 'General Consultation',
            ])
            ->assertNotFound();

        $expiredDraft = $this->createDraft();
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
            ])
            ->assertCreated();

        $this->assertDatabaseCount('health_records', 1);
        $this->assertDatabaseCount('health_record_drafts', 0);
    }

    public function test_twenty_active_drafts_are_allowed_and_twenty_first_is_rejected(): void
    {
        $this->assertSame(20, config('health_record_drafts.max_active_per_user'));
        for ($index = 1; $index <= 20; $index++) {
            $this->createDraft(['diagnosis' => "Allowed draft {$index}"]);
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
            $this->createDraft(['diagnosis' => "Rate draft {$index}"]);
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
            $service->create($this->owner, $this->draftRequest([
                'diagnosis' => "Paged draft {$index}",
            ]));
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
        string $classification = 'General Consultation'
    ): string {
        return $this->actingAs($this->owner, 'sanctum')
            ->postJson('/api/health-record-drafts', $this->draftRequest(
                $payload ?? $this->draftPayload(),
                $classification
            ))
            ->assertCreated()
            ->json('data.id');
    }

    private function finalize(string $draftId, string $key, array $payload)
    {
        return $this->actingAs($this->owner, 'sanctum')
            ->withHeaders($this->officialHeaders($key, $draftId))
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
            'dispensed_medicines' => [[
                'medicine_id' => $this->medicine->id,
                'quantity' => 2,
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
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhcId,
        ]);
    }
}
