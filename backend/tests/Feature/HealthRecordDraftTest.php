<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\HealthRecordDraft;
use App\Models\Medicine;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\AkayCacheService;
use App\Services\HealthRecordDraftPruner;
use App\Services\HealthRecordDraftService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;

class HealthRecordDraftTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhuA;

    private RuralHealthUnit $rhuB;

    private BarangayHealthCenter $bhcA;

    private BarangayHealthCenter $bhcB;

    private User $bhwA;

    private User $bhwSameBhc;

    private User $bhwB;

    private User $rhuStaff;

    private Patient $patientA;

    private Patient $patientB;

    private Medicine $medicineA;

    private Medicine $medicineB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rhuA = RuralHealthUnit::create(['name' => 'Draft RHU A', 'status' => 'active']);
        $this->rhuB = RuralHealthUnit::create(['name' => 'Draft RHU B', 'status' => 'active']);
        $this->bhcA = BarangayHealthCenter::create([
            'name' => 'Draft BHC A',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhuA->id,
        ]);
        $this->bhcB = BarangayHealthCenter::create([
            'name' => 'Draft BHC B',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhuB->id,
        ]);
        $this->bhwA = $this->user('Draft Owner', 'draft-owner@example.test', User::ROLE_BHC, $this->bhcA->id);
        $this->bhwSameBhc = $this->user('Other Draft Owner', 'draft-other@example.test', User::ROLE_BHC, $this->bhcA->id);
        $this->bhwB = $this->user('Draft BHW B', 'draft-b@example.test', User::ROLE_BHC, $this->bhcB->id);
        $this->rhuStaff = $this->user('Draft RHU Staff', 'draft-rhu@example.test', User::ROLE_RHU, null, $this->rhuA->id);
        $this->patientA = $this->patient('Clinical', 'Draft Patient', $this->bhcA->id);
        $this->patientB = $this->patient('Other', 'Facility Patient', $this->bhcB->id);
        $this->medicineA = $this->medicine('Draft Medicine A', 5, $this->bhcA->id, $this->bhwA->id);
        $this->medicineB = $this->medicine('Draft Medicine B', 5, $this->bhcB->id, $this->bhwB->id);
    }

    public function test_owner_can_create_list_resume_update_and_discard_encrypted_draft(): void
    {
        $payload = $this->draftPayload('Private clinical draft diagnosis.');
        $created = $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/health-record-drafts', $this->draftRequest($payload))
            ->assertCreated()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertHeader('Pragma', 'no-cache')
            ->assertJsonPath('data.version', 1)
            ->assertJsonPath('data.patient.id', $this->patientA->id)
            ->assertJsonMissingPath('data.payload');
        $this->assertStringContainsString('Authorization', $created->headers->get('Vary', ''));
        $publicId = $created->json('data.id');

        $raw = DB::table('health_record_drafts')->where('public_id', $publicId)->first();
        $this->assertNotNull($raw);
        $this->assertNotSame($this->patientA->id, $publicId);
        $this->assertStringNotContainsString('Private clinical draft diagnosis', $raw->encrypted_payload);
        $this->assertNull(json_decode($raw->encrypted_payload, true));

        $list = $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/health-record-drafts')
            ->assertOk()
            ->assertJsonPath('data.data.0.id', $publicId)
            ->assertJsonPath('data.data.0.patient.label', $this->patientA->full_name)
            ->assertJsonMissingPath('data.data.0.payload')
            ->assertJsonMissingPath('data.data.0.encrypted_payload');
        $this->assertResponseExcludesForbiddenKeys($list->json());

        $detail = $this->actingAs($this->bhwA, 'sanctum')
            ->getJson("/api/health-record-drafts/{$publicId}")
            ->assertOk()
            ->assertJsonPath('data.payload.diagnosis', 'Private clinical draft diagnosis.')
            ->assertJsonPath('data.medicine_selections.0.medicine.id', $this->medicineA->id)
            ->assertJsonMissingPath('data.encrypted_payload');
        $this->assertResponseExcludesForbiddenKeys($detail->json());

        $payload['diagnosis'] = 'Updated encrypted diagnosis.';
        $this->actingAs($this->bhwA, 'sanctum')
            ->putJson("/api/health-record-drafts/{$publicId}", [
                ...$this->draftRequest($payload),
                'version' => 1,
            ])
            ->assertOk()
            ->assertJsonPath('data.version', 2);
        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson("/api/health-record-drafts/{$publicId}")
            ->assertJsonPath('data.payload.diagnosis', 'Updated encrypted diagnosis.');

        $this->actingAs($this->bhwA, 'sanctum')
            ->deleteJson("/api/health-record-drafts/{$publicId}")
            ->assertNoContent();
        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson("/api/health-record-drafts/{$publicId}")
            ->assertNotFound();

        $draft = HealthRecordDraft::where('public_id', $publicId)->firstOrFail();
        $this->assertSame(HealthRecordDraft::STATUS_DISCARDED, $draft->status);
        $this->assertNull($draft->encrypted_payload);
        $this->assertSame([
            'draft_created',
            'draft_resumed',
            'draft_updated',
            'draft_resumed',
            'draft_discarded',
        ], AuditLog::where('module', 'health_record_drafts')->pluck('action')->all());
        $this->assertStringNotContainsString(
            'diagnosis',
            AuditLog::where('module', 'health_record_drafts')->pluck('description')->implode(' ')
        );
    }

    public function test_other_facilities_roles_and_invalid_facility_assignments_cannot_access_draft(): void
    {
        $publicId = $this->createDraft();

        // A same-BHC colleague may open the shared encounter; edit leases govern writes.
        $this->actingAs($this->bhwSameBhc, 'sanctum')
            ->getJson("/api/health-record-drafts/{$publicId}")
            ->assertOk();
        $this->actingAs($this->bhwB, 'sanctum')
            ->getJson("/api/health-record-drafts/{$publicId}")
            ->assertNotFound();
        $this->actingAs($this->rhuStaff, 'sanctum')
            ->getJson('/api/health-record-drafts')
            ->assertForbidden();

        $inactive = $this->user(
            'Inactive Draft BHW',
            'inactive-draft@example.test',
            User::ROLE_BHC,
            $this->bhcA->id,
            null,
            User::STATUS_INACTIVE
        );
        $missing = $this->user('Missing Draft BHW', 'missing-draft@example.test', User::ROLE_BHC);
        $mixed = $this->user(
            'Mixed Draft BHW',
            'mixed-draft@example.test',
            User::ROLE_BHC,
            $this->bhcA->id,
            $this->rhuA->id
        );

        $this->actingAs($inactive, 'sanctum')->getJson('/api/health-record-drafts')->assertForbidden();
        $this->actingAs($missing, 'sanctum')->getJson('/api/health-record-drafts')->assertForbidden();
        $this->actingAs($mixed, 'sanctum')->getJson('/api/health-record-drafts')->assertForbidden();
    }

    public function test_payload_allowlist_rejects_unknown_secret_and_cross_facility_references(): void
    {
        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/health-record-drafts', $this->draftRequest([
                'diagnosis' => 'Allowed field',
                'bearerToken' => 'secret-token',
            ]))
            ->assertUnprocessable();
        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/health-record-drafts', [
                ...$this->draftRequest(['diagnosis' => 'Allowed field']),
                'operation_key' => 'forbidden-operation-key',
            ])
            ->assertUnprocessable();
        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/health-record-drafts', [
                ...$this->draftRequest(['diagnosis' => 'Allowed field']),
                'patient_id' => $this->patientB->id,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('patient_id');
        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/health-record-drafts', $this->draftRequest([
                'dispensedMedicines' => [[
                    'medicineId' => $this->medicineB->id,
                    'quantity' => 1,
                ]],
            ]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('payload.dispensedMedicines');
    }

    public function test_partial_payload_and_size_limit_are_enforced_without_truncation(): void
    {
        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/health-record-drafts', $this->draftRequest([
                'chiefComplaint' => 'Partial draft only.',
            ]))
            ->assertCreated();

        config(['health_record_drafts.max_payload_bytes' => 100]);
        $largeText = str_repeat('A', 200);
        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/health-record-drafts', $this->draftRequest([
                'consultationNotes' => $largeText,
            ]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('payload');
        $this->assertDatabaseCount('health_record_drafts', 1);
    }

    public function test_active_draft_limit_is_enforced_per_owner(): void
    {
        config(['health_record_drafts.max_active_per_user' => 1]);
        $this->createDraft();

        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/health-record-drafts', $this->draftRequest([
                'diagnosis' => 'Second draft must fail.',
            ]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('draft');
        $this->assertDatabaseCount('health_record_drafts', 1);
    }

    public function test_stale_version_returns_conflict_without_overwriting_newer_payload(): void
    {
        $publicId = $this->createDraft();
        $newer = $this->draftRequest(['diagnosis' => 'Newer payload']);
        $stale = $this->draftRequest(['diagnosis' => 'Stale payload']);

        $this->actingAs($this->bhwA, 'sanctum')
            ->putJson("/api/health-record-drafts/{$publicId}", [...$newer, 'version' => 1])
            ->assertOk()
            ->assertJsonPath('data.version', 2);
        $this->actingAs($this->bhwA, 'sanctum')
            ->putJson("/api/health-record-drafts/{$publicId}", [...$stale, 'version' => 1])
            ->assertConflict()
            ->assertJsonPath('code', 'DRAFT_VERSION_CONFLICT');
        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson("/api/health-record-drafts/{$publicId}")
            ->assertJsonPath('data.payload.diagnosis', 'Newer payload');
    }

    public function test_expired_and_terminal_drafts_are_not_resumable_and_are_pruned(): void
    {
        $publicId = $this->createDraft();
        HealthRecordDraft::where('public_id', $publicId)->update(['expires_at' => now()->subMinute()]);

        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson("/api/health-record-drafts/{$publicId}")
            ->assertNotFound();
        $draft = HealthRecordDraft::where('public_id', $publicId)->firstOrFail();
        $this->assertSame(HealthRecordDraft::STATUS_EXPIRED, $draft->status);
        $this->assertNull($draft->encrypted_payload);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'draft_expired',
            'module' => 'health_record_drafts',
        ]);

        DB::table('health_record_drafts')
            ->where('id', $draft->id)
            ->update(['updated_at' => now()->subDays(8)]);
        $result = app(HealthRecordDraftPruner::class)->prune();
        $this->assertSame(0, $result['expired']);
        $this->assertSame(1, $result['pruned']);
        $this->assertDatabaseMissing('health_record_drafts', ['public_id' => $publicId]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'expired_drafts_pruned',
            'module' => 'health_record_drafts',
        ]);
    }

    public function test_prune_dry_run_does_not_modify_active_or_expired_rows(): void
    {
        $publicId = $this->createDraft();
        HealthRecordDraft::where('public_id', $publicId)->update(['expires_at' => now()->subMinute()]);

        $result = app(HealthRecordDraftPruner::class)->prune(dryRun: true);

        $this->assertSame(1, $result['expired']);
        $this->assertSame(0, $result['pruned']);
        $this->assertDatabaseHas('health_record_drafts', [
            'public_id' => $publicId,
            'status' => HealthRecordDraft::STATUS_ACTIVE,
        ]);
    }

    public function test_decryption_failure_returns_safe_error_and_keeps_draft_for_investigation(): void
    {
        $publicId = $this->createDraft();
        HealthRecordDraft::where('public_id', $publicId)->update([
            'encrypted_payload' => 'corrupt-ciphertext patient-secret diagnosis-secret',
        ]);
        Log::spy();

        $response = $this->actingAs($this->bhwA, 'sanctum')
            ->getJson("/api/health-record-drafts/{$publicId}")
            ->assertInternalServerError();

        $this->assertStringNotContainsString('corrupt-ciphertext', $response->getContent());
        $this->assertStringNotContainsString('patient-secret', $response->getContent());
        $this->assertDatabaseHas('health_record_drafts', [
            'public_id' => $publicId,
            'status' => HealthRecordDraft::STATUS_ACTIVE,
        ]);
        Log::shouldHaveReceived('warning')->withArgs(
            fn (string $message, array $context): bool => $message === 'Health-record draft decryption failed.'
                && $context['draft_public_id'] === $publicId
                && ! str_contains(json_encode($context), 'patient-secret')
        )->once();
    }

    public function test_unexpected_draft_failure_returns_generic_response_without_raw_error(): void
    {
        Log::spy();
        $this->mock(HealthRecordDraftService::class, function ($mock): void {
            $mock->shouldReceive('listFor')
                ->once()
                ->andThrow(new RuntimeException(
                    'SQLSTATE table health_record_drafts patient-secret diagnosis-secret'
                ));
        });

        $response = $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/health-record-drafts')
            ->assertStatus(500)
            ->assertJsonPath(
                'message',
                'Unable to load drafts safely. Please try again.'
            );

        $this->assertStringNotContainsString('SQLSTATE', $response->getContent());
        $this->assertStringNotContainsString('patient-secret', $response->getContent());
        Log::shouldHaveReceived('warning')->withArgs(
            fn (string $message, array $context): bool => $message === 'Health-record draft operation failed.'
                && $context['operation'] === 'list'
                && $context['user_id'] === $this->bhwA->id
                && ! str_contains(json_encode($context), 'patient-secret')
        )->once();
    }

    public function test_draft_save_has_no_official_side_effects_or_cache_invalidation(): void
    {
        $this->mock(AkayCacheService::class, function ($mock): void {
            $mock->shouldNotReceive('invalidateMedicine');
            $mock->shouldNotReceive('invalidateBhcMedicineDisplay');
            $mock->shouldNotReceive('invalidateReferralReports');
        });
        $quantityBefore = $this->medicineA->quantity;

        $this->createDraft();

        $this->assertDatabaseCount('health_records', 0);
        $this->assertDatabaseCount('health_record_medicines', 0);
        $this->assertDatabaseCount('medicine_inventory_transactions', 0);
        $this->assertDatabaseCount('referrals', 0);
        $this->assertDatabaseCount('follow_up_tasks', 0);
        $this->assertDatabaseCount('notifications', 0);
        $this->assertSame($quantityBefore, $this->medicineA->fresh()->quantity);
    }

    public function test_official_failure_keeps_draft_active_and_successful_commit_consumes_it(): void
    {
        // A shortage no longer blocks finalization; an undispensable item still rolls back.
        $this->medicineA->update(['quantity' => 3, 'expiration_date' => now()->subDay()->toDateString()]);
        $publicId = $this->createDraft($this->draftPayload('Official draft', 2));
        $idempotencyKey = (string) Str::uuid();
        $official = [
            'patient_id' => $this->patientA->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Official save from draft.',
            'dispensed_medicines' => [[
                'medicine_id' => $this->medicineA->id,
                'confirmed_given' => true,
                'quantity' => 2,
            ]],
        ];
        $version = fn (): string => (string) HealthRecordDraft::where('public_id', $publicId)->value('version');

        $this->actingAs($this->bhwA, 'sanctum')
            ->withHeaders([
                'Idempotency-Key' => $idempotencyKey,
                'X-Health-Record-Draft-ID' => $publicId,
                'X-Draft-Version' => $version(),
            ])
            ->postJson('/api/health-records', $official)
            ->assertUnprocessable()
            ->assertJsonPath('code', 'MEDICINE_NOT_DISPENSABLE');
        $this->assertDatabaseHas('health_record_drafts', [
            'public_id' => $publicId,
            'status' => HealthRecordDraft::STATUS_ACTIVE,
        ]);
        $this->assertDatabaseCount('health_records', 0);

        $this->medicineA->update(['expiration_date' => null]);
        $this->actingAs($this->bhwA, 'sanctum')
            ->withHeaders([
                'Idempotency-Key' => $idempotencyKey,
                'X-Health-Record-Draft-ID' => $publicId,
                'X-Draft-Version' => $version(),
            ])
            ->postJson('/api/health-records', $official)
            ->assertCreated();

        $draft = HealthRecordDraft::where('public_id', $publicId)->firstOrFail();
        $this->assertSame(HealthRecordDraft::STATUS_CONSUMED, $draft->status);
        $this->assertNull($draft->encrypted_payload);
        $this->assertNotNull($draft->consumed_health_record_id);
        $this->assertSame(1, $this->medicineA->fresh()->quantity);
        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson("/api/health-record-drafts/{$publicId}")
            ->assertNotFound();
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'draft_consumed',
            'module' => 'health_record_drafts',
        ]);
    }

    /** The draft owner with clinical.history, so staged background edits are saved and shown. */
    private function grantHistoryAccess(): void
    {
        $this->bhwA->update(['permissions' => \App\Services\StaffRoles::defaults('midwife')]);
        $this->bhwA->refresh();
    }

    public function test_draft_autosave_accepts_half_filled_history_rows(): void
    {
        $this->grantHistoryAccess();
        $payload = [...$this->draftPayload(), 'backgroundUpdate' => [
            'sections' => [
                'medical' => [
                    'currentDiseases' => [['note' => 'Since childhood']],
                    'allergies' => ['items' => [['reaction' => 'Hives']]],
                    'hospitalizations' => ['items' => [['year' => 2019]]],
                ],
                'family' => ['familyHistory' => ['items' => [['relation' => 'Mother']]]],
            ],
            'baseRevisions' => ['medical' => 0, 'family' => 0],
        ]];

        $publicId = $this->createDraft($payload);

        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson("/api/health-record-drafts/{$publicId}")
            ->assertOk()
            ->assertJsonPath('data.payload.backgroundUpdate.sections.medical.allergies.items.0.reaction', 'Hives');
    }

    public function test_draft_autosave_still_checks_history_types_and_enums(): void
    {
        $this->grantHistoryAccess();
        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/health-record-drafts', $this->draftRequest([...$this->draftPayload(), 'backgroundUpdate' => [
                'sections' => ['medical' => ['hospitalizations' => ['items' => [['type' => 'Confinement', 'year' => 1800]]]]],
                'baseRevisions' => ['medical' => 0],
            ]]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'payload.backgroundUpdate.sections.medical.hospitalizations.items.0.type',
                'payload.backgroundUpdate.sections.medical.hospitalizations.items.0.year',
            ]);
    }

    /** A draft row whose stored payload was written by an older bundle (bypassing today's sanitizer). */
    private function storedDraft(array $payload): string
    {
        $publicId = $this->createDraft();
        HealthRecordDraft::where('public_id', $publicId)->update([
            'encrypted_payload' => \Illuminate\Support\Facades\Crypt::encryptString(json_encode($payload)),
        ]);

        return $publicId;
    }

    private function assertOpensWithoutBackgroundUpdate(array $backgroundUpdate): void
    {
        $this->grantHistoryAccess();
        $publicId = $this->storedDraft([...$this->draftPayload('Kept diagnosis'), 'backgroundUpdate' => $backgroundUpdate]);

        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson("/api/health-record-drafts/{$publicId}")
            ->assertOk()
            ->assertJsonPath('data.payload.diagnosis', 'Kept diagnosis')
            ->assertJsonMissingPath('data.payload.backgroundUpdate');
    }

    public function test_stored_new_shape_background_update_is_returned_to_history_users(): void
    {
        $this->grantHistoryAccess();
        $publicId = $this->storedDraft([...$this->draftPayload(), 'backgroundUpdate' => [
            'sections' => ['medical' => ['allergies' => ['items' => [['allergen' => 'Dust']]]]],
            'baseRevisions' => ['medical' => 0],
        ]]);

        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson("/api/health-record-drafts/{$publicId}")
            ->assertOk()
            ->assertJsonPath('data.payload.backgroundUpdate.sections.medical.allergies.items.0.allergen', 'Dust');
    }

    public function test_full_pre_itr_draft_opens_with_its_background_update_dropped(): void
    {
        $this->assertOpensWithoutBackgroundUpdate([
            'sections' => [
                'medical' => [
                    'currentDiseases' => [[
                        'name' => 'Hypertension', 'note' => 'On meds', 'status' => 'Confirmed',
                        'firstRecorded' => '2026-05-01', 'lastConfirmed' => '2026-06-01',
                        'source' => 'Consultation', 'conditionKey' => 'hypertension',
                    ], [
                        'name' => 'Asthma', 'note' => '', 'status' => '',
                        'firstRecorded' => '2026-05-05', 'lastConfirmed' => '',
                        'source' => 'Patient-reported', 'conditionKey' => null,
                    ]],
                    'allergies' => 'Dust',
                    'hospitalizations' => '',
                    'surgeries' => 'Appendectomy 2020',
                ],
                'family' => [
                    'familyHistory' => ['similarIllness' => '', 'chronicIllness' => 'Diabetes (mother)', 'hereditaryIllness' => ''],
                ],
                'social' => [
                    'personalSocial' => ['diet' => 'Low salt', 'smoking' => 'Never', 'alcohol' => '', 'notes' => 'Farmer'],
                ],
            ],
            'baseRevisions' => ['medical' => 1, 'family' => 0, 'social' => 0],
        ]);
    }

    public function test_pre_itr_medical_slice_with_null_strings_opens_with_its_background_update_dropped(): void
    {
        $this->assertOpensWithoutBackgroundUpdate([
            'sections' => ['medical' => [
                'currentDiseases' => [['name' => 'Asthma', 'status' => 'Confirmed', 'conditionKey' => 'asthma', 'lastConfirmed' => '2026-06-01']],
                'allergies' => null,
                'hospitalizations' => null,
                'surgeries' => null,
            ]],
            'baseRevisions' => ['medical' => 0],
        ]);
    }

    public function test_pre_itr_social_notes_only_opens_with_its_background_update_dropped(): void
    {
        $this->assertOpensWithoutBackgroundUpdate([
            'sections' => ['social' => ['personalSocial' => ['notes' => 'x']]],
            'baseRevisions' => ['social' => 0],
        ]);
    }

    public function test_stored_background_update_that_no_longer_validates_is_dropped_not_the_draft(): void
    {
        $this->assertOpensWithoutBackgroundUpdate([
            'sections' => ['medical' => [
                'hospitalizations' => ['items' => [['type' => 'Confinement', 'year' => 2020]]],
            ]],
            'baseRevisions' => ['medical' => 0],
        ]);
    }

    private function createDraft(?array $payload = null): string
    {
        return $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/health-record-drafts', $this->draftRequest(
                $payload ?? $this->draftPayload()
            ))
            ->assertCreated()
            ->json('data.id');
    }

    private function draftRequest(array $payload): array
    {
        return [
            'patient_id' => $this->patientA->id,
            'classification' => 'General Consultation',
            'payload' => $payload,
        ];
    }

    private function draftPayload(string $diagnosis = 'Draft diagnosis', int $quantity = 1): array
    {
        return [
            'dateOfVisit' => now()->toDateString(),
            'timeOfVisit' => '09:30',
            'chiefComplaint' => 'Draft complaint',
            'diagnosis' => $diagnosis,
            'needsReferral' => false,
            'dispensedMedicines' => [[
                'medicineId' => $this->medicineA->id,
                'quantity' => $quantity,
            ]],
        ];
    }

    private function assertResponseExcludesForbiddenKeys(array $payload): void
    {
        $keys = [];
        $collect = function (array $value) use (&$collect, &$keys): void {
            foreach ($value as $key => $item) {
                if (is_string($key)) {
                    $keys[] = $key;
                }
                if (is_array($item)) {
                    $collect($item);
                }
            }
        };
        $collect($payload);

        foreach ([
            'encrypted_payload',
            'owner_user_id',
            'barangay_health_center_id',
            'consumed_health_record_id',
            'operation_key',
            'idempotency_key',
            'qr_token_hash',
        ] as $forbidden) {
            $this->assertNotContains($forbidden, $keys);
        }
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

    private function medicine(string $name, int $quantity, int $bhcId, int $creatorId): Medicine
    {
        return Medicine::create([
            'name' => $name,
            'category' => 'Basic Medicines',
            'quantity' => $quantity,
            'low_stock_threshold' => 2,
            'unit' => 'tablets',
            'availability_status' => 'Available',
            'barangay_health_center_id' => $bhcId,
            'created_by' => $creatorId,
        ]);
    }

    private function user(
        string $name,
        string $email,
        string $role,
        ?int $bhcId = null,
        ?int $rhuId = null,
        string $status = User::STATUS_ACTIVE
    ): User {
        return User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password123'),
            'role' => $role,
            'staff_role' => $this->staffRoleFor($role),
            'status' => $status,
            'barangay_health_center_id' => $bhcId,
            'rural_health_unit_id' => $rhuId,
        ]);
    }
}
