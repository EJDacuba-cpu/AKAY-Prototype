<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\Feedback;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\ReferralUpdate;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Models\UserNotification;
use App\Services\AuditLogger;
use App\Services\ReferralNoShowService;
use App\Services\UserNotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Mockery\MockInterface;
use RuntimeException;
use Tests\TestCase;

class ReferralStatusStateMachineTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhcA;

    private BarangayHealthCenter $bhcB;

    private RuralHealthUnit $rhuA;

    private RuralHealthUnit $rhuB;

    private User $bhwA;

    private User $rhuStaffA;

    private User $rhuStaffB;

    private User $admin;

    private Patient $patientA;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rhuA = RuralHealthUnit::create(['name' => 'Workflow RHU A', 'status' => 'active']);
        $this->rhuB = RuralHealthUnit::create(['name' => 'Workflow RHU B', 'status' => 'active']);
        $this->bhcA = BarangayHealthCenter::create([
            'name' => 'Workflow BHC A',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhuA->id,
        ]);
        $this->bhcB = BarangayHealthCenter::create([
            'name' => 'Workflow BHC B',
            'status' => 'active',
            'rural_health_unit_id' => $this->rhuB->id,
        ]);
        $this->bhwA = $this->user('Workflow BHW A', 'workflow-bhw-a@example.test', User::ROLE_BHW, $this->bhcA->id);
        $this->rhuStaffA = $this->user('Workflow RHU A', 'workflow-rhu-a@example.test', User::ROLE_RHU_STAFF, null, $this->rhuA->id);
        $this->rhuStaffB = $this->user('Workflow RHU B', 'workflow-rhu-b@example.test', User::ROLE_RHU_STAFF, null, $this->rhuB->id);
        $this->admin = $this->user('Workflow Admin', 'workflow-admin@example.test', User::ROLE_ADMIN);
        $this->patientA = Patient::create([
            'first_name' => 'Referral',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $this->bhcA->id,
        ]);
    }

    public function test_new_referral_forces_pending_and_creates_one_initial_history(): void
    {
        $response = $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/referrals', [
                'patient_id' => $this->patientA->id,
                'reason_for_referral' => 'Further RHU assessment.',
                'status' => Referral::STATUS_COMPLETED,
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', Referral::STATUS_PENDING);

        $referralId = $response->json('data.id');
        $this->assertSame(1, ReferralUpdate::where('referral_id', $referralId)->count());
        $this->assertDatabaseHas('referral_updates', [
            'referral_id' => $referralId,
            'previous_status' => null,
            'status' => Referral::STATUS_PENDING,
        ]);
    }

    public function test_pending_to_received_is_atomic_and_same_status_retry_is_a_no_op(): void
    {
        $referral = $this->referral();

        $this->transitionRequest($this->rhuStaffA, $referral, Referral::STATUS_RECEIVED, 'Patient arrived.')
            ->assertOk()
            ->assertJsonPath('status_unchanged', false)
            ->assertJsonPath('status', Referral::STATUS_RECEIVED);

        $this->assertSame($this->rhuA->id, $this->patientA->fresh()->rural_health_unit_id);
        $this->assertSame(1, $referral->updates()->where('status', Referral::STATUS_RECEIVED)->count());
        $this->assertSame(1, UserNotification::where('type', 'referral_received')->count());
        $this->assertSame(1, AuditLog::where('action', 'status_updated')->count());

        $this->transitionRequest($this->rhuStaffA, $referral, Referral::STATUS_RECEIVED, 'Retry.')
            ->assertOk()
            ->assertJsonPath('status_unchanged', true);

        $this->assertSame(1, $referral->updates()->where('status', Referral::STATUS_RECEIVED)->count());
        $this->assertSame(1, UserNotification::where('type', 'referral_received')->count());
        $this->assertSame(1, AuditLog::where('action', 'status_updated')->count());
    }

    public function test_no_show_late_arrival_requires_reason_and_preserves_history(): void
    {
        $referral = $this->referral(Referral::STATUS_NO_SHOW);
        ReferralUpdate::create([
            'referral_id' => $referral->id,
            'previous_status' => Referral::STATUS_PENDING,
            'status' => Referral::STATUS_NO_SHOW,
            'remarks' => 'Automatic no-show.',
        ]);

        $this->transitionRequest($this->rhuStaffA, $referral, Referral::STATUS_RECEIVED)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('remarks');

        $this->transitionRequest(
            $this->rhuStaffA,
            $referral,
            Referral::STATUS_RECEIVED,
            'Patient arrived after being marked No-Show.'
        )->assertOk();

        $history = $referral->updates()->oldest()->pluck('status')->all();
        $this->assertSame([Referral::STATUS_NO_SHOW, Referral::STATUS_RECEIVED], $history);
        $this->assertSame(1, UserNotification::where('type', 'referral_late_arrival')->count());
        $this->assertSame(1, AuditLog::where('action', 'late_arrival_received')->count());
    }

    public function test_invalid_transition_matrix_returns_conflict_without_side_effects(): void
    {
        $cases = [
            [Referral::STATUS_PENDING, Referral::STATUS_COMPLETED],
            [Referral::STATUS_RECEIVED, Referral::STATUS_PENDING],
            [Referral::STATUS_RECEIVED, Referral::STATUS_NO_SHOW],
            [Referral::STATUS_NO_SHOW, Referral::STATUS_PENDING],
            [Referral::STATUS_COMPLETED, Referral::STATUS_RECEIVED],
            [Referral::STATUS_COMPLETED, Referral::STATUS_NO_SHOW],
        ];

        foreach ($cases as [$current, $requested]) {
            $referral = $this->referral($current);
            $response = $this->transitionRequest($this->rhuStaffA, $referral, $requested, 'Invalid transition.')
                ->assertConflict();

            $expectedCode = $current === Referral::STATUS_COMPLETED
                ? 'REFERRAL_ALREADY_COMPLETED'
                : 'INVALID_REFERRAL_STATUS_TRANSITION';
            $response->assertJsonPath('code', $expectedCode)
                ->assertJsonPath('current_status', $current)
                ->assertJsonPath('requested_status', $requested);
            $this->assertSame($current, $referral->fresh()->status);
            $this->assertSame(0, $referral->updates()->count());
        }

        $this->assertSame(0, UserNotification::count());
        $this->assertSame(0, AuditLog::count());
    }

    public function test_unknown_requested_and_stored_statuses_fail_safely(): void
    {
        $referral = $this->referral();
        $this->transitionRequest($this->rhuStaffA, $referral, 'reopened')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status');

        $referral->update(['status' => 'Legacy Unknown']);
        $this->transitionRequest($this->rhuStaffA, $referral, Referral::STATUS_RECEIVED)
            ->assertConflict()
            ->assertJsonPath('code', 'INVALID_REFERRAL_STATUS_TRANSITION');
    }

    public function test_no_show_same_status_is_a_side_effect_free_no_op(): void
    {
        $referral = $this->referral(Referral::STATUS_NO_SHOW);

        $this->transitionRequest($this->rhuStaffA, $referral, Referral::STATUS_NO_SHOW)
            ->assertOk()
            ->assertJsonPath('status_unchanged', true);

        $this->assertSame(0, $referral->updates()->count());
        $this->assertSame(0, UserNotification::count());
        $this->assertSame(0, AuditLog::count());
    }

    public function test_feedback_requires_received_and_completed_referral_rejects_duplicate(): void
    {
        foreach ([Referral::STATUS_PENDING, Referral::STATUS_NO_SHOW] as $status) {
            $referral = $this->referral($status);
            $this->actingAs($this->rhuStaffA, 'sanctum')
                ->postJson('/api/feedback', $this->feedbackPayload($referral))
                ->assertConflict()
                ->assertJsonPath('code', 'REFERRAL_NOT_RECEIVED');
        }

        $received = $this->referral(Referral::STATUS_RECEIVED);
        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson('/api/feedback', $this->feedbackPayload($received))
            ->assertCreated();
        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson('/api/feedback', $this->feedbackPayload($received))
            ->assertConflict()
            ->assertJsonPath('code', 'REFERRAL_ALREADY_COMPLETED');

        $this->assertSame(1, Feedback::where('referral_id', $received->id)->count());
    }

    public function test_feedback_completion_commits_all_side_effects_once(): void
    {
        $referral = $this->referral(Referral::STATUS_RECEIVED);

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson('/api/feedback', $this->feedbackPayload($referral))
            ->assertCreated()
            ->assertJsonPath('data.referral.status', Referral::STATUS_COMPLETED);

        $this->assertSame(Referral::STATUS_COMPLETED, $referral->fresh()->status);
        $this->assertSame(1, Feedback::where('referral_id', $referral->id)->count());
        $this->assertSame(1, $referral->updates()->where('status', Referral::STATUS_COMPLETED)->count());
        $this->assertSame(1, UserNotification::where('type', 'referral_completed')->count());
        $this->assertSame(1, AuditLog::where('action', 'feedback_completed')->count());
    }

    public function test_notification_failure_rolls_back_feedback_completion(): void
    {
        $referral = $this->referral(Referral::STATUS_RECEIVED);
        $this->mock(UserNotificationService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('notifyUsersOnce')->once()->andThrow(new RuntimeException('Forced notification failure.'));
        });

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson('/api/feedback', $this->feedbackPayload($referral))
            ->assertServerError();

        $this->assertSame(Referral::STATUS_RECEIVED, $referral->fresh()->status);
        $this->assertSame(0, Feedback::where('referral_id', $referral->id)->count());
        $this->assertSame(0, $referral->updates()->count());
        $this->assertSame(0, AuditLog::count());
    }

    public function test_audit_failure_rolls_back_feedback_history_and_notification(): void
    {
        $referral = $this->referral(Referral::STATUS_RECEIVED);
        $this->mock(AuditLogger::class, function (MockInterface $mock): void {
            $mock->shouldReceive('log')->once()->andThrow(new RuntimeException('Forced audit failure.'));
        });

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson('/api/feedback', $this->feedbackPayload($referral))
            ->assertServerError();

        $this->assertSame(Referral::STATUS_RECEIVED, $referral->fresh()->status);
        $this->assertSame(0, Feedback::count());
        $this->assertSame(0, ReferralUpdate::count());
        $this->assertSame(0, UserNotification::count());
    }

    public function test_legacy_for_monitoring_row_can_complete_as_received_compatibility(): void
    {
        $referral = $this->referral(Referral::STATUS_FOR_MONITORING);

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson('/api/feedback', $this->feedbackPayload($referral))
            ->assertCreated();

        $this->assertSame(Referral::STATUS_COMPLETED, $referral->fresh()->status);
        $this->assertDatabaseHas('referral_updates', [
            'referral_id' => $referral->id,
            'previous_status' => Referral::STATUS_RECEIVED,
            'status' => Referral::STATUS_COMPLETED,
        ]);
    }

    public function test_automatic_no_show_only_changes_overdue_pending_and_is_idempotent(): void
    {
        $overdue = $this->referral(Referral::STATUS_PENDING, now()->subDay());
        $future = $this->referral(Referral::STATUS_PENDING, now()->addDay());
        $received = $this->referral(Referral::STATUS_RECEIVED, now()->subDays(2));
        $completed = $this->referral(Referral::STATUS_COMPLETED, now()->subDays(2));

        $service = app(ReferralNoShowService::class);
        $this->assertSame(1, $service->markOverduePending());
        $this->assertSame(Referral::STATUS_NO_SHOW, $overdue->fresh()->status);
        $this->assertSame(Referral::STATUS_PENDING, $future->fresh()->status);
        $this->assertSame(Referral::STATUS_RECEIVED, $received->fresh()->status);
        $this->assertSame(Referral::STATUS_COMPLETED, $completed->fresh()->status);
        $this->assertSame(1, UserNotification::where('type', 'referral_no_show')->count());
        $this->assertSame(1, AuditLog::where('action', 'automatic_no_show')->count());

        $this->assertSame(0, $service->markOverduePending());
        $this->assertSame(1, $overdue->updates()->where('status', Referral::STATUS_NO_SHOW)->count());
        $this->assertSame(1, UserNotification::where('type', 'referral_no_show')->count());
    }

    public function test_no_show_command_dry_run_has_no_side_effects(): void
    {
        $referral = $this->referral(Referral::STATUS_PENDING, now()->subDay());

        $this->artisan('referrals:mark-no-show', ['--dry-run' => true])
            ->expectsOutput('1 overdue Pending referral(s) would be marked No-Show.')
            ->assertSuccessful();

        $this->assertSame(Referral::STATUS_PENDING, $referral->fresh()->status);
        $this->assertSame(0, ReferralUpdate::count());
        $this->assertSame(0, UserNotification::count());
    }

    public function test_sequential_competing_transitions_preserve_the_first_winner(): void
    {
        $referral = $this->referral(Referral::STATUS_PENDING, now()->subDay());
        $this->transitionRequest($this->rhuStaffA, $referral, Referral::STATUS_RECEIVED)->assertOk();

        $this->transitionRequest($this->rhuStaffA, $referral, Referral::STATUS_NO_SHOW)
            ->assertConflict()
            ->assertJsonPath('code', 'INVALID_REFERRAL_STATUS_TRANSITION');
        $this->assertFalse(app(ReferralNoShowService::class)->markOverduePending($referral) > 0);
        $this->assertSame(Referral::STATUS_RECEIVED, $referral->fresh()->status);

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson('/api/feedback', $this->feedbackPayload($referral))
            ->assertCreated();
        $this->transitionRequest($this->rhuStaffA, $referral, Referral::STATUS_RECEIVED)
            ->assertConflict()
            ->assertJsonPath('code', 'REFERRAL_ALREADY_COMPLETED');
    }

    public function test_role_and_facility_authorization_remain_backend_enforced(): void
    {
        $referral = $this->referral();

        $this->transitionRequest($this->bhwA, $referral, Referral::STATUS_RECEIVED)->assertForbidden();
        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/feedback', $this->feedbackPayload($referral))
            ->assertForbidden();
        $crossFacility = $this->transitionRequest($this->rhuStaffB, $referral, Referral::STATUS_RECEIVED)
            ->assertForbidden();
        $crossFacility->assertJsonMissingPath('current_status')
            ->assertJsonMissingPath('requested_status');
        $this->transitionRequest($this->admin, $referral, Referral::STATUS_RECEIVED)->assertForbidden();

        $this->assertSame(Referral::STATUS_PENDING, $referral->fresh()->status);
        $this->assertSame(0, ReferralUpdate::count());
    }

    public function test_report_status_buckets_merge_controlled_legacy_aliases(): void
    {
        $this->referral(Referral::STATUS_RECEIVED);
        $this->referral(Referral::STATUS_FOR_MONITORING);
        $this->referral('done');
        $this->referral('complete');
        $this->referral('no_show');

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->getJson('/api/reports/rhu')
            ->assertOk()
            ->assertJsonPath('data.referrals_by_status.Received', 2)
            ->assertJsonPath('data.referrals_by_status.Completed', 2)
            ->assertJsonPath('data.referrals_by_status.No-Show', 1)
            ->assertJsonPath('data.completed_referrals', 2)
            ->assertJsonPath('data.no_show_referrals', 1)
            ->assertJsonMissingPath('data.referrals_by_status.For Monitoring')
            ->assertJsonMissingPath('data.referrals_by_status.done');
    }

    public function test_production_transition_path_uses_row_locking(): void
    {
        $source = file_get_contents(app_path('Services/ReferralWorkflowService.php'));

        $this->assertStringContainsString('->lockForUpdate()', $source);
        $this->assertStringContainsString('DB::transaction', $source);
        $this->assertSame('sqlite', config('database.default'));
    }

    private function transitionRequest(User $user, Referral $referral, string $status, ?string $remarks = null)
    {
        return $this->actingAs($user, 'sanctum')
            ->patchJson("/api/referrals/{$referral->id}/status", array_filter([
                'status' => $status,
                'remarks' => $remarks,
            ], fn (mixed $value): bool => $value !== null));
    }

    private function feedbackPayload(Referral $referral): array
    {
        return [
            'referral_id' => $referral->id,
            'rhu_diagnosis' => 'Clinical assessment completed.',
            'action_taken' => 'Patient evaluated at RHU.',
            'recommendation' => 'Continue coordinated care.',
        ];
    }

    private function referral(
        string $status = Referral::STATUS_PENDING,
        mixed $referralDate = null,
        ?RuralHealthUnit $rhu = null
    ): Referral {
        static $sequence = 0;
        $sequence++;
        $rhu ??= $this->rhuA;

        return Referral::create([
            'tracking_id' => "AKAY-WORKFLOW-{$sequence}",
            'qr_code_value' => "AKAY:WORKFLOW:{$sequence}",
            'patient_id' => $this->patientA->id,
            'barangay_health_center_id' => $this->bhcA->id,
            'rural_health_unit_id' => $rhu->id,
            'created_by' => $this->bhwA->id,
            'reason_for_referral' => 'Workflow integrity test.',
            'referral_datetime' => $referralDate ?? now()->addDay(),
            'status' => $status,
        ]);
    }

    private function user(
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
}
