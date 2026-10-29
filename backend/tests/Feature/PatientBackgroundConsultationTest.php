<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Patient Background is reviewed and updated only inside a consultation and
 * applied when it is finalized - see
 * docs/superpowers/specs/2026-10-03-patient-background-tab-design.md and, for
 * the section shapes, docs/superpowers/specs/2026-10-16-itr-patient-history-design.md.
 */
class PatientBackgroundConsultationTest extends TestCase
{
    use RefreshDatabase;

    private const DUST = ['items' => [['allergen' => 'Dust']]];

    private const MOTHER_ASTHMA = ['items' => [['condition' => 'Asthma', 'kind' => 'Chronic', 'relation' => 'Mother']]];

    private BarangayHealthCenter $bhc;

    private User $clinician;

    private User $encoder;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Background RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Background BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->clinician = $this->user('clinician', StaffRoles::defaults('midwife'));
        $this->encoder = $this->user('encoder', StaffRoles::defaults('encoder'));
        $this->patient = Patient::create([
            'first_name' => 'Background', 'last_name' => 'Patient', 'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id,
            'medical_background' => [
                'allergies' => self::DUST,
                'currentDiseases' => [],
                'familyHistory' => self::MOTHER_ASTHMA,
                'personalSocial' => ['smoking' => ['status' => 'never']],
                'revisions' => ['medical' => 2, 'family' => 1, 'social' => 0],
                'updatedAt' => ['medical' => '2026-01-01', 'family' => '2026-01-01'],
            ],
        ]);
    }

    private function user(string $name, array $permissions): User
    {
        return User::create([
            'name' => ucfirst($name), 'email' => "{$name}@example.test", 'password' => bcrypt('test-password'),
            'role' => User::ROLE_BHC, 'status' => User::STATUS_ACTIVE,
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
        $fatherDiabetes = ['condition' => 'Diabetes', 'kind' => 'Hereditary', 'relation' => 'Father'];
        $id = $this->finalize([
            'sections' => ['family' => ['familyHistory' => ['items' => [...self::MOTHER_ASTHMA['items'], $fatherDiabetes]]]],
            'base_revisions' => ['family' => 1],
        ])->assertCreated()->json('data.id');

        $background = $this->background();
        $this->assertSame($fatherDiabetes, $background['familyHistory']['items'][1]);
        $this->assertSame(2, $background['revisions']['family']);
        $this->assertSame('2026-10-03', $background['updatedAt']['family']);
        // Untouched sections keep their content, revision and date.
        $this->assertSame(self::DUST, $background['allergies']);
        $this->assertSame(['smoking' => ['status' => 'never']], $background['personalSocial']);
        $this->assertSame(2, $background['revisions']['medical']);
        $this->assertSame('2026-01-01', $background['updatedAt']['medical']);

        $changes = HealthRecord::findOrFail($id)->background_changes;
        $this->assertCount(1, $changes);
        $this->assertSame('family', $changes[0]['section']);
        $this->assertSame('consultation', $changes[0]['source']);
        $this->assertSame(['familyHistory' => self::MOTHER_ASTHMA], $changes[0]['before']);
        $this->assertSame($fatherDiabetes, $changes[0]['after']['familyHistory']['items'][1]);
        $this->assertSame(2, $changes[0]['revision']);
        $this->assertSame($this->clinician->id, $changes[0]['changedBy']);
    }

    public function test_a_stale_edited_section_is_a_conflict_and_nothing_is_saved(): void
    {
        $this->finalize([
            'sections' => ['medical' => ['allergies' => ['items' => [['allergen' => 'Penicillin']]]]],
            'base_revisions' => ['medical' => 1],
        ])->assertStatus(409)
            ->assertJsonPath('code', 'PATIENT_BACKGROUND_CONFLICT')
            ->assertJsonPath('conflicts.0.section', 'medical')
            ->assertJsonPath('conflicts.0.revision', 2)
            ->assertJsonPath('conflicts.0.current.allergies', self::DUST);

        $this->assertSame(0, HealthRecord::count());
        $this->assertSame(self::DUST, $this->background()['allergies']);
    }

    public function test_an_untouched_section_never_blocks_finalization(): void
    {
        // Family moved to revision 1 elsewhere; this consultation only edited Social.
        $this->finalize([
            'sections' => ['social' => ['personalSocial' => ['smoking' => ['status' => 'former', 'quitYear' => 2024]]]],
            'base_revisions' => ['social' => 0],
        ])->assertCreated();

        $this->assertSame(['status' => 'former', 'quitYear' => 2024], $this->background()['personalSocial']['smoking']);
    }

    public function test_an_unchanged_section_is_not_logged_or_bumped(): void
    {
        // "" and null mean "not recorded", so this equals what is stored.
        $id = $this->finalize([
            'sections' => ['social' => ['personalSocial' => [
                'smoking' => ['status' => 'never', 'sticksPerDay' => null], 'pastOccupations' => '  ',
                'diet' => ['highSalt' => false, 'notes' => ''],
            ]]],
            'base_revisions' => ['social' => 0],
        ])->assertCreated()->json('data.id');

        $this->assertNull(HealthRecord::findOrFail($id)->background_changes);
        $this->assertSame(0, $this->background()['revisions']['social']);
    }

    private function legacyHypertension(): array
    {
        return [
            'name' => 'Hypertension', 'status' => 'Active', 'firstRecorded' => '2026-02-01',
            'lastConfirmed' => '2026-03-01', 'source' => 'Consultation', 'conditionKey' => 'hypertension',
        ];
    }

    private function seedDiseases(array $diseases): void
    {
        $background = $this->background();
        $background['currentDiseases'] = $diseases;
        $this->patient->update(['medical_background' => $background]);
    }

    private function updateDiseases(array $diseases)
    {
        return $this->finalize([
            'sections' => ['medical' => ['currentDiseases' => $diseases]],
            'base_revisions' => ['medical' => $this->background()['revisions']['medical']],
        ]);
    }

    public function test_new_condition_entries_are_saved_as_patient_reported(): void
    {
        $this->updateDiseases([[
            'name' => ' Asthma ', 'note' => '  Childhood, used an inhaler  ', 'status' => 'Active',
            'source' => 'Consultation', 'firstRecorded' => '2020-01-01', 'conditionKey' => 'asthma',
        ]])->assertCreated();

        $this->assertSame([[
            'name' => 'Asthma', 'note' => 'Childhood, used an inhaler', 'source' => 'Patient-reported',
            'firstRecorded' => '2026-10-03',
        ]], $this->background()['currentDiseases']);
    }

    public function test_an_empty_note_is_not_stored(): void
    {
        $this->updateDiseases([['name' => 'Asthma', 'note' => '   ']])->assertCreated();

        $this->assertArrayNotHasKey('note', $this->background()['currentDiseases'][0]);
    }

    public function test_every_submitted_condition_becomes_patient_reported(): void
    {
        // Pre-ITR entries carry other sources; the list holds only what the
        // client submits, each as patient-reported, keeping its first date.
        $legacy = $this->legacyHypertension();
        $this->seedDiseases([$legacy, ['name' => 'Goiter', 'source' => 'Consultation', 'firstRecorded' => '2026-01-01']]);

        $this->updateDiseases([
            [...$legacy, 'name' => 'hypertension ', 'status' => 'Resolved'],
            ['name' => 'Asthma'],
        ])->assertCreated();

        $this->assertSame([
            ['name' => 'hypertension', 'source' => 'Patient-reported', 'firstRecorded' => '2026-02-01'],
            ['name' => 'Asthma', 'source' => 'Patient-reported', 'firstRecorded' => '2026-10-03'],
        ], $this->background()['currentDiseases']);
    }

    public function test_a_patient_reported_entry_can_be_removed_and_keeps_its_first_recorded_date(): void
    {
        $asthma = ['name' => 'Asthma', 'source' => 'Patient-reported', 'firstRecorded' => '2026-05-05'];
        $goiter = ['name' => 'Goiter', 'source' => 'Patient-reported', 'firstRecorded' => '2026-06-06'];
        $this->seedDiseases([$asthma, $goiter]);

        // Echoing a stored entry keeps its original date.
        $this->updateDiseases([
            [...$asthma, 'firstRecorded' => '2026-10-03', 'note' => 'Wheezes at night'], $goiter,
        ])->assertCreated();
        $diseases = $this->background()['currentDiseases'];
        $this->assertSame('2026-05-05', $diseases[0]['firstRecorded']);
        $this->assertSame('Wheezes at night', $diseases[0]['note']);

        // Removing it from the list removes it.
        $this->updateDiseases([$goiter])->assertCreated();
        $this->assertSame([$goiter], $this->background()['currentDiseases']);
    }

    public function test_echoing_stored_conditions_is_not_logged_or_bumped(): void
    {
        // Stored before this change with empty status/conditionKey/note fields.
        $reported = ['name' => 'Asthma', 'note' => null, 'source' => 'Patient-reported', 'firstRecorded' => '2026-05-05', 'status' => null, 'conditionKey' => null];
        $this->seedDiseases([$reported]);

        $id = $this->updateDiseases([$reported])->assertCreated()->json('data.id');

        $this->assertNull(HealthRecord::findOrFail($id)->background_changes);
        $this->assertSame(2, $this->background()['revisions']['medical']);
    }

    public function test_finalizing_without_clinical_history_cannot_update_the_background(): void
    {
        $finalizer = $this->user('finalizer', ['consultations.encode', 'consultations.finalize']);

        $this->finalize([
            'sections' => ['medical' => ['allergies' => ['items' => [['allergen' => 'Penicillin']]]]],
            'base_revisions' => ['medical' => 2],
        ], [], $finalizer)->assertForbidden();

        $this->assertSame(0, HealthRecord::count());
        $this->assertSame(self::DUST, $this->background()['allergies']);
    }

    public function test_background_history_lists_changes_newest_first(): void
    {
        $this->finalize([
            'sections' => ['family' => ['familyHistory' => ['noneKnown' => true]]],
            'base_revisions' => ['family' => 1],
        ])->assertCreated();
        $this->travel(1)->minutes();
        $latestId = $this->finalize([
            'sections' => ['social' => ['personalSocial' => ['alcohol' => ['status' => 'current', 'frequency' => 'occasional']]]],
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
            'sections' => ['medical' => ['allergies' => ['items' => [['allergen' => 'Penicillin']]]]],
            'base_revisions' => ['medical' => 2],
        ])->assertCreated()->assertJsonMissingPath('data.background_changes');
    }

    public function test_finalize_freezes_a_history_snapshot_including_unchanged_sections(): void
    {
        $fatherDiabetes = ['condition' => 'Diabetes', 'kind' => 'Hereditary', 'relation' => 'Father'];
        $id = $this->finalize([
            'sections' => ['family' => ['familyHistory' => ['items' => [...self::MOTHER_ASTHMA['items'], $fatherDiabetes]]]],
            'base_revisions' => ['family' => 1],
        ])->assertCreated()->json('data.id');

        $snapshot = HealthRecord::findOrFail($id)->history_snapshot;
        $this->assertSame($fatherDiabetes, $snapshot['sections']['family']['familyHistory']['items'][1]);
        $this->assertSame(self::DUST, $snapshot['sections']['medical']['allergies']);
        $this->assertSame(['smoking' => ['status' => 'never']], $snapshot['sections']['social']['personalSocial']);
        $this->assertArrayNotHasKey('obstetric', $snapshot['sections']);
        $this->assertArrayNotHasKey('revisions', $snapshot['sections']['medical']);
        $this->assertCount(1, $snapshot['changes']);
        $this->assertSame('family', $snapshot['changes'][0]['section']);

        $this->actingAs($this->clinician, 'sanctum')
            ->getJson("/api/health-records/{$id}")
            ->assertOk()
            ->assertJsonMissingPath('data.background_changes')
            ->assertJsonPath('data.history_snapshot.changes.0.section', 'family')
            ->assertJsonPath('data.history_snapshot.sections.medical.allergies.items.0.allergen', 'Dust');
    }

    public function test_maternal_visits_include_obstetric_in_the_snapshot(): void
    {
        $this->patient->update([
            'medical_background' => [
                ...$this->background(),
                'obstetric' => ['menarcheAge' => 13, 'menstrualStatus' => 'menstruating'],
            ],
        ]);

        $id = $this->finalize(null, ['category' => 'Maternal'])->assertCreated()->json('data.id');

        $snapshot = HealthRecord::findOrFail($id)->history_snapshot;
        $this->assertSame(13, $snapshot['sections']['obstetric']['obstetric']['menarcheAge']);
        $this->assertSame(self::DUST, $snapshot['sections']['medical']['allergies']);
    }

    public function test_a_later_background_update_does_not_rewrite_an_older_snapshot(): void
    {
        $id = $this->finalize(null)->assertCreated()->json('data.id');
        $frozen = HealthRecord::findOrFail($id)->history_snapshot;

        $laterId = $this->finalize([
            'sections' => ['medical' => ['allergies' => ['items' => [['allergen' => 'Penicillin']]]]],
            'base_revisions' => ['medical' => 2],
        ])->assertCreated()->json('data.id');

        $this->assertSame($frozen, HealthRecord::findOrFail($id)->fresh()->history_snapshot);
        $this->assertSame(self::DUST, $frozen['sections']['medical']['allergies']);
        $this->assertSame('Penicillin', $this->background()['allergies']['items'][0]['allergen']);
        $later = HealthRecord::findOrFail($laterId)->history_snapshot;
        $this->assertSame('Penicillin', $later['sections']['medical']['allergies']['items'][0]['allergen']);
        $this->assertSame(self::MOTHER_ASTHMA, $later['sections']['family']['familyHistory']);
        $this->assertNotSame($frozen, $later);
    }

    public function test_first_visit_without_history_edits_still_freezes_unchanged_sections(): void
    {
        $id = $this->finalize(null)->assertCreated()->json('data.id');

        $snapshot = HealthRecord::findOrFail($id)->history_snapshot;
        $this->assertSame(self::MOTHER_ASTHMA, $snapshot['sections']['family']['familyHistory']);
        $this->assertSame(self::DUST, $snapshot['sections']['medical']['allergies']);
        $this->assertSame(['smoking' => ['status' => 'never']], $snapshot['sections']['social']['personalSocial']);
        $this->assertSame(['currentDiseases', 'allergies', 'hospitalizations'], array_keys($snapshot['sections']['medical']));
        $this->assertArrayNotHasKey('obstetric', $snapshot['sections']);
        $this->assertSame([], $snapshot['changes']);

        $this->actingAs($this->encoder, 'sanctum')
            ->getJson("/api/health-records/{$id}")
            ->assertForbidden();
    }

    public function test_mixed_general_and_prenatal_visits_include_obstetric_in_the_snapshot(): void
    {
        $this->patient->update([
            'medical_background' => [
                ...$this->background(),
                'obstetric' => ['menarcheAge' => 13, 'menstrualStatus' => 'menstruating'],
            ],
        ]);

        $id = $this->finalize(null, [
            'category' => 'Maternal',
            'notes' => 'No vaccine this visit.',
            'monitoring_data' => [
                'selectedPrograms' => ['Maternal', 'EPI'],
                'primaryProgram' => 'Maternal',
            ],
        ])->assertCreated()->json('data.id');

        $snapshot = HealthRecord::findOrFail($id)->history_snapshot;
        $this->assertSame(13, $snapshot['sections']['obstetric']['obstetric']['menarcheAge']);
        $this->assertSame(self::DUST, $snapshot['sections']['medical']['allergies']);
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
        // The draft schema for the new section shapes is Task 3's; a
        // condition entry has the same shape before and after.
        return [
            'sections' => ['medical' => ['currentDiseases' => [['name' => 'Asthma', 'note' => 'Since childhood']]]],
            'baseRevisions' => ['medical' => 2],
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
            ->assertJsonPath('data.payload.backgroundUpdate.baseRevisions.medical', 2);

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
            ->assertJsonPath('data.payload.backgroundUpdate.sections.medical.currentDiseases.0.name', 'Asthma');
    }
}
