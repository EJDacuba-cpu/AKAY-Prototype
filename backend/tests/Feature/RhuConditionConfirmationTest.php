<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Feedback;
use App\Models\HealthRecord;
use App\Models\Patient;
use App\Models\PatientCondition;
use App\Models\Referral;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use App\Services\StaffRoles;
use Tests\TestCase;

class RhuConditionConfirmationTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    private User $rhuUser;

    private Patient $patient;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Confirm RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Confirm BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $this->rhuUser = $this->user('rhu@example.test', [
            'role' => User::ROLE_RHU,
            'rural_health_unit_id' => $this->rhu->id,
            'permissions' => [...StaffRoles::defaults('midwife'), 'rhu.manage', 'conditions.confirm'],
        ]);
        $this->patient = Patient::create([
            'first_name' => 'Confirm', 'last_name' => 'Patient', 'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id, 'rural_health_unit_id' => $this->rhu->id,
        ]);
    }

    private function user(string $email, array $attributes): User
    {
        return User::create([...['name' => $email, 'email' => $email, 'password' => bcrypt('test-password'), 'status' => User::STATUS_ACTIVE], ...$attributes]);
    }

    private function referral(string $status): Referral
    {
        return Referral::create([
            'tracking_id' => 'AKAY-CONFIRM-'.Str::random(6),
            'qr_code_value' => 'AKAY:CONFIRM:'.Str::random(6),
            'patient_id' => $this->patient->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'created_by' => $this->rhuUser->id,
            'reason_for_referral' => 'Confirmation test.',
            'referral_datetime' => now()->addDay(),
            'status' => $status,
        ]);
    }

    private function feedbackPayload(Referral $referral, array $overrides = []): array
    {
        return [
            'referral_id' => $referral->id,
            'rhu_diagnosis' => 'Hypertension',
            ...$overrides,
        ];
    }

    private function recordPost(User $user, array $overrides = [], array $headers = [])
    {
        return $this->actingAs($user, 'sanctum')
            ->withHeaders(['Idempotency-Key' => (string) Str::uuid(), ...$headers])
            ->postJson('/api/health-records', [
                'patient_id' => $this->patient->id,
                'date_recorded' => '2026-07-19 09:30:00',
                'category' => 'General Consultation',
                'chief_complaint' => 'Routine consultation',
                ...$overrides,
            ]);
    }

    public function test_feedback_with_a_confirmation_writes_the_condition_and_event(): void
    {
        $referral = $this->referral(Referral::STATUS_RECEIVED);

        $response = $this->actingAs($this->rhuUser, 'sanctum')
            ->postJson('/api/feedback', $this->feedbackPayload($referral, [
                'condition_confirmations' => [['name' => 'Hypertension', 'status' => 'active']],
            ]))
            ->assertCreated();

        $feedbackId = $response->json('data.id');
        $condition = PatientCondition::where('patient_id', $this->patient->id)->sole();
        $this->assertSame('Hypertension', $condition->condition_name);
        $this->assertSame('active', $condition->status);
        $this->assertSame('rhu_feedback', $condition->source_type);
        $this->assertSame($feedbackId, $condition->source_id);
        $this->assertSame(1, $condition->events()->count());
        $this->assertSame(Referral::STATUS_COMPLETED, $referral->fresh()->status);
    }

    public function test_feedback_without_confirmations_writes_no_condition(): void
    {
        $referral = $this->referral(Referral::STATUS_RECEIVED);

        $this->actingAs($this->rhuUser, 'sanctum')
            ->postJson('/api/feedback', $this->feedbackPayload($referral))
            ->assertCreated();

        $this->assertSame(0, PatientCondition::count());
    }

    public function test_a_rejected_feedback_writes_no_condition(): void
    {
        $referral = $this->referral(Referral::STATUS_PENDING);

        $this->actingAs($this->rhuUser, 'sanctum')
            ->postJson('/api/feedback', $this->feedbackPayload($referral, [
                'condition_confirmations' => [['name' => 'Hypertension', 'status' => 'active']],
            ]))
            ->assertConflict();

        $this->assertSame(0, PatientCondition::count());
        $this->assertSame(0, Feedback::count());
    }

    public function test_an_rhu_record_with_a_confirmation_writes_the_condition(): void
    {
        $response = $this->recordPost($this->rhuUser, [
            'condition_confirmations' => [['name' => 'Diabetes Mellitus', 'status' => 'under_evaluation', 'note' => 'Awaiting labs']],
        ])->assertCreated();

        $record = HealthRecord::findOrFail($response->json('data.id'));
        $condition = PatientCondition::where('patient_id', $this->patient->id)->sole();
        $this->assertSame('Diabetes Mellitus', $condition->condition_name);
        $this->assertSame('under_evaluation', $condition->status);
        $this->assertSame('rhu_record', $condition->source_type);
        $this->assertSame($record->id, $condition->source_id);
    }

    public function test_a_bhc_user_sending_confirmations_is_forbidden_and_nothing_saves(): void
    {
        $bhw = $this->user('bhw@example.test', [
            'role' => User::ROLE_BHC,
            'barangay_health_center_id' => $this->bhc->id,
            'permissions' => StaffRoles::defaults('midwife'),
        ]);

        $this->recordPost($bhw, [
            'condition_confirmations' => [['name' => 'Hypertension', 'status' => 'active']],
        ])->assertForbidden();

        $this->assertSame(0, HealthRecord::count());
        $this->assertSame(0, PatientCondition::count());
    }

    public function test_an_rhu_permission_holder_working_at_a_bhc_is_forbidden(): void
    {
        // Only a nurse can be assigned to work at a BHC.
        $this->rhuUser->update(['staff_role' => 'nurse']);
        $assignment = $this->rhuUser->facilityAssignments()->create([
            'barangay_health_center_id' => $this->bhc->id,
            'permissions' => [...StaffRoles::defaults('midwife'), 'conditions.confirm'],
            'starts_on' => today(),
            'assignment_type' => 'ongoing',
        ]);

        $this->recordPost($this->rhuUser, [
            'condition_confirmations' => [['name' => 'Hypertension', 'status' => 'active']],
        ], ['X-Working-Facility' => (string) $assignment->id])->assertForbidden()->assertJsonPath('message', 'Only RHU staff can confirm a condition.');

        $this->assertSame(0, HealthRecord::count());
        $this->assertSame(0, PatientCondition::count());
    }
}
