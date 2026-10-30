<?php

namespace Tests\Feature;

use App\Mail\AccountInviteMail;
use App\Models\AccountInvite;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class AccountActivationBootstrapTest extends TestCase
{
    use RefreshDatabase;

    protected bool $autoVerifyUsers = false;

    public function test_the_seeder_creates_facilities_and_not_a_known_admin_password(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertDatabaseMissing('users', ['email' => 'admin@akay.com']);
        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseHas('rural_health_units', ['name' => 'Rural Health Unit Bulakan']);
        $this->assertSame(14, \App\Models\BarangayHealthCenter::count());
    }

    public function test_bootstrap_creates_an_unverified_admin_and_emails_an_invite_without_printing_the_token(): void
    {
        Mail::fake();

        $this->artisan('akay:bootstrap-admin', ['email' => 'MHO@Example.test'])
            ->expectsOutputToContain('Invitation sent')
            ->doesntExpectOutputToContain('token=')
            ->assertSuccessful();

        $user = User::query()->whereRaw('lower(email) = ?', ['mho@example.test'])->firstOrFail();
        $this->assertSame('mho@example.test', $user->email);
        $this->assertSame(User::ROLE_ADMIN, $user->role);
        $this->assertSame(User::STATUS_ACTIVE, $user->status);
        $this->assertNull($user->email_verified_at);
        $this->assertFalse(Hash::check('akayadmin2026', $user->password));
        $this->assertFalse(Hash::check('password123', $user->password));

        $invite = AccountInvite::query()->where('user_id', $user->id)->firstOrFail();
        $this->assertSame(AccountInvite::STATUS_PENDING, $invite->status);
        $this->assertSame(AccountInvite::DELIVERY_SENT, $invite->delivery);
        $this->assertNotNull($invite->token_hash);

        Mail::assertSent(AccountInviteMail::class, function (AccountInviteMail $mail) use ($invite): bool {
            return $mail->hasTo('mho@example.test')
                && str_contains($mail->inviteUrl, '/accept-invite?token=')
                && $invite->token_hash === hash('sha256', explode('token=', $mail->inviteUrl, 2)[1]);
        });
    }

    public function test_bootstrap_reinvites_an_existing_unverified_admin_and_clears_copied_tokens(): void
    {
        Mail::fake();

        $admin = User::create([
            'name' => 'Municipal Health Officer',
            'email' => 'admin@akay.com',
            'password' => 'akayadmin2026',
            'role' => User::ROLE_ADMIN,
            'status' => User::STATUS_ACTIVE,
            'permissions' => [],
        ]);
        $staff = User::create([
            'name' => 'Pending BHW',
            'email' => 'bhw@example.test',
            'password' => 'password123',
            'role' => User::ROLE_BHC,
            'status' => User::STATUS_ACTIVE,
            'permissions' => [],
        ]);
        AccountInvite::create([
            'user_id' => $staff->id,
            'email' => $staff->email,
            'token_hash' => hash('sha256', 'copied-secret-token'),
            'status' => AccountInvite::STATUS_PENDING,
            'delivery' => AccountInvite::DELIVERY_COPIED,
            'expires_at' => now()->addHours(48),
        ]);

        $this->artisan('akay:bootstrap-admin', ['email' => 'admin@akay.com'])
            ->expectsOutputToContain('Invitation sent')
            ->expectsOutputToContain('Invalidated 1 previously copied pending invitation token(s).')
            ->doesntExpectOutputToContain('copied-secret-token')
            ->assertSuccessful();

        $this->assertNull($admin->fresh()->email_verified_at);
        $this->assertNull(AccountInvite::query()->where('user_id', $staff->id)->value('token_hash'));
        $this->assertSame(AccountInvite::DELIVERY_COPIED, AccountInvite::query()->where('user_id', $staff->id)->value('delivery'));
        Mail::assertSent(AccountInviteMail::class, fn (AccountInviteMail $mail): bool => $mail->hasTo('admin@akay.com'));
    }

    public function test_bootstrap_refuses_a_second_admin_when_a_verified_mho_already_exists(): void
    {
        Mail::fake();

        $this->markVerified(User::create([
            'name' => 'Existing MHO',
            'email' => 'verified-mho@example.test',
            'password' => 'password123',
            'role' => User::ROLE_ADMIN,
            'status' => User::STATUS_ACTIVE,
            'permissions' => [],
        ]));

        $this->artisan('akay:bootstrap-admin', ['email' => 'second@example.test'])
            ->expectsOutputToContain('A verified Municipal Health Officer already exists')
            ->assertFailed();

        $this->assertDatabaseMissing('users', ['email' => 'second@example.test']);
        Mail::assertNothingSent();
    }

    public function test_bootstrap_does_not_reinvite_a_verified_mho_at_the_same_mailbox(): void
    {
        Mail::fake();

        $this->markVerified(User::create([
            'name' => 'Existing MHO',
            'email' => 'mho@example.test',
            'password' => 'password123',
            'role' => User::ROLE_ADMIN,
            'status' => User::STATUS_ACTIVE,
            'permissions' => [],
        ]));

        $this->artisan('akay:bootstrap-admin', ['email' => 'mho@example.test'])
            ->expectsOutputToContain('already verified')
            ->assertSuccessful();

        Mail::assertNothingSent();
        $this->assertSame(0, AccountInvite::count());
    }

    public function test_bootstrap_refuses_a_non_admin_mailbox_and_an_invalid_address(): void
    {
        Mail::fake();

        User::create([
            'name' => 'BHW',
            'email' => 'bhw@example.test',
            'password' => 'password123',
            'role' => User::ROLE_BHC,
            'status' => User::STATUS_ACTIVE,
            'permissions' => [],
        ]);

        $this->artisan('akay:bootstrap-admin', ['email' => 'bhw@example.test'])
            ->expectsOutputToContain('non-admin')
            ->assertFailed();

        $this->artisan('akay:bootstrap-admin', ['email' => 'not-an-email'])
            ->expectsOutputToContain('valid email address')
            ->assertFailed();

        Mail::assertNothingSent();
    }

    public function test_activation_report_prints_counts_without_personal_data(): void
    {
        $admin = User::create([
            'name' => 'Pending MHO',
            'email' => 'Pending.MHO@example.test',
            'password' => 'password123',
            'role' => User::ROLE_ADMIN,
            'status' => User::STATUS_ACTIVE,
            'permissions' => [],
        ]);
        $staff = User::create([
            'name' => 'BHW',
            'email' => 'pending.mho@example.test',
            'password' => 'password123',
            'role' => User::ROLE_BHC,
            'status' => User::STATUS_ACTIVE,
            'permissions' => [],
        ]);
        $this->markVerified(User::create([
            'name' => 'Verified MHO',
            'email' => 'verified-mho@example.test',
            'password' => 'password123',
            'role' => User::ROLE_ADMIN,
            'status' => User::STATUS_ACTIVE,
            'permissions' => [],
        ]));
        AccountInvite::create([
            'user_id' => $admin->id,
            'email' => $admin->email,
            'token_hash' => hash('sha256', 'copied-token'),
            'status' => AccountInvite::STATUS_PENDING,
            'delivery' => AccountInvite::DELIVERY_COPIED,
            'expires_at' => now()->addDay(),
        ]);
        AccountInvite::create([
            'user_id' => $staff->id,
            'email' => $staff->email,
            'token_hash' => null,
            'status' => AccountInvite::STATUS_COMPLETED,
            'delivery' => AccountInvite::DELIVERY_SENT,
            'completed_via' => AccountInvite::VIA_LINK,
            'completed_at' => now(),
            'expires_at' => now()->addDay(),
        ]);

        $this->artisan('akay:account-activation-report')
            ->expectsOutputToContain('admin: 1')
            ->expectsOutputToContain('bhc: 1')
            ->expectsOutputToContain('Pending copied invitation tokens: 1')
            ->expectsOutputToContain('link: 1')
            ->expectsOutputToContain('Case-colliding email groups: 1')
            ->expectsOutputToContain('Verified Municipal Health Officer accounts: 1')
            ->doesntExpectOutputToContain('Pending.MHO@example.test')
            ->doesntExpectOutputToContain('copied-token')
            ->doesntExpectOutputToContain('password123')
            ->assertSuccessful();
    }
}
