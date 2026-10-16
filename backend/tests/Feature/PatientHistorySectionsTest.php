<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\PatientBackground;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The five-section ITR Patient History (II-V editable) and the `reviewed`
 * stamps - docs/superpowers/specs/2026-10-16-itr-patient-history-design.md.
 */
class PatientHistorySectionsTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    private User $clinician;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'History RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'History BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->clinician = $this->user('clinician', StaffRoles::defaults('midwife'));
        $this->patient = $this->makePatient('Female', [
            'allergies' => ['items' => [['allergen' => 'Dust']]],
            'familyHistory' => ['items' => [['condition' => 'Asthma', 'kind' => 'Chronic', 'relation' => 'Mother']]],
            'revisions' => ['medical' => 2, 'family' => 1, 'social' => 0],
            'updatedAt' => ['medical' => '2026-01-01', 'family' => '2026-01-01'],
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

    private function makePatient(string $sex, array $background = []): Patient
    {
        return Patient::create([
            'first_name' => 'History', 'last_name' => 'Patient', 'sex' => $sex,
            'barangay_health_center_id' => $this->bhc->id,
            'medical_background' => $background,
        ]);
    }

    private function finalize(?array $backgroundUpdate, ?Patient $patient = null, ?User $as = null)
    {
        return $this->actingAs($as ?? $this->clinician, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson('/api/health-records', [
                'patient_id' => ($patient ?? $this->patient)->id,
                'category' => 'General Consultation',
                'chief_complaint' => 'Check-up',
                'date_recorded' => '2026-10-16',
                ...($backgroundUpdate === null ? [] : ['background_update' => $backgroundUpdate]),
            ]);
    }

    private function background(?Patient $patient = null): array
    {
        return ($patient ?? $this->patient)->fresh()->medical_background ?? [];
    }

    /** One staged value per section, in the new shape, as the client sends it. */
    private function stagedSections(): array
    {
        return [
            'medical' => [
                'allergies' => ['noneKnown' => true],
                'hospitalizations' => ['items' => [
                    ['type' => 'Hospitalization', 'year' => 2019, 'reason' => 'Dengue', 'place' => 'Provincial Hospital'],
                    ['type' => 'Surgery', 'year' => 2021, 'reason' => 'Appendectomy', 'place' => 'District Hospital'],
                ]],
            ],
            'family' => [
                'familyHistory' => ['items' => [
                    ['condition' => 'Hypertension', 'kind' => 'Chronic', 'relation' => 'Father'],
                    ['condition' => 'Diabetes', 'kind' => 'Hereditary', 'relation' => 'Grandparent'],
                ]],
            ],
            'social' => [
                'personalSocial' => [
                    'education' => ['level' => 'High School', 'completed' => 'Graduate'],
                    'pastOccupations' => 'Farmer',
                    'smoking' => ['status' => 'former', 'sticksPerDay' => 10, 'years' => 5, 'quitYear' => 2020],
                    'alcohol' => ['status' => 'current', 'frequency' => 'weekly'],
                    'diet' => ['highSalt' => true, 'sweetDrinks' => true, 'notes' => 'Fond of dried fish'],
                    'sexual' => ['active' => 'declined'],
                    'environment' => [
                        'waterSource' => 'Level III', 'toilet' => 'Water-sealed (own)',
                        'exposures' => ['secondhandSmoke', 'biomassCooking'], 'notes' => 'Wood stove',
                    ],
                ],
            ],
            'obstetric' => [
                'obstetric' => [
                    'menarcheAge' => 13, 'menstrualStatus' => 'menstruating', 'intervalDays' => 28,
                    'durationDays' => 5, 'amount' => 'moderate', 'regularity' => 'regular',
                    'symptoms' => ['dysmenorrhea', 'bloating'], 'symptomNotes' => 'Cramps on day 1',
                    'pregnancies' => [
                        ['year' => 2018, 'outcome' => 'liveBirth', 'delivery' => 'normal', 'place' => 'BHC', 'note' => 'Healthy'],
                        ['year' => 2020, 'outcome' => 'miscarriage', 'delivery' => 'notApplicable'],
                    ],
                ],
            ],
        ];
    }

    public function test_each_section_applies_in_the_new_shape(): void
    {
        foreach ($this->stagedSections() as $section => $staged) {
            $revision = PatientBackground::revision($this->background(), $section);
            $id = $this->finalize([
                'sections' => [$section => $staged],
                'base_revisions' => [$section => $revision],
            ])->assertCreated()->json('data.id');

            $background = $this->background();
            foreach ($staged as $key => $value) {
                $this->assertSame($value, $background[$key], "{$section}.{$key}");
            }
            $this->assertSame($revision + 1, $background['revisions'][$section], $section);
            $this->assertSame('2026-10-16', $background['updatedAt'][$section]);

            $changes = HealthRecord::findOrFail($id)->background_changes;
            $this->assertCount(1, $changes, $section);
            $this->assertSame($section, $changes[0]['section']);
        }
        // Medical started at 2, family at 1, social at 0, obstetric never.
        $this->assertSame(1, $this->background()['revisions']['obstetric']);
        $this->assertSame(1, $this->background()['revisions']['social']);
    }

    public function test_allergies_none_known_with_items_is_422(): void
    {
        $this->finalize([
            'sections' => ['medical' => ['allergies' => ['noneKnown' => true, 'items' => [['allergen' => 'Penicillin']]]]],
            'base_revisions' => ['medical' => 2],
        ])->assertUnprocessable()->assertJsonValidationErrors('background_update.sections.medical.allergies');

        $this->finalize([
            'sections' => ['medical' => ['hospitalizations' => ['none' => true, 'items' => [['type' => 'Surgery']]]]],
            'base_revisions' => ['medical' => 2],
        ])->assertUnprocessable()->assertJsonValidationErrors('background_update.sections.medical.hospitalizations');

        $this->assertSame(0, HealthRecord::count());
    }

    public function test_family_none_known_with_items_is_422(): void
    {
        $this->finalize([
            'sections' => ['family' => ['familyHistory' => ['noneKnown' => true, 'items' => [['condition' => 'Asthma']]]]],
            'base_revisions' => ['family' => 1],
        ])->assertUnprocessable()->assertJsonValidationErrors('background_update.sections.family.familyHistory');
    }

    public function test_invalid_enum_or_range_is_422(): void
    {
        $this->finalize([
            'sections' => ['social' => ['personalSocial' => ['smoking' => ['status' => 'heavy']]]],
            'base_revisions' => ['social' => 0],
        ])->assertUnprocessable()->assertJsonValidationErrors('background_update.sections.social.personalSocial.smoking.status');

        $this->finalize([
            'sections' => ['obstetric' => ['obstetric' => ['menarcheAge' => 40, 'durationDays' => 30]]],
            'base_revisions' => ['obstetric' => 0],
        ])->assertUnprocessable()->assertJsonValidationErrors([
            'background_update.sections.obstetric.obstetric.menarcheAge',
            'background_update.sections.obstetric.obstetric.durationDays',
        ]);

        $this->assertSame(0, HealthRecord::count());
    }

    private function obstetricEdit(): array
    {
        return [
            'sections' => ['obstetric' => ['obstetric' => ['menarcheAge' => 12]]],
            'base_revisions' => ['obstetric' => 0],
        ];
    }

    public function test_obstetric_update_for_male_is_422(): void
    {
        $male = $this->makePatient('Male');

        $this->finalize($this->obstetricEdit(), $male)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('background_update.sections.obstetric');

        $this->assertSame(0, HealthRecord::count());
        $this->assertArrayNotHasKey('obstetric', $this->background($male));
    }

    public function test_obstetric_update_for_unrecorded_sex_is_422(): void
    {
        // patients.sex is NOT NULL, so "not recorded" is stored as an empty string.
        foreach (['', 'Other'] as $sex) {
            $this->finalize($this->obstetricEdit(), $this->makePatient($sex))
                ->assertUnprocessable()
                ->assertJsonValidationErrors('background_update.sections.obstetric');
        }

        $this->assertSame(0, HealthRecord::count());
    }

    public function test_reviewed_obstetric_for_male_is_422(): void
    {
        $male = $this->makePatient('Male');

        $this->finalize(['reviewed' => ['obstetric']], $male)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('background_update.reviewed');

        $this->assertSame(0, HealthRecord::count());
        $this->assertArrayNotHasKey('reviewedAt', $this->background($male));
    }

    public function test_reviewed_only_stamps_without_revision_bump_or_change_entry(): void
    {
        $id = $this->finalize(['reviewed' => ['family']])->assertCreated()->json('data.id');

        $background = $this->background();
        $this->assertSame(
            ['date' => '2026-10-16', 'facility' => 'History BHC', 'by' => $this->clinician->id],
            $background['reviewedAt']['family']
        );
        $this->assertSame(1, $background['revisions']['family']);
        $this->assertSame('2026-01-01', $background['updatedAt']['family']);
        $this->assertSame('Asthma', $background['familyHistory']['items'][0]['condition']);
        $this->assertArrayNotHasKey('medical', $background['reviewedAt']);
        $this->assertNull(HealthRecord::findOrFail($id)->background_changes);
    }

    public function test_concurrent_reviews_do_not_conflict(): void
    {
        $other = $this->user('nurse', StaffRoles::defaults('midwife'));

        // Both consultations opened family at revision 1 and only reviewed it.
        $this->finalize(['reviewed' => ['family'], 'base_revisions' => ['family' => 1]])->assertCreated();
        $this->finalize(['reviewed' => ['family'], 'base_revisions' => ['family' => 1]], null, $other)->assertCreated();

        $background = $this->background();
        $this->assertSame($other->id, $background['reviewedAt']['family']['by']);
        $this->assertSame(1, $background['revisions']['family']);
    }

    public function test_section_both_edited_and_reviewed_stamps_once_and_bumps_once(): void
    {
        $id = $this->finalize([
            'sections' => ['medical' => ['allergies' => ['items' => [['allergen' => 'Penicillin', 'reaction' => 'Rash']]]]],
            'base_revisions' => ['medical' => 2],
            'reviewed' => ['medical', 'medical', 'social'],
        ])->assertCreated()->json('data.id');

        $background = $this->background();
        $this->assertSame(3, $background['revisions']['medical']);
        $this->assertSame(0, $background['revisions']['social']);
        $this->assertSame(['medical', 'social'], array_keys($background['reviewedAt']));
        $this->assertSame(
            ['date' => '2026-10-16', 'facility' => 'History BHC', 'by' => $this->clinician->id],
            $background['reviewedAt']['medical']
        );
        $changes = HealthRecord::findOrFail($id)->background_changes;
        $this->assertCount(1, $changes);
        $this->assertSame('medical', $changes[0]['section']);
    }

    public function test_unknown_reviewed_section_is_422(): void
    {
        $this->finalize(['reviewed' => ['general']])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('background_update.reviewed.0');
        $this->finalize(['reviewed' => [['family']]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('background_update.reviewed.0');
        $this->finalize(['reviewed' => 'family'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('background_update.reviewed');

        $this->assertSame(0, HealthRecord::count());
    }

    public function test_stale_edited_section_still_returns_409(): void
    {
        $this->finalize([
            'sections' => ['medical' => ['allergies' => ['items' => [['allergen' => 'Penicillin']]]]],
            'base_revisions' => ['medical' => 1],
            'reviewed' => ['family'],
        ])->assertStatus(409)
            ->assertJsonPath('code', 'PATIENT_BACKGROUND_CONFLICT')
            ->assertJsonPath('conflicts.0.section', 'medical')
            ->assertJsonPath('conflicts.0.revision', 2)
            ->assertJsonPath('conflicts.0.current.allergies.items.0.allergen', 'Dust');

        $this->assertSame(0, HealthRecord::count());
        $this->assertArrayNotHasKey('reviewedAt', $this->background());
    }

    public function test_user_without_clinical_history_gets_403(): void
    {
        $finalizer = $this->user('finalizer', ['consultations.encode', 'consultations.finalize']);

        $this->finalize(['reviewed' => ['family']], null, $finalizer)->assertForbidden();
        $this->finalize([
            'sections' => ['medical' => ['allergies' => ['noneKnown' => true]]],
            'base_revisions' => ['medical' => 2],
        ], null, $finalizer)->assertForbidden();

        $this->assertSame(0, HealthRecord::count());
        $this->assertArrayNotHasKey('reviewedAt', $this->background());
    }

    public function test_patient_reported_condition_keeps_first_recorded_and_ignores_client_source(): void
    {
        $background = $this->background();
        $background['currentDiseases'] = [
            ['name' => 'Asthma', 'source' => 'Patient-reported', 'firstRecorded' => '2026-05-05'],
        ];
        $this->patient->update(['medical_background' => $background]);

        $this->finalize([
            'sections' => ['medical' => ['currentDiseases' => [
                [
                    'name' => ' asthma ', 'yearDiagnosed' => 2015, 'diagnosedWhere' => 'RHU', 'note' => ' Uses inhaler ',
                    'source' => 'Rhu-confirmed', 'firstRecorded' => '2020-01-01', 'status' => 'Active', 'conditionKey' => 'asthma',
                ],
                ['name' => 'Goiter', 'source' => 'Rhu-confirmed'],
            ]]],
            'base_revisions' => ['medical' => 2],
        ])->assertCreated();

        $this->assertSame([
            [
                'name' => 'asthma', 'yearDiagnosed' => 2015, 'diagnosedWhere' => 'RHU', 'note' => 'Uses inhaler',
                'source' => 'Patient-reported', 'firstRecorded' => '2026-05-05',
            ],
            ['name' => 'Goiter', 'source' => 'Patient-reported', 'firstRecorded' => '2026-10-16'],
        ], $this->background()['currentDiseases']);
    }

    public function test_is_legacy_update_detects_old_shapes(): void
    {
        $legacy = [
            ['sections' => ['medical' => ['allergies' => 'Dust']]],
            ['sections' => ['medical' => ['hospitalizations' => '']]],
            ['sections' => ['medical' => ['surgeries' => 'Appendectomy']]],
            ['sections' => ['family' => ['familyHistory' => ['similarIllness' => 'Mother - Asthma']]]],
            ['sections' => ['social' => ['personalSocial' => ['diet' => 'Low salt']]]],
            ['sections' => ['social' => ['personalSocial' => ['smoking' => 'Never']]]],
            ['sections' => ['social' => ['personalSocial' => ['alcohol' => 'Occasional']]]],
            ['sections' => ['medical' => [
                'currentDiseases' => [['name' => 'Asthma', 'status' => 'Confirmed', 'conditionKey' => 'asthma']],
                'allergies' => null, 'hospitalizations' => null, 'surgeries' => null,
            ]]],
            ['sections' => ['medical' => ['currentDiseases' => [['name' => 'Asthma', 'lastConfirmed' => '2026-06-01']]]]],
            ['sections' => ['social' => ['personalSocial' => ['notes' => 'x']]]],
            ['sections' => ['family' => ['familyHistory' => ['chronicIllness' => null]]]],
        ];
        foreach ($legacy as $update) {
            $this->assertTrue(PatientBackground::isLegacyUpdate($update), json_encode($update));
        }

        $current = [
            [],
            ['reviewed' => ['family']],
            ['sections' => $this->stagedSections(), 'base_revisions' => ['medical' => 2]],
            ['sections' => ['medical' => ['allergies' => null, 'currentDiseases' => [['name' => 'Asthma']]]]],
            ['sections' => ['social' => ['personalSocial' => ['diet' => null]]]],
        ];
        foreach ($current as $update) {
            $this->assertFalse(PatientBackground::isLegacyUpdate($update), json_encode($update));
        }
    }
}
