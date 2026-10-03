<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Patient-level clinical background (Past Medical, Family, Personal & Social
 * History) as the patient API sees it: readable, never writable. Changes go
 * through a finalized consultation - see PatientBackgroundConsultationTest.
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
            'permissions' => ActionPermissions::PRESETS['clinical'],
        ]);
        $this->patient = Patient::create([
            'first_name' => 'Background',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $rhu->id,
        ]);
    }

    /**
     * The background is read-only outside a consultation: the patient API
     * silently drops it on update, in either accepted spelling, and keeps
     * whatever the patient already had.
     */
    public function test_update_ignores_medical_background(): void
    {
        $this->patient->update(['medical_background' => ['allergies' => 'Dust']]);

        foreach (['medical_background', 'medicalBackground'] as $field) {
            $this->actingAs($this->bhw, 'sanctum')
                ->putJson("/api/patients/{$this->patient->id}", [
                    'occupation' => 'Farmer',
                    $field => ['allergies' => 'Penicillin', 'currentDiseases' => [['status' => 'Active']]],
                ])
                ->assertOk()
                ->assertJsonPath('data.medical_background.allergies', 'Dust');
        }

        $fresh = $this->patient->fresh();
        $this->assertSame('Farmer', $fresh->occupation);
        $this->assertSame(['allergies' => 'Dust'], $fresh->medical_background);
    }

    /** Registration cannot seed a background either - the first consultation does. */
    public function test_create_ignores_medical_background(): void
    {
        $response = $this->actingAs($this->bhw, 'sanctum')
            ->postJson('/api/patients', [
                'first_name' => 'New',
                'last_name' => 'Patient',
                'sex' => 'Male',
                'barangay_health_center_id' => $this->bhc->id,
                'medical_background' => ['allergies' => 'Penicillin'],
            ])
            ->assertCreated();

        $this->assertEmpty(Patient::findOrFail($response->json('data.id'))->medical_background);
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
