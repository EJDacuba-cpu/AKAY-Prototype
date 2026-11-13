<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\HealthRecord;
use App\Models\Household;
use App\Models\MonitoringHandoffRequest;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\Referral;
use App\Models\RhuVisitQueueEntry;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ReferralService;
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
            'birthdate' => '1990-05-01',
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
            'birthdate' => '1991-02-02',
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

    public function test_rhu_only_patient_creates_linkage_needed_request_without_bhc_assignment(): void
    {
        $patient = $this->rhuPatient(['barangay_health_center_id' => null]);
        $clinician = $this->rhuClinician();
        $this->finalizeManage($clinician, $patient);

        $handoff = MonitoringHandoffRequest::query()->sole();
        $this->assertSame(MonitoringHandoffRequest::STATUS_LINKAGE_NEEDED, $handoff->status);
        $this->assertNull($handoff->linked_patient_id);
        $this->assertNull($patient->fresh()->barangay_health_center_id);
        $this->assertSame(MonitoringHandoffRequest::IDENTITY_SOURCE_RHU_WALK_IN, $handoff->identity_source);
        $this->assertDatabaseCount('condition_monitorings', 0);

        $bhcStaff = $this->bhcUser($this->bhc);
        $this->as($bhcStaff)->getJson('/api/monitoring-handoff-requests/'.$handoff->id)
            ->assertOk()
            ->assertJsonPath('data.verification_status', 'awaiting_verification')
            ->assertJsonPath('data.recommendation', null)
            ->assertJsonPath('data.requires_verification', true);
    }

    public function test_bhc_referral_return_skips_verification_and_keeps_same_patient(): void
    {
        $patient = $this->rhuPatient(); // already assigned to receiving BHC
        $this->finalizeManage($this->rhuClinician(), $patient);
        $handoff = MonitoringHandoffRequest::query()->sole();

        $this->assertSame(MonitoringHandoffRequest::STATUS_PENDING_REVIEW, $handoff->status);
        $this->assertSame($patient->id, $handoff->linked_patient_id);
        $this->assertSame(MonitoringHandoffRequest::IDENTITY_SOURCE_BHC_REFERRAL_RETURN, $handoff->identity_source);
        $this->assertSame($this->bhc->id, $patient->fresh()->barangay_health_center_id);

        $bhcStaff = $this->bhcUser($this->bhc);
        $this->as($bhcStaff)->getJson('/api/monitoring-handoff-requests/'.$handoff->id)
            ->assertOk()
            ->assertJsonPath('data.requires_verification', false)
            ->assertJsonPath('data.verification_status', 'verified')
            ->assertJsonPath('data.recommendation', 'Weekly BP.');
    }

    public function test_formal_referral_visit_manage_to_bhc_reuses_original_patient(): void
    {
        $patient = $this->bhcPatient($this->bhc, [
            'first_name' => 'Referral',
            'last_name' => 'Returner',
            'rural_health_unit_id' => null,
        ]);
        $clinician = $this->rhuClinician();
        $sourceRecord = HealthRecord::create([
            'patient_id' => $patient->id,
            'created_by' => $clinician->id,
            'barangay_health_center_id' => $this->bhc->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'BHC referral source',
        ]);
        $referral = Referral::create([
            'tracking_id' => 'AKY-HO-'.strtoupper(Str::random(6)),
            'qr_code_value' => app(ReferralService::class)->makeLegacyQrPlaceholder(),
            'patient_id' => $patient->id,
            'health_record_id' => $sourceRecord->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'reason_for_referral' => 'Needs RHU confirmation',
            'status' => Referral::STATUS_RECEIVED,
        ]);
        $visit = RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $this->rhu->id,
            'patient_id' => $patient->id,
            'source' => RhuVisitQueueEntry::SOURCE_REFERRAL,
            'referral_id' => $referral->id,
            'status' => RhuVisitQueueEntry::STATUS_WAITING,
            'checked_in_at' => now(),
            'check_in_key' => uniqid('referral-handoff-', true),
        ]);
        $uuid = $this->start($clinician, $visit);
        $this->as($clinician)
            ->withHeaders(['Idempotency-Key' => (string) Str::uuid()])
            ->postJson('/api/health-records', [
                'consultation_workflow' => HealthRecord::WORKFLOW_RHU_ITR_V1,
                'consultation_uuid' => $uuid,
                'rhu_visit_id' => $visit->id,
                'patient_id' => $patient->id,
                'category' => 'General Consultation',
                'chief_complaint' => 'Referral return manage to BHC',
                'diagnoses' => [[
                    'name' => 'Diabetes',
                    'activate' => true,
                    'nextAction' => 'manage_to_bhc',
                    'receivingBhcId' => $this->bhc->id,
                    'monitoringRecommendation' => 'Monitor fasting glucose.',
                ]],
            ])
            ->assertCreated();

        $handoff = MonitoringHandoffRequest::query()->sole();
        $this->assertSame($patient->id, $handoff->patient_id);
        $this->assertSame($patient->id, $handoff->linked_patient_id);
        $this->assertSame(MonitoringHandoffRequest::STATUS_PENDING_REVIEW, $handoff->status);
        $this->assertSame(MonitoringHandoffRequest::IDENTITY_SOURCE_BHC_REFERRAL_RETURN, $handoff->identity_source);
        $this->assertSame($this->bhc->id, $patient->fresh()->barangay_health_center_id);
        $this->assertSame(1, Patient::whereKey($patient->id)->count());
        $this->assertSame(Referral::STATUS_RECEIVED, $referral->fresh()->status);
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
            'identity_confirmed' => true,
            'verification_evidence' => 'Foreign facility attempt.',
        ])->assertForbidden();
        $this->assertNull($handoff->fresh()->linked_patient_id);
        $this->assertNull($patient->fresh()->barangay_health_center_id);
    }

    public function test_register_source_assigns_same_patient_then_accept_and_start_consult(): void
    {
        $patient = $this->rhuPatient(['barangay_health_center_id' => null]);
        $this->finalizeManage($this->rhuClinician(), $patient);
        $handoff = MonitoringHandoffRequest::query()->sole();
        $bhcStaff = $this->bhcUser($this->bhc);
        $otherLocal = $this->bhcPatient($this->bhc, ['first_name' => 'Lookalike']);

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/link", [
            'linked_patient_id' => $otherLocal->id,
        ])->assertUnprocessable();
        $this->assertNull($patient->fresh()->barangay_health_center_id);

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/register-source")
            ->assertOk()
            ->assertJsonPath('data.status', MonitoringHandoffRequest::STATUS_PENDING_REVIEW)
            ->assertJsonPath('data.linked_patient.id', $patient->id)
            ->assertJsonPath('data.identity_resolution', MonitoringHandoffRequest::IDENTITY_RESOLUTION_REGISTERED_SOURCE);

        $this->assertSame($this->bhc->id, $patient->fresh()->barangay_health_center_id);
        $this->assertSame($this->rhu->id, $patient->fresh()->rural_health_unit_id);

        // Retry is idempotent and does not create a second patient.
        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/register-source")
            ->assertOk()
            ->assertJsonPath('data.linked_patient.id', $patient->id);
        $this->assertSame(1, Patient::where('first_name', $patient->first_name)->where('last_name', $patient->last_name)->count());

        $this->as($bhcStaff)->getJson('/api/patients?search='.urlencode($patient->last_name))
            ->assertOk()
            ->assertJsonFragment(['id' => $patient->id]);

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/accept")
            ->assertOk()
            ->assertJsonPath('data.status', MonitoringHandoffRequest::STATUS_ACCEPTED_AWAITING_FIRST_VISIT)
            ->assertJsonPath('data.can_start_consultation', true);
        $this->assertDatabaseCount('condition_monitorings', 0);

        $condition = PatientCondition::query()->where('patient_id', $patient->id)->sole();
        $this->as($bhcStaff)->getJson("/api/patients/{$patient->id}/care-overview")
            ->assertOk()
            ->assertJsonPath('data.monitoring_recommendations.0.condition_id', $condition->id);

        $this->as($bhcStaff)
            ->withHeaders(['Idempotency-Key' => (string) Str::uuid()])
            ->postJson('/api/health-records', [
                'patient_id' => $patient->id,
                'category' => 'General Consultation',
                'chief_complaint' => 'Start monitoring',
                'care_plan' => ['start_monitoring_condition_ids' => [$condition->id]],
            ])
            ->assertCreated();

        $this->assertSame(1, ConditionMonitoring::count());
        $this->assertSame($patient->id, ConditionMonitoring::sole()->patient_id);
        $this->assertSame($condition->id, ConditionMonitoring::sole()->patient_condition_id);
        $this->assertSame(MonitoringHandoffRequest::STATUS_MONITORING_ACTIVE, $handoff->fresh()->status);
    }

    public function test_reuse_existing_same_patient_id_already_at_receiving_bhc(): void
    {
        $patient = $this->rhuPatient(['barangay_health_center_id' => null, 'birthdate' => '1988-03-03']);
        $this->finalizeManage($this->rhuClinician(), $patient);
        $handoff = MonitoringHandoffRequest::query()->sole();
        $bhcStaff = $this->bhcUser($this->bhc);

        // Concurrent ownership assignment outside the handoff flow.
        $patient->update(['barangay_health_center_id' => $this->bhc->id]);

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/link", [
            'linked_patient_id' => $patient->id,
        ])->assertOk()
            ->assertJsonPath('data.status', MonitoringHandoffRequest::STATUS_PENDING_REVIEW)
            ->assertJsonPath('data.identity_resolution', MonitoringHandoffRequest::IDENTITY_RESOLUTION_REUSED_EXISTING);
    }

    public function test_register_source_detaches_rhu_household_before_bhc_assignment(): void
    {
        $patient = $this->rhuPatient(['barangay_health_center_id' => null]);
        $household = Household::create([
            'rural_health_unit_id' => $this->rhu->id,
            'serial_number' => 'FSN-RHU-HAND-0001',
            'address' => [],
            'version' => 1,
            'head_patient_id' => null,
        ]);
        $patient->update([
            'household_id' => $household->id,
            'relationship_to_household_head' => 'Household head',
            'family_serial_number' => $household->serial_number,
        ]);
        $household->update(['head_patient_id' => $patient->id]);

        $this->finalizeManage($this->rhuClinician(), $patient);
        $handoff = MonitoringHandoffRequest::query()->sole();
        $bhcStaff = $this->bhcUser($this->bhc);
        $patientId = $patient->id;

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/register-source")
            ->assertOk()
            ->assertJsonPath('data.status', MonitoringHandoffRequest::STATUS_PENDING_REVIEW)
            ->assertJsonPath('data.linked_patient.id', $patientId)
            ->assertJsonPath('data.identity_resolution', MonitoringHandoffRequest::IDENTITY_RESOLUTION_REGISTERED_SOURCE);

        $fresh = $patient->fresh();
        $this->assertSame($patientId, $fresh->id);
        $this->assertSame($this->bhc->id, $fresh->barangay_health_center_id);
        $this->assertSame($this->rhu->id, $fresh->rural_health_unit_id);
        $this->assertNull($fresh->household_id);
        $this->assertSame(1, Patient::whereKey($patientId)->count());
        $this->assertNotNull($household->fresh()->archived_at);
    }

    public function test_register_source_blocks_rhu_household_head_with_remaining_members(): void
    {
        $patient = $this->rhuPatient(['barangay_health_center_id' => null, 'last_name' => 'HeadOnly']);
        $member = $this->rhuPatient([
            'barangay_health_center_id' => null,
            'first_name' => 'Member',
            'last_name' => 'HeadOnly',
        ]);
        $household = Household::create([
            'rural_health_unit_id' => $this->rhu->id,
            'serial_number' => 'FSN-RHU-HAND-0002',
            'address' => [],
            'version' => 1,
        ]);
        $patient->update([
            'household_id' => $household->id,
            'relationship_to_household_head' => 'Household head',
            'family_serial_number' => $household->serial_number,
        ]);
        $member->update([
            'household_id' => $household->id,
            'relationship_to_household_head' => 'Child',
            'family_serial_number' => $household->serial_number,
        ]);
        $household->update(['head_patient_id' => $patient->id]);

        $this->finalizeManage($this->rhuClinician(), $patient);
        $handoff = MonitoringHandoffRequest::query()->sole();
        $bhcStaff = $this->bhcUser($this->bhc);

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/register-source")
            ->assertUnprocessable();

        $this->assertSame(MonitoringHandoffRequest::IDENTITY_RESOLUTION_NEEDS_REVIEW, $handoff->fresh()->identity_resolution);
        $this->assertNull($patient->fresh()->barangay_health_center_id);
        $this->assertSame($household->id, $patient->fresh()->household_id);
        $this->assertSame(MonitoringHandoffRequest::STATUS_LINKAGE_NEEDED, $handoff->fresh()->status);
    }

    public function test_foreign_bhc_ownership_and_inactive_source_enter_review(): void
    {
        $patient = $this->rhuPatient([
            'barangay_health_center_id' => $this->otherBhc->id,
        ]);
        $this->finalizeManage($this->rhuClinician(), $patient);
        $handoff = MonitoringHandoffRequest::query()->sole();
        $this->assertSame(MonitoringHandoffRequest::STATUS_LINKAGE_NEEDED, $handoff->status);
        $bhcStaff = $this->bhcUser($this->bhc);

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/register-source")
            ->assertUnprocessable();
        $this->assertSame(MonitoringHandoffRequest::IDENTITY_RESOLUTION_NEEDS_REVIEW, $handoff->fresh()->identity_resolution);
        $this->assertSame($this->otherBhc->id, $patient->fresh()->barangay_health_center_id);

        $inactive = $this->rhuPatient(['barangay_health_center_id' => null, 'status' => 'inactive', 'last_name' => 'Inactive']);
        // Cannot finalize for inactive through normal path easily — seed handoff directly.
        $condition = PatientCondition::create([
            'patient_id' => $inactive->id,
            'condition_name' => 'Diabetes',
            'condition_identity' => 'diabetes',
            'status' => PatientCondition::STATUS_ACTIVE,
            'confirmed_at' => now(),
            'source_type' => PatientCondition::SOURCE_RHU_RECORD,
            'source_id' => 1,
        ]);
        $record = HealthRecord::create([
            'patient_id' => $inactive->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Seed',
            'date_recorded' => now()->toDateString(),
            'rural_health_unit_id' => $this->rhu->id,
            'encoded_by' => $this->rhuClinician()->id,
        ]);
        $inactiveHandoff = MonitoringHandoffRequest::create([
            'patient_id' => $inactive->id,
            'patient_condition_id' => $condition->id,
            'health_record_id' => $record->id,
            'sending_rural_health_unit_id' => $this->rhu->id,
            'receiving_barangay_health_center_id' => $this->bhc->id,
            'recommendation' => 'Monitor',
            'status' => MonitoringHandoffRequest::STATUS_LINKAGE_NEEDED,
            'identity_source' => MonitoringHandoffRequest::IDENTITY_SOURCE_RHU_WALK_IN,
            'created_by' => $record->encoded_by,
        ]);
        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$inactiveHandoff->id}/register-source")
            ->assertUnprocessable();
        $this->assertSame(MonitoringHandoffRequest::IDENTITY_RESOLUTION_NEEDS_REVIEW, $inactiveHandoff->fresh()->identity_resolution);
        $this->assertNull($inactive->fresh()->barangay_health_center_id);
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

    public function test_decline_keeps_receiving_bhc_and_does_not_create_redirect_copy(): void
    {
        $patient = $this->rhuPatient();
        $this->finalizeManage($this->rhuClinician(), $patient);
        $handoff = MonitoringHandoffRequest::query()->sole();
        $bhcStaff = $this->bhcUser($this->bhc);

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/decline", [
            'reason' => 'Unable to take this monitoring request.',
            'redirected_to_bhc_id' => $this->otherBhc->id,
        ])->assertOk()
            ->assertJsonPath('data.status', MonitoringHandoffRequest::STATUS_DECLINED)
            ->assertJsonPath('data.receiving_bhc.id', $this->bhc->id)
            ->assertJsonPath('data.redirected_to_bhc', null);

        $this->assertSame(1, MonitoringHandoffRequest::count());
        $this->assertSame($this->bhc->id, $handoff->fresh()->receiving_barangay_health_center_id);
        $this->assertNull($handoff->fresh()->redirected_to_bhc_id);
        $this->assertDatabaseCount('condition_monitorings', 0);
    }

    public function test_handoff_finalize_is_idempotent_for_same_condition(): void
    {
        $patient = $this->rhuPatient(['barangay_health_center_id' => null]);
        $clinician = $this->rhuClinician();
        $this->finalizeManage($clinician, $patient);
        $this->finalizeManage($clinician, $patient);
        $this->assertSame(1, MonitoringHandoffRequest::count());
        $this->assertNull($patient->fresh()->barangay_health_center_id);
    }

    public function test_verified_cross_record_link_keeps_both_patient_ids_and_starts_monitoring(): void
    {
        $source = $this->rhuPatient([
            'barangay_health_center_id' => null,
            'first_name' => 'Testing',
            'middle_name' => 'T',
            'last_name' => 'Bee',
            'sex' => 'Male',
            'birthdate' => '2000-08-24',
            'contact_number' => '09171234567',
        ]);
        $destination = $this->bhcPatient($this->bhc, [
            'first_name' => 'Testing',
            'middle_name' => 'T',
            'last_name' => 'Bee',
            'sex' => 'Male',
            'birthdate' => '2000-08-24',
            'contact_number' => '09171234567',
        ]);
        $this->finalizeManage($this->rhuClinician(), $source);
        $handoff = MonitoringHandoffRequest::query()->sole();
        $bhcStaff = $this->bhcUser($this->bhc);

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/link", [
            'linked_patient_id' => $destination->id,
        ])->assertUnprocessable();

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/link", [
            'linked_patient_id' => $destination->id,
            'identity_confirmed' => true,
            'verification_evidence' => 'Matched name, birthdate, sex, and contact with BHC registration card.',
        ])->assertOk()
            ->assertJsonPath('data.status', MonitoringHandoffRequest::STATUS_PENDING_REVIEW)
            ->assertJsonPath('data.source_patient.id', $source->id)
            ->assertJsonPath('data.linked_patient.id', $destination->id)
            ->assertJsonPath('data.identity_resolution', MonitoringHandoffRequest::IDENTITY_RESOLUTION_VERIFIED_CROSS_RECORD);

        $this->assertSame($source->id, $handoff->fresh()->patient_id);
        $this->assertSame($destination->id, $handoff->fresh()->linked_patient_id);
        $this->assertNull($source->fresh()->barangay_health_center_id);
        $this->assertSame($this->bhc->id, $destination->fresh()->barangay_health_center_id);
        $this->assertSame(1, Patient::whereKey($source->id)->count());
        $this->assertSame(1, Patient::whereKey($destination->id)->count());

        // Idempotent retry.
        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/link", [
            'linked_patient_id' => $destination->id,
            'identity_confirmed' => true,
            'verification_evidence' => 'Matched name, birthdate, sex, and contact with BHC registration card.',
        ])->assertOk()
            ->assertJsonPath('data.linked_patient.id', $destination->id);

        $this->as($bhcStaff)->getJson("/api/patients/{$destination->id}/rhu-shared-clinical")
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/accept")->assertOk();

        $shared = $this->as($bhcStaff)->getJson("/api/patients/{$destination->id}/rhu-shared-clinical")
            ->assertOk()
            ->assertJsonPath('data.0.handoff_id', $handoff->id)
            ->assertJsonPath('data.0.source_patient_id', $source->id)
            ->assertJsonPath('data.0.condition.name', 'Hypertension')
            ->json('data');
        $this->assertNotEmpty($shared[0]['recommendation'] ?? null);
        $this->assertSame('Weekly BP.', $shared[0]['recommendation']);

        $outsider = $this->bhcUser($this->otherBhc);
        $this->as($outsider)->getJson("/api/patients/{$destination->id}/rhu-shared-clinical")->assertForbidden();

        $condition = PatientCondition::query()->where('patient_id', $source->id)->sole();
        $this->as($bhcStaff)->getJson("/api/patients/{$destination->id}/conditions")
            ->assertOk()
            ->assertJsonPath('data.conditions.0.id', $condition->id)
            ->assertJsonPath('data.conditions.0.shared_via_handoff', true)
            ->assertJsonPath('data.conditions.0.source_patient_id', $source->id);

        $this->as($bhcStaff)
            ->withHeaders(['Idempotency-Key' => (string) Str::uuid()])
            ->postJson('/api/health-records', [
                'patient_id' => $destination->id,
                'category' => 'General Consultation',
                'chief_complaint' => 'Cross-record monitoring start',
                'care_plan' => ['start_monitoring_condition_ids' => [$condition->id]],
            ])
            ->assertCreated();

        $this->assertSame($destination->id, ConditionMonitoring::sole()->patient_id);
        $this->assertSame($condition->id, ConditionMonitoring::sole()->patient_condition_id);
        $this->assertSame(MonitoringHandoffRequest::STATUS_MONITORING_ACTIVE, $handoff->fresh()->status);
        $this->assertSame($source->id, HealthRecord::query()->where('chief_complaint', 'Hypertension follow-up')->value('patient_id'));
        $this->assertSame($destination->id, HealthRecord::query()->where('chief_complaint', 'Cross-record monitoring start')->value('patient_id'));
    }

    public function test_cross_record_link_rejects_demographic_conflict_and_inactive_destination(): void
    {
        $source = $this->rhuPatient([
            'barangay_health_center_id' => null,
            'first_name' => 'Same',
            'last_name' => 'Person',
            'sex' => 'Female',
            'birthdate' => '1995-01-15',
        ]);
        $conflict = $this->bhcPatient($this->bhc, [
            'first_name' => 'Different',
            'last_name' => 'Person',
            'sex' => 'Female',
            'birthdate' => '1995-01-15',
        ]);
        $inactive = $this->bhcPatient($this->bhc, [
            'first_name' => 'Same',
            'last_name' => 'Person',
            'sex' => 'Female',
            'birthdate' => '1995-01-15',
            'status' => 'inactive',
        ]);
        $this->finalizeManage($this->rhuClinician(), $source);
        $handoff = MonitoringHandoffRequest::query()->sole();
        $bhcStaff = $this->bhcUser($this->bhc);

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/link", [
            'linked_patient_id' => $conflict->id,
            'identity_confirmed' => true,
            'verification_evidence' => 'Attempted link despite name mismatch.',
        ])->assertUnprocessable();
        $this->assertNull($handoff->fresh()->linked_patient_id);

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/link", [
            'linked_patient_id' => $inactive->id,
            'identity_confirmed' => true,
            'verification_evidence' => 'Inactive destination.',
        ])->assertUnprocessable();
        $this->assertNull($handoff->fresh()->linked_patient_id);
    }

    public function test_declined_cross_record_handoff_does_not_expose_shared_clinical(): void
    {
        $source = $this->rhuPatient([
            'barangay_health_center_id' => null,
            'first_name' => 'Decline',
            'last_name' => 'Match',
            'sex' => 'Male',
            'birthdate' => '1992-04-04',
        ]);
        $destination = $this->bhcPatient($this->bhc, [
            'first_name' => 'Decline',
            'last_name' => 'Match',
            'sex' => 'Male',
            'birthdate' => '1992-04-04',
        ]);
        $this->finalizeManage($this->rhuClinician(), $source);
        $handoff = MonitoringHandoffRequest::query()->sole();
        $bhcStaff = $this->bhcUser($this->bhc);

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/link", [
            'linked_patient_id' => $destination->id,
            'identity_confirmed' => true,
            'verification_evidence' => 'Demographics verified against registration.',
        ])->assertOk();
        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/decline", [
            'reason' => 'Unable to monitor after verification.',
        ])->assertOk();

        $this->as($bhcStaff)->getJson("/api/patients/{$destination->id}/rhu-shared-clinical")
            ->assertOk()
            ->assertJsonCount(0, 'data');
        $this->as($bhcStaff)->getJson("/api/monitoring-handoff-requests/{$handoff->id}")
            ->assertOk()
            ->assertJsonPath('data.recommendation', null)
            ->assertJsonPath('data.health_record_id', null);
    }

    public function test_resolve_identity_review_allows_verified_relink(): void
    {
        $source = $this->rhuPatient([
            'barangay_health_center_id' => null,
            'first_name' => 'Review',
            'last_name' => 'Case',
            'sex' => 'Female',
            'birthdate' => '1987-07-07',
        ]);
        $destination = $this->bhcPatient($this->bhc, [
            'first_name' => 'Review',
            'last_name' => 'Case',
            'sex' => 'Female',
            'birthdate' => '1987-07-07',
        ]);
        $this->finalizeManage($this->rhuClinician(), $source);
        $handoff = MonitoringHandoffRequest::query()->sole();
        $bhcStaff = $this->bhcUser($this->bhc);

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/flag-identity-review", [
            'note' => 'Ambiguous match list; hold for review.',
        ])->assertOk()
            ->assertJsonPath('data.identity_resolution', MonitoringHandoffRequest::IDENTITY_RESOLUTION_NEEDS_REVIEW);

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/link", [
            'linked_patient_id' => $destination->id,
            'identity_confirmed' => true,
            'verification_evidence' => 'Should stay blocked.',
        ])->assertUnprocessable();

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/resolve-identity-review", [
            'note' => 'Reviewed registration card; safe to verify linkage.',
        ])->assertOk()
            ->assertJsonPath('data.verification_status', 'awaiting_verification')
            ->assertJsonPath('data.status', MonitoringHandoffRequest::STATUS_LINKAGE_NEEDED);

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/link", [
            'linked_patient_id' => $destination->id,
            'identity_confirmed' => true,
            'verification_evidence' => 'Card and demographics confirmed after review.',
        ])->assertOk()
            ->assertJsonPath('data.linked_patient.id', $destination->id);
    }

    public function test_cross_record_link_rejects_conflicting_destination_association(): void
    {
        $sourceA = $this->rhuPatient([
            'barangay_health_center_id' => null,
            'first_name' => 'Alpha',
            'last_name' => 'Conflict',
            'sex' => 'Male',
            'birthdate' => '1990-01-01',
        ]);
        $sourceB = $this->rhuPatient([
            'barangay_health_center_id' => null,
            'first_name' => 'Beta',
            'last_name' => 'Conflict',
            'sex' => 'Male',
            'birthdate' => '1991-02-02',
        ]);
        $destination = $this->bhcPatient($this->bhc, [
            'first_name' => 'Alpha',
            'last_name' => 'Conflict',
            'sex' => 'Male',
            'birthdate' => '1990-01-01',
        ]);
        $this->finalizeManage($this->rhuClinician(), $sourceA);
        $handoffA = MonitoringHandoffRequest::query()->where('patient_id', $sourceA->id)->sole();
        $bhcStaff = $this->bhcUser($this->bhc);
        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoffA->id}/link", [
            'linked_patient_id' => $destination->id,
            'identity_confirmed' => true,
            'verification_evidence' => 'First verified link.',
        ])->assertOk();

        $this->finalizeManage($this->rhuClinician(), $sourceB, ['name' => 'Diabetes', 'monitoringRecommendation' => 'Monitor glucose.']);
        $handoffB = MonitoringHandoffRequest::query()->where('patient_id', $sourceB->id)->sole();
        $destination->update([
            'first_name' => 'Beta',
            'last_name' => 'Conflict',
            'birthdate' => '1991-02-02',
        ]);

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoffB->id}/link", [
            'linked_patient_id' => $destination->id,
            'identity_confirmed' => true,
            'verification_evidence' => 'Should conflict with existing association.',
        ])->assertUnprocessable();
        $this->assertNull($handoffB->fresh()->linked_patient_id);
    }

    public function test_correct_pending_cross_record_link_preserves_audit_and_blocks_clinical(): void
    {
        $source = $this->rhuPatient([
            'barangay_health_center_id' => null,
            'first_name' => 'Correct',
            'last_name' => 'Link',
            'sex' => 'Female',
            'birthdate' => '1985-05-05',
        ]);
        $destination = $this->bhcPatient($this->bhc, [
            'first_name' => 'Correct',
            'last_name' => 'Link',
            'sex' => 'Female',
            'birthdate' => '1985-05-05',
        ]);
        $this->finalizeManage($this->rhuClinician(), $source);
        $handoff = MonitoringHandoffRequest::query()->sole();
        $bhcStaff = $this->bhcUser($this->bhc);

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/link", [
            'linked_patient_id' => $destination->id,
            'identity_confirmed' => true,
            'verification_evidence' => 'Initial verification.',
        ])->assertOk();

        $this->as($bhcStaff)->postJson("/api/monitoring-handoff-requests/{$handoff->id}/correct-identity-link", [
            'note' => 'Wrong BHC registration selected; unlink for correction.',
        ])->assertOk()
            ->assertJsonPath('data.status', MonitoringHandoffRequest::STATUS_LINKAGE_NEEDED)
            ->assertJsonPath('data.linked_patient', null)
            ->assertJsonPath('data.identity_resolution', MonitoringHandoffRequest::IDENTITY_RESOLUTION_NEEDS_REVIEW);

        $this->as($bhcStaff)->getJson("/api/patients/{$destination->id}/rhu-shared-clinical")
            ->assertOk()
            ->assertJsonCount(0, 'data');
        $this->assertSame($source->id, $handoff->fresh()->patient_id);
    }
}
