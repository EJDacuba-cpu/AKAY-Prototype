<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\ConditionMonitoring;
use App\Models\FollowUpTask;
use App\Models\HealthRecord;
use App\Models\HealthRecordDraft;
use App\Models\Medicine;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\Referral;
use App\Models\ReferralHold;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use App\Services\FollowUpTaskSyncService;
use App\Services\ReportingEntries;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use App\Services\StaffRoles;
use Tests\TestCase;

/** BHC-only General Consultation v2: request validation of the visit-level next actions. */
class BhcGeneralConsultationV2Test extends TestCase
{
    use RefreshDatabase;

    private User $worker;

    private Patient $patient;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'V2 RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'V2 BHC', 'rural_health_unit_id' => $this->rhu->id]);
        $this->worker = User::create(['name' => 'V2 Worker', 'email' => 'v2@example.test', 'password' => 'password123', 'role' => 'bhc', 'status' => 'active', 'barangay_health_center_id' => $this->bhc->id, 'permissions' => StaffRoles::defaults('midwife')]);
        $this->patient = Patient::create(['first_name' => 'Test', 'last_name' => 'Patient', 'sex' => 'Female', 'birthdate' => '2000-01-01', 'barangay_health_center_id' => $this->bhc->id, 'rural_health_unit_id' => $this->rhu->id, 'created_by' => $this->worker->id]);
        Sanctum::actingAs($this->worker, ['akay:access']);
    }

    private function v2(array $extra = [])
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            ...[
                'patient_id' => $this->patient->id,
                'consultation_workflow' => HealthRecord::WORKFLOW_BHC_GENERAL_V2,
                'chief_complaint' => 'Cough for 3 days',
                'category' => 'General Consultation',
            ],
            ...$extra,
        ]);
    }

    private function referral(): array
    {
        return ['needs_referral' => true, 'referral' => ['reason_for_referral' => 'Further assessment', 'urgency_level' => 'Routine']];
    }

    private function nextWeek(): string
    {
        return now()->addWeek()->toDateString();
    }

    private function card(string $id, string $outcome, string $name = 'Reported condition'): array
    {
        return ['id' => $id, 'name' => $name, 'reportIn' => ['morbidity'], 'clinicalOutcome' => $outcome,
            ...($outcome === 'refer_to_rhu' ? ['referral' => ['urgencyLevel' => 'Routine', 'receivingRhuId' => $this->rhu->id, 'reasonForReferral' => 'Assessment for '.$name]] : []),
        ];
    }

    private function sharedReferral(): array
    {
        $cards = [$this->card('c1', 'refer_to_rhu', 'Concern one'), $this->card('c2', 'refer_to_rhu', 'Concern two')];
        foreach ($cards as &$card) {
            unset($card['referral']);
        }

        return [
            'needs_referral' => true,
            'care_plan' => ['condition_cards' => true, 'shared_condition_referral' => true, 'refer_to_rhu' => true, 'shared_referral_acknowledged' => true],
            'diagnoses' => $cards,
            'referral' => ['rural_health_unit_id' => $this->rhu->id, 'urgency_level' => 'Priority', 'reason_for_referral' => 'Shared RHU assessment', 'initial_diagnosis' => 'Untrusted supplied diagnosis', 'chief_complaint' => 'Untrusted override'],
        ];
    }

    public function test_shared_condition_referral_creates_one_tracking_record_and_replays_once(): void
    {
        $this->seedAvailableProvider($this->rhu, 'Shared Doctor');
        $payload = [...$this->sharedReferral(), 'patient_id' => $this->patient->id, 'category' => 'General Consultation', 'chief_complaint' => 'Original visit complaint', 'physical_exam' => 'Original findings', 'consultation_workflow' => HealthRecord::WORKFLOW_BHC_GENERAL_V2];
        $key = (string) Str::uuid();
        $id = $this->withHeader('Idempotency-Key', $key)->postJson('/api/health-records', $payload)->assertCreated()->json('data.id');
        $this->assertDatabaseCount('referrals', 1);
        $this->assertSame('Original findings', HealthRecord::findOrFail($id)->physical_exam);
        $this->assertDatabaseHas('referrals', ['health_record_id' => $id, 'initial_diagnosis' => 'Concern one; Concern two', 'chief_complaint' => 'Original visit complaint', 'urgency_level' => 'Priority', 'reason_for_referral' => 'Shared RHU assessment']);
        $this->assertArrayNotHasKey('conditionReferralOutcomes', HealthRecord::findOrFail($id)->monitoring_data);
        $this->assertArrayNotHasKey('referral', HealthRecord::findOrFail($id)->diagnoses[0]);
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/health-records', $payload)->assertOk()->assertJsonPath('idempotent_replay', true);
        $this->assertDatabaseCount('referrals', 1);
        $this->assertDatabaseCount('referral_holds', 0);
        $this->assertDatabaseCount('patient_conditions', 0);
    }

    public function test_shared_referral_keeps_bhc_return_and_excludes_locally_managed_condition(): void
    {
        $payload = $this->sharedReferral();
        $payload['diagnoses'][] = $this->card('local', 'managed_at_bhc', 'Local follow-up concern');
        $payload['care_plan']['bhc_follow_up'] = true;
        $payload['monitoring_data'] = ['followUpDate' => $this->nextWeek(), 'followUpTime' => '10:30', 'followUpReason' => 'Local follow-up concern'];
        $id = $this->v2($payload)->assertCreated()->json('data.id');
        $record = HealthRecord::findOrFail($id);
        $this->assertTrue($record->monitoring_data['bhcFollowUp']);
        $this->assertSame('Concern one; Concern two', $record->monitoring_data['pendingReferral']['initial_diagnosis']);
        $this->assertSame(1, FollowUpTask::where('health_record_id', $id)->count());
        $this->assertDatabaseCount('referral_holds', 1);
    }

    public function test_shared_unavailable_referral_creates_one_hold_and_resumes_as_one_referral(): void
    {
        $id = $this->v2($this->sharedReferral())->assertCreated()->json('data.id');
        $data = HealthRecord::findOrFail($id)->monitoring_data;
        $this->assertDatabaseCount('referral_holds', 1);
        $this->assertDatabaseCount('referrals', 0);
        $this->assertSame('Concern one; Concern two', $data['pendingReferral']['initial_diagnosis']);
        $this->seedAvailableProvider($this->rhu, 'Returned Doctor');
        $this->postJson('/api/referrals', ['patient_id' => $this->patient->id, 'health_record_id' => $id, 'resume_hold_id' => $data['referralHoldId'], ...$data['pendingReferral']])->assertCreated();
        $this->assertDatabaseCount('referrals', 1);
        $this->assertDatabaseHas('referrals', ['initial_diagnosis' => 'Concern one; Concern two']);
    }

    public function test_shared_referral_includes_referred_monitoring_without_creating_another_referral(): void
    {
        $monitoring = $this->followedHypertension();
        $payload = $this->sharedReferral();
        $payload['care_plan']['continued_monitoring_ids'] = [$monitoring->id];
        $payload['care_plan']['monitoring_referrals'] = [$monitoring->id];
        $id = $this->v2($payload)->assertCreated()->json('data.id');
        $this->assertDatabaseCount('referral_holds', 1);
        $this->assertSame('Concern one; Concern two; Hypertension', HealthRecord::findOrFail($id)->monitoring_data['pendingReferral']['initial_diagnosis']);
    }

    public function test_shared_referral_requires_the_common_fields_and_explicit_multi_concern_acknowledgment(): void
    {
        foreach (['rural_health_unit_id', 'urgency_level', 'reason_for_referral'] as $field) {
            $payload = $this->sharedReferral();
            unset($payload['referral'][$field]);
            $this->v2($payload)->assertUnprocessable()->assertJsonValidationErrors(["referral.$field"]);
        }
        $payload = $this->sharedReferral();
        unset($payload['referral']);
        $this->v2($payload)->assertUnprocessable()->assertJsonValidationErrors(['referral']);
        $payload = $this->sharedReferral();
        $payload['care_plan']['shared_referral_acknowledged'] = false;
        $this->v2($payload)->assertUnprocessable()->assertJsonValidationErrors(['care_plan.shared_referral_acknowledged']);
        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_shared_referral_rejects_individual_referral_details_and_unauthorized_destinations(): void
    {
        $payload = $this->sharedReferral();
        $payload['diagnoses'][0]['referral'] = $this->card('c1', 'refer_to_rhu')['referral'];
        $this->v2($payload)->assertUnprocessable()->assertJsonValidationErrors(['diagnoses.0.referral']);
        $payload = $this->sharedReferral();
        $payload['referral']['rural_health_unit_id'] = RuralHealthUnit::create(['name' => 'Unmapped shared RHU', 'status' => 'active'])->id;
        $this->v2($payload)->assertUnprocessable()->assertJsonValidationErrors(['referral.rural_health_unit_id']);
        $this->assertDatabaseCount('health_records', 0);
        $this->assertDatabaseCount('referrals', 0);
        $this->assertDatabaseCount('referral_holds', 0);
    }

    public function test_condition_card_workflow_allows_service_only_visits_without_conditions(): void
    {
        foreach ([[], ['diagnoses' => null], ['diagnoses' => []]] as $extra) {
            $this->v2(['care_plan' => ['condition_cards' => true, 'shared_condition_referral' => true], ...$extra])
                ->assertCreated();
        }
        $this->assertDatabaseCount('health_records', 3);
        $this->assertDatabaseCount('referrals', 0);
        $this->assertDatabaseCount('follow_up_tasks', 0);
    }

    public function test_service_only_prenatal_visit_finalizes_without_a_condition_card(): void
    {
        $id = $this->v2([
            'category' => 'Maternal',
            'chief_complaint' => 'Routine prenatal checkup',
            'care_plan' => ['condition_cards' => true, 'shared_condition_referral' => true],
            'diagnoses' => [],
            'monitoring_data' => [
                'selectedPrograms' => ['Maternal'],
                'primaryProgram' => 'Maternal',
                'prenatalIntent' => 'enroll',
            ],
            'maternal_data' => [
                'lmp' => '2026-03-01',
                'expectedDeliveryDate' => '2026-12-08',
                'gravida' => '1',
                'para' => '0',
            ],
        ])->assertCreated()->json('data.id');
        $record = HealthRecord::findOrFail($id);
        $this->assertSame([], $record->diagnoses ?? []);
        $this->assertFalse((bool) $record->needs_referral);
        $this->assertSame(0, FollowUpTask::where('health_record_id', $id)->count());
        $this->assertSame(0, Referral::where('health_record_id', $id)->count());
    }

    public function test_stale_referral_payload_does_not_create_a_referral_without_a_decision(): void
    {
        $this->seedAvailableProvider($this->rhu, 'Stale Doctor');
        $id = $this->v2([
            'care_plan' => ['condition_cards' => true, 'shared_condition_referral' => true],
            'needs_referral' => false,
            'diagnoses' => [$this->card('c1', 'managed_at_bhc', 'Wound')],
            'referral' => [
                'rural_health_unit_id' => $this->rhu->id,
                'urgency_level' => 'Routine',
                'reason_for_referral' => 'Leftover form data',
            ],
        ])->assertCreated()->json('data.id');
        $this->assertSame(0, Referral::where('health_record_id', $id)->count());
        $this->assertFalse((bool) HealthRecord::findOrFail($id)->needs_referral);
    }

    public function test_changing_a_card_to_managed_local_care_does_not_keep_the_referral(): void
    {
        $this->seedAvailableProvider($this->rhu, 'Managed After Refer Doctor');
        $card = $this->card('c1', 'managed_at_bhc', 'Wound');
        $id = $this->v2([
            'care_plan' => ['condition_cards' => true, 'shared_condition_referral' => true, 'refer_to_rhu' => false],
            'needs_referral' => false,
            'diagnoses' => [$card],
            'referral' => [
                'rural_health_unit_id' => $this->rhu->id,
                'urgency_level' => 'Priority',
                'reason_for_referral' => 'Was referred, then managed at BHC',
            ],
        ])->assertCreated()->json('data.id');
        $this->assertSame('managed_at_bhc', HealthRecord::findOrFail($id)->diagnoses[0]['clinicalOutcome']);
        $this->assertSame(0, Referral::where('health_record_id', $id)->count());
    }

    public function test_condition_cards_require_an_explicit_outcome(): void
    {
        $entry = $this->card('c1', 'managed_at_bhc');
        unset($entry['clinicalOutcome']);
        $this->v2(['care_plan' => ['condition_cards' => true], 'diagnoses' => [$entry]])
            ->assertUnprocessable()->assertJsonValidationErrors(['diagnoses.0.clinicalOutcome']);
        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_client_cannot_forge_condition_referral_result_links(): void
    {
        $id = $this->v2(['monitoring_data' => ['conditionReferralOutcomes' => [['entryId' => 'fake', 'referralId' => 123, 'holdId' => 456]]]])->assertCreated()->json('data.id');
        $this->assertArrayNotHasKey('conditionReferralOutcomes', HealthRecord::findOrFail($id)->monitoring_data);
    }

    public function test_managed_cards_do_not_require_a_return_schedule(): void
    {
        $payload = ['care_plan' => ['condition_cards' => true],
            'diagnoses' => [$this->card('c1', 'managed_at_bhc', 'Headache'), $this->card('c2', 'managed_at_bhc', 'Wound')],
        ];
        $id = $this->v2($payload)->assertCreated()->json('data.id');
        $this->assertSame(0, FollowUpTask::where('health_record_id', $id)->count());
        $this->assertFalse(HealthRecord::findOrFail($id)->monitoring_data['bhcFollowUp']);
        $this->assertSame('Completed', HealthRecord::findOrFail($id)->monitoring_data['followUpStatus']);
        $this->assertDatabaseCount('patient_conditions', 0);
    }

    public function test_managed_card_schedules_a_return_only_when_follow_up_is_requested(): void
    {
        $id = $this->v2([
            'care_plan' => ['condition_cards' => true, 'bhc_follow_up' => true],
            'diagnoses' => [$this->card('c1', 'managed_at_bhc', 'Wound')],
            'monitoring_data' => ['followUpDate' => $this->nextWeek(), 'followUpReason' => 'Wound reassessment'],
        ])->assertCreated()->json('data.id');
        $task = FollowUpTask::where('health_record_id', $id)->sole();
        $this->assertSame($this->nextWeek(), $task->due_date->toDateString());
        $this->assertNull($task->due_time);
        $this->assertTrue(HealthRecord::findOrFail($id)->monitoring_data['bhcFollowUp']);
    }

    public function test_new_managed_consultation_does_not_fulfill_an_unrelated_pending_follow_up(): void
    {
        $parent = HealthRecord::create([
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'barangay_health_center_id' => $this->bhc->id,
        ]);
        $pending = FollowUpTask::create([
            'health_record_id' => $parent->id,
            'patient_id' => $this->patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'due_date' => now()->addDays(3)->toDateString(),
            'state' => FollowUpTask::STATE_PENDING,
            'purpose' => 'Prenatal follow-up',
            'purpose_key' => 'service:maternal',
        ]);

        $this->v2([
            'care_plan' => ['condition_cards' => true],
            'diagnoses' => [$this->card('c1', 'managed_at_bhc', 'Wound')],
        ])->assertCreated();

        $this->assertSame(FollowUpTask::STATE_PENDING, $pending->fresh()->state);
        $this->assertNull($pending->fresh()->fulfilled_at);
        $this->assertSame(1, FollowUpTask::where('state', FollowUpTask::STATE_PENDING)->count());
    }

    public function test_one_consultation_can_schedule_independent_returns(): void
    {
        $id = $this->v2([
            'care_plan' => ['condition_cards' => true],
            'diagnoses' => [$this->card('c1', 'managed_at_bhc', 'Headache'), $this->card('c2', 'managed_at_bhc', 'Wound')],
            'monitoring_data' => ['followUpSchedules' => [
                ['purposeKey' => 'entry:c1', 'purpose' => 'Headache review', 'date' => $this->nextWeek(), 'sourceEntryId' => 'c1'],
                ['purposeKey' => 'entry:c2', 'purpose' => 'Wound reassessment', 'date' => now()->addDays(4)->toDateString(), 'time' => '09:30', 'sourceEntryId' => 'c2'],
            ]],
        ])->assertCreated()->json('data.id');
        $tasks = FollowUpTask::where('health_record_id', $id)->whereNull('rescheduled_to_id')->orderBy('due_date')->get();
        $this->assertCount(2, $tasks);
        $this->assertSame('Wound reassessment', $tasks[0]->purpose);
        $this->assertSame('entry:c2', $tasks[0]->purpose_key);
        $this->assertSame('Headache review', $tasks[1]->purpose);
        $this->assertTrue(HealthRecord::findOrFail($id)->monitoring_data['bhcFollowUp']);
    }

    public function test_condition_referrals_are_created_separately_and_retries_do_not_duplicate(): void
    {
        $this->seedAvailableProvider($this->rhu, 'Card Doctor');
        $cards = [$this->card('c1', 'refer_to_rhu', 'Suspected hypertension'), $this->card('c2', 'refer_to_rhu', 'Persistent cough')];
        $cards[1]['referral']['urgencyLevel'] = 'Priority';
        $key = (string) Str::uuid();
        $payload = ['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'chief_complaint' => 'Multiple concerns', 'consultation_workflow' => HealthRecord::WORKFLOW_BHC_GENERAL_V2, 'care_plan' => ['condition_cards' => true], 'needs_referral' => true, 'diagnoses' => $cards];
        $response = $this->withHeader('Idempotency-Key', $key)->postJson('/api/health-records', $payload)->assertCreated();
        $id = $response->json('data.id');
        $this->assertSame(2, Referral::where('health_record_id', $id)->count());
        $this->assertDatabaseHas('referrals', ['health_record_id' => $id, 'initial_diagnosis' => 'Persistent cough', 'urgency_level' => 'Priority', 'reason_for_referral' => 'Assessment for Persistent cough']);
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/health-records', $payload)->assertOk()->assertJsonPath('idempotent_replay', true);
        $this->assertDatabaseCount('referrals', 2);
        $this->assertDatabaseCount('follow_up_tasks', 0);
    }

    public function test_unavailable_condition_referrals_keep_distinct_hold_details(): void
    {
        $id = $this->v2(['care_plan' => ['condition_cards' => true], 'needs_referral' => true,
            'diagnoses' => [$this->card('c1', 'refer_to_rhu', 'Concern one'), $this->card('c2', 'refer_to_rhu', 'Concern two')],
        ])->assertCreated()->json('data.id');
        $outcomes = HealthRecord::findOrFail($id)->monitoring_data['conditionReferralOutcomes'];
        $this->assertCount(2, $outcomes);
        $this->assertNotSame($outcomes[0]['holdId'], $outcomes[1]['holdId']);
        $this->assertSame('Concern two', $outcomes[1]['pendingReferral']['initial_diagnosis']);
        $this->assertDatabaseCount('referrals', 0);
        $this->assertDatabaseCount('referral_holds', 2);
    }

    public function test_each_condition_referral_requires_its_own_details(): void
    {
        $card = $this->card('c1', 'refer_to_rhu');
        $card['referral'] = [];
        $this->v2(['care_plan' => ['condition_cards' => true], 'needs_referral' => true, 'diagnoses' => [$card]])
            ->assertUnprocessable()->assertJsonValidationErrors(['diagnoses.0.referral.urgencyLevel', 'diagnoses.0.referral.receivingRhuId', 'diagnoses.0.referral.reasonForReferral']);
        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_managed_and_referred_cards_do_not_force_a_follow_up(): void
    {
        $id = $this->v2(['care_plan' => ['condition_cards' => true], 'needs_referral' => true,
            'diagnoses' => [$this->card('c1', 'managed_at_bhc', 'Wound'), $this->card('c2', 'refer_to_rhu', 'Suspected hypertension')],
        ])->assertCreated()->json('data.id');
        $this->assertSame(0, FollowUpTask::where('health_record_id', $id)->count());
        $this->assertFalse(HealthRecord::findOrFail($id)->monitoring_data['bhcFollowUp']);
        $this->assertDatabaseCount('referral_holds', 1);
        $this->assertDatabaseCount('patient_conditions', 0);
    }

    public function test_mixed_condition_outcomes_keep_independent_return_and_referral(): void
    {
        $id = $this->v2(['care_plan' => ['condition_cards' => true], 'needs_referral' => true,
            'diagnoses' => [$this->card('c1', 'managed_at_bhc', 'Wound'), $this->card('c2', 'refer_to_rhu', 'Suspected hypertension')],
            'monitoring_data' => ['followUpSchedules' => [
                ['purposeKey' => 'entry:c1', 'purpose' => 'Wound reassessment', 'date' => $this->nextWeek(), 'time' => '10:00', 'sourceEntryId' => 'c1'],
            ]],
        ])->assertCreated()->json('data.id');
        $this->assertSame(1, FollowUpTask::where('health_record_id', $id)->count());
        $this->assertSame('Wound reassessment', FollowUpTask::where('health_record_id', $id)->value('purpose'));
        $this->assertSame($this->nextWeek(), HealthRecord::findOrFail($id)->monitoring_data['followUpDate']);
        $this->assertDatabaseCount('referral_holds', 1);
        $this->assertDatabaseCount('patient_conditions', 0);
    }

    public function test_resuming_one_condition_hold_preserves_the_other_pending_condition(): void
    {
        $id = $this->v2(['care_plan' => ['condition_cards' => true], 'needs_referral' => true,
            'diagnoses' => [$this->card('c1', 'refer_to_rhu', 'Concern one'), $this->card('c2', 'refer_to_rhu', 'Concern two')],
        ])->assertCreated()->json('data.id');
        $outcomes = HealthRecord::findOrFail($id)->monitoring_data['conditionReferralOutcomes'];
        $this->seedAvailableProvider($this->rhu, 'Available Card Doctor');
        $this->postJson('/api/referrals', ['patient_id' => $this->patient->id, 'health_record_id' => $id, 'resume_hold_id' => $outcomes[1]['holdId'], 'rural_health_unit_id' => $this->rhu->id, 'urgency_level' => 'Routine', 'reason_for_referral' => 'Assessment for Concern two'])->assertCreated();
        $updated = HealthRecord::findOrFail($id)->monitoring_data['conditionReferralOutcomes'];
        $this->assertSame($outcomes[0]['holdId'], $updated[0]['holdId']);
        $this->assertArrayNotHasKey('holdId', $updated[1]);
        $this->assertArrayHasKey('referralId', $updated[1]);
    }

    public function test_condition_referral_routing_failure_rolls_back_the_whole_consultation(): void
    {
        $otherRhu = RuralHealthUnit::create(['name' => 'Unmapped card RHU', 'status' => 'active']);
        $cards = [$this->card('c1', 'refer_to_rhu', 'First concern'), $this->card('c2', 'refer_to_rhu', 'Second concern')];
        $cards[1]['referral']['receivingRhuId'] = $otherRhu->id;
        $response = $this->v2(['care_plan' => ['condition_cards' => true], 'needs_referral' => true, 'diagnoses' => $cards]);
        $this->assertContains($response->status(), [403, 422]);
        $this->assertDatabaseCount('health_records', 0);
        $this->assertDatabaseCount('referrals', 0);
        $this->assertDatabaseCount('referral_holds', 0);
    }

    private function followedHypertension(): ConditionMonitoring
    {
        $record = HealthRecord::create(['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'barangay_health_center_id' => $this->bhc->id]);
        $condition = PatientCondition::create(['patient_id' => $this->patient->id, 'condition_name' => 'Hypertension', 'condition_identity' => 'hypertension', 'status' => 'active', 'confirmed_at' => now(), 'source_type' => PatientCondition::SOURCE_RHU_RECORD, 'source_id' => 1]);
        $monitoring = ConditionMonitoring::create(['patient_id' => $this->patient->id, 'patient_condition_id' => $condition->id, 'barangay_health_center_id' => $this->bhc->id, 'condition_key' => 'hypertension', 'condition_name' => 'Hypertension', 'condition_identity' => 'hypertension', 'status' => 'active', 'started_health_record_id' => $record->id, 'started_at' => now()->subWeek()]);
        $monitoring->visits()->create(['health_record_id' => $record->id, 'action' => 'started', 'referred' => false, 'created_at' => now()]);

        return $monitoring;
    }

    /** Guard: passes before the change too (unknown keys are ignored); kept as a regression guard. */
    public function test_v2_without_actions_or_reporting_saves(): void
    {
        $this->v2()->assertCreated();
    }

    public function test_rhu_user_cannot_send_v2(): void
    {
        $rhuUser = User::create(['name' => 'V2 RHU Staff', 'email' => 'v2rhu@example.test', 'password' => 'password123', 'role' => User::ROLE_RHU, 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id, 'permissions' => [...StaffRoles::defaults('midwife'), 'rhu.manage', 'conditions.confirm']]);
        Sanctum::actingAs($rhuUser, ['akay:access']);

        $this->v2()->assertUnprocessable()->assertJsonValidationErrors(['consultation_workflow']);
        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_v2_rejects_diagnosis_text(): void
    {
        $this->v2(['diagnosis' => 'Suspected dengue'])->assertUnprocessable()->assertJsonValidationErrors(['diagnosis']);
    }

    #[DataProvider('prohibitedEntryKeys')]
    public function test_v2_rejects_condition_and_care_plan_keys_on_entries(string $key, mixed $value): void
    {
        $this->v2(['diagnoses' => [['name' => 'Cough', 'reportIn' => ['morbidity'], $key => $value]]])
            ->assertUnprocessable()->assertJsonValidationErrors(["diagnoses.0.$key"]);
    }

    public static function prohibitedEntryKeys(): array
    {
        return [
            'carePlan' => ['carePlan', 'follow_up'],
            'bhcFollowUp' => ['bhcFollowUp', true],
            'addToConditions' => ['addToConditions', false],
            'conditionStatus' => ['conditionStatus', 'active'],
            'conditionKey' => ['conditionKey', 'hypertension'],
        ];
    }

    public function test_v2_entry_requires_a_destination(): void
    {
        $this->v2(['diagnoses' => [['name' => 'Cough', 'reportIn' => []]]])
            ->assertUnprocessable()->assertJsonValidationErrors(['diagnoses.0.reportIn']);
    }

    public function test_v2_rejects_unknown_destination(): void
    {
        $this->v2(['diagnoses' => [['name' => 'Cough', 'reportIn' => ['bogus']]]])
            ->assertUnprocessable()->assertJsonValidationErrors(['diagnoses.0.reportIn.0']);
    }

    public function test_v2_accepts_every_known_destination(): void
    {
        $this->v2(['diagnoses' => [['name' => 'Cough', 'reportIn' => ReportingEntries::DESTINATIONS]]])->assertCreated();
    }

    public function test_v2_two_entries_may_share_a_report(): void
    {
        $this->v2(['diagnoses' => [
            ['name' => 'Cough', 'reportIn' => ['morbidity']],
            ['name' => 'Fever', 'reportIn' => ['morbidity']],
        ]])->assertCreated();
    }

    public function test_v2_rejects_duplicate_destination_within_an_entry(): void
    {
        $this->v2(['diagnoses' => [['name' => 'Cough', 'reportIn' => ['morbidity', 'morbidity']]]])
            ->assertUnprocessable()->assertJsonValidationErrors(['diagnoses.0.reportIn']);
    }

    public function test_v2_non_string_entry_name_is_a_validation_error_not_a_500(): void
    {
        $this->v2(['diagnoses' => [['name' => ['x'], 'reportIn' => ['morbidity']]]])
            ->assertUnprocessable()->assertJsonValidationErrors(['diagnoses.0.name']);
    }

    public function test_admin_without_bhc_facility_cannot_send_v2(): void
    {
        $admin = User::create(['name' => 'V2 Admin', 'email' => 'v2admin@example.test', 'password' => 'password123', 'role' => User::ROLE_ADMIN, 'status' => 'active', 'permissions' => StaffRoles::defaults('midwife')]);
        Sanctum::actingAs($admin, ['akay:access']);

        $this->v2()->assertUnprocessable()->assertJsonValidationErrors(['consultation_workflow']);
        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_v2_rejects_duplicate_entry_names(): void
    {
        $this->v2(['diagnoses' => [
            ['name' => 'Suspected dengue', 'reportIn' => ['morbidity']],
            ['name' => ' suspected DENGUE', 'reportIn' => ['surveillance']],
        ]])->assertUnprocessable()->assertJsonValidationErrors(['diagnoses.1.name']);
    }

    public function test_v2_keys_are_prohibited_on_legacy_payloads(): void
    {
        $base = ['patient_id' => $this->patient->id, 'category' => 'General Consultation', 'chief_complaint' => 'Routine visit'];
        foreach ([
            'care_plan.bhc_follow_up' => ['care_plan' => ['bhc_follow_up' => true]],
            'care_plan.refer_to_rhu' => ['care_plan' => ['refer_to_rhu' => true]],
            'care_plan.referral_multiple_issues' => ['care_plan' => ['referral_multiple_issues' => true]],
            'diagnoses.0.reportIn' => ['diagnoses' => [['name' => 'Cough', 'reportIn' => ['morbidity']]]],
        ] as $key => $extra) {
            $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [...$base, ...$extra])
                ->assertUnprocessable()->assertJsonValidationErrors([$key]);
        }
        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_v2_follow_up_requires_date(): void
    {
        $this->v2(['care_plan' => ['bhc_follow_up' => true], 'monitoring_data' => ['followUpReason' => 'Recheck cough']])
            ->assertUnprocessable()->assertJsonValidationErrors(['monitoring_data.followUpDate']);
    }

    public function test_v2_follow_up_requires_reason_for_general_consultation(): void
    {
        $this->v2(['care_plan' => ['bhc_follow_up' => true], 'monitoring_data' => ['followUpDate' => $this->nextWeek()]])
            ->assertUnprocessable()->assertJsonValidationErrors(['monitoring_data.followUpReason']);
    }

    public function test_v2_service_only_follow_up_reason_exempt_but_date_required(): void
    {
        $maternal = [
            'selectedPrograms' => ['Maternal'],
            'primaryProgram' => 'Maternal',
            'prenatalIntent' => 'enroll',
        ];
        $this->v2([
            'category' => 'Maternal',
            'maternal_data' => ['lmp' => '2026-03-01'],
            'care_plan' => ['bhc_follow_up' => true],
            'monitoring_data' => [...$maternal, 'followUpDate' => $this->nextWeek()],
        ])->assertCreated();
        $this->v2([
            'category' => 'Maternal',
            'maternal_data' => ['lmp' => '2026-03-01'],
            'care_plan' => ['bhc_follow_up' => true],
            'monitoring_data' => $maternal,
        ])->assertUnprocessable()->assertJsonValidationErrors(['monitoring_data.followUpDate']);
    }

    public function test_v2_refer_requires_referral(): void
    {
        $this->v2(['care_plan' => ['refer_to_rhu' => true]])
            ->assertUnprocessable()->assertJsonValidationErrors(['needs_referral']);
    }

    public function test_v2_referral_requires_reason(): void
    {
        $this->v2(['care_plan' => ['refer_to_rhu' => true], 'needs_referral' => true])
            ->assertUnprocessable()->assertJsonValidationErrors(['referral.reason_for_referral']);
    }

    public function test_v2_referral_without_purpose_rejected(): void
    {
        $this->v2($this->referral())
            ->assertUnprocessable()->assertJsonValidationErrors(['care_plan.refer_to_rhu']);
    }

    public function test_v2_refer_to_rhu_with_referral_saves(): void
    {
        $this->v2(['care_plan' => ['refer_to_rhu' => true], ...$this->referral()])->assertCreated();
    }

    public function test_v2_stale_multiple_issues_flag_does_not_require_acknowledgment(): void
    {
        $this->v2(['care_plan' => ['refer_to_rhu' => true, 'referral_multiple_issues' => true], ...$this->referral()])
            ->assertCreated();
    }

    public function test_v2_concern_and_service_referral_require_acknowledgment(): void
    {
        $payload = [
            'category' => 'Maternal',
            'diagnoses' => [['id' => 'c1', 'name' => 'Cough', 'reportIn' => ['morbidity'], 'clinicalOutcome' => 'refer_to_rhu']],
            'care_plan' => [
                'condition_cards' => true,
                'shared_condition_referral' => true,
                'refer_to_rhu' => true,
                'service_referrals' => ['Maternal'],
            ],
            'monitoring_data' => [
                'selectedPrograms' => ['Maternal'],
                'primaryProgram' => 'Maternal',
                'prenatalIntent' => 'enroll',
            ],
            'maternal_data' => ['lmp' => '2026-03-01'],
            'needs_referral' => true,
            'referral' => [
                'rural_health_unit_id' => $this->rhu->id,
                'reason_for_referral' => 'Further assessment',
                'urgency_level' => 'Routine',
            ],
        ];
        $this->v2($payload)->assertUnprocessable()->assertJsonValidationErrors(['care_plan.shared_referral_acknowledged']);
        $payload['care_plan']['shared_referral_acknowledged'] = true;
        $this->v2($payload)->assertCreated();
    }

    public function test_v2_single_service_referral_does_not_require_acknowledgment(): void
    {
        $this->v2([
            'category' => 'Maternal',
            'care_plan' => [
                'condition_cards' => true,
                'shared_condition_referral' => true,
                'refer_to_rhu' => true,
                'service_referrals' => ['Maternal'],
            ],
            'monitoring_data' => [
                'selectedPrograms' => ['Maternal'],
                'primaryProgram' => 'Maternal',
                'prenatalIntent' => 'enroll',
            ],
            'maternal_data' => ['lmp' => '2026-03-01'],
            'needs_referral' => true,
            'referral' => [
                'rural_health_unit_id' => $this->rhu->id,
                'reason_for_referral' => 'Further assessment',
                'urgency_level' => 'Routine',
            ],
        ])->assertCreated();
    }

    public function test_v2_general_referral_plus_monitoring_referral_requires_acknowledgment(): void
    {
        $monitoring = $this->followedHypertension();
        $carePlan = ['refer_to_rhu' => true, 'continued_monitoring_ids' => [$monitoring->id], 'monitoring_referrals' => [$monitoring->id]];
        $this->v2(['care_plan' => $carePlan, ...$this->referral()])
            ->assertUnprocessable()->assertJsonValidationErrors(['care_plan.shared_referral_acknowledged']);
        $this->v2(['care_plan' => [...$carePlan, 'shared_referral_acknowledged' => true], ...$this->referral()])
            ->assertCreated();
    }

    public function test_v2_monitoring_referral_alone_is_a_valid_referral_purpose(): void
    {
        $monitoring = $this->followedHypertension();
        $this->v2(['care_plan' => ['continued_monitoring_ids' => [$monitoring->id], 'monitoring_referrals' => [$monitoring->id]], ...$this->referral()])
            ->assertCreated();
    }

    public function test_v2_skips_assessment_rule(): void
    {
        $this->v2([
            'care_plan' => ['bhc_follow_up' => true],
            'monitoring_data' => ['followUpDate' => $this->nextWeek(), 'followUpReason' => 'Recheck cough'],
        ])->assertCreated();
    }

    // --- Task 3: v2 save path (controller) ---

    private function followUp(array $monitoringData = []): array
    {
        return [
            'care_plan' => ['bhc_follow_up' => true],
            'monitoring_data' => ['followUpDate' => $this->nextWeek(), 'followUpTime' => '09:30', 'followUpReason' => 'Recheck cough', ...$monitoringData],
        ];
    }

    public function test_v2_stores_workflow_and_empty_diagnosis(): void
    {
        $response = $this->v2(['diagnoses' => [['id' => 'e1', 'name' => 'Cough', 'reportIn' => ['morbidity']]]])->assertCreated();

        $this->assertSame(HealthRecord::WORKFLOW_BHC_GENERAL_V2, $response->json('data.monitoring_data.consultationWorkflow'));
        $this->assertNull($response->json('data.diagnosis'));
        $this->assertTrue(HealthRecord::findOrFail($response->json('data.id'))->isBhcGeneralV2());
    }

    public function test_v2_reporting_entry_persists_both_reports_once(): void
    {
        $id = $this->v2(['diagnoses' => [[
            'id' => 'e1', 'name' => 'Suspected dengue', 'reportIn' => ['morbidity', 'notifiable', 'surveillance'],
        ]]])->assertCreated()->json('data.id');

        $record = HealthRecord::findOrFail($id);
        $this->assertCount(1, $record->diagnoses);
        $entry = $record->diagnoses[0];
        $this->assertSame(['morbidity', 'notifiable', 'surveillance'], $entry['reportIn']);
        $this->assertSame('notifiable', $entry['reportAs']);
        $this->assertTrue($entry['includeInSurveillance']);
        $this->assertSame('notifiable', $record->monitoring_data['morbidityReportingStatus']);
    }

    public function test_v2_reporting_never_creates_conditions(): void
    {
        $id = $this->v2(['diagnoses' => [['id' => 'e1', 'name' => 'Tuberculosis', 'reportIn' => ['notifiable']]]])
            ->assertCreated()->json('data.id');

        $this->assertDatabaseCount('patient_conditions', 0);
        $this->assertDatabaseCount('patient_condition_events', 0);
        $entry = HealthRecord::findOrFail($id)->diagnoses[0];
        $this->assertSame('Tuberculosis', $entry['name']);
        $this->assertArrayHasKey('conditionKey', $entry);
        $this->assertNull($entry['conditionKey']);
    }

    public function test_v2_reporting_name_is_not_renamed(): void
    {
        $id = $this->v2(['diagnoses' => [['id' => 'e1', 'name' => 'PTB', 'reportIn' => ['notifiable']]]])
            ->assertCreated()->json('data.id');

        $entry = HealthRecord::findOrFail($id)->diagnoses[0];
        $this->assertSame('PTB', $entry['name']);
        $this->assertNull($entry['conditionKey']);
    }

    public function test_v2_follow_up_only_creates_task_without_condition(): void
    {
        $id = $this->v2($this->followUp())->assertCreated()->json('data.id');

        $task = FollowUpTask::where('health_record_id', $id)->sole();
        $this->assertSame(FollowUpTask::STATE_PENDING, $task->state);
        $this->assertSame($this->nextWeek(), $task->due_date->toDateString());
        $this->assertSame((int) $this->patient->id, (int) $task->patient_id);
        $record = HealthRecord::findOrFail($id);
        $this->assertTrue($record->monitoring_data['bhcFollowUp']);
        $this->assertSame('Follow-up Required', $record->monitoring_data['followUpStatus']);
        $this->assertSame('Follow-up Required', $record->monitoring_data['follow_up_status']);
        $this->assertDatabaseCount('condition_monitorings', 0);
        $this->assertDatabaseCount('patient_conditions', 0);
    }

    public function test_v2_follow_up_status_is_server_derived(): void
    {
        // R-a: the client's followUpStatus is never trusted in v2. Without the
        // checkbox, a "Follow-up Required" status and its fields are cleared.
        $id = $this->v2(['monitoring_data' => [
            'followUpStatus' => 'Follow-up Required', 'followUpDate' => $this->nextWeek(), 'followUpTime' => '09:30', 'followUpReason' => 'Stale',
            'bhcFollowUp' => true,
        ]])->assertCreated()->json('data.id');

        $monitoringData = HealthRecord::findOrFail($id)->monitoring_data;
        $this->assertFalse($monitoringData['bhcFollowUp']);
        $this->assertSame('Completed', $monitoringData['followUpStatus']);
        $this->assertSame('Completed', $monitoringData['follow_up_status']);
        foreach (['followUpDate', 'follow_up_date', 'followUpTime', 'follow_up_time', 'followUpReason', 'follow_up_reason'] as $key) {
            $this->assertArrayHasKey($key, $monitoringData);
            $this->assertNull($monitoringData[$key], $key);
        }
        $this->assertFalse(FollowUpTask::where('health_record_id', $id)->exists());
    }

    public function test_v2_referral_only_has_no_follow_up_task(): void
    {
        $id = $this->v2([
            'care_plan' => ['refer_to_rhu' => true],
            'monitoring_data' => ['followUpStatus' => 'Follow-up Required', 'followUpDate' => $this->nextWeek()],
            ...$this->referral(),
        ])->assertCreated()->json('data.id');

        // Same assertion as CarePlanReferralFollowUpTest::test_refer_without_monitoring_still_drops_the_follow_up.
        $this->assertFalse(FollowUpTask::where('health_record_id', $id)->whereIn('state', FollowUpTask::ACTIVE_STATES)->exists());
        $monitoringData = HealthRecord::findOrFail($id)->monitoring_data;
        $this->assertSame('Needs Referral', $monitoringData['followUpStatus']);
        $this->assertFalse($monitoringData['bhcFollowUp']);
        $this->assertNull($monitoringData['followUpDate']);
    }

    public function test_v2_follow_up_and_referral_keep_the_follow_up(): void
    {
        $followUp = $this->followUp();
        $id = $this->v2([
            ...$followUp,
            'care_plan' => [...$followUp['care_plan'], 'refer_to_rhu' => true],
            ...$this->referral(),
        ])->assertCreated()->json('data.id');

        $record = HealthRecord::findOrFail($id);
        $this->assertSame($this->nextWeek(), $record->monitoring_data['followUpDate']);
        $this->assertSame('Needs Referral', $record->monitoring_data['followUpStatus']);
        $this->assertTrue($record->monitoring_data['bhcFollowUp']);
        $this->assertSame(FollowUpTask::STATE_PENDING, FollowUpTask::where('health_record_id', $id)->sole()->state);

        // The background re-sync reads the same stored flag and keeps the task.
        app(FollowUpTaskSyncService::class)->syncEligibleRecordsForUser($this->worker);

        $this->assertTrue(FollowUpTask::where('health_record_id', $id)->whereIn('state', FollowUpTask::ACTIVE_STATES)->exists());
    }

    public function test_v2_epi_next_dose_without_follow_up_creates_no_task(): void
    {
        $nextDose = now()->addWeeks(4)->toDateString();
        $id = $this->v2([
            'category' => 'Immunization',
            'chief_complaint' => 'Vaccination Visit',
            'monitoring_data' => [
                'selectedPrograms' => ['EPI'],
                'primaryProgram' => 'EPI',
                // What the legacy flow copied from the next dose; v2 ignores it
                // unless Schedule BHC Follow-up is ticked.
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => $nextDose,
            ],
            'immunization_data' => ['vaccineEntries' => [['vaccineName' => 'Pentavalent', 'doseNumber' => 1, 'nextScheduleDate' => $nextDose]]],
        ])->assertCreated()->json('data.id');

        $record = HealthRecord::findOrFail($id);
        $this->assertFalse(FollowUpTask::where('health_record_id', $id)->exists());
        $this->assertNull($record->monitoring_data['followUpDate']);
        $this->assertSame($nextDose, $record->immunization_data['vaccineEntries'][0]['nextScheduleDate'], 'the next dose stays in the service record');
    }

    public function test_v2_bhc_follow_up_does_not_touch_monitoring(): void
    {
        Carbon::setTestNow(now()->startOfMinute());
        try {
            $monitoring = $this->followedHypertension();
            $carePlan = ['continued_monitoring_ids' => [$monitoring->id]];

            // Baseline: the same payload without bhc_follow_up (the legacy continuation path).
            $without = $this->v2(['care_plan' => $carePlan])->assertCreated()->json('data.id');
            $baseline = $monitoring->fresh();
            $baselineVisit = $monitoring->visits()->where('health_record_id', $without)->sole();

            // A later clock: any write to the monitoring row would move updated_at.
            Carbon::setTestNow(now()->addMinute());
            $with = $this->v2([
                'care_plan' => [...$carePlan, 'bhc_follow_up' => true],
                'monitoring_data' => ['followUpDate' => $this->nextWeek(), 'followUpTime' => '09:30'],
            ])->assertCreated()->json('data.id');

            $after = $monitoring->fresh();
            $this->assertSame($baseline->status, $after->status);
            $this->assertEquals($baseline->updated_at, $after->updated_at);
            $this->assertSame(
                collect($baseline->getAttributes())->except('updated_at')->all(),
                collect($after->getAttributes())->except('updated_at')->all()
            );
            $visit = $monitoring->visits()->where('health_record_id', $with)->sole();
            $this->assertSame($baselineVisit->action, $visit->action);
            $this->assertSame((bool) $baselineVisit->referred, (bool) $visit->referred);
            $this->assertSame(1, ConditionMonitoring::count(), 'no monitoring is started');
            $this->assertTrue(FollowUpTask::where('health_record_id', $with)->exists());
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_v2_acknowledgment_is_audited_for_named_sources(): void
    {
        $id = $this->v2($this->sharedReferral())->assertCreated()->json('data.id');

        $this->assertDatabaseHas('audit_logs', ['module' => 'referrals', 'action' => 'acknowledged']);
        $audit = AuditLog::where('module', 'referrals')->where('action', 'acknowledged')->sole();
        $this->assertStringContainsString("health record {$id}", $audit->description);
        $this->assertStringContainsString('2 items (Concern one; Concern two)', $audit->description);
        $this->assertStringNotContainsString('Worker indicated multiple health issues.', $audit->description);
        $this->assertStringEndsWith('Not a clinical compatibility check.', $audit->description);
    }

    public function test_v2_shared_referral_audit_lists_general_consultation_and_monitoring_without_note(): void
    {
        $monitoring = $this->followedHypertension();
        $this->v2([
            'care_plan' => ['refer_to_rhu' => true, 'continued_monitoring_ids' => [$monitoring->id], 'monitoring_referrals' => [$monitoring->id], 'shared_referral_acknowledged' => true],
            ...$this->referral(),
        ])->assertCreated();

        $audit = AuditLog::where('module', 'referrals')->where('action', 'acknowledged')->sole();
        $this->assertStringContainsString('2 items (General consultation; Hypertension)', $audit->description);
        $this->assertStringNotContainsString('Worker indicated multiple health issues.', $audit->description);
        $this->assertStringEndsWith('Not a clinical compatibility check.', $audit->description);
    }

    public function test_v2_multiple_issues_flag_without_referral_writes_no_audit(): void
    {
        // R-c: the note is written only when the visit actually has a referral.
        $this->v2(['care_plan' => ['referral_multiple_issues' => true, 'shared_referral_acknowledged' => true]])->assertCreated();

        $this->assertSame(0, AuditLog::where('module', 'referrals')->where('action', 'acknowledged')->count());
    }

    public function test_v2_multiple_issues_flag_counts_only_with_refer_to_rhu(): void
    {
        // The flag belongs to Refer to RHU. With only a monitoring referral
        // (count 1) it asks for no acknowledgment and writes no audit note.
        $monitoring = $this->followedHypertension();
        $this->v2([
            'care_plan' => ['continued_monitoring_ids' => [$monitoring->id], 'monitoring_referrals' => [$monitoring->id], 'referral_multiple_issues' => true],
            ...$this->referral(),
        ])->assertCreated();

        $this->assertSame(0, AuditLog::where('description', 'like', '%Worker indicated multiple health issues.%')->count());
        $this->assertSame(0, AuditLog::where('module', 'referrals')->where('action', 'acknowledged')->count());
    }

    public function test_v2_client_follow_up_status_needs_no_date_without_bhc_follow_up(): void
    {
        // The generic "status is Follow-up Required" rule never reads the
        // client's followUpStatus in v2; only care_plan.bhc_follow_up asks for a date.
        $id = $this->v2(['monitoring_data' => ['followUpStatus' => 'Follow-up Required']])
            ->assertCreated()->json('data.id');

        $this->assertSame('Completed', HealthRecord::findOrFail($id)->monitoring_data['followUpStatus']);
    }

    // --- Task 3 fix round 1: server-controlled markers, v2 mirrors ---

    private function legacy(array $extra = [])
    {
        return $this->withHeader('Idempotency-Key', (string) Str::uuid())->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'category' => 'General Consultation',
            'chief_complaint' => 'Cough for 3 days',
            ...$extra,
        ]);
    }

    public function test_legacy_payload_cannot_forge_bhc_follow_up(): void
    {
        // A legacy referral visit whose only concern is Refer to RHU hands the
        // follow-up to the RHU; a client-sent bhcFollowUp must not keep it.
        $id = $this->legacy([
            'diagnosis' => 'Pneumonia',
            'diagnoses' => [['id' => 'd1', 'name' => 'Pneumonia', 'carePlan' => 'refer']],
            ...$this->referral(),
            'monitoring_data' => [
                'followUpStatus' => 'Follow-up Required',
                'followUpDate' => $this->nextWeek(),
                'followUpReason' => 'Recheck',
                'bhcFollowUp' => true,
            ],
        ])->assertCreated()->json('data.id');

        $monitoringData = HealthRecord::findOrFail($id)->monitoring_data;
        $this->assertNull($monitoringData['followUpDate']);
        $this->assertNotTrue($monitoringData['bhcFollowUp'] ?? null);
        $this->assertArrayNotHasKey('bhcFollowUp', $monitoringData);
        $this->assertFalse(FollowUpTask::where('health_record_id', $id)->whereIn('state', FollowUpTask::ACTIVE_STATES)->exists());

        // The background re-sync cannot be fooled either.
        app(FollowUpTaskSyncService::class)->syncEligibleRecordsForUser($this->worker);
        $this->assertFalse(FollowUpTask::where('health_record_id', $id)->whereIn('state', FollowUpTask::ACTIVE_STATES)->exists());
    }

    public function test_legacy_payload_cannot_forge_v2_marker(): void
    {
        $forged = ['monitoring_data' => ['consultationWorkflow' => HealthRecord::WORKFLOW_BHC_GENERAL_V2]];

        $bhcId = $this->legacy($forged)->assertCreated()->json('data.id');
        $this->assertArrayNotHasKey('consultationWorkflow', HealthRecord::findOrFail($bhcId)->monitoring_data ?? []);
        $this->assertFalse(HealthRecord::findOrFail($bhcId)->isBhcGeneralV2());

        $rhuUser = User::create(['name' => 'V2 RHU Forger', 'email' => 'v2rhuforge@example.test', 'password' => 'password123', 'role' => User::ROLE_RHU, 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id, 'permissions' => [...StaffRoles::defaults('midwife'), 'rhu.manage', 'conditions.confirm']]);
        Sanctum::actingAs($rhuUser, ['akay:access']);

        $rhuId = $this->legacy($forged)->assertCreated()->json('data.id');
        $this->assertArrayNotHasKey('consultationWorkflow', HealthRecord::findOrFail($rhuId)->monitoring_data ?? []);
        $this->assertFalse(HealthRecord::findOrFail($rhuId)->isBhcGeneralV2());
    }

    public function test_v2_without_entries_writes_not_included_mirrors(): void
    {
        $id = $this->v2(['monitoring_data' => [
            'morbidityReportingStatus' => 'notifiable',
            'morbidity_reporting_status' => 'notifiable',
            'includeInMorbidityReport' => true,
            'include_in_morbidity_report' => true,
            'isNotifiableDisease' => true,
            'is_notifiable_disease' => true,
        ]])->assertCreated()->json('data.id');

        $monitoringData = HealthRecord::findOrFail($id)->monitoring_data;
        $this->assertSame('not_included', $monitoringData['morbidityReportingStatus']);
        $this->assertSame('not_included', $monitoringData['morbidity_reporting_status']);
        foreach (['includeInMorbidityReport', 'include_in_morbidity_report', 'isNotifiableDisease', 'is_notifiable_disease'] as $key) {
            $this->assertFalse($monitoringData[$key], $key);
        }
    }

    // --- Task 5: compatibility, authorization, idempotency ---

    public function test_legacy_refer_concern_payload_unchanged(): void
    {
        $id = $this->legacy([
            'diagnosis' => 'Pneumonia',
            'diagnoses' => [['id' => 'd1', 'name' => 'Pneumonia', 'carePlan' => 'refer']],
            ...$this->referral(),
        ])->assertCreated()->json('data.id');

        $record = HealthRecord::findOrFail($id);
        $this->assertSame('refer', $record->diagnoses[0]['carePlan']);
        $this->assertSame('Pneumonia', $record->diagnosis);
        $this->assertArrayNotHasKey('consultationWorkflow', $record->monitoring_data ?? []);
        $this->assertFalse($record->isBhcGeneralV2());
        $this->assertSame(1, Referral::count() + ReferralHold::count(), "one referral or one hold, never both or neither");
    }

    public function test_rhu_health_record_save_unaffected(): void
    {
        $rhuUser = User::create(['name' => 'V2 RHU Saver', 'email' => 'v2rhusave@example.test', 'password' => 'password123', 'role' => User::ROLE_RHU, 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id, 'permissions' => [...StaffRoles::defaults('midwife'), 'rhu.manage', 'conditions.confirm']]);

        $response = $this->actingAs($rhuUser, 'sanctum')
            ->withHeader('Idempotency-Key', (string) Str::uuid())
            ->postJson('/api/health-records', [
                'patient_id' => $this->patient->id,
                'date_recorded' => '2026-07-19 09:30:00',
                'category' => 'General Consultation',
                'chief_complaint' => 'Routine consultation',
                'diagnosis' => 'Hypertension',
            ])->assertCreated();

        $record = HealthRecord::findOrFail($response->json('data.id'));
        $this->assertFalse($record->isBhcGeneralV2());
        $this->assertArrayNotHasKey('consultationWorkflow', $record->monitoring_data ?? []);
    }

    public function test_v2_replay_with_same_idempotency_key_returns_same_record(): void
    {
        $key = (string) Str::uuid();
        $followUp = $this->followUp();
        $payload = [
            'patient_id' => $this->patient->id,
            'consultation_workflow' => HealthRecord::WORKFLOW_BHC_GENERAL_V2,
            'chief_complaint' => 'Cough for 3 days',
            'category' => 'General Consultation',
            'diagnoses' => [['id' => 'e1', 'name' => 'Cough', 'reportIn' => ['morbidity']]],
            ...$followUp,
            'care_plan' => [...$followUp['care_plan'], 'refer_to_rhu' => true],
            ...$this->referral(),
        ];

        $first = $this->withHeader('Idempotency-Key', $key)->postJson('/api/health-records', $payload)
            ->assertCreated()->assertJsonPath('idempotent_replay', false);
        $id = $first->json('data.id');

        $this->withHeader('Idempotency-Key', $key)->postJson('/api/health-records', $payload)
            ->assertOk()
            ->assertJsonPath('idempotent_replay', true)
            ->assertJsonPath('data.id', $id);

        $this->assertDatabaseCount('health_records', 1);
        $this->assertSame(1, FollowUpTask::where('health_record_id', $id)->count());
        $this->assertSame(1, Referral::count() + ReferralHold::count(), "one referral or one hold, never both or neither");
    }

    public function test_v2_dispense_requires_items_dispense(): void
    {
        $this->worker->update(['permissions' => ['patients.register', 'consultations.encode', 'clinical.history', 'consultations.finalize']]);
        $medicine = Medicine::create(['name' => 'Restricted item', 'quantity' => 6, 'availability_status' => 'Available', 'barangay_health_center_id' => $this->bhc->id, 'created_by' => $this->worker->id]);

        $this->v2(['dispensed_medicines' => [['medicine_id' => $medicine->id, 'quantity' => 1, 'confirmed_given' => true]]])
            ->assertForbidden();

        $this->assertSame(6, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('health_records', 0);
    }

    public function test_v2_follow_up_task_completes_only_on_save(): void
    {
        $parentId = $this->v2($this->followUp())->assertCreated()->json('data.id');
        $task = FollowUpTask::where('health_record_id', $parentId)->sole();
        $this->assertSame(FollowUpTask::STATE_PENDING, $task->state);

        $visit = [
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $parentId,
            'care_plan' => ['bhc_follow_up' => true],
            // The reason is missing, so the next follow-up is rejected.
            'monitoring_data' => ['followUpTaskId' => $task->id, 'followUpDate' => now()->addWeeks(2)->toDateString(), 'followUpTime' => '09:30'],
        ];
        $this->v2($visit)->assertUnprocessable()->assertJsonValidationErrors(['monitoring_data.followUpReason']);
        $this->assertSame(FollowUpTask::STATE_PENDING, $task->fresh()->state);
        $this->assertDatabaseCount('health_records', 1);

        $visit['monitoring_data']['followUpReason'] = 'Second recheck';
        $visitId = $this->v2($visit)->assertCreated()->json('data.id');

        $task->refresh();
        $this->assertSame(FollowUpTask::STATE_FULFILLED, $task->state);
        $this->assertSame($visitId, $task->fulfilled_by_health_record_id);
        $this->assertSame($task->id, HealthRecord::findOrFail($visitId)->monitoring_data['followUpTaskId']);
        $this->assertSame(1, FollowUpTask::where('health_record_id', $visitId)->count(), 'the next follow-up is scheduled');
    }

    public function test_v2_follow_up_visit_without_next_follow_up_keeps_task_link_and_completes_it(): void
    {
        $parentId = $this->v2($this->followUp())->assertCreated()->json('data.id');
        $task = FollowUpTask::where('health_record_id', $parentId)->sole();

        $visitId = $this->v2([
            'visit_type' => 'follow_up_visit',
            'parent_health_record_id' => $parentId,
            'monitoring_data' => ['followUpTaskId' => $task->id],
        ])->assertCreated()->json('data.id');

        $this->assertSame(FollowUpTask::STATE_FULFILLED, $task->fresh()->state);
        $this->assertSame($task->id, HealthRecord::findOrFail($visitId)->monitoring_data['followUpTaskId']);
        $this->assertSame('Completed', HealthRecord::findOrFail($visitId)->monitoring_data['followUpStatus']);
        $this->assertFalse(FollowUpTask::where('health_record_id', $visitId)->exists());
    }

    public function test_v2_draft_finalize_consumes_draft(): void
    {
        $draftId = $this->postJson('/api/health-record-drafts', [
            'patient_id' => $this->patient->id,
            'classification' => 'General Consultation',
            'payload' => [
                'consultationWorkflow' => HealthRecord::WORKFLOW_BHC_GENERAL_V2,
                'chiefComplaint' => 'Draft complaint.',
                'diagnoses' => [['id' => 'e1', 'name' => 'Cough', 'reportIn' => ['morbidity']]],
                'carePlan' => ['bhcFollowUp' => true],
            ],
        ])->assertCreated()->json('data.id');
        $version = (string) HealthRecordDraft::where('public_id', $draftId)->value('version');

        $response = $this->withHeaders([
            'Idempotency-Key' => (string) Str::uuid(),
            'X-Health-Record-Draft-ID' => $draftId,
            'X-Draft-Version' => $version,
        ])->postJson('/api/health-records', [
            'patient_id' => $this->patient->id,
            'consultation_workflow' => HealthRecord::WORKFLOW_BHC_GENERAL_V2,
            'category' => 'General Consultation',
            'chief_complaint' => 'Draft complaint.',
            'diagnoses' => [['id' => 'e1', 'name' => 'Cough', 'reportIn' => ['morbidity']]],
            ...$this->followUp(),
        ])->assertCreated();

        $id = $response->json('data.id');
        $this->assertTrue(HealthRecord::findOrFail($id)->isBhcGeneralV2());
        $this->assertDatabaseHas('health_record_drafts', [
            'public_id' => $draftId,
            'status' => HealthRecordDraft::STATUS_CONSUMED,
            'consumed_health_record_id' => $id,
            'encrypted_payload' => null,
        ]);
    }
}
