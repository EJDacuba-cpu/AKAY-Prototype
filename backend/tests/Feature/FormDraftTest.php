<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecordDraft;
use App\Models\Patient;
use App\Models\User;
use App\Services\FacilityAccessService;
use App\Services\FormDraftCommit;
use App\Services\FormDraftRecoveryKeyService;
use App\Services\FormDraftRegistry;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Tests\TestCase;

class FormDraftTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $other;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        // Core/legacy contract fixtures retain old definitions deliberately.
        // Current product enrollment is verified separately in FormDraftScopeTest.
        config(['form_drafts.forms' => [...config('form_drafts.forms'), ...config('form_drafts.legacy_forms', [])]]);
        $bhc = BarangayHealthCenter::create(['name' => 'Draft facility', 'status' => 'active']);
        $attributes = ['password' => 'test-password', 'role' => 'bhc', 'status' => 'active', 'barangay_health_center_id' => $bhc->id, 'permissions' => ['patients.register', 'clinical.history', 'clinical.background.update']];
        $this->owner = User::create([...$attributes, 'name' => 'Owner', 'email' => 'owner@test.test']);
        $this->other = User::create([...$attributes, 'name' => 'Other', 'email' => 'other@test.test']);
        $this->patient = Patient::create(['first_name' => 'Private', 'last_name' => 'Patient', 'sex' => 'Female', 'barangay_health_center_id' => $bhc->id]);
    }

    private function input(array $overrides = []): array
    {
        return array_replace(['form_type' => 'patient', 'mode' => 'edit', 'context_key' => 'patient:'.$this->patient->id, 'transaction_uuid' => (string) Str::uuid(), 'schema_version' => 1, 'base_revision' => null, 'payload' => ['first_name' => 'Unfinished private name', 'birthdate' => '2026-']], $overrides);
    }

    private function createDraft(array $input = []): array
    {
        return $this->actingAs($this->owner, 'sanctum')->postJson('/api/form-drafts', $input ?: $this->input())->assertCreated()->assertHeader('Cache-Control', 'no-store, private')->json('data');
    }

    public function test_encrypted_partial_input_lookup_detail_and_optimistic_updates(): void
    {
        $input = $this->input();
        $draft = $this->createDraft($input);
        $raw = DB::table('form_drafts')->where('public_id', $draft['id'])->first();
        $this->assertStringNotContainsString('Unfinished private name', $raw->encrypted_payload);
        $this->getJson('/api/form-drafts/lookup?'.http_build_query($input))->assertOk()->assertJsonPath('data.id', $draft['id'])->assertJsonMissingPath('data.payload');
        $this->getJson('/api/form-drafts/'.$draft['id'])->assertOk()->assertJsonPath('data.payload.birthdate', '2026-');
        $input['payload']['first_name'] = 'Changed';
        $this->putJson('/api/form-drafts/'.$draft['id'], [...$input, 'version' => 1])->assertOk()->assertJsonPath('data.version', 2);
        $this->putJson('/api/form-drafts/'.$draft['id'], [...$input, 'version' => 1])->assertConflict();
    }

    public function test_owner_target_facility_permission_and_key_authorization_are_current(): void
    {
        $input = $this->input();
        $draft = $this->createDraft($input);
        $key = $this->postJson('/api/form-drafts/device-key', $input)->assertOk()->assertHeader('Cache-Control', 'no-store, private')->json('data');
        $this->assertSame(32, strlen(base64_decode($key['key_material'])));
        $this->actingAs($this->other, 'sanctum')->getJson('/api/form-drafts/'.$draft['id'])->assertNotFound();
        $this->postJson('/api/form-drafts/device-key', [...$input, 'key_id' => $key['key_id']])->assertNotFound();
        $this->actingAs($this->owner->fresh(), 'sanctum')->postJson('/api/form-drafts/device-key', [...$input, 'key_id' => $key['key_id']])->assertOk()->assertJsonPath('data.key_material', $key['key_material']);
        $foreign = BarangayHealthCenter::create(['name' => 'Elsewhere', 'status' => 'active']);
        $this->patient->update(['barangay_health_center_id' => $foreign->id]);
        $this->getJson('/api/form-drafts/'.$draft['id'])->assertForbidden();
        $this->getJson('/api/form-drafts/lookup?'.http_build_query($input))->assertForbidden();
        $this->postJson('/api/form-drafts/device-key', [...$input, 'key_id' => $key['key_id']])->assertForbidden();
    }

    public function test_schema_rejects_unknown_secrets_nested_fields_and_oversize_input(): void
    {
        foreach ([['password' => 'secret'], ['first_name' => ['token' => 'secret']], ['unknown' => 'value'], ['first_name' => str_repeat('x', 20001)]] as $payload) {
            $this->actingAs($this->owner, 'sanctum')->postJson('/api/form-drafts', $this->input(['payload' => $payload]))->assertUnprocessable();
        }
        $this->postJson('/api/form-drafts', $this->input(['form_type' => 'unregistered']))->assertUnprocessable();
        $this->postJson('/api/form-drafts', $this->input(['form_type' => 'patient.schema']))->assertUnprocessable();
        $this->postJson('/api/form-drafts', $this->input(['context_key' => 'patient:999999']))->assertNotFound();
        $this->owner->update(['permissions' => []]);
        $this->actingAs($this->owner->fresh(), 'sanctum')->postJson('/api/form-drafts', $this->input())->assertForbidden();
    }

    public function test_one_active_slot_terminal_identity_and_noop_retention(): void
    {
        $input = $this->input();
        $draft = $this->createDraft($input);
        $this->postJson('/api/form-drafts', $this->input())->assertConflict()->assertJsonPath('data.id', $draft['id'])->assertJsonMissingPath('data.payload');
        $this->travel(1)->days();
        $this->putJson('/api/form-drafts/'.$draft['id'], [...$input, 'version' => 1])->assertOk()->assertJsonPath('data.version', 1)->assertJsonPath('data.expires_at', $draft['expires_at']);
        $this->deleteJson('/api/form-drafts/'.$draft['id'], ['version' => 2])->assertConflict();
        $this->deleteJson('/api/form-drafts/'.$draft['id'], ['version' => 1])->assertNoContent();
        $this->putJson('/api/form-drafts/'.$draft['id'], [...$input, 'version' => 1])->assertConflict();
        $this->postJson('/api/form-drafts', $input)->assertConflict();
        $this->assertNull(DB::table('form_drafts')->where('public_id', $draft['id'])->value('encrypted_payload'));
        $this->postJson('/api/form-drafts', $this->input())->assertCreated();
    }

    public function test_explicit_commit_wraps_real_patient_endpoint_replays_once_and_rolls_back(): void
    {
        foreach (Route::getRoutes() as $route) {
            if ($route->getName() === 'patients.update') {
                $route->middleware(FormDraftTestCommitMiddleware::class);
            }
        }
        $input = $this->input(['payload' => ['first_name' => 'Official']]);
        $draft = $this->createDraft($input);
        $headers = ['X-Form-Draft-Id' => $draft['id'], 'X-Form-Draft-Version' => '1', 'X-Form-Draft-Transaction' => $draft['transaction_uuid']];
        $endpoint = '/api/patients/'.$this->patient->id;
        FormDraftTestCommitMiddleware::$failAfterMutation = true;
        try {
            $this->patchJson($endpoint, ['first_name' => 'Official'], $headers)->assertUnprocessable();
        } finally {
            FormDraftTestCommitMiddleware::$failAfterMutation = false;
        }
        $this->assertSame('Private', $this->patient->fresh()->first_name);
        $this->getJson('/api/form-drafts/'.$draft['id'])->assertOk();
        $result = $this->patchJson($endpoint, ['first_name' => 'Official'], $headers)->assertOk()->json();
        $this->assertSame('Official', $this->patient->fresh()->first_name);
        $this->patchJson($endpoint, ['first_name' => 'Official'], $headers)->assertOk()->assertExactJson($result);
        $this->patchJson($endpoint, ['first_name' => 'Different'], $headers)->assertConflict();
        $this->getJson('/api/form-drafts/'.$draft['id'])->assertNotFound();
        $this->postJson('/api/form-drafts', $input)->assertConflict();
        $this->owner->update(['permissions' => []]);
        $this->actingAs($this->owner->fresh(), 'sanctum')->patchJson($endpoint, ['first_name' => 'Official'], $headers)->assertForbidden();
    }

    public function test_clinical_keys_are_key_only_and_retirement_prevents_reacquisition(): void
    {
        $this->owner->update(['permissions' => ['consultations.encode', 'clinical.history']]);
        $this->actingAs($this->owner->fresh(), 'sanctum');
        $input = $this->input(['form_type' => 'consultation', 'mode' => 'create']);
        $key = $this->postJson('/api/form-drafts/device-key', $input)->assertOk()->json('data');
        $this->postJson('/api/form-drafts', $input)->assertUnprocessable();
        $this->getJson('/api/form-drafts/lookup?'.http_build_query($input))->assertUnprocessable();
        $clinical = HealthRecordDraft::create(['public_id' => (string) Str::uuid(), 'consultation_uuid' => $input['transaction_uuid'], 'owner_user_id' => $this->owner->id, 'barangay_health_center_id' => $this->owner->barangay_health_center_id, 'patient_id' => $this->patient->id, 'classification' => 'general', 'version' => 1, 'status' => 'active', 'last_saved_at' => now(), 'expires_at' => now()->addDays(30)]);
        $keys = app(FormDraftRecoveryKeyService::class);
        $keys->withClinicalIdentity($clinical->consultation_uuid, function () use ($clinical) {
            $locked = HealthRecordDraft::whereKey($clinical->id)->lockForUpdate()->firstOrFail();
            $locked->update(['status' => 'discarded']);
            app(FormDraftRecoveryKeyService::class)->retireClinical($locked);
        });
        $clinical->delete(); // Existing workflow tombstone pruning must not restore recovery authority.
        $this->postJson('/api/form-drafts/device-key', [...$input, 'key_id' => $key['key_id']])->assertConflict();
        $this->assertNull(DB::table('form_draft_recovery_keys')->where('public_id', $key['key_id'])->value('encrypted_key'));
    }

    public function test_clinical_identity_is_bound_to_one_authorized_patient_across_actors(): void
    {
        $this->owner->update(['permissions' => ['consultations.encode', 'clinical.history']]);
        $this->other->update(['permissions' => ['consultations.encode', 'clinical.history']]);
        $input = $this->input(['form_type' => 'consultation', 'mode' => 'edit']);
        $this->actingAs($this->owner->fresh(), 'sanctum')->postJson('/api/form-drafts/device-key', $input)->assertOk();
        $this->actingAs($this->other->fresh(), 'sanctum')->postJson('/api/form-drafts/device-key', $input)->assertOk();
        $another = Patient::create(['first_name' => 'Other', 'last_name' => 'Patient', 'sex' => 'Female', 'barangay_health_center_id' => $this->owner->barangay_health_center_id]);
        $this->postJson('/api/form-drafts/device-key', [...$input, 'context_key' => 'patient:'.$another->id])->assertConflict();
        $this->assertDatabaseHas('clinical_recovery_identities', ['consultation_uuid' => $input['transaction_uuid'], 'facility_scope' => 'bhc:'.$this->owner->barangay_health_center_id, 'context_key' => 'patient:'.$this->patient->id]);
    }

    public function test_exact_terminal_status_and_device_only_discard_prevent_resurrection(): void
    {
        $input = $this->input();
        $draft = $this->createDraft($input);
        $this->deleteJson('/api/form-drafts/'.$draft['id'], ['version' => 1])->assertNoContent();
        $this->getJson('/api/form-drafts/status?'.http_build_query($input))->assertOk()->assertJsonPath('data.status', 'discarded')->assertJsonMissingPath('data.payload');
        $this->actingAs($this->other, 'sanctum')->getJson('/api/form-drafts/status?'.http_build_query($input))->assertOk()->assertJsonPath('data', null);
        $input = $this->input();
        $this->actingAs($this->owner, 'sanctum');
        $key = $this->postJson('/api/form-drafts/device-key', $input)->assertOk()->json('data');
        $this->postJson('/api/form-drafts/device-key/retire', [...$input, 'key_id' => $key['key_id']])->assertNoContent();
        $this->postJson('/api/form-drafts', $input)->assertConflict();
        $this->getJson('/api/form-drafts/status?'.http_build_query($input))->assertOk()->assertJsonPath('data.status', 'discarded');
        $this->postJson('/api/form-drafts/device-key', [...$input, 'key_id' => $key['key_id']])->assertNotFound();
    }

    public function test_nested_business_snapshots_and_independent_action_schemas_are_explicit(): void
    {
        $registry = app(FormDraftRegistry::class);
        $cases = [
            'feedback' => ['condition_confirmations' => [['name' => 'Partial', 'status' => '']], 'legacy_monitoring_discontinuations' => [['monitoring_id' => 1, 'reason' => 'unfinished']], 'dateReceived' => '2026-', 'timeReceived' => '0', 'assessmentOutcome' => '', 'followUpDate' => ''],
            'dispensing' => ['dispensed_medicines' => [['medicine_id' => 1, 'quantity' => '', 'unit' => '', 'remarks' => '', 'override_reason' => '', 'allocations' => [['expiry_group_id' => 1, 'quantity' => '']]]]],
            'provider-availability' => ['doctorId' => '1', 'status' => 'Unavailable', 'untilFurtherNotice' => false, 'date' => '2026-', 'allDay' => false, 'startTime' => '0', 'endTime' => '', 'notesTouched' => true, 'notes' => ['remarks' => '', 'internal' => '', 'returnDate' => '', 'returnTime' => '']],
            'medicine-quarantine' => ['expiry_group_id' => 1, 'quantity' => '', 'reason' => 'unfinished'],
            'medicine-release' => ['expiry_group_id' => 1, 'quantity' => '', 'reason' => 'unfinished'],
            'medicine-quarantine-disposal' => ['expiry_group_id' => 1, 'quantity' => '', 'reason' => 'unfinished'],
        ];
        foreach ($cases as $form => $payload) {
            $this->assertSame($payload, $registry->payload($form, $payload));
        }
    }

    public function test_database_unique_active_slot_and_account_profile_subset_are_enforced(): void
    {
        $registry = app(FormDraftRegistry::class);
        $this->assertSame(['name' => 'Partial'], $registry->payload('account-profile', ['name' => 'Partial']));
        $this->assertSame(['bhc'], config('form_drafts.forms.patient-background-medical.roles'));
        $draft = $this->createDraft();
        $row = (array) DB::table('form_drafts')->where('public_id', $draft['id'])->first();
        unset($row['id']);
        $row['public_id'] = (string) Str::uuid();
        $row['transaction_uuid'] = (string) Str::uuid();
        $this->expectException(UniqueConstraintViolationException::class);
        DB::table('form_drafts')->insert($row);
    }

    public function test_unauthenticated_key_access_and_configured_owner_write_limit(): void
    {
        $this->postJson('/api/form-drafts/device-key', $this->input())->assertUnauthorized();
        config(['form_drafts.write_limit' => 1]);
        $this->createDraft();
        $this->postJson('/api/form-drafts', $this->input())->assertStatus(429);
    }

    public function test_raw_referral_and_feedback_inputs_survive_before_final_serialization(): void
    {
        $registry = app(FormDraftRegistry::class);
        $referral = ['dateOfReferral' => '2026-', 'timeOfReferral' => '0', 'preferredVisitDate' => '', 'preferredVisitTime' => '', 'philHealthNumber' => 'partial', 'philHealthCategory' => ''];
        $this->assertSame($referral, $registry->payload('referral', $referral));
        $feedback = ['condition_rows' => [['conditionId' => '', 'name' => 'Partial condition', 'status' => '', 'note' => 'unfinished', 'recommend' => false, 'legacyMonitoringId' => null]], 'legacy_rows' => [['monitoringId' => 1, 'decision' => 'correct', 'correctedName' => 'Unfinished', 'reason' => '']]];
        $this->assertSame($feedback, $registry->payload('feedback', $feedback));
    }

    public function test_seven_day_expiry_scrubs_payload_and_key(): void
    {
        $input = $this->input();
        $draft = $this->createDraft($input);
        $key = $this->postJson('/api/form-drafts/device-key', $input)->assertOk()->json('data');
        $this->travel(7)->days();
        $this->getJson('/api/form-drafts/'.$draft['id'])->assertNotFound();
        $this->postJson('/api/form-drafts/device-key', [...$input, 'key_id' => $key['key_id']])->assertNotFound();
        $this->assertNull(DB::table('form_drafts')->where('public_id', $draft['id'])->value('encrypted_payload'));
    }

    public function test_expired_device_identity_does_not_recreate_server_input_before_prune(): void
    {
        $input = $this->input();
        $this->actingAs($this->owner, 'sanctum')->postJson('/api/form-drafts/device-key', $input)->assertOk();
        $this->travel(7)->days();
        $this->assertSame('active', DB::table('form_draft_recovery_keys')->value('status'));
        $this->getJson('/api/form-drafts/status?'.http_build_query($input))->assertOk()->assertJsonPath('data.status', 'expired');
        $this->postJson('/api/form-drafts', $input)->assertConflict();
        $this->assertDatabaseCount('form_drafts', 0);
        $this->assertDatabaseCount('form_draft_recovery_keys', 1);
    }

    public function test_active_server_draft_keeps_rolling_lifetime_after_its_device_key_expires(): void
    {
        $input = $this->input();
        $draft = $this->createDraft($input);
        $this->postJson('/api/form-drafts/device-key', $input)->assertOk();
        $this->travel(6)->days();
        $input['payload']['first_name'] = 'New input before key expiry';
        $this->putJson('/api/form-drafts/'.$draft['id'], [...$input, 'version' => 1])->assertOk();
        $this->travel(1)->days();
        $input['payload']['first_name'] = 'New input after key expiry';
        $this->putJson('/api/form-drafts/'.$draft['id'], [...$input, 'version' => 2])->assertOk()->assertJsonPath('data.version', 3);
    }

    public function test_pre_server_clinical_terminal_guard_blocks_different_actor_keys_and_rolls_back_atomically(): void
    {
        foreach ([$this->owner, $this->other] as $user) {
            $user->update(['permissions' => ['consultations.encode', 'clinical.history']]);
        }
        $input = $this->input(['form_type' => 'consultation']);
        $this->actingAs($this->owner->fresh(), 'sanctum')->postJson('/api/form-drafts/device-key', $input)->assertOk();
        $this->actingAs($this->other->fresh(), 'sanctum')->postJson('/api/form-drafts/device-key', $input)->assertOk();
        $this->assertDatabaseCount('health_record_drafts', 0);
        $keys = app(FormDraftRecoveryKeyService::class);
        try {
            $keys->withClinicalIdentity($input['transaction_uuid'], function () use ($keys, $input) {
                $keys->retireClinicalIdentity($input['transaction_uuid'], 'discarded');
                throw new \RuntimeException('Rollback terminal mutation');
            });
            $this->fail('Expected simulated failure');
        } catch (\RuntimeException $error) {
            $this->assertSame('Rollback terminal mutation', $error->getMessage());
        }
        $this->assertSame(2, DB::table('form_draft_recovery_keys')->whereNotNull('encrypted_key')->count());
        $keys->withClinicalIdentity($input['transaction_uuid'], fn () => $keys->retireClinicalIdentity($input['transaction_uuid'], 'discarded'));
        $this->assertSame(0, DB::table('form_draft_recovery_keys')->whereNotNull('encrypted_key')->count());
        foreach ([$this->owner, $this->other] as $user) {
            $this->actingAs($user->fresh(), 'sanctum')->postJson('/api/form-drafts/device-key', $input)->assertConflict();
        }
        $this->assertDatabaseHas('clinical_recovery_identities', ['consultation_uuid' => $input['transaction_uuid'], 'status' => 'discarded']);
        $neverIssued = $this->input(['form_type' => 'consultation']);
        $keys->withClinicalIdentity($neverIssued['transaction_uuid'], fn () => $keys->retireClinicalIdentity($neverIssued['transaction_uuid'], 'discarded'));
        $this->postJson('/api/form-drafts/device-key', $neverIssued)->assertConflict();
        $this->assertDatabaseCount('form_draft_recovery_keys', 2);
    }

    public function test_clinical_issuance_takes_shared_identity_boundary_before_user_and_clinical_state_queries(): void
    {
        $this->owner->update(['permissions' => ['consultations.encode', 'clinical.history']]);
        $queries = [];
        DB::listen(function ($query) use (&$queries) {
            $queries[] = $query->sql;
        });
        $this->actingAs($this->owner->fresh(), 'sanctum');
        $queries = [];
        $this->postJson('/api/form-drafts/device-key', $this->input(['form_type' => 'consultation']))->assertOk();
        $guard = collect($queries)->search(fn ($sql) => str_contains($sql, 'clinical_recovery_identities'));
        $clinical = collect($queries)->search(fn ($sql) => str_contains($sql, 'health_record_drafts'));
        $userLock = collect($queries)->search(fn ($sql) => str_starts_with($sql, 'select * from "users"'));
        $this->assertNotFalse($guard);
        $this->assertNotFalse($clinical);
        $this->assertNotFalse($userLock);
        $this->assertLessThan($clinical, $guard);
        $this->assertLessThan($userLock, $guard);
    }

    public function test_clinical_retirement_requires_its_outer_boundary(): void
    {
        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('outer withClinicalIdentity boundary');
        app(FormDraftRecoveryKeyService::class)->retireClinicalIdentity((string) Str::uuid(), 'discarded');
    }

    public function test_clinical_authorization_refreshes_the_actor_after_entering_the_guard(): void
    {
        $this->owner->update(['permissions' => ['consultations.encode', 'clinical.history']]);
        $staleActor = $this->owner->fresh();
        DB::table('users')->where('id', $this->owner->id)->update(['permissions' => '[]']);
        $this->actingAs($staleActor, 'sanctum')->postJson('/api/form-drafts/device-key', $this->input(['form_type' => 'consultation']))->assertForbidden();
        $this->assertDatabaseCount('form_draft_recovery_keys', 0);
    }
}

class FormDraftTestCommitMiddleware
{
    public static bool $failAfterMutation = false;

    public function handle(Request $request, \Closure $next)
    {
        return app(FormDraftCommit::class)->run($request, 'patient', 'edit', 'patient:'.$request->route('patient')->id, $request->all(), function () use ($request, $next) {
            $response = $next($request);
            if (self::$failAfterMutation) {
                abort(422, 'Simulated domain rollback');
            }

            return $response;
        }, fn () => app(FacilityAccessService::class)->authorizePatientModification($request->user(), $request->route('patient')));
    }
}
