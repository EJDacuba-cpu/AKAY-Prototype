# Email-Verified Account Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require mailbox-based invitation acceptance before a new AKAY account can access the system, including when an admin tries temporary-password or copied-link shortcuts.

**Architecture:** Use the existing `users.email_verified_at`, invitation hashes and transactional password service. Laravel enforces the policy at invitation, session and API boundaries; React presents the resulting setup state. No new database stored procedure or authentication package is required.

**Tech Stack:** Laravel/Sanctum, PostgreSQL, React, Tailwind, shadcn/ui, existing frontend service/list-refresh conventions.

**Spec:** `docs/superpowers/specs/2026-10-30-email-verified-account-activation-design.md`

**Execution status:** Plan only. Do not implement, migrate, commit, send invitations, rotate tokens, or modify accounts until Eric explicitly asks to proceed. Work in `itr-patient-history` per Eric's existing preference and notify him before product code editing.

## Global Constraints

- Keep administrative active/inactive status separate from Pending Setup.
- No temporary-password, password-reset, copied-link, frontend-only, or permanent admin bypass for unverified accounts.
- Do not infer mailbox ownership from active status or successful historical email delivery.
- Retain the case-insensitive login fix and reject ambiguous case-colliding identities.
- No Gmail-only restriction, Gmail alias folding, real test emails, or secrets in logs.
- Keep historical audit records; remove unused executable code only after tracing callers.
- Existing-account rollout and admin bootstrap must be reviewed before enabling enforcement.

## Review Focus

1. Old bearer/refresh tokens must not bypass new verification rules (Task 2).
2. Reset, copied-link and temporary-password paths must not silently activate pending accounts (Tasks 1 and 3).
3. An email edit racing with acceptance must invalidate the old mailbox token (Tasks 1 and 3).
4. Existing unverified MHO accounts must not be silently locked out or blindly marked verified (Task 5).
5. A provider accepting a send, a failed send or a GET link preview must not mark setup complete (Tasks 1 and 4).

---

## File map

- Verification policy: new `backend/app/Services/AccountActivationService.php`.
- Invitation proof/password transaction: `backend/app/Http/Controllers/Api/AccountInviteController.php`, `backend/app/Services/AccountInviteService.php`, `PasswordSetService.php`, `PasswordSetRecorder.php` in that Services directory.
- Session/API gates: `backend/app/Http/Controllers/Api/AuthController.php`, `backend/app/Services/UserSessionRevocationService.php`, new `backend/app/Http/Middleware/EnsureAccountIsActivated.php`, `backend/bootstrap/app.php`, `backend/routes/api.php`.
- Email changes/reset recovery: `backend/app/Http/Requests/UserRequest.php`, `backend/app/Http/Controllers/Api/UserController.php`, `AccountInviteController.php`, `PasswordResetRequestController.php` in that Controllers directory.
- Client setup/actions: `frontend/src/utils/accountAccess.js`, `accessRequestStatus.js`, `accountSetup.js`; `frontend/src/components/features/password-access/InvitesTab.jsx`, `TemporaryPasswordDialog.jsx`, `AccessRequestTable.jsx`; `frontend/src/pages/admin/AddUser.jsx`; `frontend/src/pages/AcceptInvite.jsx`, `Login.jsx`; `frontend/src/services/accountInviteService.js`, `apiClient.js`, `authService.js` only for contract propagation; existing account details/status components if displaying setup state.
- Tests: existing `backend/tests/Feature/AccountInviteAcceptTest.php`, `AccountInviteAdminTest.php`, `AccountInviteCreationTest.php`, `TemporaryPasswordSignInTest.php`, `PasswordSetRecorderTest.php`, `ResetRequestDeliveryTest.php`, `AccountEmailChangeResetRequestTest.php`, `AuthenticationPersistenceTest.php`, `AuthenticationSessionSecurityTest.php`; new `backend/tests/Feature/AccountActivationSecurityTest.php`; existing frontend account/access/activation tests listed in Task 4.
- Rollout guide: new `docs/account-activation-rollout.md`.

## Task 1: Make emailed invitation acceptance the activation authority

**Interfaces:** New `AccountActivationService::isActivated(User $user): bool` reads persisted verification. New `AccountActivationService::acceptInvite(AccountInvite $invite, string $token, string $password): bool` locks/reloads account and invitation in a consistent order, validates current email and token, and atomically performs password setup and verification. Controllers retain their existing request fields and success response.

- [ ] Add failing cases in `AccountInviteAcceptTest`: creation/sending/GET verify leaves `email_verified_at` null; valid POST accept sets it and hashes the personal password; invalid/expired/replayed tokens leave both unchanged. Use `Mail::fake()` and existing fixture helpers.

```php
$this->assertNull($user->fresh()->email_verified_at); // after create/send/GET preview
// after valid acceptance:
$this->assertNotNull($user->fresh()->email_verified_at);
$this->assertTrue(Hash::check('PersonalPass42', $user->fresh()->password));
```

- [ ] Run `php artisan test --filter=AccountInviteAcceptTest` from `backend`; confirm the new verification assertion fails before implementation.
- [ ] Implement the service and delegate acceptance to it. Re-check active status, current account/invite email equality after trim/lower normalization, pending status, hash, and future expiry under locks. Keep the existing 48-hour expiry. Roll back password, verification and invite consumption together on any failure.
- [ ] Add stale-email and concurrent double-acceptance cases: exactly one acceptance succeeds; an old-email token never verifies the replacement email. Use isolated PostgreSQL for actual locking evidence and SQLite for ordinary feature behavior.
- [ ] Run `php artisan test --filter='AccountInviteAcceptTest|AccountInviteCreationTest'`; expect all selected tests passing, including unchanged password-strength and one-time-token checks.
- [ ] After reviewing the task diff, commit only its implementation and tests when implementation is authorized: `feat(auth): activate accounts through verified invitation acceptance`.

## Task 2: Enforce activation across sessions and APIs

**Interfaces:** Consume `AccountActivationService::isActivated(User $user): bool`. Add `EnsureAccountIsActivated::handle(Request $request, Closure $next): Response`, registered as `account.activated`. Authenticated unverified requests return 403 with `ACCOUNT_SETUP_REQUIRED`; logout is allowed. A correct-password login for an unverified account returns the same code without issuing a session or refresh cookie. Wrong/ambiguous credentials retain generic `LOGIN_FAILED`. Invalid refresh remains the existing 401 session contract and clears its cookie.

- [ ] Create `AccountActivationSecurityTest` cases for correct-password/unverified login, directly minted old access token, old refresh cookie, admin role, and disabled facility/permissions. Assert blocked access and no new token pair; logout still works. Verify a verified account still obeys active status, facility and MHO permissions.

```php
$response->assertForbidden()->assertJsonPath('code', 'ACCOUNT_SETUP_REQUIRED');
$this->assertDatabaseCount('personal_access_tokens', 0); // failed initial login
```

- [ ] Run `php artisan test --filter=AccountActivationSecurityTest`; confirm the bypass cases fail against current behavior.
- [ ] Add activation checks before access/persistent-session issuance and during refresh. Register middleware on the entire authenticated API group, with logout as the narrow exception; include profile/change-password so old tokens cannot finish setup through those routes. Preserve existing `password.current`, role, facility, Turnstile, throttling and token-ability checks.
- [ ] Add `email_verified_at` to `AuthController::userPayload()` and preserve it through `apiClient.js` normalization if needed. Frontend state is informational; no client value is trusted for verification.
- [ ] Update ordinary authenticated test fixtures to explicitly represent verified accounts only where those tests exercise already activated staff. Leave invite/security fixtures unverified; do not auto-verify every fixture in shared setup.
- [ ] Run `php artisan test --filter='AccountActivationSecurityTest|AuthenticationPersistenceTest|AuthenticationSessionSecurityTest|TemporaryPasswordSignInTest'`; expect no failed or silently skipped relevant cases. Temporary-password tests must now use verified users when testing recovery.
- [ ] Review and commit: `fix(auth): enforce activation on login refresh and protected APIs`.

## Task 3: Close alternate setup routes and handle email corrections

**Interfaces:** Unverified temporary-password and copied-invite-link requests return 403 `ACCOUNT_SETUP_REQUIRED` without changing password/hash/expiry or returning a token. Password-reset routes do not activate unverified users. Public reset request responses remain generic to avoid account enumeration. Only Task 1 writes verification.

- [ ] Add failing tests in `AccountInviteAdminTest`, `PasswordSetRecorderTest`, `ResetRequestDeliveryTest`, `AccountEmailChangeResetRequestTest` and `AccountActivationSecurityTest`: temp generation/direct copy endpoint cannot activate pending users; manually supplied old copied tokens fail; reset approval/copy/completion cannot complete a pending invitation or verify email; a verified recovery still works.
- [ ] Run `php artisan test --filter='AccountInviteAdminTest|PasswordSetRecorderTest|ResetRequestDeliveryTest|AccountEmailChangeResetRequestTest|AccountActivationSecurityTest'`; record the new failing cases.
- [ ] Guard temporary-password issuance in `AccountInviteService::temporaryPassword()` as well as its endpoint, so non-controller callers cannot bypass policy. Preserve verified recovery only where currently supported; do not add new endpoints for completed invites.
- [ ] Retire invite copy-link generation and raw activation URL responses. During rollout invalidate pending invitations marked copied and other tokens without trustworthy emailed provenance. Old endpoint calls must fail safely rather than return an activation secret. Historical copied/completed audit values remain readable.
- [ ] Restrict reset request approval, resend/copy, token verification and completion to already verified users. Return generic public responses for unavailable accounts. Remove/reset the recorder behavior that completes an unverified invitation through reset/temporary-password routes; verify the guard exists at service boundaries as well as HTTP boundaries.
- [ ] Audit the legacy `AuthController::forgotPassword()`/`resetPassword()` methods against `routes/api.php`; remove those unused methods/imports only if there are no other callers, rather than maintaining an unguarded alternate path.
- [ ] Normalize email writes and compare identities case-insensitively in `UserRequest`, invite email update and account update; reject case-only duplicate accounts without choosing an arbitrary existing row. On actual mailbox change, lock the account, clear verification, revoke sessions and invalidate old invite/reset tokens in one transaction, then send a new invitation after commit. A completed old invitation must be rotated to pending for the new address. Do not treat capitalization-only edits as a new mailbox.
- [ ] Re-run Task 3 tests plus `php artisan test --filter='AccountProfileEditTest|TemporaryPasswordSignInTest'`; include wrong email, mixed case, mail failure and acceptance-versus-email-edit race.
- [ ] Review and commit: `fix(auth): prevent alternate activation and invalidate stale email credentials`.

## Task 4: Explain Pending Setup and remove obsolete admin actions

**Interfaces:** Account/invite responses expose `user.email_verified_at`; UI derives Pending Setup separately from active/inactive status. Consume `ACCOUNT_SETUP_REQUIRED` as a clear setup message without storing an authenticated session. Existing invitation accept success continues directing the user to sign in.

- [ ] Extend `frontend/src/utils/accessRequestStatus.test.js`, `accountAccess.test.js`, `accountSetup.test.js` and `frontend/src/config/turnstile.test.js` with these assertions: unverified invite has resend/correct-email only; no copy/temp action; verified recovery actions follow existing lifecycle; delivery sent is not setup complete; login setup error says to use the invitation or ask MHO to resend; inactive status remains distinct.
- [ ] Run `npm.cmd run test:access` and `node --test src/utils/accountAccess.test.js src/config/turnstile.test.js` in `frontend`. Confirm new assertions fail before changing behavior.
- [ ] Update status/action helpers and InvitesTab. Remove activation-copy service functions/dialog branches and imports only after searching every caller. Keep `CopyValue`, `copyText`, and `ManualCopyDialog` if verified reset recovery still uses them; do not delete shared recovery code wholesale.
- [ ] Update AddUser and account details copy to say the account was created with setup pending, invitation delivery can fail, and access requires completion. Retain resend and correct-email actions with inline errors and existing shadcn/Tailwind components. Do not label a mail provider accepting a message as proven inbox delivery.
- [ ] Handle setup-required login/session responses without entering a dashboard or retaining sensitive cached state. Reuse existing auth cleanup and invitation pages; no extra verification screen is required.
- [ ] Run `npm.cmd run test:access`, `node --test src/utils/accountAccess.test.js src/config/turnstile.test.js`, and `npm.cmd run build`; expect pass, and inspect both desktop and phone layouts once for account creation, invitations and blocked login.
- [ ] Review and commit: `feat(accounts): show pending activation and remove unverified access shortcuts`.

## Task 5: Prepare controlled rollout and verify the complete flow

**Files:** Create `docs/account-activation-rollout.md`; adapt existing fixture/seeder files only after identifying them during implementation. `users.email_verified_at` already exists, so no schema migration is planned solely to add that field.

- [ ] Document a read-only preflight report: counts of null verification by role and invite completion route, pending copied tokens, case-colliding emails and verified admin availability. Report counts only; no passwords, hashes, tokens, or unnecessary personal data.
- [ ] Document reviewed treatment of existing accounts: mailbox re-invitation, rotation of pending copied/unknown-provenance links, verified admin bootstrap, token revocation and deployment ordering. Never mass-set verification based on active status, reset completion or temporary-password history. Agree the existing-account cohort and recovery procedure with Eric before deploying enforcement.
- [ ] Use a disposable database and controlled test mail inbox to exercise create -> Pending Setup -> blocked temporary/copy/direct API -> emailed invitation -> password setup -> verified login -> EHR access. In tests, assert no EHR access before acceptance and preserve configured permissions afterward.
- [ ] Verify expired and replayed links, mail failures, corrected email, old access/refresh tokens, inactive accounts, verified password recovery, and verified-admin access. Repeat transaction races on isolated PostgreSQL; explicitly report unavailable runtime verification.
- [ ] Run the complete backend suite with `php artisan test` in the testing environment and `npm.cmd run test:access`, `npm.cmd run test:medicine`, `node --test src/utils/accountAccess.test.js src/config/turnstile.test.js`, and `npm.cmd run build` in frontend. Review diff for removed callers and accidental changes to clinical workflows.
- [ ] Review and commit the rollout guide and final verification record: `docs(auth): document verified account activation rollout`.
- [ ] Stop at a reviewable local result. Production email sends, re-invitations, account updates, deployment and enforcement on live users require separately authorized execution.

## Planning self-review

Coverage: creation/acceptance in Task 1; login/session/API enforcement in Task 2; alternative routes and email edits in Task 3; user-facing state and dead-code removal in Task 4; existing accounts and release order in Task 5. Shared service interfaces, codes and status vocabulary are specified above. Historical invite completion is explicitly not treated as mailbox proof. The main rollout decision still requiring Eric's review is treatment of existing null-verification accounts and the first verified MHO/admin; this does not block writing this plan.
