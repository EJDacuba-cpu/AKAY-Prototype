<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\HealthRecord;
use App\Models\MonitoringHandoffRequest;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\RhuVisitQueueEntry;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MonitoringHandoffTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    private BarangayHealthCenter $otherBhc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Handoff RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Handoff BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $this->otherBhc = BarangayHealthCenter::create(['name' => 'Other Catchment BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
    }

    private function rhuClinician(): User
    {
        return User::create([
            'name' => 'Handoff Clinician',
            'email' => uniqid('', true).'@example.test',
            'password' => 'password123',
            'status' => 'active',
            'role' => 'rhu',
            'staff_role' => 'doctor',
            'rural_health_unit_id' => $this->rhu->id,
            'permissions' => [...StaffRoles::defaults('doctor'), 'consultations.encode', 'consultations.finalize', 'followups.manage'],
        ]);
    }

    private function bhcUser(BarangayHealthCenter $bhc, array $permissions = []): User
    {
        return User::create([
            'name' => 'Handoff BHW',
            'email' => uniqid('', true).'@example.test',
            'password' => 'password123',
            'status' => 'active',
            'role' => 'bhc',
            'staff_role' => 'midwife',
            'barangay_health_center_id' => $bhc->id,
            'permissions' => $permissions ?: StaffRoles::defaults('midwife'),
        ]);
    }

    private function as(User $user): static
    {
        Sanctum::actingAs($user, ['akay:access']);

        return $this;
    }

    private function rhuPatient(array $attributes = []): Patient
    {
        return Patient::create([
            'first_name' => 'Handoff',
            'last_name' => uniqid(),
            'sex' => 'Female',
            'status' => 'active',
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            ...$attributes,
        ]);
    }

    private function bhcPatient(BarangayHealthCenter $bhc, array $attributes = []): Patient
    {
        return Patient::create([
            'first_name' => 'Catchment',
            'last_name' => uniqid(),
            'sex' => 'Female',
            'status' => 'active',
            'barangay_health_center_id' => $bhc->id,
            ...$attributes,
        ]);
    }

    private function visit(Patient $patient): RhuVisitQueueEntry
    {
        return RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $this->rhu->id,
            'patient_id' => $patient->id,
            'source' => RhuVisitQueueEntry::SOURCE_WALK_IN,
            'status' => RhuVisitQueueEntry::STATUS_WAITING,
            'checked_in_at' => now(),
            'check_in_key' => uniqid('handoff-', true),
        ]);
    }

    private function start(User $user, RhuVisitQueueEntry $visit): string
    {
        return $this->as($user)->postJson("/api/rhu-visits/{$visit->id}/start")->assertOk()->json('data.consultation_uuid');
    }

    private function finalizeManage(User $user, Patient $patient, array $diagnosis = []): int
    {
        $visit = $this->visit($patient);
        $uuid = $this->start($user, $visit);

        return $this->as($user)
            ->withHeaders(['Idempotency-Key' => (string) Str::uuid()])
            ->postJson('/api/health-records', [
                'consultation_workflow' => HealthRecord::WORKFLOW_RHU_ITR_V1,
                'consultation_uuid' => $uuid,
                'rhu_visit_id' => $visit->id,
                'patient_id' => $patient->id,
                'category' => 'General Consultation',
                'chief_complaint' => 'Hypertension follow-up',
                'diagnoses' => [[
                    'name' => 'Hypertension',
                    'activate' => true,
                    'nextAction' => 'manage_to_bhc',
                    'receivingBhcId' => $this->bhc->id,
                    'monitoringRecommendation' => 'Weekly BP.',
                    ...$diagnosis,
                ]],
            ])
            ->assertCreated()
            ->json('data.id');
    }

    public function test_catchment_bhc_patient_can_be_searched_and_checked_in_without_ownership_change(): void
    {
        $nurse = User::create([
            'name' => 'Queue Nurse',
            'email' => uniqid('', true).'@example.test',
            'password' => 'password123',
            'status' => 'active',
            'role' => 'rhu',
            'staff_role' => 'nurse',
            'rural_health_unit_id' => $this->rhu->id,
            'permissions' => [...StaffRoles::defaults('nurse'), 'patients.register'],
        ]);
        $patient = $this->bhcPatient($this->bhc, ['first_name' => 'Catchment', 'last_name' => 'Walker']);
        $this->as($nurse)->getJson('/api/rhu-visits/patient-search?q=Catchment Walker')
            ->assertOk()
            ->assertJsonPath('data.0.id', $patient->id);

        $this->as($nurse)->postJson('/api/rhu-visits', [
            'patient_id' => $patient->id,
            'check_in_key' => 'catchment-walk-in',
        ])->assertCreated();

        $this->assertNull($patient->fresh()->rural_health_unit_id);
        $this->assertSame($this->bhc->id, $patient->fresh()->barangay_health_center_id);
    }

    public function test_rhu_only_patient_creates_linkage_needed_request(): void
    {
        $patient = $this->rhuPatient(['barangay_health_center_id' => null]);
        $clinician = $this->rhuClinician();
        $this->finalizeManage($clinician, $patient);

        $handoff = MonitoringHandoffRequest::query()->sole();
        $this->assertSame(MonitoringHandoffRequest::STATUS_LINKAGE_NEEDED, $handoff->status);
        $this->assertNull($handoff->linked_patient_id);
        $this->assertDatabaseCount('condition_monitorings', 0);
    }

    public function test_bhc_lists_only_its_requests_and_cannot_link_another_bhcs_patient(): void
    {
        $patient = $this->rhuPatient(['barangay_health_center_id' => null]);
        $this->finalizeManage($this->rhuClinician(), $patient);
        $handoff = MonitoringHandoffRequest::query()->sole();
        $owner = $this->bhcUser($this->bhc);
        $outsider = $this->bhcUser($this->otherBhc);
        $foreignPatient = $this->bhcPatient($this->otherBhc);

        $this->as($owner)->getJson('/api/monitoring-handoff-requests')->assertOk()->assertJsonPath('data.0.id', $handoff->id);
        $this->as($outsider)->getJson('/api/monitoring-handoff-requests')->assertOk()->assertJsonCount(0, 'data');
        $this->as($outsider)->getJson('/api/monitoring-handoff-requests/'.$handoff->id)->assertForbidden();

        $this->as($owner)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/link", [
            'linked_patient_id' => $foreignPatient->id,
        ])->assertForbidden();
        $this->assertNull($handoff->fresh()->linked_patient_id);
    }

    public function test_link_accept_does_not_start_monitoring_and_start_consult_does(): void
    {
        $patient = $this->rhuPatient(['barangay_health_center_id' => null]);
        $this->finalizeManage($this->rhuClinician(), $patient);
        $handoff = MonitoringHandoffRequest::query()->sole();
        $bhcStaff = $this->bhcUser($this->bhc);
        $linked = $this->bhcPatient($this->bhc, ['first_name' => 'Linked']);

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/link", [
            'linked_patient_id' => $linked->id,
        ])->assertOk()->assertJsonPath('data.status', MonitoringHandoffRequest::STATUS_PENDING_REVIEW);

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/accept")
            ->assertOk()
            ->assertJsonPath('data.status', MonitoringHandoffRequest::STATUS_ACCEPTED_AWAITING_FIRST_VISIT);
        $this->assertDatabaseCount('condition_monitorings', 0);

        $condition = PatientCondition::query()->where('patient_id', $patient->id)->sole();
        $this->as($bhcStaff)->getJson("/api/patients/{$linked->id}/care-overview")
            ->assertOk()
            ->assertJsonPath('data.monitoring_recommendations.0.condition_id', $condition->id);
        $this->as($bhcStaff)->getJson("/api/patients/{$linked->id}/conditions")
            ->assertOk()
            ->assertJsonPath('data.conditions.0.id', $condition->id)
            ->assertJsonPath('data.conditions.0.monitoring', null);

        $this->as($bhcStaff)
            ->withHeaders(['Idempotency-Key' => (string) Str::uuid()])
            ->postJson('/api/health-records', [
                'patient_id' => $linked->id,
                'category' => 'General Consultation',
                'chief_complaint' => 'Start monitoring',
                'care_plan' => ['start_monitoring_condition_ids' => [$condition->id]],
            ])
            ->assertCreated();

        $this->assertSame(1, ConditionMonitoring::count());
        $this->assertSame($linked->id, ConditionMonitoring::sole()->patient_id);
        $this->assertSame($condition->id, ConditionMonitoring::sole()->patient_condition_id);
        $this->assertSame(1, PatientCondition::where('condition_identity', $condition->condition_identity)->count());
        $this->assertSame(MonitoringHandoffRequest::STATUS_MONITORING_ACTIVE, $handoff->fresh()->status);
        $this->as($bhcStaff)->getJson("/api/patients/{$linked->id}/conditions")
            ->assertOk()
            ->assertJsonPath('data.conditions.0.monitoring.id', ConditionMonitoring::sole()->id)
            ->assertJsonPath('data.conditions.0.monitoring.status', 'active');
    }

    public function test_pending_request_cannot_start_and_legacy_recommend_still_can(): void
    {
        $patient = $this->bhcPatient($this->bhc);
        $this->finalizeManage($this->rhuClinician(), $patient);
        $condition = PatientCondition::query()->where('patient_id', $patient->id)->sole();
        $bhcStaff = $this->bhcUser($this->bhc);

        $this->as($bhcStaff)
            ->withHeaders(['Idempotency-Key' => (string) Str::uuid()])
            ->postJson('/api/health-records', [
                'patient_id' => $patient->id,
                'category' => 'General Consultation',
                'chief_complaint' => 'Too soon',
                'care_plan' => ['start_monitoring_condition_ids' => [$condition->id]],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['care_plan.start_monitoring_condition_ids.0']);

        $legacyPatient = $this->bhcPatient($this->bhc, ['first_name' => 'Legacy']);
        $legacy = PatientCondition::create([
            'patient_id' => $legacyPatient->id,
            'condition_name' => 'Diabetes',
            'condition_identity' => 'diabetes',
            'status' => PatientCondition::STATUS_ACTIVE,
            'confirmed_at' => now(),
            'source_type' => PatientCondition::SOURCE_RHU_RECORD,
            'source_id' => 1,
            'bhc_monitoring_recommended_at' => now(),
        ]);
        $this->as($bhcStaff)
            ->withHeaders(['Idempotency-Key' => (string) Str::uuid()])
            ->postJson('/api/health-records', [
                'patient_id' => $legacyPatient->id,
                'category' => 'General Consultation',
                'chief_complaint' => 'Legacy start',
                'care_plan' => ['start_monitoring_condition_ids' => [$legacy->id]],
            ])
            ->assertCreated();
        $this->assertSame(1, ConditionMonitoring::count());
    }

    public function test_decline_with_redirect_creates_a_new_request(): void
    {
        $patient = $this->rhuPatient();
        $this->finalizeManage($this->rhuClinician(), $patient);
        $handoff = MonitoringHandoffRequest::query()->sole();
        $bhcStaff = $this->bhcUser($this->bhc);

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/decline", [
            'reason' => 'Wrong catchment BHC.',
            'redirected_to_bhc_id' => $this->otherBhc->id,
        ])->assertOk()->assertJsonPath('data.status', MonitoringHandoffRequest::STATUS_REDIRECTED);

        $this->assertSame(2, MonitoringHandoffRequest::count());
        $copy = MonitoringHandoffRequest::query()->where('id', '!=', $handoff->id)->sole();
        $this->assertSame($this->otherBhc->id, $copy->receiving_barangay_health_center_id);
        $this->assertSame(MonitoringHandoffRequest::STATUS_LINKAGE_NEEDED, $copy->status);
        $this->assertDatabaseCount('condition_monitorings', 0);
    }
}
