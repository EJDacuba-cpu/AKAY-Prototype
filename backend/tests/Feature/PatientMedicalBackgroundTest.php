<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Patient-level clinical background (Patient Profile > Medical Background,
 * Family History, Personal & Social History) - the longitudinal history the
 * profile owns, distinct from the per-visit health_records.medical_history.
 */
class PatientMedicalBackgroundTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    private User $bhw;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();

        $rhu = RuralHealthUnit::create(['name' => 'Background RHU']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Background BHC',
            'rural_health_unit_id' => $rhu->id,
        ]);
        $this->bhw = User::create([
            'name' => 'Background BHW',
            'email' => 'background-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHW,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $this->bhc->id,
        ]);
        $this->patient = Patient::create([
            'first_name' => 'Background',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $rhu->id,
        ]);
    }

    public function test_medical_background_is_saved_and_returned(): void
    {
        $background = [
            'currentDiseases' => [
                [
                    'name' => 'Hypertension',
                    'status' => 'Active',
                    'firstRecorded' => '2026-01-10',
                    'lastConfirmed' => '2026-09-01',
                    'source' => 'Consultation',
                ],
            ],
            'allergies' => 'Penicillin',
            'hospitalizations' => 'Appendectomy (2019)',
            'surgeries' => 'None reported',
            'familyHistory' => [
                'similarIllness' => 'Mother - Hypertension',
                'chronicIllness' => 'Diabetes (father\'s side)',
                'hereditaryIllness' => 'None reported',
            ],
            'personalSocial' => [
                'diet' => 'High-salt diet',
                'smoking' => 'Former smoker',
                'alcohol' => 'Social drinker',
                'notes' => 'Walks daily.',
            ],
        ];

        $this->actingAs($this->bhw, 'sanctum')
            ->putJson("/api/patients/{$this->patient->id}", [
                'medical_background' => $background,
            ])
            ->assertOk()
            ->assertJsonPath('data.medical_background.allergies', 'Penicillin')
            ->assertJsonPath(
                'data.medical_background.currentDiseases.0.name',
                'Hypertension'
            );

        $fresh = $this->patient->fresh();
        $this->assertSame('Active', $fresh->medical_background['currentDiseases'][0]['status']);
        $this->assertSame(
            'Mother - Hypertension',
            $fresh->medical_background['familyHistory']['similarIllness']
        );
        $this->assertSame(
            'High-salt diet',
            $fresh->medical_background['personalSocial']['diet']
        );
    }

    /** The camelCase key the frontend sends is accepted too. */
    public function test_camel_case_medical_background_alias_is_accepted(): void
    {
        $this->actingAs($this->bhw, 'sanctum')
            ->putJson("/api/patients/{$this->patient->id}", [
                'medicalBackground' => ['allergies' => 'Seafood'],
            ])
            ->assertOk();

        $this->assertSame('Seafood', $this->patient->fresh()->medical_background['allergies']);
    }

    /** A current-disease entry without a name is rejected rather than stored half-formed. */
    public function test_current_disease_requires_a_name(): void
    {
        $this->actingAs($this->bhw, 'sanctum')
            ->putJson("/api/patients/{$this->patient->id}", [
                'medical_background' => [
                    'currentDiseases' => [['status' => 'Active']],
                ],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('medical_background.currentDiseases.0.name');
    }

    /**
     * Each background section carries its own "last updated" date, so the
     * profile can say how current what it shows is. Saving one section must
     * not disturb the dates the other sections already carried.
     */
    public function test_section_update_dates_are_saved_independently(): void
    {
        $this->actingAs($this->bhw, 'sanctum')
            ->putJson("/api/patients/{$this->patient->id}", [
                'medical_background' => [
                    'allergies' => 'Penicillin',
                    'updatedAt' => ['medical' => '2026-09-19'],
                ],
            ])
            ->assertOk();

        $this->actingAs($this->bhw, 'sanctum')
            ->putJson("/api/patients/{$this->patient->id}", [
                'medical_background' => [
                    'allergies' => 'Penicillin',
                    'familyHistory' => ['similarIllness' => 'Mother - Asthma'],
                    'updatedAt' => ['medical' => '2026-09-19', 'family' => '2026-09-20'],
                ],
            ])
            ->assertOk();

        $background = $this->patient->fresh()->medical_background;
        $this->assertSame('2026-09-19', $background['updatedAt']['medical']);
        $this->assertSame('2026-09-20', $background['updatedAt']['family']);
    }

    /** Updating an unrelated field must not wipe an existing background. */
    public function test_unrelated_update_preserves_existing_background(): void
    {
        $this->patient->update([
            'medical_background' => ['allergies' => 'Dust'],
        ]);

        $this->actingAs($this->bhw, 'sanctum')
            ->putJson("/api/patients/{$this->patient->id}", [
                'occupation' => 'Farmer',
            ])
            ->assertOk();

        $fresh = $this->patient->fresh();
        $this->assertSame('Farmer', $fresh->occupation);
        $this->assertSame('Dust', $fresh->medical_background['allergies']);
    }

    /**
     * The profile's Birthday field, and the value an edit writes back.
     *
     * A birthdate is a calendar date, not an instant. Serialized as an instant
     * it leaves the API as local midnight in UTC ("...T16:00:00Z" under
     * APP_TIMEZONE=Asia/Manila), which every client that reads the date off the
     * front of the string resolves to the PREVIOUS day - so the chart shows the
     * birthday a day early and the next profile save persists it a day early.
     * Pinned in a non-UTC timezone, since UTC hides the defect.
     */
    public function test_birthdate_is_serialized_as_a_plain_calendar_date(): void
    {
        config(['app.timezone' => 'Asia/Manila']);
        date_default_timezone_set('Asia/Manila');

        $this->patient->update(['birthdate' => '1964-03-04']);

        $response = $this->actingAs($this->bhw, 'sanctum')
            ->getJson("/api/patients/{$this->patient->id}")
            ->assertOk();

        $birthdate = $response->json('data.birthdate');
        $this->assertSame('1964-03-04', $birthdate);

        // Round-trip: saving the date the profile just read must not shift it.
        $this->actingAs($this->bhw, 'sanctum')
            ->putJson("/api/patients/{$this->patient->id}", [
                'birthdate' => explode('T', (string) $birthdate)[0],
            ])
            ->assertOk();

        $this->assertSame(
            '1964-03-04',
            $this->patient->fresh()->birthdate->format('Y-m-d'),
        );
    }
}
