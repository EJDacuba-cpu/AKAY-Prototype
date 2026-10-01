<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CareOverviewTest extends TestCase
{
    use RefreshDatabase;

    private Patient $patient;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'CO RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'CO BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->patient = Patient::create(['first_name' => 'CO', 'last_name' => 'Patient', 'sex' => 'Female', 'barangay_health_center_id' => $this->bhc->id]);
    }

    private function actAs(array $permissions): void
    {
        $user = User::create(['name' => 'CO User '.count($permissions), 'email' => 'co'.count($permissions).'@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $this->bhc->id, 'permissions' => $permissions]);
        $this->actingAs($user, 'sanctum');
    }

    private function record(array $monitoringData = []): HealthRecord
    {
        return HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->bhc->id, 'date_recorded' => now()->subWeeks(2), 'monitoring_data' => $monitoringData]);
    }

    private function monitoring(HealthRecord $record, string $name, ?string $key): ConditionMonitoring
    {
        $monitoring = ConditionMonitoring::create(['patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->bhc->id, 'condition_key' => $key, 'condition_name' => $name, 'condition_identity' => $key ?? 'name:'.strtolower($name), 'status' => 'active', 'started_health_record_id' => $record->id, 'started_at' => now()->subWeeks(2)]);
        $monitoring->visits()->create(['health_record_id' => $record->id, 'action' => 'started', 'referred' => false, 'created_at' => now()]);

        return $monitoring;
    }

    public function test_lists_pending_follow_ups_and_unscheduled_monitoring(): void
    {
        $this->actAs(ActionPermissions::PRESETS['encoder']);
        $source = $this->record(['followUpReason' => 'BP recheck']);
        $htn = $this->monitoring($source, 'Hypertension', 'hypertension');
        $asthma = $this->monitoring($source, 'Asthma', null);
        $task = FollowUpTask::create(['health_record_id' => $source->id, 'patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->bhc->id, 'due_date' => now()->subDay()->toDateString(), 'state' => 'pending']);
        $task->conditionMonitorings()->attach($htn->id);

        $response = $this->getJson("/api/patients/{$this->patient->id}/care-overview")->assertOk();

        $response->assertJsonPath('data.pending_follow_ups.0.id', $task->id)
            ->assertJsonPath('data.pending_follow_ups.0.is_overdue', true)
            ->assertJsonPath('data.pending_follow_ups.0.reason', 'BP recheck')
            ->assertJsonPath('data.pending_follow_ups.0.conditions.0.condition_name', 'Hypertension')
            ->assertJsonCount(1, 'data.monitoring_without_follow_up')
            ->assertJsonPath('data.monitoring_without_follow_up.0.id', $asthma->id)
            ->assertJsonPath('data.monitoring_without_follow_up.0.last_health_record_id', $source->id);
        $this->assertSame(['pending_follow_ups', 'monitoring_without_follow_up'], array_keys($response->json('data')));
        $this->assertSame(
            ['id', 'due_date', 'due_time', 'state', 'is_overdue', 'reason', 'source_health_record_id', 'source_date', 'conditions'],
            array_keys($response->json('data.pending_follow_ups.0'))
        );
    }

    public function test_fulfilled_rescheduled_and_stopped_items_are_excluded(): void
    {
        $this->actAs(ActionPermissions::PRESETS['clinical']);
        $source = $this->record();
        $stopped = $this->monitoring($source, 'Asthma', null);
        $stopped->update(['status' => 'stopped']);
        FollowUpTask::create(['health_record_id' => $source->id, 'patient_id' => $this->patient->id, 'barangay_health_center_id' => $this->bhc->id, 'due_date' => now()->toDateString(), 'state' => 'fulfilled', 'fulfilled_at' => now()]);

        $this->getJson("/api/patients/{$this->patient->id}/care-overview")->assertOk()
            ->assertJsonCount(0, 'data.pending_follow_ups')
            ->assertJsonCount(0, 'data.monitoring_without_follow_up');
    }

    public function test_requires_encode_or_history_permission(): void
    {
        $this->actAs(['inventory.view']);
        $this->getJson("/api/patients/{$this->patient->id}/care-overview")->assertForbidden();
    }
}
