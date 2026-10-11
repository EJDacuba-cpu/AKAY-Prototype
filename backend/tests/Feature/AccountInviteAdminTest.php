<?php

namespace Tests\Feature;

use App\Models\AccountInvite;
use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\PasswordResetRequest;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\AccessRequestStatus;
use App\Services\AccountInviteService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AccountInviteAdminTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private BarangayHealthCenter $bhc;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();

        $rhu = RuralHealthUnit::create(['name' => 'Admin RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Admin BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->admin = User::create(['name' => 'MHO', 'email' => 'MHO@Example.Test', 'password' => 'password123', 'role' => 'admin', 'status' => 'active', 'permissions' => []]);
        Sanctum::actingAs($this->admin, ['*']);
    }

    private function makeUser(string $email, string $status = 'active'): User
    {
        return User::create([
            'name' => 'User '.$email, 'email' => $email, 'password' => bin2hex(random_bytes(16)),
            'role' => 'bhc', 'staff_role' => 'midwife', 'status' => $status,
            'barangay_health_center_id' => $this->bhc->id, 'permissions' => [],
        ]);
    }

    private function makeInvite(string $email, array $invite = [], string $userStatus = 'active', array $user = []): AccountInvite
    {
        $account = $this->makeUser($email, $userStatus);
        if ($user) {
            $account->forceFill($user)->save();
        }

        return AccountInvite::create([
            'user_id' => $account->id,
            'email' => $email,
            'status' => AccountInvite::STATUS_PENDING,
            'delivery' => AccountInvite::DELIVERY_SENT,
            'expires_at' => now()->addHours(10),
            'sent_at' => now(),
            ...$invite,
        ]);
    }

    private function realInvite(string $email = 'joshua@example.test'): AccountInvite
    {
        return app(AccountInviteService::class)->issue($this->makeUser($email), $this->admin);
    }

    public function test_resend_rotates_the_token_and_restarts_48_hours(): void
    {
        $invite = $this->realInvite();
        $invite->forceFill(['token_hash' => hash('sha256', 'old-token'), 'expires_at' => now()->addHour()])->save();

        $this->travel(2)->hours();
        Mail::fake();

        $this->postJson("/api/account-invites/{$invite->id}/resend")
            ->assertOk()
            ->assertJsonPath('data.id', $invite->id)
            ->assertJsonPath('data.display_status', 'in_progress')
            ->assertJsonPath('data.delivery', 'sent');

        $this->getJson('/api/auth/invites/verify?token=old-token')->assertUnprocessable();

        $fresh = $invite->fresh();
        $this->assertNotSame(hash('sha256', 'old-token'), $fresh->token_hash);
        $this->assertEqualsWithDelta(48 * 3600, now()->diffInSeconds($fresh->expires_at, false), 5);
        Mail::assertSent(\App\Mail\AccountInviteMail::class, 1);
        $this->assertTrue(AuditLog::where('action', 'account invite resent')->exists());
    }

    public function test_copy_link_returns_a_working_url_and_counts_as_in_progress(): void
    {
        $invite = $this->makeInvite('copy@example.test', ['delivery' => AccountInvite::DELIVERY_FAILED]);
        $this->getJson('/api/account-invites?status=pending')->assertJsonPath('data.data.0.id', $invite->id);

        $url = $this->postJson("/api/account-invites/{$invite->id}/link")
            ->assertOk()
            ->json('data.url');

        parse_str(parse_url($url, PHP_URL_QUERY), $query);
        $this->getJson('/api/auth/invites/verify?token='.$query['token'])->assertOk();

        $this->assertSame(AccountInvite::DELIVERY_COPIED, $invite->fresh()->delivery);
        $this->assertSame([$invite->id], collect($this->getJson('/api/account-invites?status=in_progress')->json('data.data'))->pluck('id')->all());
        $this->assertSame([], $this->getJson('/api/account-invites?status=pending')->json('data.data'));
        $this->assertTrue(AuditLog::where('action', 'account invite link copied')->exists());
        Mail::assertNothingSent();
    }

    public function test_edit_email_updates_the_account_and_resends(): void
    {
        $invite = $this->realInvite();
        Mail::fake();

        $this->patchJson("/api/account-invites/{$invite->id}/email", ['email' => 'New.Address@example.test'])
            ->assertOk()
            ->assertJsonPath('data.email', 'New.Address@example.test');

        $this->assertSame('New.Address@example.test', $invite->user->fresh()->email);
        $this->assertSame('New.Address@example.test', $invite->fresh()->email);
        Mail::assertSent(\App\Mail\AccountInviteMail::class, fn ($mail) => $mail->hasTo('New.Address@example.test'));

        $log = AuditLog::where('action', 'account invite email changed')->firstOrFail();
        $this->assertStringNotContainsString('New.Address', $log->description);
    }

    public function test_edit_email_refuses_an_address_in_use_in_any_case(): void
    {
        $invite = $this->realInvite();

        $this->patchJson("/api/account-invites/{$invite->id}/email", ['email' => 'MHO@Example.Test'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');
        $this->patchJson("/api/account-invites/{$invite->id}/email", ['email' => 'mho@example.test'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');
        $this->patchJson("/api/account-invites/{$invite->id}/email", ['email' => 'not-an-email'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');

        $this->assertSame('joshua@example.test', $invite->user->fresh()->email);

        // Keeping the account's own address (in another case) is not "in use".
        $this->patchJson("/api/account-invites/{$invite->id}/email", ['email' => 'Joshua@example.test'])->assertOk();
    }

    public function test_temporary_password_is_returned_once_and_never_logged(): void
    {
        $invite = $this->realInvite();
        $logged = [];
        Event::listen(MessageLogged::class, function (MessageLogged $event) use (&$logged): void {
            $logged[] = $event->message.json_encode($event->context);
        });

        $invite->user->createToken('before-temporary-password');
        $this->assertSame(1, $invite->user->tokens()->count());

        $response = $this->postJson("/api/account-invites/{$invite->id}/temporary-password")->assertOk();
        $password = $response->json('data.password');

        $this->assertGreaterThanOrEqual(12, strlen($password));
        $this->assertMatchesRegularExpression('/[a-z]/', $password);
        $this->assertMatchesRegularExpression('/[A-Z]/', $password);
        $this->assertMatchesRegularExpression('/\d/', $password);

        $user = $invite->user->fresh();
        $this->assertTrue(Hash::check($password, $user->password));
        $this->assertTrue((bool) $user->must_change_password);
        $this->assertSame(0, $user->tokens()->count());
        $this->assertEqualsWithDelta(72 * 3600, now()->diffInSeconds($user->temp_password_expires_at, false), 5);
        $this->assertSame($user->temp_password_expires_at->toJSON(), \Illuminate\Support\Carbon::parse($response->json('data.expires_at'))->toJSON());

        $fresh = $invite->fresh();
        $this->assertSame(AccountInvite::STATUS_TEMPORARY, $fresh->status);
        $this->assertNull($fresh->token_hash);

        $audit = AuditLog::where('action', 'temporary password issued')->get();
        $this->assertCount(1, $audit);
        foreach (AuditLog::all() as $row) {
            $this->assertStringNotContainsString($password, (string) $row->description);
        }
        foreach ($logged as $line) {
            $this->assertStringNotContainsString($password, $line);
        }

        // Listing never shows it either.
        $this->assertStringNotContainsString($password, $this->getJson('/api/account-invites')->getContent());
    }

    public function test_completed_or_inactive_invites_refuse_every_action(): void
    {
        $completed = $this->makeInvite('done@example.test', ['status' => AccountInvite::STATUS_COMPLETED, 'completed_via' => 'link', 'completed_at' => now()]);
        $inactive = $this->makeInvite('gone@example.test', [], 'inactive');

        foreach ([$completed, $inactive] as $invite) {
            $this->postJson("/api/account-invites/{$invite->id}/resend")->assertUnprocessable();
            $this->patchJson("/api/account-invites/{$invite->id}/email", ['email' => 'other@example.test'])->assertUnprocessable();
            $this->postJson("/api/account-invites/{$invite->id}/link")->assertUnprocessable();
            $this->postJson("/api/account-invites/{$invite->id}/temporary-password")->assertUnprocessable();
        }

        Mail::assertNothingSent();
        $this->assertSame(AccountInvite::STATUS_COMPLETED, $completed->fresh()->status);
        $this->assertNotSame('temporary', $inactive->fresh()->status);
    }

    public function test_status_filters_follow_the_four_statuses(): void
    {
        $past = now()->subHour();
        $ids = [
            'pending_failed' => $this->makeInvite('a1@example.test', ['delivery' => 'failed']),
            'pending_expired' => $this->makeInvite('a2@example.test', ['status' => 'expired', 'expires_at' => $past]),
            'pending_temp_past' => $this->makeInvite('a3@example.test', ['status' => 'temporary'], 'active', ['temp_password_expires_at' => $past, 'must_change_password' => true]),
            'pending_stale_link' => $this->makeInvite('a4@example.test', ['expires_at' => $past]),
            'progress_sent' => $this->makeInvite('b1@example.test', ['delivery' => 'sent']),
            'progress_copied' => $this->makeInvite('b2@example.test', ['delivery' => 'copied']),
            'progress_temp' => $this->makeInvite('b3@example.test', ['status' => 'temporary'], 'active', ['temp_password_expires_at' => now()->addHours(5), 'must_change_password' => true]),
            'complete_link' => $this->makeInvite('c1@example.test', ['status' => 'completed', 'completed_via' => 'link', 'completed_at' => now()]),
            'complete_temp' => $this->makeInvite('c2@example.test', ['status' => 'completed', 'completed_via' => 'temporary_password', 'completed_at' => now()]),
            'complete_inactive' => $this->makeInvite('c3@example.test', ['status' => 'completed', 'completed_via' => 'link', 'completed_at' => now()], 'inactive'),
            'cancelled_sent' => $this->makeInvite('d1@example.test', ['delivery' => 'sent'], 'inactive'),
            'cancelled_expired' => $this->makeInvite('d2@example.test', ['status' => 'expired'], 'inactive'),
            'cancelled_failed' => $this->makeInvite('d3@example.test', ['delivery' => 'failed'], 'inactive'),
        ];

        $expected = [
            'pending' => ['pending_failed', 'pending_expired', 'pending_temp_past', 'pending_stale_link'],
            'in_progress' => ['progress_sent', 'progress_copied', 'progress_temp'],
            'complete' => ['complete_link', 'complete_temp', 'complete_inactive'],
            'cancelled' => ['cancelled_sent', 'cancelled_expired', 'cancelled_failed'],
        ];

        foreach ($expected as $status => $keys) {
            $returned = collect($this->getJson("/api/account-invites?status={$status}&per_page=100")->assertOk()->json('data.data'));
            foreach ($returned as $row) {
                $this->assertSame($status, $row['display_status'], "Row {$row['id']} came back under {$status}");
            }
            $actual = $returned->pluck('id')->sort()->values()->all();
            $want = collect($keys)->map(fn ($key) => $ids[$key]->id)->sort()->values()->all();
            $this->assertSame($want, $actual, "Filter {$status}");
        }

        // Each row reports its computed status and the stale link was marked expired.
        $rows = collect($this->getJson('/api/account-invites?per_page=100')->json('data.data'))->keyBy('id');
        $this->assertCount(13, $rows);
        $this->assertSame('pending', $rows[$ids['pending_stale_link']->id]['display_status']);
        // `status` stays the stored value; `display_status` is the computed one.
        $this->assertSame('expired', $rows[$ids['pending_stale_link']->id]['status']);
        $this->assertSame('temporary', $rows[$ids['progress_temp']->id]['status']);
        $this->assertSame('completed', $rows[$ids['complete_link']->id]['status']);
        $this->assertSame('cancelled', $rows[$ids['cancelled_failed']->id]['display_status']);
        $this->assertSame('complete', $rows[$ids['complete_inactive']->id]['display_status']);
        $this->assertSame('in_progress', $rows[$ids['progress_temp']->id]['display_status']);
        $this->assertSame(AccountInvite::STATUS_EXPIRED, $ids['pending_stale_link']->fresh()->status);
        $this->assertNull($ids['pending_stale_link']->fresh()->token_hash);

        $row = $rows[$ids['progress_sent']->id];
        $this->assertSame('b1@example.test', $row['email']);
        $this->assertSame('midwife', $row['user']['staff_role']);
        $this->assertSame('bhc', $row['user']['role']);
        $this->assertSame('Admin BHC', $row['user']['facility']);
        $this->assertArrayHasKey('temp_password_expires_at', $row);

        $this->assertCount(1, $this->getJson('/api/account-invites?search=b2@example')->json('data.data'));
    }

    public function test_reset_request_statuses_follow_the_same_four_statuses(): void
    {
        $make = function (string $email, array $attributes, string $userStatus = 'active'): PasswordResetRequest {
            $user = $this->makeUser($email, $userStatus);

            return PasswordResetRequest::create([
                'user_id' => $user->id, 'email' => $email, 'status' => 'pending', 'requested_at' => now(),
                ...$attributes,
            ]);
        };

        $future = now()->addMinutes(30);
        $ids = [
            'pending' => $make('r1@example.test', []),
            'pending_failed' => $make('r2@example.test', ['status' => 'approved', 'delivery' => 'failed', 'expires_at' => $future]),
            'pending_expired' => $make('r3@example.test', ['status' => 'expired']),
            'progress_sent' => $make('r4@example.test', ['status' => 'approved', 'delivery' => 'sent', 'expires_at' => $future]),
            'progress_copied' => $make('r5@example.test', ['status' => 'approved', 'delivery' => 'copied', 'expires_at' => $future]),
            'progress_legacy' => $make('r6@example.test', ['status' => 'approved', 'delivery' => null, 'expires_at' => $future]),
            'complete' => $make('r7@example.test', ['status' => 'completed', 'completed_via' => 'link']),
            'complete_inactive' => $make('r8@example.test', ['status' => 'completed'], 'inactive'),
            'cancelled_rejected' => $make('r9@example.test', ['status' => 'rejected']),
            'cancelled_inactive' => $make('r10@example.test', [], 'inactive'),
            'cancelled_inactive_approved' => $make('r11@example.test', ['status' => 'approved', 'delivery' => 'failed', 'expires_at' => $future], 'inactive'),
        ];

        $expected = [
            'pending' => ['pending', 'pending_failed', 'pending_expired'],
            'in_progress' => ['progress_sent', 'progress_copied', 'progress_legacy'],
            'complete' => ['complete', 'complete_inactive'],
            'cancelled' => ['cancelled_rejected', 'cancelled_inactive', 'cancelled_inactive_approved'],
        ];

        foreach ($expected as $status => $keys) {
            $query = PasswordResetRequest::query();
            AccessRequestStatus::applyToResetRequests($query, $status);
            $this->assertEqualsCanonicalizing(
                collect($keys)->map(fn ($key) => $ids[$key]->id)->all(),
                $query->pluck('id')->all(),
                "Reset filter {$status}"
            );
        }
    }

    public function test_summary_counts_pending_rows_on_both_tabs(): void
    {
        $this->makeInvite('s1@example.test', ['delivery' => 'failed']);
        $this->makeInvite('s2@example.test', ['status' => 'expired']);
        $this->makeInvite('s3@example.test', ['expires_at' => now()->subMinute()]);
        $this->makeInvite('s4@example.test', ['delivery' => 'sent']);
        $this->makeInvite('s5@example.test', ['delivery' => 'failed'], 'inactive');

        $reset = function (string $email, array $attributes, string $userStatus = 'active'): void {
            PasswordResetRequest::create([
                'user_id' => $this->makeUser($email, $userStatus)->id, 'email' => $email,
                'status' => 'pending', 'requested_at' => now(), ...$attributes,
            ]);
        };
        $reset('t1@example.test', []);
        $reset('t2@example.test', ['status' => 'approved', 'delivery' => 'failed', 'expires_at' => now()->addMinutes(30)]);
        $reset('t3@example.test', ['status' => 'approved', 'delivery' => 'sent', 'expires_at' => now()->subMinute()]);
        $reset('t4@example.test', ['status' => 'approved', 'delivery' => 'sent', 'expires_at' => now()->addMinutes(30)]);
        $reset('t5@example.test', [], 'inactive');

        $this->getJson('/api/password-invites/summary')
            ->assertOk()
            ->assertExactJson(['data' => ['reset_requests' => 3, 'invites' => 3]]);
    }

    public function test_only_admins_can_use_invite_actions(): void
    {
        $invite = $this->makeInvite('x@example.test');
        Sanctum::actingAs($this->makeUser('bhc@example.test'), ['*']);

        $this->getJson('/api/account-invites')->assertForbidden();
        $this->getJson('/api/password-invites/summary')->assertForbidden();
        $this->postJson("/api/account-invites/{$invite->id}/resend")->assertForbidden();
        $this->patchJson("/api/account-invites/{$invite->id}/email", ['email' => 'y@example.test'])->assertForbidden();
        $this->postJson("/api/account-invites/{$invite->id}/link")->assertForbidden();
        $this->postJson("/api/account-invites/{$invite->id}/temporary-password")->assertForbidden();
    }

    public function test_changing_the_email_in_edit_account_resends_the_open_invite(): void
    {
        $invite = $this->realInvite('before@example.test');
        $invite->forceFill(['token_hash' => hash('sha256', 'old-token')])->save();
        $this->getJson('/api/auth/invites/verify?token=old-token')->assertOk();
        Mail::fake();

        $this->patchJson("/api/users/{$invite->user_id}", ['email' => 'after@example.test'])->assertOk();

        $this->getJson('/api/auth/invites/verify?token=old-token')->assertUnprocessable();

        $fresh = $invite->fresh();
        $this->assertSame('after@example.test', $fresh->email);
        $this->assertSame(AccountInvite::STATUS_PENDING, $fresh->status);
        $this->assertNotNull($fresh->token_hash);
        $this->assertNotSame(hash('sha256', 'old-token'), $fresh->token_hash);
        Mail::assertSent(\App\Mail\AccountInviteMail::class, fn ($mail) => $mail->hasTo('after@example.test'));
        Mail::assertNotSent(\App\Mail\AccountInviteMail::class, fn ($mail) => $mail->hasTo('before@example.test'));
    }

    public function test_changing_the_email_of_an_inactive_account_retires_the_link_without_sending(): void
    {
        $invite = $this->makeInvite('asleep@example.test', ['token_hash' => hash('sha256', 'asleep-token')], 'inactive');

        $this->patchJson("/api/users/{$invite->user_id}", ['email' => 'awake@example.test'])->assertOk();

        Mail::assertNothingSent();
        $fresh = $invite->fresh();
        $this->assertSame('awake@example.test', $fresh->email);
        $this->assertNull($fresh->token_hash);
        $this->assertSame(AccountInvite::STATUS_EXPIRED, $fresh->status);
    }

    public function test_edit_account_leaves_completed_invites_and_unchanged_emails_alone(): void
    {
        $completed = $this->makeInvite('done@example.test', ['status' => AccountInvite::STATUS_COMPLETED, 'completed_via' => 'link', 'completed_at' => now()]);
        $open = $this->realInvite('same@example.test');
        $openHash = $open->fresh()->token_hash;
        Mail::fake();

        $this->patchJson("/api/users/{$completed->user_id}", ['email' => 'done2@example.test'])->assertOk();
        $this->patchJson("/api/users/{$open->user_id}", ['email' => 'same@example.test', 'name' => 'Renamed'])->assertOk();

        Mail::assertNothingSent();
        $this->assertSame(AccountInvite::STATUS_COMPLETED, $completed->fresh()->status);
        $this->assertSame($openHash, $open->fresh()->token_hash);
    }

    public function test_a_temporary_invite_without_an_expiry_counts_as_expired(): void
    {
        $invite = $this->makeInvite('noexpiry@example.test', ['status' => AccountInvite::STATUS_TEMPORARY], 'active', [
            'must_change_password' => true,
            'temp_password_expires_at' => null,
        ]);

        $this->assertSame(AccessRequestStatus::PENDING, AccessRequestStatus::forInvite($invite->fresh('user')));

        $pending = collect($this->getJson('/api/account-invites?status=pending')->json('data.data'));
        $this->assertSame([$invite->id], $pending->pluck('id')->all());
        $this->assertSame('pending', $pending->first()['display_status']);
        $this->assertSame([], $this->getJson('/api/account-invites?status=in_progress')->json('data.data'));
    }
}
