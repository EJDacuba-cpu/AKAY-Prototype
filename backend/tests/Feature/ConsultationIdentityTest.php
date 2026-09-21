<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\HealthRecordDraft;
use App\Models\Medicine;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * consultation_uuid: one stable identity per consultation, across the server
 * draft, the encrypted device copy, reconnect, and the official record.
 *
 * Deliberately separate from idempotency_key, which identifies one final-save
 * ATTEMPT and must behave exactly as it did before this column existed.
 */
class ConsultationIdentityTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    private User $owner;

    private User $sameBhcUser;

    private Patient $patient;

    private Medicine $medicine;

    protected function setUp(): void
    {
        parent::setUp();

        $rhu = RuralHealthUnit::create(['name' => 'Identity RHU']);
        $this->seedAvailableProvider($rhu);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Identity BHC',
            'rural_health_unit_id' => $rhu->id,
        ]);
        $this->owner = $this->user('Identity Owner', 'identity-owner@example.test');
        $this->sameBhcUser = $this->user('Identity Peer', 'identity-peer@example.test');
        $this->patient = Patient::create([
            'first_name' => 'Identity',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id,
        ]);
        $this->medicine = Medicine::create([
            'name' => 'Identity Medicine',
            'category' => 'Basic Medicines',
            'quantity' => 20,
            'low_stock_threshold' => 2,
            'unit' => 'tablets',
            'availability_status' => 'Available',
            'barangay_health_center_id' => $this->bhc->id,
            'created_by' => $this->owner->id,
        ]);
    }

    // ---- Server draft --------------------------------------------------

    public function test_draft_stores_consultation_uuid_as_a_column_and_returns_it(): void
    {
        $uuid = (string) Str::uuid();

        $created = $this->createDraft($uuid)
            ->assertCreated()
            ->assertJsonPath('data.consultation_uuid', $uuid);
        $publicId = $created->json('data.id');

        // A real column, distinct from the server-minted public id.
        $this->assertDatabaseHas('health_record_drafts', [
            'public_id' => $publicId,
            'consultation_uuid' => $uuid,
        ]);
        $this->assertNotSame($uuid, $publicId);

        // Round-trips on list and detail, and inside the encrypted payload.
        $this->actingAs($this->owner, 'sanctum')
            ->getJson('/api/health-record-drafts')
            ->assertOk()
            ->assertJsonPath('data.data.0.consultation_uuid', $uuid);
        $this->actingAs($this->owner, 'sanctum')
            ->getJson("/api/health-record-drafts/{$publicId}")
            ->assertOk()
            ->assertJsonPath('data.consultation_uuid', $uuid)
            ->assertJsonPath('data.payload.consultationUuid', $uuid);
    }

    public function test_the_same_consultation_survives_update_and_resume_unchanged(): void
    {
        $uuid = (string) Str::uuid();
        $publicId = $this->createDraft($uuid)->assertCreated()->json('data.id');

        // A later save never reassigns the identity, whatever it claims.
        $this->updateDraft($publicId, 1, (string) Str::uuid())
            ->assertOk()
            ->assertJsonPath('data.version', 2)
            ->assertJsonPath('data.consultation_uuid', $uuid);
        $this->updateDraft($publicId, 2, null)
            ->assertOk()
            ->assertJsonPath('data.consultation_uuid', $uuid);

        $this->assertSame(
            $uuid,
            HealthRecordDraft::where('public_id', $publicId)->value('consultation_uuid')
        );
    }

    public function test_two_consultations_for_the_same_patient_are_two_drafts(): void
    {
        $first = (string) Str::uuid();
        $second = (string) Str::uuid();

        $firstId = $this->createDraft($first)->assertCreated()->json('data.id');
        $secondId = $this->createDraft($second)->assertCreated()->json('data.id');

        $this->assertNotSame($firstId, $secondId);
        $this->assertSame(2, HealthRecordDraft::where('patient_id', $this->patient->id)->count());
        $this->assertDatabaseHas('health_record_drafts', ['public_id' => $firstId, 'consultation_uuid' => $first]);
        $this->assertDatabaseHas('health_record_drafts', ['public_id' => $secondId, 'consultation_uuid' => $second]);
    }

    public function test_reconnecting_without_a_draft_id_never_splits_one_consultation_in_two(): void
    {
        // The device went offline before its first autosave, so it never
        // learned the public id. Another tab created the server draft first.
        $uuid = (string) Str::uuid();
        $existing = $this->createDraft($uuid, 'Server copy.')->assertCreated();
        $publicId = $existing->json('data.id');

        $this->createDraft($uuid, 'Device copy that must not overwrite.')
            ->assertStatus(409)
            ->assertJsonPath('code', 'DRAFT_CONSULTATION_EXISTS')
            ->assertJsonPath('draft_id', $publicId)
            ->assertJsonPath('version', 1);

        // Exactly one draft, and its content untouched.
        $this->assertSame(1, HealthRecordDraft::where('consultation_uuid', $uuid)->count());
        $this->actingAs($this->owner, 'sanctum')
            ->getJson("/api/health-record-drafts/{$publicId}")
            ->assertJsonPath('data.payload.diagnosis', 'Server copy.');
    }

    public function test_a_consultation_that_first_reaches_the_server_on_reconnect_creates_exactly_one_draft(): void
    {
        $uuid = (string) Str::uuid();

        $this->createDraft($uuid)->assertCreated();

        $this->assertSame(1, HealthRecordDraft::where('consultation_uuid', $uuid)->count());
    }

    public function test_a_discarded_draft_never_blocks_its_consultation_from_saving_again(): void
    {
        $uuid = (string) Str::uuid();
        $publicId = $this->createDraft($uuid)->assertCreated()->json('data.id');
        $this->actingAs($this->owner, 'sanctum')
            ->deleteJson("/api/health-record-drafts/{$publicId}")
            ->assertSuccessful();

        // Uniqueness covers ACTIVE rows only.
        $this->createDraft($uuid)->assertCreated();
        $this->assertSame(1, HealthRecordDraft::query()
            ->where('consultation_uuid', $uuid)
            ->where('status', HealthRecordDraft::STATUS_ACTIVE)
            ->count());
    }

    public function test_consultation_uuid_is_never_an_authorization_key(): void
    {
        $uuid = (string) Str::uuid();
        $this->createDraft($uuid)->assertCreated();

        // Another user presenting the same uuid is neither told about the
        // owner's draft nor able to touch it; it simply gets its own.
        $peer = $this->actingAs($this->sameBhcUser, 'sanctum')
            ->postJson('/api/health-record-drafts', $this->draftRequest($uuid))
            ->assertCreated()
            ->assertJsonMissingPath('draft_id');

        $this->assertSame(2, HealthRecordDraft::where('consultation_uuid', $uuid)->count());
        $this->assertSame(
            $this->sameBhcUser->id,
            HealthRecordDraft::where('public_id', $peer->json('data.id'))->value('owner_user_id')
        );
    }

    public function test_invalid_consultation_uuid_is_rejected_on_column_and_payload(): void
    {
        $this->actingAs($this->owner, 'sanctum')
            ->postJson('/api/health-record-drafts', [
                ...$this->draftRequest(null),
                'consultation_uuid' => 'not-a-uuid',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('consultation_uuid');

        $request = $this->draftRequest(null);
        $request['payload']['consultationUuid'] = 'not-a-uuid';
        $this->actingAs($this->owner, 'sanctum')
            ->postJson('/api/health-record-drafts', $request)
            ->assertStatus(422);

        $this->assertDatabaseCount('health_record_drafts', 0);
    }

    // ---- Legacy drafts -------------------------------------------------

    public function test_legacy_draft_without_an_identity_still_saves_lists_and_resumes(): void
    {
        $publicId = $this->createDraft(null)
            ->assertCreated()
            ->assertJsonPath('data.consultation_uuid', null)
            ->json('data.id');

        $this->assertNull(HealthRecordDraft::where('public_id', $publicId)->value('consultation_uuid'));
        $this->actingAs($this->owner, 'sanctum')
            ->getJson("/api/health-record-drafts/{$publicId}")
            ->assertOk()
            ->assertJsonPath('data.consultation_uuid', null)
            ->assertJsonMissingPath('data.payload.consultationUuid');
        $this->updateDraft($publicId, 1, null)->assertOk();
    }

    public function test_legacy_drafts_with_null_identity_never_collide_with_each_other(): void
    {
        $this->createDraft(null)->assertCreated();
        $this->createDraft(null)->assertCreated();

        $this->assertSame(2, HealthRecordDraft::whereNull('consultation_uuid')->count());
    }

    public function test_legacy_draft_adopts_an_identity_once_on_its_next_save(): void
    {
        $publicId = $this->createDraft(null)->assertCreated()->json('data.id');
        $uuid = (string) Str::uuid();

        $this->updateDraft($publicId, 1, $uuid)
            ->assertOk()
            ->assertJsonPath('data.consultation_uuid', $uuid);

        // ...and keeps it: a second claim does not reassign.
        $this->updateDraft($publicId, 2, (string) Str::uuid())
            ->assertOk()
            ->assertJsonPath('data.consultation_uuid', $uuid);
    }

    public function test_legacy_draft_cannot_adopt_an_identity_another_draft_already_owns(): void
    {
        $taken = (string) Str::uuid();
        $owning = $this->createDraft($taken)->assertCreated()->json('data.id');
        $legacy = $this->createDraft(null)->assertCreated()->json('data.id');

        $this->updateDraft($legacy, 1, $taken)
            ->assertStatus(409)
            ->assertJsonPath('code', 'DRAFT_CONSULTATION_EXISTS')
            ->assertJsonPath('draft_id', $owning);

        $this->assertNull(HealthRecordDraft::where('public_id', $legacy)->value('consultation_uuid'));
        $this->assertSame(1, (int) HealthRecordDraft::where('public_id', $legacy)->value('version'));
    }

    // ---- Final health record -------------------------------------------

    public function test_final_record_receives_the_consultations_uuid_separate_from_idempotency_key(): void
    {
        $uuid = (string) Str::uuid();
        $draftId = $this->createDraft($uuid)->assertCreated()->json('data.id');
        $key = (string) Str::uuid();

        $created = $this->finalize($key, $draftId, [
            ...$this->officialPayload(),
            'consultation_uuid' => $uuid,
        ])->assertCreated();
        $recordId = $created->json('data.id');

        $row = DB::table('health_records')->where('id', $recordId)->first();
        $this->assertSame($uuid, $row->consultation_uuid);
        $this->assertSame($key, $row->idempotency_key);
        $this->assertNotSame($row->consultation_uuid, $row->idempotency_key);

        // The draft it came from carries the same identity.
        $this->assertDatabaseHas('health_record_drafts', [
            'public_id' => $draftId,
            'consultation_uuid' => $uuid,
            'status' => HealthRecordDraft::STATUS_CONSUMED,
            'consumed_health_record_id' => $recordId,
        ]);
    }

    public function test_consultation_uuid_is_hidden_from_health_record_responses(): void
    {
        $uuid = (string) Str::uuid();

        $response = $this->finalize((string) Str::uuid(), null, [
            ...$this->officialPayload(),
            'consultation_uuid' => $uuid,
        ])->assertCreated();

        $this->assertStringNotContainsString($uuid, $response->getContent());
        $response->assertJsonMissingPath('data.consultation_uuid');
    }

    public function test_the_same_consultation_cannot_become_two_records_under_a_new_key(): void
    {
        // The save committed but its response was lost; the encoder reloaded,
        // which mints a fresh idempotency key, and saved again.
        $uuid = (string) Str::uuid();
        $payload = [...$this->officialPayload(), 'consultation_uuid' => $uuid];

        $recordId = $this->finalize((string) Str::uuid(), null, $payload)
            ->assertCreated()
            ->json('data.id');

        $this->finalize((string) Str::uuid(), null, $payload)
            ->assertStatus(409)
            ->assertJsonPath('code', 'CONSULTATION_ALREADY_RECORDED')
            ->assertJsonPath('health_record_id', $recordId);

        $this->assertDatabaseCount('health_records', 1);
        $this->assertDatabaseCount('health_record_medicines', 1);
        $this->assertSame(18, $this->medicine->fresh()->quantity);
    }

    public function test_another_users_record_is_never_identified_by_a_shared_uuid(): void
    {
        $uuid = (string) Str::uuid();
        $this->finalize((string) Str::uuid(), null, [
            ...$this->officialPayload(),
            'consultation_uuid' => $uuid,
        ])->assertCreated();

        $this->actingAs($this->sameBhcUser, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson('/api/health-records', [
                ...$this->officialPayload(),
                'consultation_uuid' => $uuid,
            ])
            ->assertStatus(409)
            ->assertJsonPath('code', 'CONSULTATION_ALREADY_RECORDED')
            ->assertJsonPath('health_record_id', null);

        $this->assertDatabaseCount('health_records', 1);
    }

    public function test_records_without_an_identity_never_collide_with_each_other(): void
    {
        $this->finalize((string) Str::uuid(), null, $this->officialPayload())->assertCreated();
        $this->finalize((string) Str::uuid(), null, $this->officialPayload())->assertCreated();

        $this->assertSame(2, HealthRecord::whereNull('consultation_uuid')->count());
    }

    public function test_consultation_uuid_cannot_be_changed_on_an_existing_record(): void
    {
        $recordId = $this->finalize((string) Str::uuid(), null, [
            ...$this->officialPayload(),
            'consultation_uuid' => (string) Str::uuid(),
        ])->assertCreated()->json('data.id');

        $this->actingAs($this->owner, 'sanctum')
            ->putJson("/api/health-records/{$recordId}", [
                'consultation_uuid' => (string) Str::uuid(),
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('consultation_uuid');
    }

    // ---- Idempotency is unchanged --------------------------------------

    public function test_idempotent_replay_is_unchanged_and_ignores_consultation_uuid(): void
    {
        $key = (string) Str::uuid();
        $uuid = (string) Str::uuid();
        $payload = [...$this->officialPayload(), 'consultation_uuid' => $uuid];

        $recordId = $this->finalize($key, null, $payload)->assertCreated()->json('data.id');

        // Same key, same content: the ordinary replay.
        $this->finalize($key, null, $payload)
            ->assertOk()
            ->assertJsonPath('idempotent_replay', true)
            ->assertJsonPath('result.health_record_id', $recordId);

        // The identity is not part of the payload fingerprint, so a replay
        // that omits it is still the same submission.
        $this->finalize($key, null, $this->officialPayload())
            ->assertOk()
            ->assertJsonPath('idempotent_replay', true);

        // Changed CONTENT under the same key is still a mismatch.
        $this->finalize($key, null, [...$payload, 'chief_complaint' => 'Changed.'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH');

        $this->assertDatabaseCount('health_records', 1);
    }

    public function test_idempotency_hash_is_identical_with_or_without_consultation_uuid(): void
    {
        $service = app(\App\Services\HealthRecordIdempotencyService::class);
        $payload = $this->officialPayload();

        $this->assertSame(
            $service->hash($payload),
            $service->hash([...$payload, 'consultation_uuid' => (string) Str::uuid()])
        );
        $this->assertSame(
            $service->legacyHash($payload),
            $service->legacyHash([...$payload, 'consultation_uuid' => (string) Str::uuid()])
        );
    }

    // ---- Helpers -------------------------------------------------------

    private function createDraft(?string $uuid, string $diagnosis = 'Identity diagnosis.')
    {
        return $this->actingAs($this->owner, 'sanctum')
            ->postJson('/api/health-record-drafts', $this->draftRequest($uuid, $diagnosis));
    }

    private function updateDraft(string $publicId, int $version, ?string $uuid)
    {
        return $this->actingAs($this->owner, 'sanctum')
            ->putJson("/api/health-record-drafts/{$publicId}", [
                ...$this->draftRequest($uuid),
                'version' => $version,
            ]);
    }

    private function draftRequest(?string $uuid, string $diagnosis = 'Identity diagnosis.'): array
    {
        $payload = [
            'chiefComplaint' => 'Identity complaint.',
            'diagnosis' => $diagnosis,
            'dispensedMedicines' => [[
                'medicineId' => $this->medicine->id,
                'quantity' => 2,
            ]],
        ];
        if ($uuid !== null) {
            $payload['consultationUuid'] = $uuid;
        }

        return [
            'patient_id' => $this->patient->id,
            'classification' => 'General Consultation',
            ...($uuid !== null ? ['consultation_uuid' => $uuid] : []),
            'payload' => $payload,
        ];
    }

    private function finalize(string $key, ?string $draftId, array $payload)
    {
        return $this->actingAs($this->owner, 'sanctum')
            ->withHeaders([
                'Idempotency-Key' => $key,
                ...($draftId !== null ? ['X-Health-Record-Draft-ID' => $draftId] : []),
            ])
            ->postJson('/api/health-records', $payload);
    }

    private function officialPayload(): array
    {
        return [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Identity finalization visit.',
            'dispensed_medicines' => [[
                'medicine_id' => $this->medicine->id,
                'quantity' => 2,
            ]],
        ];
    }

    private function user(string $name, string $email): User
    {
        return User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $this->bhc->id,
        ]);
    }
}
