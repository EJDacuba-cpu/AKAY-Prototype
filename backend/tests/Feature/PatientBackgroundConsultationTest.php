<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Patient Background is reviewed and updated only inside a consultation and
 * applied when it is finalized - see
 * docs/superpowers/specs/2026-10-03-patient-background-tab-design.md.
 */
class PatientBackgroundConsultationTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    private User $clinician;

    private User $encoder;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Background RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Background BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->clinician = $this->user('clinician', ActionPermissions::PRESETS['clinical']);
        $this->encoder = $this->user('encoder', ActionPermissions::PRESETS['encoder']);
        $this->patient = Patient::create([
            'first_name' => 'Background', 'last_name' => 'Patient', 'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id,
            'medical_background' => [
                'allergies' => 'Dust',
                'currentDiseases' => [],
                'familyHistory' => ['similarIllness' => 'Mother - Asthma'],
                'personalSocial' => ['smoking' => 'Never'],
                'revisions' => ['medical' => 2, 'family' => 1, 'social' => 0],
                'updatedAt' => ['medical' => '2026-01-01', 'family' => '2026-01-01'],
            ],
        ]);
    }

    private function user(string $name, array $permissions): User
    {
        return User::create([
            'name' => ucfirst($name), 'email' => "{$name}@example.test", 'password' => bcrypt('test-password'),
            'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $this->bhc->id, 'permissions' => $permissions,
        ]);
    }

    private function finalize(?array $backgroundUpdate, array $extra = [], ?User $as = null)
    {
        return $this->actingAs($as ?? $this->clinician, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson('/api/health-records', [
                'patient_id' => $this->patient->id,
                'category' => 'General Consultation',
                'chief_complaint' => 'Check-up',
                'date_recorded' => '2026-10-03',
                ...($backgroundUpdate === null ? [] : ['background_update' => $backgroundUpdate]),
                ...$extra,
            ]);
    }

    private function background(): array
    {
        return $this->patient->fresh()->medical_background;
    }

    public function test_finalize_applies_only_the_edited_section_and_logs_it(): void
    {
        $id = $this->finalize([
            'sections' => ['family' => ['familyHistory' => ['similarIllness' => 'Mother - Asthma', 'chronicIllness' => 'Father - Diabetes']]],
            'base_revisions' => ['family' => 1],
        ])->assertCreated()->json('data.id');

        $background = $this->background();
        $this->assertSame('Father - Diabetes', $background['familyHistory']['chronicIllness']);
        $this->assertSame(2, $background['revisions']['family']);
        $this->assertSame('2026-10-03', $background['updatedAt']['family']);
        // Untouched sections keep their content, revision and date.
        $this->assertSame('Dust', $background['allergies']);
        $this->assertSame(['smoking' => 'Never'], $background['personalSocial']);
        $this->assertSame(2, $background['revisions']['medical']);
        $this->assertSame('2026-01-01', $background['updatedAt']['medical']);

        $changes = HealthRecord::findOrFail($id)->background_changes;
        $this->assertCount(1, $changes);
        $this->assertSame('family', $changes[0]['section']);
        $this->assertSame('consultation', $changes[0]['source']);
        $this->assertSame(['familyHistory' => ['similarIllness' => 'Mother - Asthma']], $changes[0]['before']);
        $this->assertSame('Father - Diabetes', $changes[0]['after']['familyHistory']['chronicIllness']);
        $this->assertSame(2, $changes[0]['revision']);
        $this->assertSame($this->clinician->id, $changes[0]['changedBy']);
    }

    public function test_a_stale_edited_section_is_a_conflict_and_nothing_is_saved(): void
    {
        $this->finalize([
            'sections' => ['medical' => ['allergies' => 'Penicillin']],
            'base_revisions' => ['medical' => 1],
        ])->assertStatus(409)
            ->assertJsonPath('code', 'PATIENT_BACKGROUND_CONFLICT')
            ->assertJsonPath('conflicts.0.section', 'medical')
            ->assertJsonPath('conflicts.0.revision', 2)
            ->assertJsonPath('conflicts.0.current.allergies', 'Dust');

        $this->assertSame(0, HealthRecord::count());
        $this->assertSame('Dust', $this->background()['allergies']);
    }

    public function test_an_untouched_section_never_blocks_finalization(): void
    {
        // Family moved to revision 1 elsewhere; this consultation only edited Social.
        $this->finalize([
            'sections' => ['social' => ['personalSocial' => ['smoking' => 'Former smoker']]],
            'base_revisions' => ['social' => 0],
        ])->assertCreated();

        $this->assertSame('Former smoker', $this->background()['personalSocial']['smoking']);
    }

    public function test_an_unchanged_section_is_not_logged_or_bumped(): void
    {
        $id = $this->finalize([
            'sections' => ['social' => ['personalSocial' => ['smoking' => 'Never', 'diet' => '']]],
            'base_revisions' => ['social' => 0],
        ])->assertCreated()->json('data.id');

        $this->assertNull(HealthRecord::findOrFail($id)->background_changes);
        $this->assertSame(0, $this->background()['revisions']['social']);
    }

    public function test_finalizing_without_clinical_history_cannot_update_the_background(): void
    {
        $finalizer = $this->user('finalizer', ['consultations.encode', 'consultations.finalize']);

        $this->finalize([
            'sections' => ['medical' => ['allergies' => 'Penicillin']],
            'base_revisions' => ['medical' => 2],
        ], [], $finalizer)->assertForbidden();

        $this->assertSame(0, HealthRecord::count());
        $this->assertSame('Dust', $this->background()['allergies']);
    }

    public function test_diagnosis_sync_builds_on_the_edited_medical_section(): void
    {
        $id = $this->finalize([
            'sections' => ['medical' => ['allergies' => 'Penicillin', 'currentDiseases' => [['name' => 'Asthma', 'status' => 'Controlled']]]],
            'base_revisions' => ['medical' => 2],
        ], [
            'diagnosis' => 'Hypertension',
            'diagnoses' => [['id' => 'd1', 'name' => 'HTN']],
        ])->assertCreated()->json('data.id');

        $background = $this->background();
        $this->assertSame('Penicillin', $background['allergies']);
        $this->assertSame(['Asthma', 'Hypertension'], array_column($background['currentDiseases'], 'name'));
        $this->assertSame(4, $background['revisions']['medical']);

        $changes = HealthRecord::findOrFail($id)->background_changes;
        $this->assertSame(['consultation', 'diagnosis'], array_column($changes, 'source'));
        $this->assertSame([3, 4], array_column($changes, 'revision'));
    }

    public function test_a_diagnosis_sync_bumps_the_medical_revision_for_later_conflicts(): void
    {
        $this->finalize(null, [
            'diagnosis' => 'Hypertension',
            'diagnoses' => [['id' => 'd1', 'name' => 'Hypertension']],
        ])->assertCreated();

        $this->assertSame(3, $this->background()['revisions']['medical']);
        $this->finalize([
            'sections' => ['medical' => ['allergies' => 'Penicillin']],
            'base_revisions' => ['medical' => 2],
        ])->assertStatus(409);
    }

    public function test_background_history_lists_changes_newest_first(): void
    {
        $this->finalize([
            'sections' => ['family' => ['familyHistory' => ['hereditaryIllness' => 'None']]],
            'base_revisions' => ['family' => 1],
        ])->assertCreated();
        $this->travel(1)->minutes();
        $latestId = $this->finalize([
            'sections' => ['social' => ['personalSocial' => ['alcohol' => 'Occasional']]],
            'base_revisions' => ['social' => 0],
        ])->assertCreated()->json('data.id');

        $this->actingAs($this->clinician, 'sanctum')
            ->getJson("/api/patients/{$this->patient->id}/background-history")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.section', 'social')
            ->assertJsonPath('data.0.healthRecordId', $latestId)
            ->assertJsonPath('data.0.changedByName', 'Clinician')
            ->assertJsonPath('data.1.section', 'family');

        $this->actingAs($this->encoder, 'sanctum')
            ->getJson("/api/patients/{$this->patient->id}/background-history")
            ->assertForbidden();
    }

    public function test_record_responses_do_not_expose_background_changes(): void
    {
        $this->finalize([
            'sections' => ['medical' => ['allergies' => 'Penicillin']],
            'base_revisions' => ['medical' => 2],
        ])->assertCreated()->assertJsonMissingPath('data.background_changes');
    }

    private function draftPayload(array $extra = []): array
    {
        return [
            'patient_id' => $this->patient->id,
            'classification' => 'General Consultation',
            'payload' => ['chiefComplaint' => 'Draft complaint', ...$extra],
        ];
    }

    private function stagedUpdate(): array
    {
        return [
            'sections' => ['family' => ['familyHistory' => [
                'similarIllness' => 'Mother - Asthma', 'chronicIllness' => 'Father - Diabetes', 'hereditaryIllness' => '',
            ]]],
            'baseRevisions' => ['family' => 1],
        ];
    }

    public function test_an_encoder_cannot_stage_background_edits_in_a_draft(): void
    {
        $this->actingAs($this->encoder, 'sanctum')
            ->postJson('/api/health-record-drafts', $this->draftPayload(['backgroundUpdate' => $this->stagedUpdate()]))
            ->assertForbidden();
    }

    public function test_staged_edits_are_hidden_from_and_preserved_against_an_encoder(): void
    {
        $draft = $this->actingAs($this->clinician, 'sanctum')
            ->postJson('/api/health-record-drafts', $this->draftPayload(['backgroundUpdate' => $this->stagedUpdate()]))
            ->assertCreated()->json('data');

        $this->actingAs($this->clinician, 'sanctum')
            ->getJson("/api/health-record-drafts/{$draft['id']}")
            ->assertOk()
            ->assertJsonPath('data.payload.backgroundUpdate.baseRevisions.family', 1);

        $this->actingAs($this->encoder, 'sanctum')
            ->getJson("/api/health-record-drafts/{$draft['id']}")
            ->assertOk()
            ->assertJsonMissingPath('data.payload.backgroundUpdate');

        $version = $this->actingAs($this->encoder, 'sanctum')
            ->postJson("/api/health-record-drafts/{$draft['id']}/transition", [
                'action' => 'takeover', 'version' => $draft['version'], 'note' => 'Continuing the interview',
            ])->assertOk()->json('data.version');
        $this->actingAs($this->encoder, 'sanctum')
            ->putJson("/api/health-record-drafts/{$draft['id']}", [
                ...$this->draftPayload(['chiefComplaint' => 'Updated by encoder']),
                'version' => $version,
            ])->assertOk();

        $this->actingAs($this->clinician, 'sanctum')
            ->getJson("/api/health-record-drafts/{$draft['id']}")
            ->assertOk()
            ->assertJsonPath('data.payload.chiefComplaint', 'Updated by encoder')
            ->assertJsonPath('data.payload.backgroundUpdate.sections.family.familyHistory.chronicIllness', 'Father - Diabetes');
    }
}
