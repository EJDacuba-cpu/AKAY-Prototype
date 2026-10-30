<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\HealthRecordDraftPayloadService;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The informant and similar-illness answers on a record, and the ITR Patient
 * History staged update through records and drafts (BHC and RHU share
 * POST /health-records) - docs/superpowers/specs/2026-10-16-itr-patient-history-design.md.
 */
class PatientHistoryRecordTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    private User $clinician;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Record RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Record BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $this->clinician = User::create([
            'name' => 'Clinician', 'email' => 'clinician@example.test', 'password' => bcrypt('test-password'),
            'role' => User::ROLE_BHC, 'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $this->bhc->id, 'permissions' => StaffRoles::defaults('midwife'),
        ]);
        $this->patient = Patient::create([
            'first_name' => 'Record', 'last_name' => 'Patient', 'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id, 'rural_health_unit_id' => $this->rhu->id,
            'medical_background' => [
                'familyHistory' => ['items' => [['condition' => 'Asthma', 'kind' => 'Chronic', 'relation' => 'Mother']]],
                'revisions' => ['medical' => 0, 'family' => 3, 'social' => 0],
                'updatedAt' => ['family' => '2026-01-01'],
            ],
        ]);
    }

    private function record(array $extra = [], ?User $as = null)
    {
        return $this->actingAs($as ?? $this->clinician, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson('/api/health-records', [
                'patient_id' => $this->patient->id,
                'category' => 'General Consultation',
                'chief_complaint' => 'Check-up',
                'date_recorded' => '2026-10-16',
                ...$extra,
            ]);
    }

    private function informant(array $overrides = []): array
    {
        return ['relation' => 'Mother', 'name' => 'Maria Santos', 'patientId' => null, ...$overrides];
    }

    private function similarIllness(array $overrides = []): array
    {
        return ['answer' => 'Yes', 'who' => 'Younger brother', 'note' => 'Same fever and rash', ...$overrides];
    }

    public function test_finalize_saves_informant_and_similar_illness(): void
    {
        $informant = $this->informant(['relation' => 'Patient', 'name' => null, 'patientId' => $this->patient->id]);
        $similar = $this->similarIllness();

        $id = $this->record(['informant' => $informant, 'similar_illness' => $similar])
            ->assertCreated()->json('data.id');

        $record = HealthRecord::findOrFail($id);
        $this->assertSame($informant, $record->informant);
        $this->assertSame($similar, $record->similar_illness);
    }

    public function test_informant_and_similar_illness_are_optional(): void
    {
        $id = $this->record(['informant' => null, 'similar_illness' => null])->assertCreated()->json('data.id');

        $record = HealthRecord::findOrFail($id);
        $this->assertNull($record->informant);
        $this->assertNull($record->similar_illness);
    }

    public function test_bad_informant_relation_is_422(): void
    {
        $this->record(['informant' => $this->informant(['relation' => 'Neighbour'])])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('informant.relation');
        $this->record(['informant' => $this->informant(['name' => str_repeat('a', 151)])])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('informant.name');
        $this->record(['informant' => $this->informant(['patientId' => 999999])])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('informant.patientId');
        $this->record(['similar_illness' => $this->similarIllness(['answer' => 'Maybe'])])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('similar_illness.answer');
        $this->record(['similar_illness' => $this->similarIllness(['note' => str_repeat('a', 501)])])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('similar_illness.note');

        $this->assertSame(0, HealthRecord::count());
    }

    public function test_a_saved_record_cannot_be_given_an_informant_afterwards(): void
    {
        $id = $this->record()->assertCreated()->json('data.id');

        $this->actingAs($this->clinician, 'sanctum')
            ->patchJson("/api/health-records/{$id}", ['informant' => $this->informant()])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('informant');
    }

    private function stagedUpdate(): array
    {
        return [
            'sections' => [
                'medical' => [
                    'currentDiseases' => [['name' => 'Asthma', 'yearDiagnosed' => 2015, 'note' => 'Uses inhaler']],
                    'allergies' => ['noneKnown' => true],
                    'hospitalizations' => ['items' => [['type' => 'Surgery', 'year' => 2021, 'reason' => 'Appendectomy', 'place' => 'District']]],
                ],
                'family' => ['familyHistory' => ['items' => [['condition' => 'Diabetes', 'kind' => 'Hereditary', 'relation' => 'Father', 'relativePatientId' => null]]]],
                'social' => ['personalSocial' => [
                    'education' => ['level' => 'College', 'completed' => 'Graduate'],
                    'pastOccupations' => 'Farmer',
                    'smoking' => ['status' => 'former', 'sticksPerDay' => 10, 'years' => 5, 'quitYear' => 2020],
                    'alcohol' => ['status' => 'current', 'frequency' => 'weekly'],
                    'diet' => ['highSalt' => true, 'fatty' => false, 'sweetDrinks' => true, 'lowFruitVeg' => false, 'notes' => 'Dried fish'],
                    'sexual' => ['active' => 'declined', 'notes' => null],
                    'environment' => ['waterSource' => 'Level III', 'toilet' => 'Pit latrine', 'exposures' => ['secondhandSmoke'], 'notes' => 'Wood stove'],
                ]],
                'obstetric' => ['obstetric' => [
                    'menarcheAge' => 13, 'menstrualStatus' => 'menstruating', 'menopauseAge' => null,
                    'intervalDays' => 28, 'durationDays' => 5, 'amount' => 'moderate', 'regularity' => 'regular',
                    'symptoms' => ['dysmenorrhea', 'bloating'], 'symptomNotes' => 'Cramps',
                    'pregnancies' => [['year' => 2018, 'outcome' => 'liveBirth', 'delivery' => 'normal', 'place' => 'BHC', 'note' => 'Healthy']],
                ]],
            ],
            'baseRevisions' => ['medical' => 0, 'family' => 3, 'social' => 0, 'obstetric' => 0],
            'reviewed' => ['medical', 'family', 'social', 'obstetric'],
        ];
    }

    private function draftBody(array $payload): array
    {
        return [
            'patient_id' => $this->patient->id,
            'classification' => 'General Consultation',
            'payload' => ['chiefComplaint' => 'Draft complaint', ...$payload],
        ];
    }

    public function test_draft_round_trips_informant_similar_illness_and_new_background_update(): void
    {
        $payload = [
            'informant' => $this->informant(['relation' => 'Guardian']),
            'similarIllness' => $this->similarIllness(),
            'backgroundUpdate' => $this->stagedUpdate(),
        ];

        $draft = $this->actingAs($this->clinician, 'sanctum')
            ->postJson('/api/health-record-drafts', $this->draftBody($payload))
            ->assertCreated()->json('data');

        $shown = $this->actingAs($this->clinician, 'sanctum')
            ->getJson("/api/health-record-drafts/{$draft['id']}")
            ->assertOk()->json('data.payload');

        $this->assertEquals($payload['informant'], $shown['informant']);
        $this->assertEquals($payload['similarIllness'], $shown['similarIllness']);
        $this->assertEquals($payload['backgroundUpdate'], $shown['backgroundUpdate']);
    }

    public function test_draft_keeps_unrecorded_sections_sent_as_null(): void
    {
        $update = [
            'sections' => ['medical' => ['allergies' => null, 'hospitalizations' => null], 'social' => ['personalSocial' => ['smoking' => null]]],
            'baseRevisions' => ['medical' => 0, 'social' => 0],
        ];

        $draft = $this->actingAs($this->clinician, 'sanctum')
            ->postJson('/api/health-record-drafts', $this->draftBody(['backgroundUpdate' => $update]))
            ->assertCreated()->json('data');

        $this->actingAs($this->clinician, 'sanctum')
            ->getJson("/api/health-record-drafts/{$draft['id']}")
            ->assertOk()
            ->assertJsonPath('data.payload.backgroundUpdate.sections.medical.allergies', null)
            ->assertJsonPath('data.payload.backgroundUpdate.baseRevisions.social', 0);
    }

    public function test_draft_rejects_a_bad_informant_or_similar_illness(): void
    {
        foreach ([
            ['informant' => $this->informant(['relation' => 'Neighbour'])],
            ['informant' => $this->informant(['name' => str_repeat('a', 151)])],
            ['informant' => $this->informant(['patientId' => 999999])],
            ['similarIllness' => $this->similarIllness(['answer' => 'Maybe'])],
            ['similarIllness' => $this->similarIllness(['who' => str_repeat('a', 151)])],
            ['informant' => [...$this->informant(), 'extra' => 'x']],
        ] as $payload) {
            $this->actingAs($this->clinician, 'sanctum')
                ->postJson('/api/health-record-drafts', $this->draftBody($payload))
                ->assertUnprocessable();
        }
    }

    public function test_draft_with_legacy_background_update_opens_with_the_update_dropped(): void
    {
        $payload = [
            'chiefComplaint' => 'Old draft',
            'backgroundUpdate' => [
                'sections' => ['medical' => ['allergies' => 'Dust', 'hospitalizations' => '', 'surgeries' => 'None']],
                'baseRevisions' => ['medical' => 2],
            ],
        ];

        $sanitized = app(HealthRecordDraftPayloadService::class)->sanitize($payload);

        $this->assertArrayNotHasKey('backgroundUpdate', $sanitized);
        $this->assertSame('Old draft', $sanitized['chiefComplaint']);
    }

    public function test_rhu_user_can_update_background_through_health_records(): void
    {
        $rhuUser = User::create([
            'name' => 'RHU Nurse', 'email' => 'rhu-nurse@example.test', 'password' => bcrypt('test-password'),
            'role' => User::ROLE_RHU, 'status' => User::STATUS_ACTIVE,
            'rural_health_unit_id' => $this->rhu->id, 'permissions' => [...StaffRoles::defaults('midwife'), 'rhu.manage', 'conditions.confirm'],
        ]);
        // The BHC fills the patient first.
        $this->record(['background_update' => [
            'sections' => ['family' => ['familyHistory' => ['noneKnown' => true]]],
            'base_revisions' => ['family' => 3],
        ]])->assertCreated();
        $this->assertSame(4, $this->patient->fresh()->medical_background['revisions']['family']);

        $this->record(['background_update' => [
            'sections' => ['family' => ['familyHistory' => ['items' => [['condition' => 'Hypertension', 'relation' => 'Father']]]]],
            'base_revisions' => ['family' => 4],
            'reviewed' => ['social'],
        ]], $rhuUser)->assertCreated();

        $background = $this->patient->fresh()->medical_background;
        $this->assertSame(5, $background['revisions']['family']);
        $this->assertSame('Hypertension', $background['familyHistory']['items'][0]['condition']);
        $this->assertSame('Record RHU', $background['reviewedAt']['social']['facility']);
        $this->assertSame($rhuUser->id, $background['reviewedAt']['social']['by']);
        $this->assertSame('Record RHU', $background['reviewedAt']['family']['facility']);
        $this->assertSame(0, $background['revisions']['social']);
    }
}
