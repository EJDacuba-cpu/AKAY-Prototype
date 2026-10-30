<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\Medicine;
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

class RhuItrConsultationTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'ITR RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'ITR BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
    }

    private function rhuUser(array $permissions, array $attributes = []): User
    {
        return User::create([
            'name' => 'ITR Staff',
            'email' => uniqid('', true).'@example.test',
            'password' => 'password123',
            'status' => 'active',
            'role' => 'rhu',
            'staff_role' => 'nurse',
            'rural_health_unit_id' => $this->rhu->id,
            'permissions' => $permissions,
            ...$attributes,
        ]);
    }

    private function encoder(): User
    {
        return $this->rhuUser([...StaffRoles::defaults('nurse'), 'consultations.encode']);
    }

    private function clinician(): User
    {
        return $this->rhuUser([
            ...StaffRoles::defaults('doctor'),
            'consultations.encode',
            'consultations.finalize',
            'followups.manage',
        ]);
    }

    private function patient(array $attributes = []): Patient
    {
        return Patient::create([
            'first_name' => 'ITR',
            'last_name' => uniqid(),
            'sex' => 'Female',
            'status' => 'active',
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            ...$attributes,
        ]);
    }

    private function visit(Patient $patient, array $attributes = []): RhuVisitQueueEntry
    {
        return RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $this->rhu->id,
            'patient_id' => $patient->id,
            'source' => RhuVisitQueueEntry::SOURCE_WALK_IN,
            'status' => RhuVisitQueueEntry::STATUS_WAITING,
            'checked_in_at' => now(),
            'check_in_key' => uniqid('itr-', true),
            ...$attributes,
        ]);
    }

    private function as(User $user): static
    {
        Sanctum::actingAs($user, ['akay:access']);

        return $this;
    }

    private function startVisit(User $user, RhuVisitQueueEntry $visit): string
    {
        $uuid = $this->as($user)->postJson("/api/rhu-visits/{$visit->id}/start")
            ->assertOk()
            ->json('data.consultation_uuid');
        $this->assertNotEmpty($uuid);

        return $uuid;
    }

    private function postRecord(User $user, Patient $patient, RhuVisitQueueEntry $visit, string $uuid, array $overrides = [])
    {
        return $this->as($user)
            ->withHeaders(['Idempotency-Key' => (string) Str::uuid()])
            ->postJson('/api/health-records', [
                'consultation_workflow' => HealthRecord::WORKFLOW_RHU_ITR_V1,
                'consultation_uuid' => $uuid,
                'rhu_visit_id' => $visit->id,
                'patient_id' => $patient->id,
                'category' => 'General Consultation',
                'chief_complaint' => 'Cough and fever',
                ...$overrides,
            ]);
    }

    public function test_rhu_itr_stores_additional_concern_without_changing_the_referral_snapshot(): void
    {
        $patient = $this->patient();
        $clinician = $this->clinician();
        $referral = Referral::create([
            'tracking_id' => 'REF-ADDITIONAL',
            'qr_code_value' => app(ReferralService::class)->makeLegacyQrPlaceholder(),
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'chief_complaint' => 'Original BHC complaint',
            'reason_for_referral' => 'Assessment',
            'status' => Referral::STATUS_RECEIVED,
        ]);
        $visit = $this->visit($patient, ['referral_id' => $referral->id]);
        $uuid = $this->startVisit($clinician, $visit);
        $concern = ['chiefComplaint' => 'Second concern', 'historyOfPresentIllness' => 'Since dawn'];

        $this->postRecord($clinician, $patient, $visit, $uuid, [
            'chief_complaint' => 'Today RHU complaint',
            'monitoring_data' => ['additionalConcern' => $concern],
        ])->assertCreated();

        $record = HealthRecord::where('consultation_uuid', $uuid)->firstOrFail();
        $this->assertSame('Today RHU complaint', $record->chief_complaint);
        $this->assertSame($concern, $record->monitoring_data['additionalConcern']);
        $this->assertSame('Original BHC complaint', $referral->fresh()->chief_complaint);
        $this->assertSame(Referral::STATUS_RECEIVED, $referral->fresh()->status);
    }

    public function test_rhu_itr_rejects_invalid_additional_concern_fields(): void
    {
        $patient = $this->patient();
        $clinician = $this->clinician();
        $visit = $this->visit($patient);
        $uuid = $this->startVisit($clinician, $visit);

        foreach ([
            ['chiefComplaint' => ['invalid']],
            ['chiefComplaint' => str_repeat('a', 2001)],
            ['historyOfPresentIllness' => str_repeat('a', 5001)],
            ['unexpected' => 'not a clinical field'],
        ] as $concern) {
            $this->postRecord($clinician, $patient, $visit, $uuid, [
                'monitoring_data' => ['additionalConcern' => $concern],
            ])->assertUnprocessable();
        }
        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_additional_concern_does_not_replace_required_today_chief_complaint(): void
    {
        $patient = $this->patient();
        $clinician = $this->clinician();
        $visit = $this->visit($patient);
        $uuid = $this->startVisit($clinician, $visit);

        $this->postRecord($clinician, $patient, $visit, $uuid, [
            'chief_complaint' => '',
            'monitoring_data' => ['additionalConcern' => ['chiefComplaint' => 'Second concern']],
        ])->assertUnprocessable()->assertJsonValidationErrors('chief_complaint');
        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_rhu_itr_confirmed_dispensing_deducts_only_rhu_stock(): void
    {
        $patient = $this->patient();
        $visit = $this->visit($patient);
        $clinician = $this->clinician();
        $clinician->update(['permissions' => [...$clinician->permissions, 'items.dispense']]);
        $uuid = $this->startVisit($clinician, $visit);
        $medicine = Medicine::create(['name' => 'RHU stock', 'quantity' => 8, 'unit' => 'tablets',
            'availability_status' => 'Available', 'rural_health_unit_id' => $this->rhu->id,
            'created_by' => $clinician->id]);
        $medicine->expiryGroups()->create(['expiration_date' => now()->addYear()->toDateString(),
            'available_quantity' => 8, 'quarantined_quantity' => 0]);

        $this->postRecord($clinician, $patient, $visit, $uuid, [
            'dispensed_medicines' => [['medicine_id' => $medicine->id, 'quantity' => 2,
                'confirmed_given' => true]],
        ])->assertUnprocessable()->assertJsonValidationErrors('dispensed_medicines');

        $this->assertSame(8, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('health_record_medicines', 0);
        $this->assertDatabaseCount('medicine_inventory_transactions', 0);
    }

    public function test_rhu_itr_cannot_dispense_another_facility_medicine(): void
    {
        $patient = $this->patient();
        $visit = $this->visit($patient);
        $clinician = $this->clinician();
        $clinician->update(['permissions' => [...$clinician->permissions, 'items.dispense']]);
        $uuid = $this->startVisit($clinician, $visit);
        $otherRhu = RuralHealthUnit::create(['name' => 'Other RHU', 'status' => 'active']);
        $medicine = Medicine::create(['name' => 'Other RHU stock', 'quantity' => 8,
            'availability_status' => 'Available', 'rural_health_unit_id' => $otherRhu->id,
            'created_by' => $clinician->id]);
        $medicine->expiryGroups()->create(['expiration_date' => now()->addYear()->toDateString(),
            'available_quantity' => 8, 'quarantined_quantity' => 0]);

        $this->postRecord($clinician, $patient, $visit, $uuid, [
            'dispensed_medicines' => [['medicine_id' => $medicine->id, 'quantity' => 2,
                'confirmed_given' => true]],
        ])->assertUnprocessable();
        $this->assertSame(8, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('health_records', 0);
        $this->assertDatabaseCount('health_record_medicines', 0);
        $this->assertDatabaseCount('medicine_inventory_transactions', 0);
    }

    public function test_rhu_itr_dispensing_requires_mho_permission(): void
    {
        $patient = $this->patient();
        $visit = $this->visit($patient);
        $clinician = $this->clinician();
        $clinician->update(['permissions' => array_values(array_diff($clinician->permissions, ['items.dispense']))]);
        $uuid = $this->startVisit($clinician, $visit);
        $medicine = Medicine::create(['name' => 'Permission gated stock', 'quantity' => 8,
            'availability_status' => 'Available', 'rural_health_unit_id' => $this->rhu->id,
            'created_by' => $clinician->id]);
        $medicine->expiryGroups()->create(['expiration_date' => now()->addYear()->toDateString(),
            'available_quantity' => 8, 'quarantined_quantity' => 0]);

        $this->postRecord($clinician, $patient, $visit, $uuid, [
            'dispensed_medicines' => [['medicine_id' => $medicine->id, 'quantity' => 2,
                'confirmed_given' => true]],
        ])->assertUnprocessable()->assertJsonValidationErrors('dispensed_medicines');
        $this->assertSame(8, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('health_record_medicines', 0);
    }

    public function test_encoder_can_save_a_draft_but_cannot_finalize(): void
    {
        $patient = $this->patient();
        $visit = $this->visit($patient);
        $encoder = $this->encoder();
        $uuid = $this->startVisit($encoder, $visit);

        $this->as($encoder)->postJson('/api/health-record-drafts', [
            'patient_id' => $patient->id,
            'classification' => 'General Consultation',
            'consultation_uuid' => $uuid,
            'rhu_visit_id' => $visit->id,
            'payload' => [
                'consultationWorkflow' => HealthRecord::WORKFLOW_RHU_ITR_V1,
                'chiefComplaint' => 'Cough',
            ],
        ])->assertCreated();

        $this->postRecord($encoder, $patient, $visit, $uuid)->assertForbidden();
        $this->assertSame(RhuVisitQueueEntry::STATUS_IN_CONSULTATION, $visit->fresh()->status);
        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_referred_bhc_findings_and_rhu_reassessments_remain_accessible_without_patient_rhu_assignment(): void
    {
        $patient = $this->patient(['rural_health_unit_id' => null]);
        $clinician = $this->clinician();
        $source = HealthRecord::create([
            'patient_id' => $patient->id, 'created_by' => $clinician->id,
            'barangay_health_center_id' => $this->bhc->id, 'category' => 'General Consultation',
            'body_findings' => [['region' => 'chest', 'finding' => 'Tenderness']],
        ]);
        $hidden = $source->replicate();
        $hidden->save();
        $referral = Referral::create([
            'tracking_id' => 'AKY-BODY-'.Str::upper(Str::random(6)),
            'qr_code_value' => app(ReferralService::class)->makeLegacyQrPlaceholder(),
            'patient_id' => $patient->id, 'health_record_id' => $source->id,
            'barangay_health_center_id' => $this->bhc->id, 'rural_health_unit_id' => $this->rhu->id,
            'reason_for_referral' => 'Assessment', 'status' => Referral::STATUS_RECEIVED,
        ]);
        $visit = $this->visit($patient, ['source' => RhuVisitQueueEntry::SOURCE_REFERRAL, 'referral_id' => $referral->id]);
        $uuid = $this->startVisit($clinician, $visit);
        $ids = $this->getJson('/api/health-records?patient_id='.$patient->id)->assertOk()->json('data.data');
        $this->assertSame([$source->id], array_column($ids, 'id'));
        $this->postRecord($clinician, $patient, $visit, $uuid, ['monitoring_data' => ['bodyFindingReassessments' => [[
            'sourceRecordId' => $hidden->id, 'sourceFindingIndex' => 0, 'expectedRevision' => 0, 'status' => 'still_present',
        ]]]])->assertUnprocessable();
        $id = $this->postRecord($clinician, $patient, $visit, $uuid, [
            'body_findings' => [['region' => 'chest', 'finding' => 'New RHU finding']],
            'monitoring_data' => ['bodyFindingReassessments' => [[
                'sourceRecordId' => $source->id, 'sourceFindingIndex' => 0, 'expectedRevision' => 0, 'status' => 'no_longer_present',
            ]]],
        ])->assertCreated()->json('data.id');
        $this->getJson('/api/health-records/'.$id)->assertOk()->assertJsonPath('data.monitoring_data.bodyFindingReassessments.0.status', 'no_longer_present');
        $ids = $this->getJson('/api/health-records?patient_id='.$patient->id)->assertOk()->json('data.data');
        $this->assertEqualsCanonicalizing([$source->id, $id], array_column($ids, 'id'));
        $this->getJson('/api/health-records/'.$hidden->id)->assertForbidden();
    }

    public function test_walk_in_finalize_activates_condition_prescribes_without_stock_change_and_schedules_rhu_follow_up(): void
    {
        $patient = $this->patient();
        $visit = $this->visit($patient);
        $clinician = $this->clinician();
        $uuid = $this->startVisit($clinician, $visit);
        $medicine = Medicine::create([
            'name' => 'Losartan 50mg',
            'category' => 'Cardiovascular',
            'quantity' => 40,
            'unit' => 'tablets',
            'availability_status' => 'Available',
            'rural_health_unit_id' => $this->rhu->id,
            'created_by' => $clinician->id,
        ]);

        $response = $this->postRecord($clinician, $patient, $visit, $uuid, [
            'diagnoses' => [[
                'name' => 'Hypertension',
                'activate' => true,
                'nextAction' => 'manage_to_bhc',
                'manageToBhc' => true,
                'receivingBhcId' => $this->bhc->id,
                'monitoringRecommendation' => 'Weekly blood pressure at the BHC.',
            ]],
            'prescription_text' => 'Losartan 50mg tablets · 14 · Once daily after breakfast',
            'care_plan' => [
                'rhu_follow_up' => true,
                'manage_to_bhc' => true,
            ],
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => now()->addDays(7)->toDateString(),
                'followUpTime' => '09:00',
                'followUpReason' => 'Recheck blood pressure.',
            ],
        ])->assertCreated();

        $record = HealthRecord::findOrFail($response->json('data.id'));
        $this->assertTrue($record->isRhuItrV1());
        $this->assertSame($this->rhu->id, $record->rural_health_unit_id);
        $this->assertSame($uuid, $record->consultation_uuid);
        $this->assertSame(
            'Losartan 50mg tablets · 14 · Once daily after breakfast',
            $record->monitoring_data['prescriptionText'] ?? null
        );
        $this->assertArrayNotHasKey('prescribedMedicines', $record->monitoring_data ?? []);
        $this->assertSame(40, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('medicine_inventory_transactions', 0);
        $this->assertDatabaseCount('health_record_medicines', 0);

        $condition = PatientCondition::where('patient_id', $patient->id)->sole();
        $this->assertSame('Hypertension', $condition->condition_name);
        $this->assertSame(PatientCondition::STATUS_ACTIVE, $condition->status);
        $this->assertNotNull($condition->bhc_monitoring_recommended_at);
        $this->assertDatabaseHas('monitoring_handoff_requests', [
            'patient_id' => $patient->id,
            'patient_condition_id' => $condition->id,
            'receiving_barangay_health_center_id' => $this->bhc->id,
            'status' => 'pending_review',
        ]);
        $this->assertDatabaseCount('condition_monitorings', 0);

        $visit->refresh();
        $this->assertSame(RhuVisitQueueEntry::STATUS_CLOSED, $visit->status);
        $this->assertSame(RhuVisitQueueEntry::CLOSE_REASON_COMPLETED, $visit->close_reason);

        $task = FollowUpTask::where('rural_health_unit_id', $this->rhu->id)->whereNull('rescheduled_to_id')->sole();
        $this->assertSame($patient->id, $task->patient_id);
        $this->assertSame(FollowUpTask::STATE_PENDING, $task->state);
        $this->as($clinician)
            ->getJson("/api/follow-up-tasks?patient_id={$patient->id}&active=1")
            ->assertOk()
            ->assertJsonPath('data.0.id', $task->id);

        $replacement = $this->as($clinician)
            ->patchJson("/api/follow-up-tasks/{$task->id}/reschedule", [
                'due_date' => now()->addDays(14)->toDateString(),
            ])
            ->assertOk()
            ->json('data');
        $this->assertSame(FollowUpTask::STATE_RESCHEDULED, $replacement['state']);
        $this->assertNotSame($task->id, $replacement['id']);
        $this->assertSame($replacement['id'], $task->fresh()->rescheduled_to_id);
        $this->assertSame($this->rhu->id, FollowUpTask::findOrFail($replacement['id'])->rural_health_unit_id);
    }

    public function test_referral_consult_finalize_closes_the_visit_and_leaves_the_referral_received(): void
    {
        $patient = $this->patient();
        $referral = Referral::create([
            'tracking_id' => 'AKY-ITR-'.Str::upper(Str::random(6)),
            'qr_code_value' => app(ReferralService::class)->makeLegacyQrPlaceholder(),
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'reason_for_referral' => 'Evaluate cough.',
            'status' => Referral::STATUS_RECEIVED,
        ]);
        $visit = $this->visit($patient, [
            'source' => RhuVisitQueueEntry::SOURCE_REFERRAL,
            'referral_id' => $referral->id,
        ]);
        $clinician = $this->clinician();
        $uuid = $this->startVisit($clinician, $visit);

        $this->postRecord($clinician, $patient, $visit, $uuid, [
            'diagnoses' => [['name' => 'Tuberculosis', 'activate' => true]],
        ])->assertCreated();

        $this->assertSame(Referral::STATUS_RECEIVED, $referral->fresh()->status);
        $this->assertSame(RhuVisitQueueEntry::STATUS_CLOSED, $visit->fresh()->status);
        $this->assertDatabaseCount('follow_up_tasks', 0);
    }

    public function test_later_rhu_consult_fulfills_the_pending_follow_up_task(): void
    {
        $patient = $this->patient();
        $firstVisit = $this->visit($patient);
        $clinician = $this->clinician();
        $firstUuid = $this->startVisit($clinician, $firstVisit);

        $created = $this->postRecord($clinician, $patient, $firstVisit, $firstUuid, [
            'care_plan' => ['rhu_follow_up' => true],
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => now()->addDays(3)->toDateString(),
                'followUpReason' => 'Return for review.',
            ],
        ])->assertCreated();

        $parentId = $created->json('data.id');
        $task = FollowUpTask::where('health_record_id', $parentId)->whereNull('rescheduled_to_id')->sole();

        $returnVisit = $this->visit($patient);
        $returnUuid = $this->startVisit($clinician, $returnVisit);
        $this->postRecord($clinician, $patient, $returnVisit, $returnUuid, [
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $parentId,
            'monitoring_data' => [
                'followUpTaskId' => $task->id,
            ],
        ])->assertCreated();

        $this->assertSame(FollowUpTask::STATE_FULFILLED, $task->fresh()->state);
        $this->assertSame(RhuVisitQueueEntry::STATUS_CLOSED, $returnVisit->fresh()->status);
    }

    public function test_finalizing_an_rhu_return_fulfills_only_the_follow_ups_selected_at_start(): void
    {
        $patient = $this->patient();
        $clinician = $this->clinician();
        $firstVisit = $this->visit($patient);
        $firstUuid = $this->startVisit($clinician, $firstVisit);
        $created = $this->postRecord($clinician, $patient, $firstVisit, $firstUuid, [
            'care_plan' => ['rhu_follow_up' => true],
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => now()->addDays(3)->toDateString(),
                'followUpReason' => 'Return for review.',
            ],
        ])->assertCreated();
        $selected = FollowUpTask::where('health_record_id', $created->json('data.id'))->whereNull('rescheduled_to_id')->sole();
        $otherParent = HealthRecord::create([
            'patient_id' => $patient->id, 'created_by' => $clinician->id,
            'rural_health_unit_id' => $this->rhu->id, 'category' => 'General Consultation',
            'chief_complaint' => 'Wound',
        ]);
        $unchecked = FollowUpTask::create([
            'health_record_id' => $otherParent->id,
            'patient_id' => $patient->id,
            'rural_health_unit_id' => $this->rhu->id,
            'due_date' => now()->addDays(4)->toDateString(),
            'purpose' => 'Wound review',
            'state' => FollowUpTask::STATE_PENDING,
        ]);

        $returnVisit = $this->visit($patient);
        $returnUuid = $this->as($clinician)->postJson("/api/rhu-visits/{$returnVisit->id}/start", [
            'follow_up_task_ids' => [$selected->id],
        ])->assertOk()->json('data.consultation_uuid');

        $this->assertSame([$selected->id], $returnVisit->fresh()->continued_follow_up_task_ids);
        $this->postRecord($clinician, $patient, $returnVisit, $returnUuid, [
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $selected->health_record_id,
            'monitoring_data' => ['followUpTaskId' => $selected->id],
            'care_plan' => ['continued_follow_up_task_ids' => [$selected->id]],
        ])->assertCreated();

        $this->assertSame(FollowUpTask::STATE_FULFILLED, $selected->fresh()->state);
        $this->assertSame(FollowUpTask::STATE_PENDING, $unchecked->fresh()->state);
    }

    public function test_manage_to_bhc_does_not_silent_activate_and_does_not_fan_out(): void
    {
        $patient = $this->patient();
        $visit = $this->visit($patient);
        $clinician = $this->clinician();
        $uuid = $this->startVisit($clinician, $visit);

        $this->postRecord($clinician, $patient, $visit, $uuid, [
            'diagnoses' => [
                [
                    'name' => 'Asthma',
                    'activate' => false,
                    'nextAction' => 'manage_to_bhc',
                    'receivingBhcId' => $this->bhc->id,
                    'monitoringRecommendation' => 'Peak flow at BHC.',
                ],
                [
                    'name' => 'URI',
                    'activate' => false,
                    'nextAction' => 'none',
                ],
            ],
            'care_plan' => ['manage_to_bhc' => true],
        ])->assertUnprocessable();

        $this->assertDatabaseCount('patient_conditions', 0);
        $this->assertDatabaseCount('monitoring_handoff_requests', 0);
    }

    public function test_per_diagnosis_follow_up_and_service_only_save(): void
    {
        $patient = $this->patient();
        $visit = $this->visit($patient);
        $clinician = $this->clinician();
        $uuid = $this->startVisit($clinician, $visit);
        $dxId = (string) Str::uuid();

        $this->postRecord($clinician, $patient, $visit, $uuid, [
            'diagnoses' => [[
                'id' => $dxId,
                'name' => 'Asthma',
                'activate' => true,
                'nextAction' => 'rhu_follow_up',
            ]],
            'monitoring_data' => [
                'followUpSchedules' => [[
                    'purposeKey' => 'entry:'.$dxId,
                    'purpose' => 'Peak flow',
                    'date' => now()->addDays(10)->toDateString(),
                    'time' => '08:30',
                    'sourceEntryId' => $dxId,
                ]],
            ],
        ])->assertCreated();

        $this->assertDatabaseCount('patient_conditions', 1);
        $this->assertDatabaseCount('monitoring_handoff_requests', 0);
        $this->assertSame(FollowUpTask::STATE_PENDING, FollowUpTask::whereNull('rescheduled_to_id')->sole()->state);

        $serviceVisit = $this->visit($patient);
        $serviceUuid = $this->startVisit($clinician, $serviceVisit);
        $this->postRecord($clinician, $patient, $serviceVisit, $serviceUuid, [
            'diagnoses' => [],
        ])->assertCreated();
        $this->assertDatabaseCount('patient_conditions', 1);
        $this->assertDatabaseCount('monitoring_handoff_requests', 0);
    }

    public function test_rhu_can_read_referred_follow_up_and_its_parent_but_not_unrelated_bhc_records(): void
    {
        $patient = $this->patient(['rural_health_unit_id' => null]);
        $clinician = $this->clinician();
        $parent = HealthRecord::create([
            'patient_id' => $patient->id,
            'created_by' => $clinician->id,
            'barangay_health_center_id' => $this->bhc->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Initial cough',
            'visit_type' => 'initial_consultation',
        ]);
        $followUp = HealthRecord::create([
            'patient_id' => $patient->id,
            'created_by' => $clinician->id,
            'barangay_health_center_id' => $this->bhc->id,
            'parent_health_record_id' => $parent->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Cough worsened',
            'visit_type' => 'follow_up_visit',
        ]);
        $unrelated = HealthRecord::create([
            'patient_id' => $patient->id,
            'created_by' => $clinician->id,
            'barangay_health_center_id' => $this->bhc->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Unrelated visit',
        ]);
        Referral::create([
            'tracking_id' => 'AKY-PARENT-'.Str::upper(Str::random(6)),
            'qr_code_value' => app(ReferralService::class)->makeLegacyQrPlaceholder(),
            'patient_id' => $patient->id,
            'health_record_id' => $followUp->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'reason_for_referral' => 'Assessment',
            'status' => Referral::STATUS_RECEIVED,
        ]);

        $this->as($clinician)->getJson('/api/health-records/'.$followUp->id)
            ->assertOk()
            ->assertJsonPath('data.id', $followUp->id)
            ->assertJsonPath('data.parent_health_record_id', $parent->id);
        $this->as($clinician)->getJson('/api/health-records/'.$parent->id)
            ->assertOk()
            ->assertJsonPath('data.id', $parent->id)
            ->assertJsonPath('data.chief_complaint', 'Initial cough');
        $this->as($clinician)->getJson('/api/health-records/'.$unrelated->id)->assertForbidden();
        $ids = $this->as($clinician)->getJson('/api/health-records?patient_id='.$patient->id)
            ->assertOk()
            ->json('data.data');
        $this->assertEqualsCanonicalizing([$followUp->id, $parent->id], array_column($ids, 'id'));
    }
}
