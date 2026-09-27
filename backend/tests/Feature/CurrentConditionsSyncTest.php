<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\CurrentConditionsSync;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class CurrentConditionsSyncTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Sync RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Sync BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->patient = Patient::create([
            'first_name' => 'Test', 'last_name' => 'Sync', 'sex' => 'Female',
            'barangay_health_center_id' => $bhc->id,
            'medical_background' => [
                'allergies' => 'None',
                'currentDiseases' => [
                    ['name' => 'Hypertension', 'status' => 'Controlled', 'firstRecorded' => '2026-01-10', 'lastConfirmed' => '2026-01-10', 'source' => 'Patient Profile'],
                ],
            ],
        ]);
    }

    private function conditions(): array
    {
        return $this->patient->fresh()->medical_background['currentDiseases'];
    }

    public function test_only_ticked_diagnoses_are_added(): void
    {
        app(CurrentConditionsSync::class)->sync($this->patient, [
            ['name' => 'Asthma', 'addToConditions' => true, 'conditionStatus' => 'Active'],
            ['name' => 'Acute gastroenteritis', 'addToConditions' => false],
            ['name' => 'Tension headache'],
        ], '2026-09-28');

        $names = array_column($this->conditions(), 'name');
        $this->assertSame(['Hypertension', 'Asthma'], $names);
        $asthma = $this->conditions()[1];
        $this->assertSame('Active', $asthma['status']);
        $this->assertSame('2026-09-28', $asthma['firstRecorded']);
        $this->assertSame('Consultation', $asthma['source']);
    }

    public function test_an_existing_condition_is_updated_not_duplicated(): void
    {
        app(CurrentConditionsSync::class)->sync($this->patient, [
            ['name' => '  hypertension ', 'addToConditions' => true, 'conditionStatus' => 'Active'],
        ], '2026-09-28');

        $conditions = $this->conditions();
        $this->assertCount(1, $conditions);
        $this->assertSame('Hypertension', $conditions[0]['name']);
        $this->assertSame('Active', $conditions[0]['status']);
        $this->assertSame('2026-01-10', $conditions[0]['firstRecorded']);
        $this->assertSame('2026-09-28', $conditions[0]['lastConfirmed']);
        // The rest of the background is untouched.
        $this->assertSame('None', $this->patient->fresh()->medical_background['allergies']);
    }

    public function test_an_unknown_status_falls_back_to_active(): void
    {
        app(CurrentConditionsSync::class)->sync($this->patient, [
            ['name' => 'Asthma', 'addToConditions' => true, 'conditionStatus' => 'Monitoring'],
        ], '2026-09-28');

        $this->assertSame('Active', $this->conditions()[1]['status']);
    }

    public function test_users_without_clinical_history_cannot_add_conditions(): void
    {
        $user = User::create([
            'name' => 'No History', 'email' => 'nohistory@example.test', 'password' => bcrypt('test-password'),
            'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE,
        ]);
        $sync = app(CurrentConditionsSync::class);
        if ($sync->canSync($user)) {
            $this->markTestSkipped('The default BHW role has clinical.history in this configuration.');
        }

        // Unticked diagnoses never need the permission.
        $sync->assertAllowed($user, [['name' => 'Asthma', 'addToConditions' => false]]);

        $this->expectException(ValidationException::class);
        $sync->assertAllowed($user, [['name' => 'Asthma', 'addToConditions' => true]]);
    }
}
