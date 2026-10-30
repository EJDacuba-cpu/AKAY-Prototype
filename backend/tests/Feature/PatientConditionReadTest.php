<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use App\Services\StaffRoles;
use Tests\TestCase;

class PatientConditionReadTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    private Patient $patient;

    private User $rhuUser;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Read RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Read BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->patient = Patient::create(['first_name' => 'Read', 'last_name' => 'Patient', 'sex' => 'Female', 'barangay_health_center_id' => $this->bhc->id, 'rural_health_unit_id' => $rhu->id]);
        $this->rhuUser = User::create(['name' => 'Dr. Rhu', 'email' => 'rhu-read@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_RHU, 'status' => User::STATUS_ACTIVE, 'rural_health_unit_id' => $rhu->id]);
    }

    private function bhw(array $permissions, ?BarangayHealthCenter $bhc = null, string $email = 'bhw-read@example.test'): User
    {
        return User::create(['name' => 'Read BHW', 'email' => $email, 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHC, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => ($bhc ?? $this->bhc)->id, 'permissions' => $permissions]);
    }

    private function condition(string $name, string $identity, string $status, array $attributes = []): PatientCondition
    {
        return PatientCondition::create([...[
            'patient_id' => $this->patient->id, 'condition_name' => $name, 'condition_identity' => $identity,
            'status' => $status, 'confirmed_by' => $this->rhuUser->id, 'confirmed_at' => now(),
            'source_type' => PatientCondition::SOURCE_RHU_RECORD, 'source_id' => 1,
        ], ...$attributes]);
    }

    private function monitoring(string $name, string $identity, ?PatientCondition $condition = null, ?string $key = null): ConditionMonitoring
    {
        $record = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->bhc->id, 'date_recorded' => now()->subWeek()]);

        return ConditionMonitoring::create([
            'patient_id' => $this->patient->id, 'patient_condition_id' => $condition?->id, 'barangay_health_center_id' => $this->bhc->id,
            'condition_key' => $key, 'condition_name' => $name, 'condition_identity' => $identity, 'status' => 'active',
            'started_health_record_id' => $record->id, 'started_at' => now()->subWeek(),
        ]);
    }

    public function test_conditions_list_returns_conditions_events_and_legacy_monitoring(): void
    {
        $old = $this->condition('Asthma', 'name:asthma', 'resolved', ['confirmed_at' => now()->subMonth()]);
        $htn = $this->condition('Hypertension', 'hypertension', 'active', [
            'confirmed_at' => now()->subDay(), 'source_type' => PatientCondition::SOURCE_RHU_FEEDBACK, 'source_id' => 7,
            'bhc_monitoring_recommended_at' => now()->subDay(),
        ]);
        $htn->events()->create(['from_status' => null, 'to_status' => 'under_evaluation', 'note' => null, 'source_type' => 'rhu_record', 'source_id' => 3, 'changed_by' => $this->rhuUser->id, 'changed_at' => now()->subWeek()]);
        $htn->events()->create(['from_status' => 'under_evaluation', 'to_status' => 'active', 'note' => 'Confirmed on repeat BP', 'source_type' => 'rhu_feedback', 'source_id' => 7, 'changed_by' => $this->rhuUser->id, 'changed_at' => now()->subDay()]);
        $linked = $this->monitoring('Hypertension', 'hypertension', $htn, 'hypertension');
        $legacy = $this->monitoring('Gout', 'name:gout');
        $this->monitoring('Anemia', 'name:anemia')->update(['status' => 'stopped']);

        $this->actingAs($this->bhw(StaffRoles::defaults('midwife')), 'sanctum');
        $response = $this->getJson("/api/patients/{$this->patient->id}/conditions")->assertOk();

        $this->assertSame(['conditions', 'legacy_monitorings'], array_keys($response->json('data')));
        $response->assertJsonCount(2, 'data.conditions')
            ->assertJsonPath('data.conditions.0.id', $htn->id)
            ->assertJsonPath('data.conditions.0.condition_name', 'Hypertension')
            ->assertJsonPath('data.conditions.0.condition_identity', 'hypertension')
            ->assertJsonPath('data.conditions.0.status', 'active')
            ->assertJsonPath('data.conditions.0.confirmed_by_name', 'Dr. Rhu')
            ->assertJsonPath('data.conditions.0.source_type', 'rhu_feedback')
            ->assertJsonPath('data.conditions.0.source_id', 7)
            ->assertJsonPath('data.conditions.0.monitoring.id', $linked->id)
            ->assertJsonPath('data.conditions.0.monitoring.status', 'active')
            ->assertJsonPath('data.conditions.0.events.0.to_status', 'active')
            ->assertJsonPath('data.conditions.0.events.0.from_status', 'under_evaluation')
            ->assertJsonPath('data.conditions.0.events.0.note', 'Confirmed on repeat BP')
            ->assertJsonPath('data.conditions.0.events.0.changed_by_name', 'Dr. Rhu')
            ->assertJsonPath('data.conditions.0.events.1.to_status', 'under_evaluation')
            ->assertJsonPath('data.conditions.1.id', $old->id)
            ->assertJsonPath('data.conditions.1.monitoring', null)
            ->assertJsonCount(0, 'data.conditions.1.events')
            ->assertJsonCount(1, 'data.legacy_monitorings')
            ->assertJsonPath('data.legacy_monitorings.0.id', $legacy->id)
            ->assertJsonPath('data.legacy_monitorings.0.condition_name', 'Gout')
            ->assertJsonPath('data.legacy_monitorings.0.condition_identity', 'name:gout');
        $this->assertNotNull($response->json('data.conditions.0.bhc_monitoring_recommended_at'));
        $this->assertNotNull($response->json('data.conditions.0.confirmed_at'));
        $this->assertNotNull($response->json('data.conditions.0.monitoring.started_at'));
        $this->assertSame(
            ['id', 'condition_name', 'condition_identity', 'status', 'confirmed_at', 'confirmed_by_name', 'source_type', 'source_id', 'bhc_monitoring_recommended_at', 'monitoring', 'events'],
            array_keys($response->json('data.conditions.0'))
        );
        $this->assertSame(
            ['from_status', 'to_status', 'note', 'source_type', 'source_id', 'changed_by_name', 'changed_at'],
            array_keys($response->json('data.conditions.0.events.0'))
        );
        $this->assertSame(['id', 'condition_name', 'condition_key', 'condition_identity', 'started_at'], array_keys($response->json('data.legacy_monitorings.0')));
    }

    public function test_conditions_list_needs_clinical_history_and_facility_access(): void
    {
        $this->actingAs($this->bhw(StaffRoles::defaults('encoder')), 'sanctum');
        $this->getJson("/api/patients/{$this->patient->id}/conditions")->assertForbidden();

        $rhu = RuralHealthUnit::create(['name' => 'Other RHU', 'status' => 'active']);
        $other = BarangayHealthCenter::create(['name' => 'Other BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->actingAs($this->bhw(StaffRoles::defaults('midwife'), $other, 'other-read@example.test'), 'sanctum');
        $this->getJson("/api/patients/{$this->patient->id}/conditions")->assertForbidden();
    }

    public function test_overview_lists_a_recommendation_until_monitoring_starts(): void
    {
        $htn = $this->condition('Hypertension', 'hypertension', 'active', ['bhc_monitoring_recommended_at' => now()->subDay()]);
        $this->condition('Asthma', 'name:asthma', 'active'); // not recommended

        $this->actingAs($this->bhw(StaffRoles::defaults('encoder')), 'sanctum');
        $response = $this->getJson("/api/patients/{$this->patient->id}/care-overview")->assertOk();
        $response->assertJsonCount(1, 'data.monitoring_recommendations')
            ->assertJsonPath('data.monitoring_recommendations.0.condition_id', $htn->id)
            ->assertJsonPath('data.monitoring_recommendations.0.condition_name', 'Hypertension')
            ->assertJsonPath('data.monitoring_recommendations.0.condition_key', 'hypertension')
            ->assertJsonPath('data.monitoring_recommendations.0.status', 'active');
        $this->assertSame(
            ['condition_id', 'condition_name', 'condition_key', 'status', 'confirmed_at', 'recommended_at'],
            array_keys($response->json('data.monitoring_recommendations.0'))
        );

        $this->monitoring('Hypertension', 'hypertension', $htn, 'hypertension');
        $this->getJson("/api/patients/{$this->patient->id}/care-overview")->assertOk()
            ->assertJsonCount(0, 'data.monitoring_recommendations');
    }

    public function test_a_resolved_or_ruled_out_recommendation_leaves_the_overview(): void
    {
        $htn = $this->condition('Hypertension', 'hypertension', 'active', ['bhc_monitoring_recommended_at' => now()->subDay()]);
        $asthma = $this->condition('Asthma', 'name:asthma', 'controlled', ['bhc_monitoring_recommended_at' => now()->subDay()]);

        $this->actingAs($this->bhw(StaffRoles::defaults('midwife')), 'sanctum');
        $this->getJson("/api/patients/{$this->patient->id}/care-overview")->assertOk()
            ->assertJsonCount(2, 'data.monitoring_recommendations');

        $htn->update(['status' => 'resolved']);
        $asthma->update(['status' => 'ruled_out']);
        $this->getJson("/api/patients/{$this->patient->id}/care-overview")->assertOk()
            ->assertJsonCount(0, 'data.monitoring_recommendations');
    }

    public function test_resolving_a_monitored_condition_keeps_the_monitoring_and_exposes_its_status(): void
    {
        $htn = $this->condition('Hypertension', 'hypertension', 'active');
        $monitoring = $this->monitoring('Hypertension', 'hypertension', $htn, 'hypertension');
        $htn->update(['status' => 'resolved']);

        $this->actingAs($this->bhw(StaffRoles::defaults('midwife')), 'sanctum');
        $this->getJson("/api/patients/{$this->patient->id}/care-overview")->assertOk()
            ->assertJsonCount(1, 'data.monitoring_without_follow_up')
            ->assertJsonPath('data.monitoring_without_follow_up.0.id', $monitoring->id)
            ->assertJsonPath('data.monitoring_without_follow_up.0.condition_status', 'resolved')
            ->assertJsonPath('data.monitoring_without_follow_up.0.legacy', false);
        $this->assertSame('active', $monitoring->fresh()->status);
    }

    public function test_overview_marks_legacy_monitoring(): void
    {
        $htn = $this->condition('Hypertension', 'hypertension', 'active');
        $linked = $this->monitoring('Hypertension', 'hypertension', $htn, 'hypertension');
        $legacy = $this->monitoring('Gout', 'name:gout');
        $task = FollowUpTask::create(['health_record_id' => $linked->started_health_record_id, 'patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->bhc->id, 'due_date' => now()->toDateString(), 'state' => 'pending']);
        $task->conditionMonitorings()->attach([$linked->id, $legacy->id]);
        $legacyOnly = $this->monitoring('Anemia', 'name:anemia');

        $this->actingAs($this->bhw(StaffRoles::defaults('midwife')), 'sanctum');
        $response = $this->getJson("/api/patients/{$this->patient->id}/care-overview")->assertOk();

        $scheduled = collect($response->json('data.pending_follow_ups.0.conditions'))->keyBy('monitoring_id');
        $this->assertSame('active', $scheduled[$linked->id]['condition_status']);
        $this->assertFalse($scheduled[$linked->id]['legacy']);
        $this->assertNull($scheduled[$legacy->id]['condition_status']);
        $this->assertTrue($scheduled[$legacy->id]['legacy']);
        $response->assertJsonCount(1, 'data.monitoring_without_follow_up')
            ->assertJsonPath('data.monitoring_without_follow_up.0.id', $legacyOnly->id)
            ->assertJsonPath('data.monitoring_without_follow_up.0.condition_status', null)
            ->assertJsonPath('data.monitoring_without_follow_up.0.legacy', true);
    }
}
