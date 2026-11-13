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
use Illuminate\Support\Facades\Notification;
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
        ], ['staff_role' => 'doctor']);
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

    public function test_higher_level_referral_is_only_a_documented_plan_in_a_mixed_tb_consultation(): void
    {
        Notification::fake();
        $patient = $this->patient();
        $clinician = $this->clinician();
        // A care plan is not referral issuance and needs no referrals.submit permission.
        $clinician->permissions = array_values(array_diff($clinician->permissions, ['referrals.submit']));
        $clinician->save();
        $visit = $this->visit($patient);
        $uuid = $this->startVisit($clinician, $visit);
        $plan = ['reason' => 'Specialist assessment', 'intendedFacility' => 'Provincial hospital', 'clinicalPlan' => 'Review available investigations'];
        $diagnoses = [
            ['id' => 'tb', 'name' => 'TB', 'nextAction' => 'refer_higher_level', 'higherLevelReferralPlan' => $plan,
                'tbManagement' => ['diagnosisType' => 'tb_disease', 'drugResistance' => 'drug_susceptible']],
            ['id' => 'uri', 'name' => 'URI', 'nextAction' => 'none'],
        ];

        $id = $this->postRecord($clinician, $patient, $visit, $uuid, ['diagnoses' => $diagnoses])
            ->assertCreated()->json('data.id');
        $this->assertSame($plan, HealthRecord::findOrFail($id)->diagnoses[0]['higherLevelReferralPlan']);
        $this->getJson('/api/health-records/'.$id)->assertOk()
            ->assertJsonPath('data.diagnoses.0.nextAction', 'refer_higher_level')
            ->assertJsonPath('data.diagnoses.0.higherLevelReferralPlan', $plan);
        $this->assertDatabaseCount('referrals', 0);
        $this->assertDatabaseCount('tb_dr_referrals', 0);
        $this->assertDatabaseCount('tb_treatment_cases', 0);
        $this->assertDatabaseCount('follow_up_tasks', 0);
        $this->assertDatabaseCount('patient_conditions', 0);
        Notification::assertNothingSent();
        $this->assertSame(RhuVisitQueueEntry::STATUS_CLOSED, $visit->fresh()->status);
        $this->assertSame(RhuVisitQueueEntry::CLOSE_REASON_COMPLETED, $visit->fresh()->close_reason);
    }

    public function test_all_four_next_actions_finalize_ds_tb_without_treatment_registration(): void
    {
        $clinician = $this->clinician();
        foreach (['none', 'rhu_follow_up', 'manage_to_bhc', 'refer_higher_level'] as $action) {
            $patient = $this->patient();
            $visit = $this->visit($patient);
            $uuid = $this->startVisit($clinician, $visit);
            $entry = ['id' => 'tb', 'name' => 'TB', 'nextAction' => $action,
                'tbManagement' => ['diagnosisType' => 'tb_disease', 'drugResistance' => 'drug_susceptible']];
            $extra = [];
            if ($action === 'manage_to_bhc') {
                $entry = [...$entry, 'activate' => true, 'receivingBhcId' => $this->bhc->id, 'monitoringRecommendation' => 'Review symptoms at BHC'];
            } elseif ($action === 'rhu_follow_up') {
                $extra = ['monitoring_data' => ['followUpSchedules' => [[
                    'purposeKey' => 'entry:tb', 'sourceEntryId' => 'tb', 'purpose' => 'Review symptoms',
                    'date' => now()->addWeek()->toDateString(),
                ]]]];
            } elseif ($action === 'refer_higher_level') {
                $entry['higherLevelReferralPlan'] = ['reason' => 'Specialist assessment', 'clinicalPlan' => 'Review available investigations'];
            }
            $id = $this->postRecord($clinician, $patient, $visit, $uuid, [...$extra, 'diagnoses' => [$entry]])
                ->assertCreated()->json('data.id');
            $record = HealthRecord::findOrFail($id);
            $this->assertSame($action, $record->diagnoses[0]['nextAction']);
            $this->assertNull($record->tb_data);
            $this->assertDatabaseCount('tb_treatment_cases', 0);
            $this->assertDatabaseCount('tb_dr_referrals', 0);
            $this->assertDatabaseCount('referrals', 0);
        }
    }

    public function test_higher_level_referral_requires_visible_reason_and_plan_but_facility_is_optional(): void
    {
        $patient = $this->patient();
        $clinician = $this->clinician();
        $visit = $this->visit($patient);
        $uuid = $this->startVisit($clinician, $visit);
        $entry = ['id' => 'a', 'name' => 'Asthma', 'nextAction' => 'refer_higher_level'];
        foreach ([null, ['reason' => ' ', 'clinicalPlan' => ' '], ['reason' => 'Specialist assessment']] as $plan) {
            $this->postRecord($clinician, $patient, $visit, $uuid, ['diagnoses' => [[...$entry, 'higherLevelReferralPlan' => $plan]]])
                ->assertUnprocessable()->assertJsonValidationErrors($plan === null
                    ? ['diagnoses.0.higherLevelReferralPlan']
                    : (isset($plan['clinicalPlan'])
                        ? ['diagnoses.0.higherLevelReferralPlan.reason', 'diagnoses.0.higherLevelReferralPlan.clinicalPlan']
                        : ['diagnoses.0.higherLevelReferralPlan.clinicalPlan']));
        }
        $this->postRecord($clinician, $patient, $visit, $uuid, ['diagnoses' => [[...$entry,
            'higherLevelReferralPlan' => ['reason' => 'Specialist assessment', 'clinicalPlan' => 'Continue prescribed care'],
        ]]])->assertCreated();
    }

    public function test_hidden_higher_level_plan_is_cleared_and_does_not_block_other_actions(): void
    {
        $patient = $this->patient();
        $clinician = $this->clinician();
        $visit = $this->visit($patient);
        $uuid = $this->startVisit($clinician, $visit);
        $id = $this->postRecord($clinician, $patient, $visit, $uuid, ['diagnoses' => [[
            'id' => 'a', 'name' => 'Asthma', 'nextAction' => 'none',
            'higherLevelReferralPlan' => ['reason' => 'Stale reason', 'clinicalPlan' => ''],
        ]]])->assertCreated()->json('data.id');
        $this->assertEmpty(HealthRecord::findOrFail($id)->diagnoses[0]['higherLevelReferralPlan'] ?? null);
    }

    public function test_discarded_rhu_recovery_gets_a_fresh_identity_on_the_same_started_visit(): void
    {
        $patient = $this->patient();
        $encoder = $this->encoder();
        $visit = $this->visit($patient);
        $uuid = $this->startVisit($encoder, $visit);
        $input = ['form_type' => 'consultation', 'mode' => 'edit', 'context_key' => 'visit:'.$visit->id, 'transaction_uuid' => $uuid];
        $key = $this->postJson('/api/form-drafts/device-key', $input)->assertOk()->json('data');
        $this->postJson('/api/form-drafts/clinical-discard', [...$input, 'key_id' => $key['key_id']])->assertNoContent();
        $fresh = $visit->fresh();
        $this->assertSame('in_consultation', $fresh->status);
        $this->assertNull($fresh->closed_at);
        $this->assertNotSame($uuid, $fresh->consultation_uuid);
        $this->assertDatabaseCount('rhu_visit_queue_entries', 1);
        $this->postJson('/api/form-drafts/device-key', [...$input, 'transaction_uuid' => $fresh->consultation_uuid])->assertOk();
        $this->postJson('/api/form-drafts/device-key', $input)->assertConflict();
    }

    public function test_queue_entry_can_check_a_waiting_visit_without_starting_or_creating_a_draft(): void
    {
        $patient = $this->patient();
        $visit = $this->visit($patient);
        $this->as($this->encoder())->getJson("/api/health-record-drafts/lookup?patient_id={$patient->id}&rhu_visit_id={$visit->id}")
            ->assertOk()->assertJsonPath('data', null);
        $this->assertNull($visit->fresh()->consultation_uuid);
        $this->assertSame('waiting', $visit->fresh()->status);
        $this->assertDatabaseCount('health_record_drafts', 0);

        $otherPatient = $this->patient();
        $this->getJson("/api/health-record-drafts/lookup?patient_id={$otherPatient->id}&rhu_visit_id={$visit->id}")
            ->assertUnprocessable();
    }

    public function test_discarding_a_server_rhu_draft_preserves_visit_and_retires_old_identity(): void
    {
        $patient = $this->patient();
        $encoder = $this->encoder();
        $visit = $this->visit($patient);
        $uuid = $this->startVisit($encoder, $visit);
        $id = $this->postJson('/api/health-record-drafts', ['patient_id' => $patient->id, 'classification' => 'General Consultation', 'consultation_uuid' => $uuid, 'rhu_visit_id' => $visit->id, 'payload' => ['chiefComplaint' => 'Partial']])->assertCreated()->json('data.id');
        $this->deleteJson('/api/health-record-drafts/'.$id, ['version' => 1])->assertNoContent();
        $this->assertNotSame($uuid, $visit->fresh()->consultation_uuid);
        $this->assertSame('in_consultation', $visit->fresh()->status);
        $this->assertDatabaseHas('clinical_recovery_identities', ['consultation_uuid' => $uuid, 'status' => 'discarded']);
    }

    public function test_lost_rhu_finalize_response_can_replay_after_the_visit_has_completed(): void
    {
        $patient = $this->patient();
        $clinician = $this->clinician();
        $visit = $this->visit($patient);
        $uuid = $this->startVisit($clinician, $visit);
        $input = ['consultation_workflow' => HealthRecord::WORKFLOW_RHU_ITR_V1, 'consultation_uuid' => $uuid, 'rhu_visit_id' => $visit->id, 'patient_id' => $patient->id, 'category' => 'General Consultation', 'chief_complaint' => 'Partial'];
        $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', $input)->assertCreated();
        $this->postJson('/api/health-records', $input)->assertOk()->assertJsonPath('idempotent_replay', true);
        $this->assertDatabaseCount('health_records', 1);
        $this->assertSame(RhuVisitQueueEntry::CLOSE_REASON_COMPLETED, $visit->fresh()->close_reason);
        $this->postJson('/api/health-records', [...$input, 'chief_complaint' => 'Changed'])->assertConflict();
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

    public function test_rhu_draft_persists_additional_concern_fields_for_back_to_queue_resume(): void
    {
        $patient = $this->patient();
        $encoder = $this->encoder();
        $visit = $this->visit($patient);
        $uuid = $this->startVisit($encoder, $visit);

        $created = $this->as($encoder)->postJson('/api/health-record-drafts', [
            'patient_id' => $patient->id,
            'classification' => 'General Consultation',
            'consultation_uuid' => $uuid,
            'rhu_visit_id' => $visit->id,
            'payload' => [
                'consultationWorkflow' => HealthRecord::WORKFLOW_RHU_ITR_V1,
                'chiefComplaint' => 'Today RHU complaint',
                'showAdditionalConcern' => true,
                'additionalChiefComplaint' => 'Second concern',
                'additionalHistoryOfPresentIllness' => 'Since dawn',
            ],
        ])->assertCreated();

        $draftId = $created->json('data.id');
        $this->getJson('/api/health-record-drafts/'.$draftId)
            ->assertOk()
            ->assertJsonPath('data.payload.chiefComplaint', 'Today RHU complaint')
            ->assertJsonPath('data.payload.showAdditionalConcern', true)
            ->assertJsonPath('data.payload.additionalChiefComplaint', 'Second concern')
            ->assertJsonPath('data.payload.additionalHistoryOfPresentIllness', 'Since dawn');

        $this->postRecord($encoder, $patient, $visit, $uuid, [
            'chief_complaint' => 'Today RHU complaint',
            'monitoring_data' => [
                'additionalConcern' => [
                    'chiefComplaint' => 'Second concern',
                    'historyOfPresentIllness' => 'Since dawn',
                ],
            ],
        ])->assertForbidden();
        $this->assertSame(RhuVisitQueueEntry::STATUS_IN_CONSULTATION, $visit->fresh()->status);
        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_rhu_care_plan_draft_flush_can_be_finalized_at_the_current_revision(): void
    {
        $patient = $this->patient();
        $user = $this->clinician();
        $visit = $this->visit($patient);
        $uuid = $this->startVisit($user, $visit);
        $input = [
            'patient_id' => $patient->id, 'rhu_visit_id' => $visit->id,
            'consultation_uuid' => $uuid, 'classification' => 'General Consultation',
            'payload' => [
                'consultationWorkflow' => HealthRecord::WORKFLOW_RHU_ITR_V1,
                'wizardPhase' => 'review', 'chiefComplaint' => 'Hypertension review',
                'diagnoses' => [[
                    'id' => 'd1', 'name' => 'Hypertension', 'activate' => true,
                    'nextAction' => 'rhu_follow_up', 'receivingBhcId' => '', 'monitoringRecommendation' => '',
                    'tbManagement' => ['diagnosisType' => '', 'drugResistance' => '', 'openTreatmentCard' => false],
                ]],
            ],
        ];
        $created = $this->as($user)->postJson('/api/health-record-drafts', $input)->assertCreated();
        $id = $created->json('data.id');
        $updated = $this->putJson('/api/health-record-drafts/'.$id, [...$input, 'version' => $created->json('data.version')])
            ->assertOk();
        $this->getJson('/api/health-record-drafts/'.$id)->assertOk()
            ->assertJsonPath('data.payload.diagnoses.0.nextAction', 'rhu_follow_up');
        $this->withHeaders(['X-Health-Record-Draft-ID' => $id, 'X-Draft-Version' => (string) $updated->json('data.version')]);
        $this->postRecord($user, $patient, $visit, $uuid)->assertCreated();
        $this->assertDatabaseHas('health_record_drafts', ['public_id' => $id, 'status' => 'consumed']);
        $this->assertDatabaseCount('health_records', 1);
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
        $this->assertSame([], array_column($ids, 'id'));
        $this->getJson('/api/health-records/'.$source->id)->assertForbidden();
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
        $this->assertSame([$id], array_column($ids, 'id'));
        $this->getJson('/api/health-records/'.$hidden->id)->assertForbidden();
        $this->getJson('/api/health-records/'.$source->id)->assertForbidden();
    }

    public function test_rhu_itr_persists_independent_report_in_destinations_and_visit_mirrors(): void
    {
        $patient = $this->patient();
        $visit = $this->visit($patient);
        $clinician = $this->clinician();
        $uuid = $this->startVisit($clinician, $visit);

        $id = $this->postRecord($clinician, $patient, $visit, $uuid, [
            'diagnoses' => [[
                'name' => 'Dengue fever',
                'activate' => true,
                'nextAction' => 'none',
                'reportIn' => ['morbidity', 'notifiable', 'surveillance'],
            ]],
        ])->assertCreated()->json('data.id');

        $record = HealthRecord::findOrFail($id);
        $this->assertSame(
            ['morbidity', 'notifiable', 'surveillance'],
            $record->diagnoses[0]['reportIn']
        );
        $this->assertSame('notifiable', $record->diagnoses[0]['reportAs']);
        $this->assertTrue($record->diagnoses[0]['includeInSurveillance']);
        $this->assertSame('notifiable', $record->monitoring_data['morbidityReportingStatus'] ?? null);
    }

    public function test_rhu_itr_still_prohibits_bhc_condition_card_fields_on_diagnoses(): void
    {
        $patient = $this->patient();
        $visit = $this->visit($patient);
        $clinician = $this->clinician();
        $uuid = $this->startVisit($clinician, $visit);

        $this->postRecord($clinician, $patient, $visit, $uuid, [
            'diagnoses' => [[
                'name' => 'Cough',
                'activate' => false,
                'nextAction' => 'none',
                'reportIn' => ['morbidity'],
                'clinicalOutcome' => 'managed_at_bhc',
            ]],
        ])->assertUnprocessable()->assertJsonValidationErrors(['diagnoses.0.clinicalOutcome']);
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

    public function test_referral_no_further_follow_up_completes_the_referral_with_bhc_notes(): void
    {
        Notification::fake();
        $patient = $this->patient();
        $referral = Referral::create([
            'tracking_id' => 'AKY-ITR-'.Str::upper(Str::random(6)),
            'qr_code_value' => app(ReferralService::class)->makeLegacyQrPlaceholder(),
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'reason_for_referral' => 'Evaluate hypertension.',
            'status' => Referral::STATUS_RECEIVED,
        ]);
        $visit = $this->visit($patient, [
            'source' => RhuVisitQueueEntry::SOURCE_REFERRAL,
            'referral_id' => $referral->id,
        ]);
        $clinician = $this->clinician();
        $uuid = $this->startVisit($clinician, $visit);

        $this->postRecord($clinician, $patient, $visit, $uuid, [
            'diagnoses' => [[
                'name' => 'Hypertension',
                'activate' => true,
                'nextAction' => 'none',
            ]],
        ])->assertUnprocessable();

        $this->postRecord($clinician, $patient, $visit, $uuid, [
            'diagnoses' => [[
                'name' => 'Hypertension',
                'activate' => true,
                'nextAction' => 'none',
                'noFurtherFollowUpReason' => 'BP controlled at RHU; continue lifestyle advice only.',
            ]],
        ])->assertCreated();

        $this->assertSame(Referral::STATUS_COMPLETED, $referral->fresh()->status);
        $this->assertDatabaseHas('feedback', [
            'referral_id' => $referral->id,
            'rhu_diagnosis' => 'Hypertension',
        ]);
        $this->assertStringContainsString(
            'BP controlled at RHU',
            (string) $referral->fresh()->feedback->remarks
        );
        $this->assertSame(RhuVisitQueueEntry::STATUS_CLOSED, $visit->fresh()->status);
    }

    public function test_referral_manage_to_bhc_creates_monitoring_request_and_completes_referral(): void
    {
        Notification::fake();
        $patient = $this->patient([
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => null,
        ]);
        $referral = Referral::create([
            'tracking_id' => 'AKY-ITR-'.Str::upper(Str::random(6)),
            'qr_code_value' => app(ReferralService::class)->makeLegacyQrPlaceholder(),
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'reason_for_referral' => 'Confirm hypertension.',
            'status' => Referral::STATUS_RECEIVED,
        ]);
        $visit = $this->visit($patient, [
            'source' => RhuVisitQueueEntry::SOURCE_REFERRAL,
            'referral_id' => $referral->id,
        ]);
        $clinician = $this->clinician();
        $uuid = $this->startVisit($clinician, $visit);

        $this->postRecord($clinician, $patient, $visit, $uuid, [
            'diagnoses' => [[
                'name' => 'Hypertension',
                'activate' => true,
                'nextAction' => 'manage_to_bhc',
                'receivingBhcId' => $this->bhc->id,
                'monitoringRecommendation' => 'Weekly BP checks at the BHC.',
            ]],
        ])->assertCreated();

        $this->assertSame(Referral::STATUS_COMPLETED, $referral->fresh()->status);
        $this->assertDatabaseHas('feedback', [
            'referral_id' => $referral->id,
            'rhu_diagnosis' => 'Hypertension',
        ]);
        $this->assertDatabaseHas('monitoring_handoff_requests', [
            'patient_id' => $patient->id,
            'receiving_barangay_health_center_id' => $this->bhc->id,
            'recommendation' => 'Weekly BP checks at the BHC.',
        ]);
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

    public function test_hypertension_follow_up_lifecycle_fulfills_and_can_schedule_the_next_return(): void
    {
        $patient = $this->patient();
        $clinician = $this->clinician();
        $dxId = (string) Str::uuid();
        $firstVisit = $this->visit($patient);
        $firstUuid = $this->startVisit($clinician, $firstVisit);

        $created = $this->postRecord($clinician, $patient, $firstVisit, $firstUuid, [
            'diagnoses' => [[
                'id' => $dxId,
                'name' => 'Hypertension',
                'activate' => true,
                'nextAction' => 'rhu_follow_up',
            ]],
            'care_plan' => ['rhu_follow_up' => true],
            'monitoring_data' => [
                'followUpSchedules' => [[
                    'purposeKey' => 'entry:'.$dxId,
                    'purpose' => 'Recheck blood pressure',
                    'date' => now()->addDays(7)->toDateString(),
                    'time' => '09:00',
                    'sourceEntryId' => $dxId,
                ]],
            ],
        ])->assertCreated();

        $parentId = (int) $created->json('data.id');
        $pending = FollowUpTask::where('health_record_id', $parentId)->whereNull('rescheduled_to_id')->sole();
        $this->assertSame(FollowUpTask::STATE_PENDING, $pending->state);
        $this->assertSame(PatientCondition::STATUS_ACTIVE, PatientCondition::where('patient_id', $patient->id)->sole()->status);

        $returnVisit = $this->visit($patient);
        $returnUuid = $this->as($clinician)->postJson("/api/rhu-visits/{$returnVisit->id}/start", [
            'follow_up_task_ids' => [$pending->id],
        ])->assertOk()->json('data.consultation_uuid');

        // Mirror the RHU workspace when parent_health_record_id is still unresolved
        // but the selected pending task id is already known.
        $nextDate = now()->addDays(14)->toDateString();
        $returnPayload = [
            'visit_type' => 'follow_up_visit',
            'diagnoses' => [[
                'id' => $dxId,
                'name' => 'Hypertension',
                'activate' => false,
                'nextAction' => 'rhu_follow_up',
            ]],
            'monitoring_data' => [
                'followUpTaskId' => $pending->id,
                'followUpSchedules' => [[
                    'purposeKey' => 'entry:'.$dxId,
                    'purpose' => 'Continue hypertension follow-up',
                    'date' => $nextDate,
                    'time' => '10:00',
                    'predecessorTaskId' => $pending->id,
                    'sourceEntryId' => $dxId,
                ]],
            ],
            'care_plan' => [
                'rhu_follow_up' => true,
                'continued_follow_up_task_ids' => [$pending->id],
            ],
        ];
        $idempotencyKey = (string) Str::uuid();
        $createdReturn = $this->as($clinician)
            ->withHeaders(['Idempotency-Key' => $idempotencyKey])
            ->postJson('/api/health-records', [
                'consultation_workflow' => HealthRecord::WORKFLOW_RHU_ITR_V1,
                'consultation_uuid' => $returnUuid,
                'rhu_visit_id' => $returnVisit->id,
                'patient_id' => $patient->id,
                'category' => 'General Consultation',
                'chief_complaint' => 'Cough and fever',
                ...$returnPayload,
            ])
            ->assertCreated();

        $this->assertSame(FollowUpTask::STATE_FULFILLED, $pending->fresh()->state);
        $this->assertSame(PatientCondition::STATUS_ACTIVE, PatientCondition::where('patient_id', $patient->id)->sole()->status);

        $next = FollowUpTask::query()
            ->where('patient_id', $patient->id)
            ->whereNull('rescheduled_to_id')
            ->where('state', FollowUpTask::STATE_PENDING)
            ->sole();
        $this->assertSame($nextDate, $next->due_date->toDateString());
        $this->assertSame($pending->id, $next->predecessor_task_id);
        $this->assertNotSame($parentId, $next->health_record_id);

        // Lost-response replay must not create a second successor task.
        $this->as($clinician)
            ->withHeaders(['Idempotency-Key' => $idempotencyKey])
            ->postJson('/api/health-records', [
                'consultation_workflow' => HealthRecord::WORKFLOW_RHU_ITR_V1,
                'consultation_uuid' => $returnUuid,
                'rhu_visit_id' => $returnVisit->id,
                'patient_id' => $patient->id,
                'category' => 'General Consultation',
                'chief_complaint' => 'Cough and fever',
                ...$returnPayload,
            ])
            ->assertOk()
            ->assertJsonPath('data.id', $createdReturn->json('data.id'));
        $this->assertSame(1, FollowUpTask::where('patient_id', $patient->id)->where('state', FollowUpTask::STATE_PENDING)->count());

        $staleVisit = $this->visit($patient);
        $staleUuid = $this->startVisit($clinician, $staleVisit);
        $this->postRecord($clinician, $patient, $staleVisit, $staleUuid, [
            'visit_type' => 'follow_up_visit',
            'monitoring_data' => ['followUpTaskId' => $pending->id],
            'care_plan' => ['continued_follow_up_task_ids' => [$pending->id]],
        ])->assertStatus(409);
        $this->assertSame(1, FollowUpTask::where('patient_id', $patient->id)->where('state', FollowUpTask::STATE_PENDING)->count());
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

    public function test_rhu_cannot_open_bhc_health_record_details_even_when_referred(): void
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
            'history_of_present_illness' => 'Worse at night',
            'physical_exam' => 'Wheeze',
            'body_findings' => [['id' => 'f1', 'region' => 'chest', 'side' => 'front', 'finding' => 'Wheeze']],
            'visit_type' => 'follow_up_visit',
        ]);
        $unrelated = HealthRecord::create([
            'patient_id' => $patient->id,
            'created_by' => $clinician->id,
            'barangay_health_center_id' => $this->bhc->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Unrelated visit',
        ]);
        $referral = Referral::create([
            'tracking_id' => 'AKY-PARENT-'.Str::upper(Str::random(6)),
            'qr_code_value' => app(ReferralService::class)->makeLegacyQrPlaceholder(),
            'patient_id' => $patient->id,
            'health_record_id' => $followUp->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'reason_for_referral' => 'Assessment',
            'status' => Referral::STATUS_RECEIVED,
        ]);

        $this->as($clinician)->getJson('/api/health-records/'.$followUp->id)->assertForbidden();
        $this->as($clinician)->getJson('/api/health-records/'.$parent->id)->assertForbidden();
        $this->as($clinician)->getJson('/api/health-records/'.$unrelated->id)->assertForbidden();
        $ids = $this->as($clinician)->getJson('/api/health-records?patient_id='.$patient->id)
            ->assertOk()
            ->json('data.data');
        $this->assertSame([], array_column($ids, 'id'));

        $slipRecord = $this->as($clinician)->getJson('/api/referrals/'.$referral->id)
            ->assertOk()
            ->json('data.health_record');
        $this->assertSame($followUp->id, $slipRecord['id']);
        $this->assertSame('Worse at night', $slipRecord['history_of_present_illness']);
        $this->assertSame('Wheeze', $slipRecord['physical_exam']);
        $this->assertSame('Wheeze', $slipRecord['body_findings'][0]['finding']);
        $this->assertArrayNotHasKey('diagnoses', $slipRecord);
        $this->assertArrayNotHasKey('monitoring_data', $slipRecord);
        $this->assertArrayNotHasKey('maternal_data', $slipRecord);
    }
}
