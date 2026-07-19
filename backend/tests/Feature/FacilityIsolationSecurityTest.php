<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Medicine;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class FacilityIsolationSecurityTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhcA;
    private BarangayHealthCenter $bhcB;
    private RuralHealthUnit $rhuA;
    private RuralHealthUnit $rhuB;
    private User $admin;
    private User $bhwA;
    private User $bhwB;
    private User $rhuStaffA;
    private User $rhuStaffB;
    private Patient $patientA;
    private Patient $patientB;
    private Patient $rhuPatientA;
    private Patient $rhuPatientB;
    private HealthRecord $recordA;
    private HealthRecord $recordB;
    private Referral $referralA;
    private Referral $referralB;
    private FollowUpTask $taskA;
    private FollowUpTask $taskB;
    private Medicine $medicineA;
    private Medicine $medicineB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->bhcA = BarangayHealthCenter::create(['name' => 'Security BHC A']);
        $this->bhcB = BarangayHealthCenter::create(['name' => 'Security BHC B']);
        $this->rhuA = RuralHealthUnit::create(['name' => 'Security RHU A']);
        $this->rhuB = RuralHealthUnit::create(['name' => 'Security RHU B']);
        $this->bhcA->update(['rural_health_unit_id' => $this->rhuA->id]);
        $this->bhcB->update(['rural_health_unit_id' => $this->rhuB->id]);

        $this->admin = $this->createUser('Security Admin', 'security-admin@example.test', User::ROLE_ADMIN);
        $this->bhwA = $this->createUser(
            'BHW A',
            'security-bhw-a@example.test',
            User::ROLE_BHW,
            $this->bhcA->id
        );
        $this->bhwB = $this->createUser(
            'BHW B',
            'security-bhw-b@example.test',
            User::ROLE_BHW,
            $this->bhcB->id
        );
        $this->rhuStaffA = $this->createUser(
            'RHU Staff A',
            'security-rhu-a@example.test',
            User::ROLE_RHU_STAFF,
            null,
            $this->rhuA->id
        );
        $this->rhuStaffB = $this->createUser(
            'RHU Staff B',
            'security-rhu-b@example.test',
            User::ROLE_RHU_STAFF,
            null,
            $this->rhuB->id
        );

        $this->patientA = $this->createPatient('Patient', 'A', $this->bhcA->id);
        $this->patientB = $this->createPatient('Patient', 'B', $this->bhcB->id);
        $this->rhuPatientA = $this->createPatient('RHU Patient', 'A', null, $this->rhuA->id);
        $this->rhuPatientB = $this->createPatient('RHU Patient', 'B', null, $this->rhuB->id);

        $this->recordA = $this->createScheduledRecord($this->patientA, $this->bhwA, $this->bhcA);
        $this->recordB = $this->createScheduledRecord($this->patientB, $this->bhwB, $this->bhcB);
        $this->taskA = $this->createFollowUpTask($this->recordA, $this->bhwA, $this->bhcA);
        $this->taskB = $this->createFollowUpTask($this->recordB, $this->bhwB, $this->bhcB);

        $this->referralA = $this->createReferral(
            'AKAY-SECURITY-A',
            $this->patientA,
            $this->recordA,
            $this->bhcA,
            $this->rhuA,
            $this->bhwA
        );
        $this->referralB = $this->createReferral(
            'AKAY-SECURITY-B',
            $this->patientB,
            $this->recordB,
            $this->bhcB,
            $this->rhuB,
            $this->bhwB
        );

        $this->medicineA = $this->createMedicine('Security Medicine A', $this->bhcA, $this->bhwA);
        $this->medicineB = $this->createMedicine('Security Medicine B', $this->bhcB, $this->bhwB);
    }

    public function test_rejects_bhw_without_bhc_assignment(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/users', $this->userPayload('bhw-no-bhc@example.test', User::ROLE_BHW))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('barangay_health_center_id');
    }

    public function test_rejects_bhw_with_both_facility_assignments(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/users', [
                ...$this->userPayload('bhw-both@example.test', User::ROLE_BHW),
                'barangay_health_center_id' => $this->bhcA->id,
                'rural_health_unit_id' => $this->rhuA->id,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('rural_health_unit_id');
    }

    public function test_rejects_rhu_staff_without_rhu_assignment(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/users', $this->userPayload('rhu-no-rhu@example.test', User::ROLE_RHU_STAFF))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('rural_health_unit_id');
    }

    public function test_rejects_rhu_staff_with_both_facility_assignments(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/users', [
                ...$this->userPayload('rhu-both@example.test', User::ROLE_RHU_STAFF),
                'barangay_health_center_id' => $this->bhcA->id,
                'rural_health_unit_id' => $this->rhuA->id,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('barangay_health_center_id');
    }

    public function test_rejects_bhw_with_nonexistent_bhc(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/users', [
                ...$this->userPayload('bhw-missing-bhc@example.test', User::ROLE_BHW),
                'barangay_health_center_id' => 999999,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('barangay_health_center_id');
    }

    public function test_rejects_rhu_staff_with_nonexistent_rhu(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/users', [
                ...$this->userPayload('rhu-missing@example.test', User::ROLE_RHU_STAFF),
                'rural_health_unit_id' => 999999,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('rural_health_unit_id');
    }

    public function test_rejects_clinical_account_assignment_to_inactive_facility(): void
    {
        $this->bhcA->update(['status' => 'inactive']);

        $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/users', [
                ...$this->userPayload('bhw-inactive-bhc@example.test', User::ROLE_BHW),
                'barangay_health_center_id' => $this->bhcA->id,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('barangay_health_center_id');
    }

    public function test_rejects_update_that_removes_bhw_bhc_assignment(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->patchJson("/api/users/{$this->bhwA->id}", [
                'barangay_health_center_id' => null,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('barangay_health_center_id');

        $this->assertSame($this->bhcA->id, $this->bhwA->fresh()->barangay_health_center_id);
    }

    public function test_rejects_update_that_adds_bhc_to_rhu_staff(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->patchJson("/api/users/{$this->rhuStaffA->id}", [
                'barangay_health_center_id' => $this->bhcA->id,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('barangay_health_center_id');

        $this->assertNull($this->rhuStaffA->fresh()->barangay_health_center_id);
    }

    public function test_unassigned_clinical_account_cannot_access_null_facility_patient(): void
    {
        $unassigned = $this->createUser('Unassigned BHW', 'unassigned@example.test', User::ROLE_BHW);
        $patient = $this->createPatient('Null', 'Facility');

        $this->actingAs($unassigned, 'sanctum')
            ->getJson("/api/patients/{$patient->id}")
            ->assertForbidden();
    }

    public function test_mixed_assignment_clinical_account_is_denied_clinical_access(): void
    {
        $mixed = $this->createUser(
            'Mixed BHW',
            'mixed@example.test',
            User::ROLE_BHW,
            $this->bhcA->id,
            $this->rhuA->id
        );

        $this->actingAs($mixed, 'sanctum')
            ->getJson('/api/patients')
            ->assertForbidden();
    }

    public function test_bhw_patient_list_excludes_other_bhc(): void
    {
        $response = $this->actingAs($this->bhwA, 'sanctum')
            ->getJson('/api/patients')
            ->assertOk();

        $ids = collect($response->json('data.data'))->pluck('id');
        $this->assertTrue($ids->contains($this->patientA->id));
        $this->assertFalse($ids->contains($this->patientB->id));
    }

    public function test_bhw_cannot_view_other_bhc_patient(): void
    {
        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson("/api/patients/{$this->patientB->id}")
            ->assertForbidden();
    }

    public function test_bhw_cannot_update_other_bhc_patient(): void
    {
        $this->actingAs($this->bhwA, 'sanctum')
            ->patchJson("/api/patients/{$this->patientB->id}", ['first_name' => 'Changed'])
            ->assertForbidden();

        $this->assertSame('Patient', $this->patientB->fresh()->first_name);
    }

    public function test_bhw_cannot_change_patient_facilities_in_update_payload(): void
    {
        $this->actingAs($this->bhwA, 'sanctum')
            ->patchJson("/api/patients/{$this->patientA->id}", [
                'barangay_health_center_id' => $this->bhcB->id,
                'rural_health_unit_id' => $this->rhuB->id,
            ])
            ->assertOk();

        $patient = $this->patientA->fresh();
        $this->assertSame($this->bhcA->id, $patient->barangay_health_center_id);
        $this->assertNull($patient->rural_health_unit_id);
    }

    public function test_rhu_staff_cannot_arbitrarily_access_other_rhu_patient(): void
    {
        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->getJson("/api/patients/{$this->rhuPatientB->id}")
            ->assertForbidden();
    }

    public function test_rhu_staff_can_view_patient_through_addressed_referral(): void
    {
        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->getJson("/api/patients/{$this->patientA->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $this->patientA->id)
            ->assertJsonPath('data.referrals.0.id', $this->referralA->id);
    }

    public function test_rhu_patient_list_includes_patient_from_addressed_referral(): void
    {
        $response = $this->actingAs($this->rhuStaffA, 'sanctum')
            ->getJson('/api/patients')
            ->assertOk();

        $ids = collect($response->json('data.data'))->pluck('id');
        $this->assertTrue($ids->contains($this->patientA->id));
        $this->assertFalse($ids->contains($this->patientB->id));
    }

    public function test_bhw_cannot_create_health_record_for_other_bhc_patient(): void
    {
        $this->postHealthRecord($this->bhwA, $this->healthRecordPayload($this->patientB))
            ->assertForbidden();
    }

    public function test_bhw_cannot_view_other_bhc_health_record(): void
    {
        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson("/api/health-records/{$this->recordB->id}")
            ->assertForbidden();
    }

    public function test_bhw_cannot_update_other_bhc_health_record(): void
    {
        $this->actingAs($this->bhwA, 'sanctum')
            ->patchJson("/api/health-records/{$this->recordB->id}", ['notes' => 'Changed'])
            ->assertForbidden();
    }

    public function test_health_record_update_cannot_reassign_patient(): void
    {
        $this->actingAs($this->bhwA, 'sanctum')
            ->patchJson("/api/health-records/{$this->recordA->id}", [
                'patient_id' => $this->patientB->id,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('patient_id');

        $this->assertSame($this->patientA->id, $this->recordA->fresh()->patient_id);
    }

    public function test_same_facility_health_record_creation_succeeds(): void
    {
        $this->postHealthRecord($this->bhwA, $this->healthRecordPayload($this->patientA))
            ->assertCreated()
            ->assertJsonPath('data.barangay_health_center_id', $this->bhcA->id)
            ->assertJsonPath('data.rural_health_unit_id', null);
    }

    public function test_bhw_cannot_create_referral_with_other_bhc_patient(): void
    {
        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/referrals', $this->referralPayload($this->patientB))
            ->assertForbidden();
    }

    public function test_bhw_cannot_create_referral_with_other_bhc_health_record(): void
    {
        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/referrals', $this->referralPayload($this->patientA, $this->recordB))
            ->assertForbidden();
    }

    public function test_referral_health_record_must_match_submitted_patient(): void
    {
        $otherPatient = $this->createPatient('Other', 'A', $this->bhcA->id);
        $otherRecord = HealthRecord::create([
            'patient_id' => $otherPatient->id,
            'created_by' => $this->bhwA->id,
            'barangay_health_center_id' => $this->bhcA->id,
            'category' => 'Maternal Care',
        ]);

        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/referrals', $this->referralPayload($this->patientA, $otherRecord))
            ->assertUnprocessable();
    }

    public function test_referral_ignores_client_supplied_referring_bhc(): void
    {
        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/referrals', [
                ...$this->referralPayload($this->patientA, $this->recordA),
                'barangay_health_center_id' => $this->bhcB->id,
            ])
            ->assertCreated()
            ->assertJsonPath('data.barangay_health_center_id', $this->bhcA->id);
    }

    public function test_valid_same_facility_referral_creation_succeeds(): void
    {
        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/referrals', $this->referralPayload($this->patientA, $this->recordA))
            ->assertCreated()
            ->assertJsonPath('data.patient_id', $this->patientA->id)
            ->assertJsonPath('data.health_record_id', $this->recordA->id)
            ->assertJsonPath('data.barangay_health_center_id', $this->bhcA->id);
    }

    public function test_bhw_cannot_fulfill_other_bhc_follow_up_task(): void
    {
        $this->postHealthRecord($this->bhwA, $this->followUpPayload(
                $this->patientA,
                $this->recordA,
                $this->taskB
            ))
            ->assertForbidden();

        $this->assertNull($this->taskB->fresh()->fulfilled_at);
    }

    public function test_follow_up_task_must_match_patient(): void
    {
        $otherPatient = $this->createPatient('Follow Up', 'Other', $this->bhcA->id);
        $otherRecord = $this->createScheduledRecord($otherPatient, $this->bhwA, $this->bhcA);

        $this->postHealthRecord($this->bhwA, $this->followUpPayload(
                $otherPatient,
                $otherRecord,
                $this->taskA
            ))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('monitoring_data.followUpTaskId');
    }

    public function test_follow_up_task_must_match_service_type(): void
    {
        $payload = $this->followUpPayload($this->patientA, $this->recordA, $this->taskA);
        $payload['category'] = 'Maternal Care';

        $this->postHealthRecord($this->bhwA, $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('monitoring_data.followUpTaskId');
    }

    public function test_follow_up_task_cannot_link_to_unrelated_parent_record(): void
    {
        $otherParent = $this->createScheduledRecord($this->patientA, $this->bhwA, $this->bhcA);

        $this->postHealthRecord($this->bhwA, $this->followUpPayload(
                $this->patientA,
                $otherParent,
                $this->taskA
            ))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('monitoring_data.followUpTaskId');
    }

    public function test_completed_follow_up_task_cannot_be_reused(): void
    {
        $this->taskA->update([
            'state' => FollowUpTask::STATE_FULFILLED,
            'fulfilled_at' => now(),
        ]);

        $this->postHealthRecord($this->bhwA, $this->followUpPayload(
                $this->patientA,
                $this->recordA,
                $this->taskA
            ))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('monitoring_data.followUpTaskId');
    }

    public function test_valid_same_facility_follow_up_linking_succeeds(): void
    {
        $response = $this->postHealthRecord($this->bhwA, $this->followUpPayload(
                $this->patientA,
                $this->recordA,
                $this->taskA
            ))
            ->assertCreated();

        $task = $this->taskA->fresh();
        $this->assertSame(FollowUpTask::STATE_FULFILLED, $task->state);
        $this->assertSame($response->json('data.id'), $task->fulfilled_by_health_record_id);
    }

    public function test_existing_follow_up_record_can_be_edited_without_reusing_task(): void
    {
        $response = $this->postHealthRecord($this->bhwA, $this->followUpPayload(
                $this->patientA,
                $this->recordA,
                $this->taskA
            ))
            ->assertCreated();

        $recordId = $response->json('data.id');
        $this->actingAs($this->bhwA, 'sanctum')
            ->patchJson("/api/health-records/{$recordId}", ['notes' => 'Updated follow-up notes.'])
            ->assertOk()
            ->assertJsonPath('data.notes', 'Updated follow-up notes.');

        $this->assertSame($recordId, $this->taskA->fresh()->fulfilled_by_health_record_id);
    }

    public function test_bhw_cannot_dispense_other_bhc_medicine_during_record_creation(): void
    {
        $payload = $this->healthRecordPayload($this->patientA);
        $payload['dispensed_medicines'] = [[
            'medicine_id' => $this->medicineB->id,
            'quantity' => 2,
        ]];

        $this->postHealthRecord($this->bhwA, $payload)
            ->assertUnprocessable();

        $this->assertSame(20, $this->medicineB->fresh()->quantity);
    }

    public function test_valid_same_bhc_medicine_selection_succeeds(): void
    {
        $payload = $this->healthRecordPayload($this->patientA);
        $payload['dispensed_medicines'] = [[
            'medicine_id' => $this->medicineA->id,
            'quantity' => 2,
        ]];

        $this->postHealthRecord($this->bhwA, $payload)
            ->assertCreated()
            ->assertJsonPath('data.dispensed_medicines.0.medicine_id', $this->medicineA->id);

        $this->assertSame(18, $this->medicineA->fresh()->quantity);
    }

    public function test_direct_dispense_endpoint_rejects_other_bhc_medicine(): void
    {
        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson("/api/health-records/{$this->recordA->id}/dispensed-medicines", [
                'dispensed_medicines' => [[
                    'medicine_id' => $this->medicineB->id,
                    'quantity' => 1,
                ]],
            ])
            ->assertUnprocessable();
    }

    public function test_bhw_cannot_submit_rhu_feedback(): void
    {
        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/feedback', $this->feedbackPayload($this->referralA))
            ->assertForbidden();
    }

    public function test_bhw_cannot_mark_referral_received(): void
    {
        $this->actingAs($this->bhwA, 'sanctum')
            ->patchJson("/api/referrals/{$this->referralA->id}/status", [
                'status' => Referral::STATUS_RECEIVED,
            ])
            ->assertForbidden();
    }

    public function test_bhw_cannot_mark_referral_completed(): void
    {
        $this->actingAs($this->bhwA, 'sanctum')
            ->patchJson("/api/referrals/{$this->referralA->id}/status", [
                'status' => Referral::STATUS_COMPLETED,
            ])
            ->assertForbidden();
    }

    public function test_rhu_staff_cannot_update_referral_addressed_to_other_rhu(): void
    {
        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->patchJson("/api/referrals/{$this->referralB->id}/status", [
                'status' => Referral::STATUS_RECEIVED,
            ])
            ->assertForbidden();
    }

    public function test_rhu_staff_can_update_referral_addressed_to_own_rhu(): void
    {
        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->patchJson("/api/referrals/{$this->referralA->id}/status", [
                'status' => Referral::STATUS_RECEIVED,
            ])
            ->assertOk()
            ->assertJsonPath('data.status', Referral::STATUS_RECEIVED);
    }

    public function test_rhu_staff_cannot_submit_feedback_for_other_rhu_referral(): void
    {
        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson('/api/feedback', $this->feedbackPayload($this->referralB))
            ->assertForbidden();
    }

    public function test_rhu_staff_can_submit_feedback_for_own_rhu_referral(): void
    {
        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson('/api/feedback', $this->feedbackPayload($this->referralA))
            ->assertCreated()
            ->assertJsonPath('data.referral_id', $this->referralA->id);
    }

    private function createUser(
        string $name,
        string $email,
        string $role,
        ?int $bhcId = null,
        ?int $rhuId = null
    ): User {
        return User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password123'),
            'role' => $role,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $bhcId,
            'rural_health_unit_id' => $rhuId,
        ]);
    }

    private function createPatient(
        string $firstName,
        string $lastName,
        ?int $bhcId = null,
        ?int $rhuId = null
    ): Patient {
        return Patient::create([
            'first_name' => $firstName,
            'last_name' => $lastName,
            'sex' => 'Female',
            'barangay_health_center_id' => $bhcId,
            'rural_health_unit_id' => $rhuId,
        ]);
    }

    private function createScheduledRecord(
        Patient $patient,
        User $creator,
        BarangayHealthCenter $bhc
    ): HealthRecord {
        return HealthRecord::create([
            'patient_id' => $patient->id,
            'created_by' => $creator->id,
            'barangay_health_center_id' => $bhc->id,
            'category' => 'General Consultation',
            'monitoring_data' => [
                'followUpStatus' => 'Follow Up Required',
                'followUpDate' => now()->addWeek()->toDateString(),
            ],
        ]);
    }

    private function createFollowUpTask(
        HealthRecord $record,
        User $creator,
        BarangayHealthCenter $bhc
    ): FollowUpTask {
        return FollowUpTask::create([
            'health_record_id' => $record->id,
            'patient_id' => $record->patient_id,
            'barangay_health_center_id' => $bhc->id,
            'due_date' => now()->addWeek()->toDateString(),
            'state' => FollowUpTask::STATE_PENDING,
            'created_by' => $creator->id,
        ]);
    }

    private function createReferral(
        string $trackingId,
        Patient $patient,
        HealthRecord $record,
        BarangayHealthCenter $bhc,
        RuralHealthUnit $rhu,
        User $creator
    ): Referral {
        return Referral::create([
            'tracking_id' => $trackingId,
            'qr_code_value' => "AKAY:REFERRAL:{$trackingId}",
            'patient_id' => $patient->id,
            'health_record_id' => $record->id,
            'barangay_health_center_id' => $bhc->id,
            'rural_health_unit_id' => $rhu->id,
            'created_by' => $creator->id,
            'status' => Referral::STATUS_PENDING,
            'reason_for_referral' => 'Security test referral.',
        ]);
    }

    private function createMedicine(
        string $name,
        BarangayHealthCenter $bhc,
        User $creator
    ): Medicine {
        return Medicine::create([
            'name' => $name,
            'category' => 'Basic Medicines',
            'quantity' => 20,
            'unit' => 'tablets',
            'availability_status' => 'Available',
            'barangay_health_center_id' => $bhc->id,
            'created_by' => $creator->id,
        ]);
    }

    private function userPayload(string $email, string $role): array
    {
        return [
            'name' => 'Security User',
            'email' => $email,
            'password' => 'password123',
            'role' => $role,
        ];
    }

    private function healthRecordPayload(Patient $patient): array
    {
        return [
            'patient_id' => $patient->id,
            'category' => 'Maternal Care',
            'chief_complaint' => 'Routine visit',
        ];
    }

    private function postHealthRecord(User $user, array $payload)
    {
        return $this->actingAs($user, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson('/api/health-records', $payload);
    }

    private function referralPayload(
        Patient $patient,
        ?HealthRecord $record = null
    ): array {
        return [
            'patient_id' => $patient->id,
            'health_record_id' => $record?->id,
            'rural_health_unit_id' => $this->rhuA->id,
            'reason_for_referral' => 'Further assessment is needed.',
        ];
    }

    private function followUpPayload(
        Patient $patient,
        HealthRecord $parent,
        FollowUpTask $task
    ): array {
        return [
            'patient_id' => $patient->id,
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $parent->id,
            'category' => 'General Consultation',
            'monitoring_data' => [
                'followUpTaskId' => $task->id,
                'follow_up_task_id' => $task->id,
                'followUpStatus' => 'Routine Monitoring',
            ],
        ];
    }

    private function feedbackPayload(Referral $referral): array
    {
        return [
            'referral_id' => $referral->id,
            'rhu_diagnosis' => 'Clinical assessment completed.',
            'action_taken' => 'Patient evaluated.',
        ];
    }
}
