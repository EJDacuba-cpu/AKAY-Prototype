# Email-verified account activation rollout

This is a local/review guide. It does not authorize production email sends, mass verification, live re-invitation, or deployment.

## What changed

New staff accounts stay Active with setup pending until the owner sets a password from the current emailed invitation. Login, refresh, and authenticated APIs require `users.email_verified_at`. Copied invite links and temporary passwords cannot activate an unverified account.

The database seeder no longer creates `admin@akay.com`. The first Municipal Health Officer is created with:

```
php artisan akay:bootstrap-admin {email}
```

That command emails the normal 48-hour invitation. It never prints the token and never sets a known password. If a verified MHO already exists, it refuses to create another bootstrap admin.

## Read-only preflight

Run this against a disposable copy of the database, not as a way to mark people verified:

```
php artisan akay:account-activation-report
```

It prints counts only:

- unverified accounts by role
- pending copied invitation tokens
- completed invitations by route (`link`, `temporary_password`, `reset`)
- case-colliding email groups (`lower(email)` duplicates)
- verified Municipal Health Officer accounts

It does not print emails, names, passwords, hashes, or tokens.

## Existing accounts

Do not set `email_verified_at` from active status, old invite completion, password reset, temporary-password history, or successful historical email delivery.

Existing local `admin@akay.com` with the old seeded password cannot sign in after enforcement. Run `akay:bootstrap-admin` with a mailbox you control, then complete `/accept-invite`.

Copied pending invitation tokens are invalidated by the bootstrap command. Resend remaining pending invites by email.

Production/live staff need a separately reviewed re-invitation procedure before enforcement is turned on in that environment. At least one MHO/admin must complete setup through a controlled inbox. There is no permanent admin HTTP exemption.

## Suggested local order

1. Run `php artisan akay:account-activation-report` and keep the counts.
2. Seed facilities only (`php artisan db:seed`) if needed.
3. `php artisan akay:bootstrap-admin your-inbox@example.test` using Mail::fake in tests, or a controlled inbox locally.
4. Open the invitation, set a personal password, sign in.
5. Create a staff account and confirm: Pending Setup, blocked login, resend/correct-email only, then emailed acceptance, then verified login.
6. Confirm verified password-reset recovery still works; invite copy-link and unverified temporary passwords do not.

## Production

Do not run the bootstrap command, re-invitations, or token rotation against live users until Eric authorizes that pass separately.
