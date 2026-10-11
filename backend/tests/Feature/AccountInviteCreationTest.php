<?php

namespace Tests\Feature;

use App\Mail\AccountInviteMail;
use App\Models\AccountInvite;
use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\AccountInviteService;
use App\Services\StaffRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AccountInviteCreationTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $rhu = RuralHealthUnit::create(['name' => 'Invite RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Invite BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $this->admin = User::create(['name' => 'MHO', 'email' => 'mho@example.test', 'password' => 'password123', 'role' => 'admin', 'status' => 'active', 'permissions' => []]);
        Sanctum::actingAs($this->admin, ['*']);
    }

    private function payload(array $overrides = []): array
    {
        return [
            'name' => 'Joshua', 'email' => 'joshua@example.test', 'contact_number' => '09171234567',
            'role' => 'bhc', 'staff_role' => 'midwife', 'barangay_health_center_id' => $this->bhc->id,
            'permissions' => StaffRoles::defaults('midwife'), 'permissions_confirmed' => true,
            ...$overrides,
        ];
    }

    public function test_creating_an_account_emails_a_one_time_invite(): void
    {
        Mail::fake();

        $this->postJson('/api/users', $this->payload())
            ->assertCreated()
            ->assertJsonPath('invite.delivery', 'sent');

        $this->assertSame(1, AccountInvite::count());
        $invite = AccountInvite::firstOrFail();
        $this->assertSame(AccountInvite::STATUS_PENDING, $invite->status);
        $this->assertSame(AccountInvite::DELIVERY_SENT, $invite->delivery);
        $this->assertSame('joshua@example.test', $invite->email);
        $this->assertSame($this->admin->id, $invite->created_by);
        $this->assertEqualsWithDelta(now()->addHours(48)->timestamp, $invite->expires_at->timestamp, 60);
        $this->assertMatchesRegularExpression('/^[a-f0-9]{64}$/', $invite->token_hash);

        Mail::assertSent(AccountInviteMail::class, function (AccountInviteMail $mail) use ($invite) {
            $this->assertTrue($mail->hasTo('joshua@example.test'));
            $this->assertStringContainsString('/accept-invite?token=', $mail->inviteUrl);
            $token = explode('token=', $mail->inviteUrl, 2)[1];
            $this->assertSame($invite->token_hash, hash('sha256', $token));

            $content = $mail->content();
            $html = view($content->view, [...$content->with, 'inviteUrl' => $mail->inviteUrl])->render();
            $this->assertStringContainsString('The Municipal Health Officer created your AKAY account.', $html);
            $this->assertStringContainsString('Facility: Invite BHC', $html);
            $this->assertStringContainsString('Role: Midwife', $html);
            $this->assertStringContainsString('Set up your account', $html);
            $this->assertStringContainsString('This link works once and expires in 48 hours.', $html);
            $this->assertSame("You're now in AKAY", $mail->envelope()->subject);

            return true;
        });
    }

    public function test_the_new_account_cannot_sign_in_before_accepting(): void
    {
        Mail::fake();
        $this->postJson('/api/users', $this->payload())->assertCreated();

        $this->postJson('/api/auth/login', ['email' => 'joshua@example.test', 'password' => 'password123'])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'LOGIN_FAILED');
        $this->postJson('/api/auth/login', ['email' => 'joshua@example.test', 'password' => ''])
            ->assertUnprocessable();
    }

    public function test_a_mailer_failure_still_creates_the_account(): void
    {
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('smtp down'));

        $this->postJson('/api/users', $this->payload())
            ->assertCreated()
            ->assertJsonPath('invite.delivery', 'failed');

        $this->assertDatabaseHas('users', ['email' => 'joshua@example.test']);
        $this->assertDatabaseHas('account_invites', ['email' => 'joshua@example.test', 'delivery' => 'failed', 'status' => 'pending']);
    }

    public function test_the_mho_cannot_set_a_password(): void
    {
        Mail::fake();

        $this->postJson('/api/users', $this->payload(['password' => 'password123', 'password_confirmation' => 'password123']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('password');

        $this->postJson('/api/users', $this->payload())->assertCreated();
        $user = User::where('email', 'joshua@example.test')->firstOrFail();

        $this->patchJson("/api/users/{$user->id}", ['password' => 'password123', 'password_confirmation' => 'password123'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('password');
    }

    public function test_blank_password_fields_are_ignored_and_never_wipe_the_password(): void
    {
        Mail::fake();
        $this->postJson('/api/users', $this->payload(['password' => '', 'password_confirmation' => '']))->assertCreated();
        $user = User::where('email', 'joshua@example.test')->firstOrFail();
        $before = $user->password;

        $this->patchJson("/api/users/{$user->id}", ['name' => 'Joshua R.', 'password' => null, 'password_confirmation' => null])->assertOk();

        $this->assertSame($before, $user->fresh()->password);
    }

    public function test_the_audit_log_never_contains_the_token(): void
    {
        Mail::fake();
        $this->postJson('/api/users', $this->payload())->assertCreated();

        $invite = AccountInvite::firstOrFail();
        $token = null;
        Mail::assertSent(AccountInviteMail::class, function (AccountInviteMail $mail) use (&$token) {
            $token = explode('token=', $mail->inviteUrl, 2)[1];

            return true;
        });

        $descriptions = AuditLog::pluck('description')->implode("\n");
        $this->assertStringContainsString('j***', $descriptions);
        $this->assertStringNotContainsString($token, $descriptions);
        $this->assertStringNotContainsString($invite->token_hash, $descriptions);
        $this->assertStringNotContainsString('joshua@example.test', AuditLog::where('action', 'account invite sent')->value('description'));
    }

    public function test_resend_rotates_the_token_and_link_marks_it_copied(): void
    {
        Mail::fake();
        $this->postJson('/api/users', $this->payload())->assertCreated();
        $invite = AccountInvite::firstOrFail();
        $first = $invite->token_hash;
        $service = app(AccountInviteService::class);

        $service->resend($invite);
        $second = $invite->fresh()->token_hash;
        $this->assertNotSame($first, $second);
        $this->assertSame(AccountInvite::DELIVERY_SENT, $invite->fresh()->delivery);

        $url = $service->link($invite->fresh());
        $this->assertStringContainsString('/accept-invite?token=', $url);
        $fresh = $invite->fresh();
        $this->assertNotSame($second, $fresh->token_hash);
        $this->assertSame(hash('sha256', explode('token=', $url, 2)[1]), $fresh->token_hash);
        $this->assertSame(AccountInvite::DELIVERY_COPIED, $fresh->delivery);
    }

    public function test_temporary_password_replaces_the_link(): void
    {
        Mail::fake();
        $this->postJson('/api/users', $this->payload())->assertCreated();
        $invite = AccountInvite::firstOrFail();

        $password = app(AccountInviteService::class)->temporaryPassword($invite);

        $user = $invite->user->fresh();
        $this->assertTrue(\Illuminate\Support\Facades\Hash::check($password, $user->password));
        $this->assertTrue($user->must_change_password);
        $this->assertEqualsWithDelta(now()->addHours(72)->timestamp, $user->temp_password_expires_at->timestamp, 60);
        $fresh = $invite->fresh();
        $this->assertSame(AccountInvite::STATUS_TEMPORARY, $fresh->status);
        $this->assertNull($fresh->token_hash);
    }
}
