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

    public function test_an_existing_condition_is_linked_not_duplicated(): void
    {
        app(CurrentConditionsSync::class)->sync($this->patient, [
            ['name' => '  hypertension ', 'addToConditions' => true, 'conditionStatus' => 'Active'],
        ], '2026-09-28');

        $conditions = $this->conditions();
        $this->assertCount(1, $conditions);
        $this->assertSame('Hypertension', $conditions[0]['name']);
        // The existing status (set on the Patient Profile) is left alone -
        // only the linked visit's date moves it forward.
        $this->assertSame('Controlled', $conditions[0]['status']);
        $this->assertSame('2026-01-10', $conditions[0]['firstRecorded']);
        $this->assertSame('2026-09-28', $conditions[0]['lastConfirmed']);
        // The rest of the background is untouched.
        $this->assertSame('None', $this->patient->fresh()->medical_background['allergies']);
    }

    public function test_the_same_diagnosis_twice_in_one_consultation_is_not_duplicated(): void
    {
        app(CurrentConditionsSync::class)->sync($this->patient, [
            ['name' => 'Asthma', 'addToConditions' => true, 'conditionStatus' => 'Active'],
            ['name' => ' asthma ', 'addToConditions' => true, 'conditionStatus' => 'Active'],
        ], '2026-09-28');

        $names = array_column($this->conditions(), 'name');
        $this->assertSame(['Hypertension', 'Asthma'], $names);
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

    // ---- Registered (conditionKey) diagnoses -------------------------------
    // See docs/superpowers/specs/2026-09-29-diagnosis-monitoring-surveillance-registry-design.md

    public function test_a_registered_diagnosis_syncs_even_when_addtoconditions_is_false(): void
    {
        app(CurrentConditionsSync::class)->sync($this->patient, [
            ['name' => 'Tuberculosis', 'conditionKey' => 'tuberculosis', 'addToConditions' => false],
        ], '2026-09-28');

        $names = array_column($this->conditions(), 'name');
        $this->assertSame(['Hypertension', 'Tuberculosis'], $names);
    }

    public function test_users_without_clinical_history_still_get_registered_diagnoses_synced(): void
    {
        $user = User::create([
            'name' => 'No History Two', 'email' => 'nohistory2@example.test', 'password' => bcrypt('test-password'),
            'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE,
        ]);
        $sync = app(CurrentConditionsSync::class);
        if ($sync->canSync($user)) {
            $this->markTestSkipped('The default BHW role has clinical.history in this configuration.');
        }

        // A registered diagnosis is never blocked by the permission guard,
        // whatever addToConditions says - only a free-text one is. Neither
        // call below throws; assertAllowed only ever communicates by
        // exception, so a lack of one on either line is the pass condition.
        $sync->assertAllowed($user, [['name' => 'Tuberculosis', 'conditionKey' => 'tuberculosis', 'addToConditions' => false]]);
        $sync->assertAllowed($user, [['name' => 'Tuberculosis', 'conditionKey' => 'tuberculosis', 'addToConditions' => true]]);
        $this->assertTrue(true);
    }

    public function test_a_registered_diagnosis_is_matched_by_conditionkey_not_name(): void
    {
        // Patient's existing entry is a pre-registry legacy name with no key.
        $this->patient->update(['medical_background' => [
            'currentDiseases' => [
                ['name' => 'HTN', 'status' => 'Controlled', 'firstRecorded' => '2026-01-10', 'lastConfirmed' => '2026-01-10', 'source' => 'Patient Profile'],
            ],
        ]]);

        // A new registered diagnosis (already server-normalized to the
        // official name, as ClinicalRegistry::resolveConditionEntries would
        // produce) does not name-match "HTN", so it becomes its own entry -
        // reconciling the old free-text spelling is out of scope.
        app(CurrentConditionsSync::class)->sync($this->patient, [
            ['name' => 'Hypertension', 'conditionKey' => 'hypertension'],
        ], '2026-09-28');

        $names = array_column($this->conditions(), 'name');
        $this->assertSame(['HTN', 'Hypertension'], $names);
        $this->assertNull($this->conditions()[0]['conditionKey'] ?? null);
        $this->assertSame('hypertension', $this->conditions()[1]['conditionKey']);
    }

    public function test_a_repeat_registered_diagnosis_links_and_keeps_status(): void
    {
        // Seed a keyed entry first (as a prior sync would have produced).
        app(CurrentConditionsSync::class)->sync($this->patient, [
            ['name' => 'Tuberculosis', 'conditionKey' => 'tuberculosis'],
        ], '2026-01-15');
        $tb = $this->conditions()[1];
        $this->assertSame('Active', $tb['status']);

        // Manually mark it Controlled, as the Patient Profile would.
        $background = $this->patient->fresh()->medical_background;
        $background['currentDiseases'][1]['status'] = 'Controlled';
        $this->patient->update(['medical_background' => $background]);

        // Re-diagnosed on a later visit: links, keeps Controlled, moves the date.
        app(CurrentConditionsSync::class)->sync($this->patient, [
            ['name' => 'Tuberculosis', 'conditionKey' => 'tuberculosis'],
        ], '2026-09-28');

        $conditions = $this->conditions();
        $this->assertCount(2, $conditions);
        $this->assertSame('Controlled', $conditions[1]['status']);
        $this->assertSame('2026-09-28', $conditions[1]['lastConfirmed']);
    }

    public function test_a_legacy_entry_with_the_same_name_is_stamped_with_the_key(): void
    {
        // The seeded "Hypertension" entry already has the official spelling
        // but no key yet (created before this feature). A registered
        // diagnosis matches it by name and stamps the key going forward.
        app(CurrentConditionsSync::class)->sync($this->patient, [
            ['name' => 'Hypertension', 'conditionKey' => 'hypertension'],
        ], '2026-09-28');

        $conditions = $this->conditions();
        $this->assertCount(1, $conditions);
        $this->assertSame('hypertension', $conditions[0]['conditionKey']);
        $this->assertSame('Controlled', $conditions[0]['status']);
        $this->assertSame('2026-09-28', $conditions[0]['lastConfirmed']);
    }
}
