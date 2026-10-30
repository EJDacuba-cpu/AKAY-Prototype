<?php

namespace Tests\Feature;

use App\Models\AccountInvite;
use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\AccountInviteService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class AccountInviteAcceptTest extends TestCase
{
    use RefreshDatabase;

    protected bool $autoVerifyUsers = false;

    private User $user;

    private AccountInvite $invite;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();

        $rhu = RuralHealthUnit::create(['name' => 'Accept RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Accept BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $admin = User::create(['name' => 'MHO', 'email' => 'mho@example.test', 'password' => 'password123', 'role' => 'admin', 'status' => 'active', 'permissions' => []]);
        $this->user = User::create([
            'name' => 'Joshua', 'email' => 'joshua@example.test', 'password' => bin2hex(random_bytes(16)),
            'role' => 'bhc', 'status' => 'active', 'barangay_health_center_id' => $bhc->id, 'permissions' => [],
        ]);

        $this->invite = app(AccountInviteService::class)->issue($this->user, $admin);
        $this->token = 'known-token-for-tests';
        $this->invite->forceFill(['token_hash' => hash('sha256', $this->token)])->save();
    }

    private function accept(array $overrides = [])
    {
        return $this->postJson('/api/auth/invites/accept', [
            'token' => $this->token,
            'password' => 'Newpass123',
            'password_confirmation' => 'Newpass123',
            ...$overrides,
        ]);
    }

    public function test_a_valid_token_shows_the_account(): void
    {
        $this->getJson('/api/auth/invites/verify?token='.$this->token)
            ->assertOk()
            ->assertJsonPath('data.name', 'Joshua')
            ->assertJsonPath('data.email', 'joshua@example.test')
            ->assertJsonStructure(['data' => ['expires_at']]);
    }

    public function test_issuing_sending_and_previewing_leave_the_account_unverified(): void
    {
        $this->assertNull($this->user->fresh()->email_verified_at);

        $this->getJson('/api/auth/invites/verify?token='.$this->token)->assertOk();

        $this->assertNull($this->user->fresh()->email_verified_at);
        $this->assertSame(AccountInvite::STATUS_PENDING, $this->invite->fresh()->status);
    }

    public function test_accepting_sets_the_password_and_completes_the_invite(): void
    {
        $this->user->createToken('before-accept');
        $this->assertSame(1, $this->user->tokens()->count());
        $this->assertNull($this->user->email_verified_at);

        $this->accept(['password' => 'PersonalPass42', 'password_confirmation' => 'PersonalPass42'])
            ->assertOk()
            ->assertJsonPath('message', 'Your password is set. Sign in to continue.');

        $this->user->refresh();
        $this->assertNotNull($this->user->email_verified_at);
        $this->assertTrue(Hash::check('PersonalPass42', $this->user->password));
        $this->assertFalse((bool) $this->user->must_change_password);
        $this->assertNull($this->user->temp_password_expires_at);

        $invite = $this->invite->fresh();
        $this->assertSame(AccountInvite::STATUS_COMPLETED, $invite->status);
        $this->assertSame(AccountInvite::VIA_LINK, $invite->completed_via);
        $this->assertNotNull($invite->completed_at);
        $this->assertNull($invite->token_hash);

        $this->assertSame(0, $this->user->tokens()->count());

        $audit = AuditLog::where('action', 'account invite completed')->firstOrFail();
        $this->assertStringNotContainsString('joshua@example.test', $audit->description);

        $this->postJson('/api/auth/login', $this->withTurnstile(['email' => 'joshua@example.test', 'password' => 'PersonalPass42']))
            ->assertOk();
    }

    public function test_a_link_works_once(): void
    {
        $this->accept()->assertOk();
        $verifiedAt = $this->user->fresh()->email_verified_at;
        $this->assertNotNull($verifiedAt);

        $this->accept(['password' => 'Another123', 'password_confirmation' => 'Another123'])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'This invite link is invalid or expired.');

        $this->assertTrue(Hash::check('Newpass123', $this->user->fresh()->password));
        $this->assertEquals($verifiedAt, $this->user->fresh()->email_verified_at);
        $this->getJson('/api/auth/invites/verify?token='.$this->token)->assertUnprocessable();
    }

    public function test_an_invalid_token_leaves_password_and_verification_unchanged(): void
    {
        $originalPassword = $this->user->password;

        $this->accept(['token' => 'not-the-invite-token'])->assertUnprocessable();

        $fresh = $this->user->fresh();
        $this->assertNull($fresh->email_verified_at);
        $this->assertSame($originalPassword, $fresh->password);
        $this->assertSame(AccountInvite::STATUS_PENDING, $this->invite->fresh()->status);
    }

    public function test_an_old_email_token_does_not_verify_the_replacement_mailbox(): void
    {
        $originalPassword = $this->user->password;
        $this->user->forceFill(['email' => 'corrected@example.test'])->save();

        $this->accept()->assertUnprocessable();

        $fresh = $this->user->fresh();
        $this->assertSame('corrected@example.test', $fresh->email);
        $this->assertNull($fresh->email_verified_at);
        $this->assertSame($originalPassword, $fresh->password);
        $this->assertSame(AccountInvite::STATUS_PENDING, $this->invite->fresh()->status);
        $this->assertSame('joshua@example.test', $this->invite->fresh()->email);
    }

    public function test_concurrent_acceptance_allows_only_one_winner(): void
    {
        $first = $this->accept();
        $second = $this->accept(['password' => 'OtherPass42', 'password_confirmation' => 'OtherPass42']);

        $first->assertOk();
        $second->assertUnprocessable();

        $fresh = $this->user->fresh();
        $this->assertNotNull($fresh->email_verified_at);
        $this->assertTrue(Hash::check('Newpass123', $fresh->password));
        $this->assertFalse(Hash::check('OtherPass42', $fresh->password));
        $this->assertSame(AccountInvite::STATUS_COMPLETED, $this->invite->fresh()->status);
    }

    public function test_an_expired_link_is_refused_and_marked_expired(): void
    {
        $this->travel(49)->hours();

        $this->getJson('/api/auth/invites/verify?token='.$this->token)
            ->assertUnprocessable()
            ->assertJsonPath('message', 'This invite link is invalid or expired.');

        $invite = $this->invite->fresh();
        $this->assertSame(AccountInvite::STATUS_EXPIRED, $invite->status);
        $this->assertNull($invite->token_hash);
        $this->assertNull($this->user->fresh()->email_verified_at);

        $this->travelBack();
        $this->accept()->assertUnprocessable();
        $this->assertNull($this->user->fresh()->email_verified_at);
    }

    public function test_an_unknown_token_is_refused(): void
    {
        $this->getJson('/api/auth/invites/verify?token=nope')->assertUnprocessable();
        $this->getJson('/api/auth/invites/verify')->assertUnprocessable();
        $this->getJson('/api/auth/invites/verify?token[]=x')
            ->assertUnprocessable()
            ->assertJsonPath('message', 'This invite link is invalid or expired.');
    }

    public function test_an_inactive_account_cannot_accept(): void
    {
        $this->user->forceFill(['status' => 'inactive'])->save();

        $this->getJson('/api/auth/invites/verify?token='.$this->token)->assertUnprocessable();
        $this->accept()->assertUnprocessable();

        $this->assertSame(AccountInvite::STATUS_PENDING, $this->invite->fresh()->status);
    }

    public function test_weak_passwords_are_refused(): void
    {
        foreach (['password1', 'PASSWORD1', 'Password'] as $weak) {
            $this->accept(['password' => $weak, 'password_confirmation' => $weak])
                ->assertUnprocessable()
                ->assertJsonValidationErrors('password');
        }

        $this->accept(['password_confirmation' => 'Different123'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('password');

        $this->assertSame(AccountInvite::STATUS_PENDING, $this->invite->fresh()->status);
    }
}
