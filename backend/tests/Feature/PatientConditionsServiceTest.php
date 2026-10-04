<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use App\Services\PatientConditions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class PatientConditionsServiceTest extends TestCase
{
    use RefreshDatabase;

    private User $rhuUser;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Cond RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Cond BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->rhuUser = $this->user('rhu@example.test', ['role' => User::ROLE_RHU_STAFF, 'rural_health_unit_id' => $rhu->id, 'permissions' => ActionPermissions::PRESETS['rhu']]);
    }

    private function user(string $email, array $attributes): User
    {
        return User::create([...['name' => $email, 'email' => $email, 'password' => bcrypt('test-password'), 'status' => User::STATUS_ACTIVE], ...$attributes]);
    }

    private function patient(string $first = 'Cond'): Patient
    {
        return Patient::create(['first_name' => $first, 'last_name' => 'Patient', 'sex' => 'Female', 'barangay_health_center_id' => $this->bhc->id]);
    }

    private function apply(Patient $patient, array $confirmations, int $sourceId = 42): Collection
    {
        return app(PatientConditions::class)->apply($patient, $confirmations, $this->rhuUser, PatientCondition::SOURCE_RHU_FEEDBACK, $sourceId);
    }

    public function test_confirming_a_new_condition_creates_it_with_an_event(): void
    {
        $patient = $this->patient();

        $condition = $this->apply($patient, [['name' => '  Hypertension ', 'status' => 'active']])->sole();

        $this->assertSame('Hypertension', $condition->condition_name);
        $this->assertSame('hypertension', $condition->condition_identity);
        $this->assertSame('active', $condition->status);
        $this->assertSame($this->rhuUser->id, $condition->confirmed_by);
        $this->assertSame('rhu_feedback', $condition->source_type);
        $this->assertSame(42, $condition->source_id);
        $event = $condition->events()->sole();
        $this->assertNull($event->from_status);
        $this->assertSame('active', $event->to_status);
        $this->assertSame(['rhu_feedback', 42, $this->rhuUser->id], [$event->source_type, $event->source_id, $event->changed_by]);
    }

    public function test_a_second_confirmation_of_the_same_identity_updates_the_open_row(): void
    {
        $patient = $this->patient();
        $this->apply($patient, [['name' => 'Hypertension', 'status' => 'active']]);

        $this->apply($patient, [['name' => 'HTN', 'status' => 'controlled']], 43);

        $condition = PatientCondition::where('patient_id', $patient->id)->sole();
        $this->assertSame('Hypertension', $condition->condition_name);
        $this->assertSame('controlled', $condition->status);
        $this->assertSame(43, $condition->source_id);
        $this->assertSame(['active', 'controlled'], $condition->events()->orderBy('id')->pluck('to_status')->all());
    }

    public function test_a_status_change_by_condition_id_writes_one_event(): void
    {
        $patient = $this->patient();
        $condition = $this->apply($patient, [['name' => 'Hypertension', 'status' => 'active']])->sole();

        $this->apply($patient, [['condition_id' => $condition->id, 'status' => 'resolved', 'note' => 'BP normal x3']], 50);

        $this->assertSame('resolved', $condition->fresh()->status);
        $this->assertSame(1, PatientCondition::count());
        $event = $condition->events()->orderByDesc('id')->first();
        $this->assertSame(['active', 'resolved', 'BP normal x3'], [$event->from_status, $event->to_status, $event->note]);
        $this->assertSame(2, $condition->events()->count());
    }

    public function test_an_unchanged_status_without_a_note_writes_no_event(): void
    {
        $patient = $this->patient();
        $condition = $this->apply($patient, [['name' => 'Hypertension', 'status' => 'active']])->sole();

        $this->apply($patient, [['condition_id' => $condition->id, 'status' => 'active']], 51);

        $this->assertSame(1, $condition->events()->count());
        $this->assertSame(51, $condition->fresh()->source_id);
    }

    public function test_another_patients_condition_id_is_rejected(): void
    {
        $other = $this->apply($this->patient('Other'), [['name' => 'Hypertension', 'status' => 'active']])->sole();
        $patient = $this->patient();

        try {
            $this->apply($patient, [['name' => 'Diabetes', 'status' => 'active'], ['condition_id' => $other->id, 'status' => 'resolved']]);
            $this->fail('Expected a ValidationException.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('condition_confirmations.1.condition_id', $e->errors());
        }

        $this->assertSame(0, PatientCondition::where('patient_id', $patient->id)->count());
        $this->assertSame('active', $other->fresh()->status);
    }

    public function test_the_same_condition_twice_in_one_request_is_rejected(): void
    {
        $patient = $this->patient();

        try {
            $this->apply($patient, [['name' => 'Hypertension', 'status' => 'active'], ['name' => 'HTN', 'status' => 'controlled']]);
            $this->fail('Expected a ValidationException.');
        } catch (ValidationException $e) {
            $this->assertSame(['This condition is listed twice.'], $e->errors()['condition_confirmations.1.name']);
        }

        $this->assertSame(0, PatientCondition::count());
    }

    public function test_recommending_monitoring_needs_a_monitorable_status(): void
    {
        $patient = $this->patient();

        try {
            $this->apply($patient, [['name' => 'Hypertension', 'status' => 'under_evaluation', 'recommend_bhc_monitoring' => true]]);
            $this->fail('Expected a ValidationException.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('condition_confirmations.0.recommend_bhc_monitoring', $e->errors());
        }

        $this->assertSame(0, PatientCondition::count());
    }

    public function test_recommendation_is_stamped_on_the_condition(): void
    {
        $condition = $this->apply($this->patient(), [['name' => 'Hypertension', 'status' => 'active', 'recommend_bhc_monitoring' => true]])->sole();

        $this->assertNotNull($condition->bhc_monitoring_recommended_at);
        $this->assertSame($this->rhuUser->id, $condition->bhc_monitoring_recommended_by);
    }

    private function legacyMonitoring(Patient $patient): ConditionMonitoring
    {
        $record = HealthRecord::create(['patient_id' => $patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->bhc->id]);

        return ConditionMonitoring::create([
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'condition_key' => 'hypertension',
            'condition_name' => 'Hypertension',
            'condition_identity' => 'hypertension',
            'status' => 'active',
            'started_health_record_id' => $record->id,
            'started_at' => now(),
        ]);
    }

    public function test_confirming_links_matching_legacy_monitoring(): void
    {
        $patient = $this->patient();
        $monitoring = $this->legacyMonitoring($patient);

        $condition = $this->apply($patient, [['name' => 'HTN', 'status' => 'active']])->sole();

        $this->assertSame($condition->id, $monitoring->fresh()->patient_condition_id);
    }

    public function test_under_evaluation_does_not_link_legacy_monitoring(): void
    {
        $patient = $this->patient();
        $monitoring = $this->legacyMonitoring($patient);

        $this->apply($patient, [['name' => 'HTN', 'status' => 'under_evaluation']]);

        $this->assertNull($monitoring->fresh()->patient_condition_id);
    }

    public function test_can_confirm_only_for_rhu_staff_with_the_permission(): void
    {
        $this->assertTrue(PatientConditions::canConfirm($this->rhuUser));
        $this->assertFalse(PatientConditions::canConfirm(null));

        $onDuty = clone $this->rhuUser;
        $onDuty->workingFacility = ['id' => $this->bhc->id, 'name' => $this->bhc->name, 'type' => 'bhc', 'is_home' => false, 'permissions' => ActionPermissions::PRESETS['rhu']];
        $this->assertFalse(PatientConditions::canConfirm($onDuty));

        $clinical = $this->user('bhw@example.test', ['role' => User::ROLE_BHW, 'barangay_health_center_id' => $this->bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $this->assertFalse(PatientConditions::canConfirm($clinical));
    }
}
