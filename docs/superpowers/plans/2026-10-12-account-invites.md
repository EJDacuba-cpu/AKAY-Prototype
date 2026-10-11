# Account Invites and Temporary Passwords Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New accounts get an emailed one-time invite link instead of an MHO-chosen password, with a temporary-password fallback, live validation icons on the account forms, and one Password & Invites page with four shared statuses.

**Architecture:** A new `account_invites` table and `AccountInviteService` own invite tokens and mail; a `PasswordSetRecorder` closes every open invite or reset request whenever a user sets a password by any route; a `password.current` middleware enforces the forced change. On the frontend, two pure mapping utilities (`accessRequestStatus`, `fieldState`) drive a shared table used by both tabs, and two new public pages handle accepting an invite and the forced change.

**Tech Stack:** Laravel 11 (PHPUnit, Sanctum, Mailables), React 19 + react-router + Tailwind v4, `node --test` for frontend utilities.

**Spec:** `docs/superpowers/specs/2026-10-12-account-invites-design.md`

## Global Constraints

- All UI copy, code and comments in English. Copy strings below are exact.
- Invite link: one use, valid **48 hours**. Reset link: **60 minutes** (unchanged, `PASSWORD_RESET_TOKEN_EXPIRES_MINUTES`). Temporary password: valid **72 hours**.
- Password rule for accepting an invite and for the forced change: `PasswordRule::min(8)->mixedCase()->numbers()` (same as reset `complete`).
- Tokens: `Str::random(64)`, stored only as `hash('sha256', $token)`.
- Never write a password or token to a log, audit description or notification. Mask emails in logs with the existing `maskEmail` behavior.
- Both tabs use exactly four statuses: `pending` → "Pending", `in_progress` → "In progress", `complete` → "Complete", `cancelled` → "Cancelled". The reason appears only in the badge tooltip and View details.
- Emails compare without case (`lower(email) = ?`), as login and `emailAvailable` do.
- Animations respect `prefers-reduced-motion`.
- Backend test command: `cd backend && php artisan test --filter=<Name>`. Frontend: `cd frontend && npm run test:access`. Lint: `cd frontend && npx eslint <files>`.

## Review Focus

1. **Copy link on a failed email.** After the MHO copies a link for a row showing Email not sent, the row must move to In progress, not stay Pending. Decision: `delivery` gains the value `copied` ("Link shared by the MHO · expires in {time}"). Tests in Task 5, Task 7 and Task 10.
2. **Edit email to an address used by another account in different case** (`MARIA@x.com` vs `maria@x.com`) must be refused with the uniqueness message. Test in Task 5.
3. **Accepting the same invite twice** (double click, back button) must set the password once and answer the second call with 422. Test in Task 4.
4. **Signing in with a correct but expired temporary password** must fail with `TEMP_PASSWORD_EXPIRED`, and the invite row must show Pending ("Temporary password expired"). Tests in Task 6 and Task 10.
5. **Actions on an inactive account's invite or reset request** must be refused (422) and the row shows Cancelled; reactivating shows the previous status. Tests in Task 5 and Task 10.

---

## File Structure

Backend
- `database/migrations/2026_10_12_000001_create_account_invites.php` — new table, user columns, reset-request columns.
- `app/Models/AccountInvite.php` — model and constants.
- `app/Models/PasswordResetRequest.php` — new constants, fillable.
- `app/Support/FrontendUrl.php` — builds frontend links (moved out of the reset controller).
- `app/Services/PasswordSetRecorder.php` — B4 rule.
- `app/Services/AccountInviteService.php` — issue, send, link, temporary password.
- `app/Services/AccessRequestStatus.php` — translates the four display statuses into query conditions for both models.
- `app/Mail/AccountInviteMail.php`, `resources/views/emails/account-invite.blade.php`.
- `app/Http/Controllers/Api/AccountInviteController.php` — public verify/accept, admin list and actions, summary.
- `app/Http/Middleware/EnsurePasswordIsCurrent.php` — `password.current`.
- Modify: `UserController.php`, `UserRequest.php`, `AuthController.php`, `PasswordResetRequestController.php`, `routes/api.php`, `bootstrap/app.php`.

Frontend
- `src/utils/fieldState.js` (+ test), `src/utils/passwordRules.js` (+ test), `src/utils/accessRequestStatus.js` (+ test), `src/utils/passwordChange.js` (+ test).
- `src/services/accountInviteService.js`; modify `src/services/passwordResetService.js`.
- `src/components/features/access/FieldError.jsx` — `state` prop and icon.
- `src/components/features/password-access/AccessRequestTable.jsx` — the shared table, `AccessStatusBadge.jsx`, `ResetRequestsTab.jsx`, `InvitesTab.jsx`, `TemporaryPasswordDialog.jsx`.
- `src/pages/AcceptInvite.jsx`, `src/pages/ChangePassword.jsx`.
- Modify: `src/pages/admin/AddUser.jsx`, `src/pages/admin/PasswordResetRequests.jsx` (becomes the tab container), `src/pages/admin/UserManagement.jsx`, `src/utils/accountForm.js`, `src/App.jsx`, `src/services/apiClient.js`, `src/pages/Login.jsx`, `src/components/layout/sidebar/sidebarData.js`, `src/index.css`, `package.json` (`test:access`).

---

### Task 1: Live validation icons on Create Account

**Files:**
- Create: `frontend/src/utils/fieldState.js`, `frontend/src/utils/fieldState.test.js`
- Modify: `frontend/src/components/features/access/FieldError.jsx`, `frontend/src/pages/admin/AddUser.jsx`, `frontend/src/index.css`, `frontend/package.json`

**Interfaces:**
- Produces: `fieldState({ touched: boolean, error?: string, checking?: boolean, confirmed?: boolean }) -> "valid" | "checking" | "invalid" | undefined`; `<Field state={...}>` used again in Tasks 9 and 12.

- [ ] **Step 1: Write the failing test** in `fieldState.test.js`:

```js
test("an untouched field shows nothing", () => assert.equal(fieldState({ touched: false }), undefined));
test("an error wins over everything", () => assert.equal(fieldState({ touched: true, error: "Enter mobile number.", checking: true }), "invalid"));
test("an error shows even before the field was left", () => assert.equal(fieldState({ touched: false, error: "Email is already taken." }), "invalid"));
test("a server check in flight shows the spinner", () => assert.equal(fieldState({ touched: true, checking: true }), "checking"));
test("a left, passing field is valid", () => assert.equal(fieldState({ touched: true }), "valid"));
test("a field waiting for server confirmation is not valid yet", () => assert.equal(fieldState({ touched: true, confirmed: false }), undefined));
```

- [ ] **Step 2: Add `src/utils/fieldState.test.js` to the `test:access` script and run it.** Run: `cd frontend && npm run test:access`. Expected: FAIL, `fieldState.js` not found.

- [ ] **Step 3: Implement `fieldState` in `src/utils/fieldState.js`.** Order: error → `"invalid"`; checking → `"checking"`; touched and `confirmed !== false` → `"valid"`; otherwise `undefined`.

- [ ] **Step 4: Add the icon to `Field`.** New prop `state`. Wrap the cloned input in `relative` and add `pr-9` to it when `state` is set. Render inside the wrapper, `absolute right-3 top-1/2 -translate-y-1/2`:
  - `valid`: lucide `CircleCheck` 16px, `text-emerald-600`, class `akay-check-in`, `aria-hidden`.
  - `checking`: lucide `LoaderCircle` 16px `animate-spin text-slate-400 motion-reduce:animate-none`, with `<span className="sr-only">Checking…</span>`.
  - `invalid`: lucide `CircleAlert` 16px `text-red-600`, `aria-hidden` (the message below already announces it).
  In `index.css`, add `@keyframes akay-check-in { from { opacity: 0; transform: scale(.6) } to { opacity: 1; transform: scale(1) } }`, `.akay-check-in { animation: akay-check-in 200ms ease-out }`, and inside `@media (prefers-reduced-motion: reduce)` set `.akay-check-in { animation: none }`.

- [ ] **Step 5: Wire it in `AddUser.jsx`.** Track `checkingEmail` (true while `checkEmail` awaits). Pass to the three Personal Details fields: `state={fieldState({ touched: touched[key], error: fieldError(key), checking: key === "email" && checkingEmail, confirmed: key === "email" ? takenEmails[form.email.toLowerCase()] === false : undefined })}`. Leave the password fields untouched here; Task 8 removes them.

- [ ] **Step 6: Run tests and lint.** `npm run test:access` → all pass; `npx eslint src/utils/fieldState.js src/components/features/access/FieldError.jsx src/pages/admin/AddUser.jsx` → no output.

- [ ] **Step 7: Commit** `feat(accounts): live validation icons on account fields`.

---

### Task 2: Schema, models and `PasswordSetRecorder`

**Files:**
- Create: `backend/database/migrations/2026_10_12_000001_create_account_invites.php`, `backend/app/Models/AccountInvite.php`, `backend/app/Services/PasswordSetRecorder.php`, `backend/tests/Feature/PasswordSetRecorderTest.php`
- Modify: `backend/app/Models/PasswordResetRequest.php`, `backend/app/Models/User.php`

**Interfaces:**
- Produces:
  - `AccountInvite` constants `STATUS_PENDING='pending'`, `STATUS_EXPIRED='expired'`, `STATUS_TEMPORARY='temporary'`, `STATUS_COMPLETED='completed'`; `DELIVERY_SENT='sent'`, `DELIVERY_FAILED='failed'`, `DELIVERY_COPIED='copied'`; `VIA_LINK='link'`, `VIA_TEMPORARY_PASSWORD='temporary_password'`, `VIA_RESET='reset'`. Relations `user()`, `creator()`. `token_hash` hidden. Datetime casts for `expires_at`, `sent_at`, `completed_at`.
  - `PasswordResetRequest` adds `DELIVERY_SENT`, `DELIVERY_FAILED`, `DELIVERY_COPIED` (same values), `VIA_LINK='link'`, `VIA_INVITE='invite'`, `VIA_TEMPORARY_PASSWORD='temporary_password'`; `delivery`, `completed_via` fillable.
  - `User` relation `accountInvite(): HasOne`; casts `must_change_password => 'boolean'`, `temp_password_expires_at => 'datetime'`. Neither is fillable; set them with `forceFill`.
  - `PasswordSetRecorder::record(User $user, string $route): void`, `$route` one of `'invite' | 'reset' | 'temporary_password'`.

- [ ] **Step 1: Write the migration** exactly as spec B1–B3: `account_invites` (`user_id` unique FK cascade, `email`, `token_hash` nullable, `status` string default `pending`, `delivery` nullable string, `completed_via` nullable string, `expires_at`/`sent_at`/`completed_at` nullable timestamps, `created_by` nullable FK `nullOnDelete`, timestamps); `users.must_change_password` boolean default false, `users.temp_password_expires_at` nullable timestamp; `password_reset_requests.delivery` and `.completed_via` nullable strings. `down()` drops all of them.

- [ ] **Step 2: Write the failing tests** in `PasswordSetRecorderTest`:

```php
public function test_an_invite_link_completes_the_invite_and_open_reset_requests(): void
// invite pending + reset request approved → record($user, 'invite')
// invite: status completed, completed_via 'link', token_hash null, completed_at set
// reset: status completed, completed_via 'invite', reset_token_hash null, expires_at null

public function test_a_reset_completes_an_open_invite_via_reset(): void
// invite expired + reset approved → record($user, 'reset') → invite completed via 'reset'; reset completed via 'link'

public function test_a_temporary_password_change_completes_both_via_temporary_password(): void
// invite temporary + reset pending → record($user, 'temporary_password') → both completed via 'temporary_password'

public function test_finished_items_are_left_alone(): void
// reset rejected and an older reset completed via 'link' stay as they are after record($user, 'invite')
```

- [ ] **Step 3: Run** `php artisan test --filter=PasswordSetRecorderTest`. Expected: FAIL (class not found).

- [ ] **Step 4: Implement the models and `PasswordSetRecorder::record`.** Route → `completed_via`: invites `invite→link, reset→reset, temporary_password→temporary_password`; reset requests `reset→link, invite→invite, temporary_password→temporary_password`. Open means invite `status != completed`; reset `status in (pending, approved, expired)`. One `DB::transaction`.

- [ ] **Step 5: Run** the test. Expected: PASS (4 tests).

- [ ] **Step 6: Commit** `feat(accounts): account invites schema and password-set recorder`.

---

### Task 3: Invite on create, mail, and no passwords from the MHO

**Files:**
- Create: `backend/app/Support/FrontendUrl.php`, `backend/app/Services/AccountInviteService.php`, `backend/app/Mail/AccountInviteMail.php`, `backend/resources/views/emails/account-invite.blade.php`, `backend/tests/Feature/AccountInviteCreationTest.php`
- Modify: `backend/app/Http/Controllers/Api/UserController.php` (`store`), `backend/app/Http/Requests/UserRequest.php`, `backend/app/Http/Controllers/Api/PasswordResetRequestController.php` (use `FrontendUrl`), `backend/tests/Feature/StaffRoleAccountTest.php` and any test that posts `password` to `/api/users`

**Interfaces:**
- Consumes: Task 2 models.
- Produces:
  - `FrontendUrl::to(string $path): string` — `rtrim(env('FRONTEND_URL', env('APP_FRONTEND_URL', 'http://localhost:5173')), '/').$path`.
  - `AccountInviteService` constants `LINK_HOURS = 48`, `TEMPORARY_PASSWORD_HOURS = 72`; methods `issue(User $user, ?User $by): AccountInvite` (create or rotate, then send), `resend(AccountInvite $invite): AccountInvite`, `link(AccountInvite $invite): string` (rotate, `delivery = copied`, return URL), `temporaryPassword(AccountInvite $invite): string`, `inviteUrl(string $token): string` (`FrontendUrl::to('/accept-invite?token='.$token)`). Private `rotate(AccountInvite $invite): string` sets a new token hash, `status = pending`, `email = user email`, `expires_at = now + 48h`, `sent_at = now`, returns the raw token.
  - `store` response gains `invite: { delivery: "sent" | "failed" }`.

- [ ] **Step 1: Write the failing tests** in `AccountInviteCreationTest` (use `Mail::fake()`):
  - `test_creating_an_account_emails_a_one_time_invite`: POST `/api/users` without password → 201, `invite.delivery = sent`; one `account_invites` row, `status pending`, `expires_at` 48 h ahead (±1 min), `token_hash` 64 hex chars; `Mail::assertSent(AccountInviteMail::class)` to the account email, and the mail's URL contains `/accept-invite?token=` whose sha256 equals `token_hash`.
  - `test_the_new_account_cannot_sign_in_before_accepting`: login with `password123` and with an empty password → 422 `LOGIN_FAILED`.
  - `test_a_mailer_failure_still_creates_the_account`: `Mail::shouldReceive('to')->andThrow(new \RuntimeException('smtp down'))` → 201, `invite.delivery = failed`, row `delivery failed`.
  - `test_the_mho_cannot_set_a_password`: POST and PATCH with `password` → 422 with an error on `password`.
  - `test_the_audit_log_never_contains_the_token`: no `audit_logs.description` contains the raw token or `token_hash`.

- [ ] **Step 2: Run** `php artisan test --filter=AccountInviteCreationTest`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `UserRequest`: `password` and `password_confirmation` become `['prohibited']` on create and update.
  - `UserController@store`: `$data['password'] = Str::random(64)` before `User::create`; then `$invite = $invites->issue($user, $request->user())`; add `'invite' => ['delivery' => $invite->delivery]` to the response. Audit `account invite sent` with the masked email.
  - `AccountInviteService::send` (private): try `Mail::to($invite->email)->send(new AccountInviteMail($invite, $url))`, set `delivery = sent`; on `Throwable` log `Account invite email failed.` with the invite id and masked email, set `delivery = failed`. Never rethrow.
  - Mail view: copy the reset email's frame. Subject `You're now in AKAY`. Body lines (exact): "Hello {{ name }},", "The Municipal Health Officer created your AKAY account.", "Facility: {{ facility }}" and "Role: {{ staff role label }}" (skip lines that are empty), button **Set up your account**, "This link works once and expires in 48 hours.", "If you did not expect this email, do not open the link and tell your MHO."
  - `PasswordResetRequestController`: replace `frontendUrl()` with `FrontendUrl::to(...)`.
  - Update existing tests that posted `password`/`password_confirmation` to `/api/users`: drop those keys.

- [ ] **Step 4: Run** `php artisan test --filter="AccountInviteCreation|StaffRoleAccount|EmailAvailability|AccountFacility"`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(accounts): invite new accounts by email instead of an MHO password`.

---

### Task 4: Accept an invite (public)

**Files:**
- Create: `backend/app/Http/Controllers/Api/AccountInviteController.php` (public part), `backend/tests/Feature/AccountInviteAcceptTest.php`
- Modify: `backend/routes/api.php`

**Interfaces:**
- Consumes: `AccountInviteService`, `PasswordSetRecorder`.
- Produces: `GET /api/auth/invites/verify?token=` → `{ data: { name, email, expires_at } }`; `POST /api/auth/invites/accept` → `{ message: "Your password is set. Sign in to continue." }`. Throttles: verify `20,1`, accept `10,1`.

- [ ] **Step 1: Write the failing tests:**
  - `test_a_valid_token_shows_the_account` → 200 with name and email.
  - `test_accepting_sets_the_password_and_completes_the_invite` → then login with the new password succeeds; invite `completed` via `link`.
  - `test_a_link_works_once`: the second accept with the same token → 422 "This invite link is invalid or expired." and the password is unchanged (Review Focus 3).
  - `test_an_expired_link_is_refused_and_marked_expired`: travel 49 h → verify 422; row `status expired`, `token_hash` null.
  - `test_an_inactive_account_cannot_accept` → 422.
  - `test_weak_passwords_are_refused`: `password1`, `PASSWORD1`, `Password` → 422 on `password`.

- [ ] **Step 2: Run** `php artisan test --filter=AccountInviteAcceptTest`. Expected: FAIL.

- [ ] **Step 3: Implement** `verify(Request)` and `accept(Request, PasswordSetRecorder, AuditLogger)`. Lookup: `token_hash = sha256(token)`, `status = pending`, user active, `expires_at` in the future; an expired match is updated to `expired` with `token_hash` null. Accept runs in a transaction with `lockForUpdate()` on the invite: set the password, `must_change_password = false`, `temp_password_expires_at = null`, `record($user, 'invite')`, revoke the user's tokens (`revokeAllTokens($user, 'invite-accepted')`), audit `account invite completed`.

- [ ] **Step 4: Run** the test. Expected: PASS.

- [ ] **Step 5: Commit** `feat(accounts): accept an account invite and set a password`.

---

### Task 5: Admin invite actions, list and summary

**Files:**
- Create: `backend/app/Services/AccessRequestStatus.php`, `backend/tests/Feature/AccountInviteAdminTest.php`
- Modify: `backend/app/Http/Controllers/Api/AccountInviteController.php`, `backend/routes/api.php`

**Interfaces:**
- Consumes: Task 3 service.
- Produces (all inside `role:admin`):
  - `GET /api/account-invites?status=&search=&per_page=` → paginated rows `{ id, email, status, delivery, completed_via, sent_at, expires_at, completed_at, temp_password_expires_at, user: { id, name, email, role, staff_role, status, facility } }`.
  - `POST /api/account-invites/{invite}/resend`, `PATCH /api/account-invites/{invite}/email` `{ email }`, `POST /api/account-invites/{invite}/link` → `{ data: { url } }`, `POST /api/account-invites/{invite}/temporary-password` → `{ data: { password, expires_at } }`.
  - `GET /api/password-invites/summary` → `{ data: { reset_requests: int, invites: int } }`, the Pending counts.
  - `AccessRequestStatus::applyToInvites(Builder $query, string $status): void` and `applyToResetRequests(Builder $query, string $status): void` for `pending | in_progress | complete | cancelled`, following spec F2 (with `delivery = copied` counted as In progress, and "account inactive and not completed" as Cancelled, excluded from every other status).

- [ ] **Step 1: Write the failing tests:**
  - `test_resend_rotates_the_token_and_restarts_48_hours`: the old token no longer verifies; mail sent again.
  - `test_copy_link_returns_a_working_url_and_counts_as_in_progress` (Review Focus 1): start from `delivery failed`; response URL verifies; row `delivery copied`; `?status=in_progress` lists it and `?status=pending` does not.
  - `test_edit_email_updates_the_account_and_resends`; `test_edit_email_refuses_an_address_in_use_in_any_case` with `MHO@Example.Test` → 422 on `email` (Review Focus 2).
  - `test_temporary_password_is_returned_once_and_never_logged`: response password has 12+ chars with upper, lower and a digit; user `must_change_password` true, `temp_password_expires_at` 72 h ahead; invite `status temporary`, `token_hash` null; no audit description or log contains the password.
  - `test_completed_or_inactive_invites_refuse_every_action` (Review Focus 5): each action → 422.
  - `test_status_filters_follow_the_four_statuses`: seed one invite per F2 invite row (including `temporary` past expiry → pending, inactive account → cancelled) and assert each filter returns exactly the expected ids.
  - `test_summary_counts_pending_rows_on_both_tabs`.
  - `test_only_admins_can_use_invite_actions`: a BHC user → 403.

- [ ] **Step 2: Run** `php artisan test --filter=AccountInviteAdminTest`. Expected: FAIL.

- [ ] **Step 3: Implement** the controller actions and `AccessRequestStatus`. The temporary password is generated with `Str::password(12, symbols: false)` repeated until it matches `/[a-z]/`, `/[A-Z]/` and `/\d/`; set it with `forceFill`, set the flags, `status = temporary`, clear `token_hash`, `revokeAllTokens($user, 'temporary-password')`, audit `temporary password issued` (no password in the text). Edit email uses the case-insensitive uniqueness check from `emailAvailable` with `ignore = user id`, updates `users.email`, then resends. Audit `account invite resent`, `account invite email changed`, `account invite link copied`.

- [ ] **Step 4: Run** the test. Expected: PASS.

- [ ] **Step 5: Commit** `feat(accounts): MHO invite actions, status filters and summary`.

---

### Task 6: Temporary passwords at sign-in and the forced change

**Files:**
- Create: `backend/app/Http/Middleware/EnsurePasswordIsCurrent.php`, `backend/tests/Feature/TemporaryPasswordSignInTest.php`
- Modify: `backend/app/Http/Controllers/Api/AuthController.php`, `backend/bootstrap/app.php`, `backend/routes/api.php`

**Interfaces:**
- Produces: session `user.must_change_password: boolean`; `POST /api/auth/change-password` `{ current_password, password, password_confirmation }` → `{ message: "Password changed.", user }` (throttle `10,1`); 403 `{ code: "PASSWORD_CHANGE_REQUIRED" }` from the middleware; 422 `{ code: "TEMP_PASSWORD_EXPIRED", message: "This temporary password has expired. Ask the MHO for a new one." }` from login.

- [ ] **Step 1: Write the failing tests:**
  - `test_signing_in_with_a_temporary_password_flags_the_session`.
  - `test_other_routes_are_blocked_until_the_password_changes`: `GET /api/patients` → 403 `PASSWORD_CHANGE_REQUIRED`; `GET /api/auth/profile` and `POST /api/auth/logout` still work.
  - `test_changing_the_password_clears_the_flags_and_completes_the_invite`: after change, `/api/patients` is no longer 403 for that reason; invite `completed` via `temporary_password`.
  - `test_an_expired_temporary_password_cannot_sign_in` (Review Focus 4): travel 73 h → 422 `TEMP_PASSWORD_EXPIRED`.
  - `test_the_new_password_must_differ_and_follow_the_rules`: same as current → 422; `weakpass` → 422; wrong `current_password` → 422 on `current_password`.

- [ ] **Step 2: Run** `php artisan test --filter=TemporaryPasswordSignInTest`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `login`: after the existing `$validAccount` check passes, if `must_change_password` and `temp_password_expires_at` is past, return the 422 above.
  - `userPayload`: add `'must_change_password' => (bool) $user->must_change_password`.
  - Middleware alias `password.current`; append it to the authenticated group in `routes/api.php`. It passes requests whose path is `api/auth/profile`, `api/auth/logout` or `api/auth/change-password`, and otherwise returns the 403 when `must_change_password` is true.
  - `changePassword(Request, PasswordSetRecorder, AuditLogger)`: rules `current_password` required, `password` `required|confirmed|different:current_password` plus the global rule; check `current_password` with `Hash::check`; set the password, clear both flags; if the flag was set, `record($user, 'temporary_password')`; audit `password changed`; return the fresh `userPayload`.

- [ ] **Step 4: Run** `php artisan test --filter="TemporaryPasswordSignIn|AuthenticationSessionSecurity|AuthenticationPersistence"`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(auth): temporary passwords with an enforced change at sign-in`.

---

### Task 7: Reset requests: delivery, resend, copy link, recorder, staff role

**Files:**
- Create: `backend/tests/Feature/ResetRequestDeliveryTest.php`
- Modify: `backend/app/Http/Controllers/Api/PasswordResetRequestController.php`, `backend/routes/api.php`

**Interfaces:**
- Consumes: `PasswordSetRecorder`, `AccessRequestStatus::applyToResetRequests`, `FrontendUrl`.
- Produces: `POST /api/password-reset-requests/{request}/resend`, `POST /api/password-reset-requests/{request}/link` → `{ data: { url } }`; `index` accepts `status=pending|in_progress|complete|cancelled`; `toResponse` adds `delivery`, `completed_via`, `user.staff_role`.

- [ ] **Step 1: Write the failing tests:**
  - `test_an_approval_whose_email_fails_is_saved_as_failed`: mailer throws → 200 (not 500), `delivery failed`, `status approved`.
  - `test_resend_and_link_restart_the_60_minute_window`: old token stops verifying; `link` sets `delivery copied` and the URL verifies.
  - `test_resend_and_link_work_for_expired_requests_and_refuse_pending_completed_rejected` → 422 for the last three.
  - `test_completing_a_reset_completes_an_open_invite_via_reset` (through the recorder).
  - `test_status_filter_and_staff_role`: rows map per spec F2 reset table; payload has `user.staff_role`.

- [ ] **Step 2: Run** `php artisan test --filter=ResetRequestDeliveryTest`. Expected: FAIL.

- [ ] **Step 3: Implement.** Wrap the approval mail in try/catch like `AccountInviteService::send`. A private `issueResetLink(PasswordResetRequest $request): string` sets token, `status approved`, `expires_at` 60 min, and returns the raw token for `approve`, `resend` and `link`. `complete` sets the password then calls `record($user, 'reset')` instead of its own status update. `index` replaces the raw status filter with `AccessRequestStatus::applyToResetRequests`. Audit `reset link resent` and `reset link copied` (masked email, never the token).

- [ ] **Step 4: Run** `php artisan test --filter="ResetRequestDelivery|AuthenticationSessionSecurity|PasswordSetRecorder"`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(accounts): reset requests share delivery, resend and copy link`.

---

### Task 8: Create and Edit Account without passwords

**Files:**
- Modify: `frontend/src/pages/admin/AddUser.jsx`, `frontend/src/utils/accountForm.js`, `frontend/src/utils/accountForm.test.js`, `frontend/src/pages/admin/UserManagement.jsx`

**Interfaces:**
- Consumes: Task 3 response `invite.delivery`.
- Produces: `validateAccountStep(STEPS.personal, ...)` checks only `name`, `email`, `contact_number`.

- [ ] **Step 1: Update the tests:** "personal details reports every problem at once" expects `["name", "email", "contact_number"]`; delete the password tests; add `test("passwords are not part of personal details", …)` asserting `{ ...form, password: "", password_confirmation: "x" }` yields `{}`.

- [ ] **Step 2: Run** `npm run test:access`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `accountForm.js`: remove the password block and the `editing` option's password use; `SERVER_FIELDS` drops `password`.
  - `AddUser.jsx`: remove both password fields, `showPassword`, the show/hide toggle, `password` from the body and from `liveErrors`. Review details: replace the `Credentials` row with `["Sign-in", "Invite link by email"]` for new accounts only. After a create, `navigate("/admin/users", { state: { notice } })` where notice is `{ title: "Account created", message: "An invite was sent to {email}." }` or, when `invite.delivery === "failed"`, `{ title: "Account created", message: "The invite email could not be sent. Resend it from Password & Invites." }`.
  - `UserManagement.jsx`: show `location.state.notice` once in the existing `NoticeModal`, then clear it with `navigate(location.pathname, { replace: true, state: null })`.

- [ ] **Step 4: Run** `npm run test:access` and eslint on the three files. Expected: PASS, no lint output.

- [ ] **Step 5: Commit** `feat(accounts): account forms no longer take a password`.

---

### Task 9: Accept invite page

**Files:**
- Create: `frontend/src/utils/passwordRules.js`, `frontend/src/utils/passwordRules.test.js`, `frontend/src/services/accountInviteService.js`, `frontend/src/pages/AcceptInvite.jsx`
- Modify: `frontend/src/App.jsx` (route and `PUBLIC_BOOT_ROUTES`), `frontend/src/pages/Login.jsx`, `frontend/package.json`

**Interfaces:**
- Produces:
  - `passwordRules(password) -> [{ key: "length", label: "At least 8 characters", met }, { key: "case", label: "Upper and lower case", met }, { key: "number", label: "At least one number", met }]`; `meetsPasswordRules(password) -> boolean`. Used again in Task 12.
  - `accountInviteService.js`: `verifyInvite(token)`, `acceptInvite({ token, password, passwordConfirmation })`, `getAccountInvites(params)`, `resendInvite(id)`, `updateInviteEmail(id, email)`, `copyInviteLink(id) -> url`, `issueTemporaryPassword(id) -> { password, expiresAt }`, `getPasswordInviteSummary() -> { resetRequests, invites }`.

- [ ] **Step 1: Write the failing test** `passwordRules.test.js`: `"Abcdefg1"` meets all; `"abcdefg1"` fails `case`; `"Abcdefgh"` fails `number`; `"Ab1"` fails `length`; `meetsPasswordRules("")` is false. Add it to `test:access`.

- [ ] **Step 2: Run** `npm run test:access`. Expected: FAIL.

- [ ] **Step 3: Implement** `passwordRules.js`, the service (same `apiRequest` patterns as `passwordResetService.js`), and `AcceptInvite.jsx` on the `ResetPassword.jsx` layout: heading "Welcome to AKAY, {name}", read-only email, Password and Confirm password `Field`s with `fieldState` icons, the three rules shown with a check when met, button **Save and continue**. Invalid or expired token: "This invite link is invalid or expired. Ask your MHO to send a new one." On success `navigate("/login", { replace: true, state: { notice: "Your password is set. Sign in to continue." } })`; `Login.jsx` shows `location.state.notice` in its existing session notice area. Route `/accept-invite`, added to `PUBLIC_BOOT_ROUTES`.

- [ ] **Step 4: Run** `npm run test:access` and eslint. Expected: PASS.

- [ ] **Step 5: Commit** `feat(accounts): accept invite page`.

---

### Task 10: Status mapping for both tabs

**Files:**
- Create: `frontend/src/utils/accessRequestStatus.js`, `frontend/src/utils/accessRequestStatus.test.js`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `STATUS_OPTIONS = [{ value: "pending", label: "Pending" }, { value: "in_progress", label: "In progress" }, { value: "complete", label: "Complete" }, { value: "cancelled", label: "Cancelled" }]`; `resetRequestStatus(row, now = new Date())` and `inviteStatus(row, now = new Date())` → `{ status, label, reason, actions }` where `actions` is a list of `"approve" | "decline" | "resend" | "copy" | "editEmail" | "temporaryPassword"`. `row` is the API shape from Tasks 5 and 7.

- [ ] **Step 1: Write the failing tests:** one test per row of both spec F2 tables, asserting status, reason and actions exactly as the spec lists them (for example invite `{ status: "pending", delivery: "failed", user: { status: "active" } }` → `{ status: "pending", label: "Pending", reason: "Email not sent", actions: ["resend", "copy", "editEmail", "temporaryPassword"] }`). Plus:
  - `delivery: "copied"` → In progress, reason "Link shared by the MHO · expires in {time}" (Review Focus 1).
  - invite `temporary` with `temp_password_expires_at` before `now` → Pending, "Temporary password expired", actions `["resend", "temporaryPassword"]` (Review Focus 4).
  - any non-completed row with `user.status: "inactive"` → Cancelled, "Account deactivated", no actions (Review Focus 5).
  - "expires in" text: 41 hours left → `"Link sent · expires in 41 h"`; 25 minutes left → `"Link sent · expires in 25 min"`.

- [ ] **Step 2: Run** `npm run test:access`. Expected: FAIL.

- [ ] **Step 3: Implement** both functions as a lookup over the F2 rules, inactive check first.

- [ ] **Step 4: Run** `npm run test:access`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(accounts): shared status mapping for reset requests and invites`.

---

### Task 11: Password & Invites page

**Files:**
- Create: `frontend/src/components/features/password-access/AccessRequestTable.jsx`, `AccessStatusBadge.jsx`, `ResetRequestsTab.jsx`, `InvitesTab.jsx`, `TemporaryPasswordDialog.jsx`
- Modify: `frontend/src/pages/admin/PasswordResetRequests.jsx`, `frontend/src/services/passwordResetService.js`, `frontend/src/components/layout/sidebar/sidebarData.js`, `frontend/src/pages/admin/UserManagement.jsx`

**Interfaces:**
- Consumes: Tasks 9 and 10; `passwordResetService` gains `resendResetLink(id)` and `copyResetLink(id) -> url`; `getPasswordResetRequests` passes the new `status` values.
- Produces: `AccessRequestTable({ rows, columns, statusOf, onAction, emptyMessage })`, shared by both tabs, keeping today's desktop table, mobile cards, toolbar, summary cards and detail modal.

- [ ] **Step 1: Split the page.** `PasswordResetRequests.jsx` keeps `DashboardLayout` (title "Password & Invites") and renders two tab buttons, `Reset requests ({n})` and `Invites ({n})` from `getPasswordInviteSummary()`, selected by `?tab=invites`. Move today's table, cards and modal into `AccessRequestTable`; `ResetRequestsTab` and `InvitesTab` each load their rows and pass `statusOf` (`resetRequestStatus` / `inviteStatus`).
- [ ] **Step 2: Apply spec F3 wording.** Columns Account, Email, Role (staff role label), Facility, Date, Status; filter uses `STATUS_OPTIONS` with "All statuses"; cards "Needs action", "Showing", "Links expire in" (60 minutes / 48 hours); Decline dialog "Decline this reset request?". `AccessStatusBadge` colors: pending amber, in_progress blue, complete emerald, cancelled slate; `title={reason}` as the tooltip. Sidebar label and the Users page link become "Password & Invites".
- [ ] **Step 3: Row actions.** Main action as a button (Approve + Decline, or Resend link); Reset requests show Copy link as a button; Invites put Copy link, Edit email and Issue temporary password in a `⋯` menu. Copy link writes the URL with `navigator.clipboard.writeText` and shows "Link copied. The emailed link no longer works." Edit email opens a small form using `Field` with the Task 1 email check. Issue temporary password confirms with "Issue a temporary password for {name}? Any invite link stops working.", then `TemporaryPasswordDialog` shows the password with a Copy button and "This is the only time it is shown. It expires in 72 hours. {name} must change it the first time they sign in." After every action, reload the tab and the summary.
- [ ] **Step 4: Verify** `npm run test:access`, eslint on the changed files, and `npx vite build` succeed.
- [ ] **Step 5: Commit** `feat(accounts): Password & Invites page with shared statuses`.

---

### Task 12: Forced password change page

**Files:**
- Create: `frontend/src/utils/passwordChange.js`, `frontend/src/utils/passwordChange.test.js`, `frontend/src/pages/ChangePassword.jsx`
- Modify: `frontend/src/App.jsx` (`ProtectedPage`, route), `frontend/src/services/apiClient.js`, `frontend/src/pages/Login.jsx`, `frontend/package.json`

**Interfaces:**
- Consumes: Task 6 endpoints, Task 9 `passwordRules`.
- Produces: `needsPasswordChange(user, pathname) -> boolean`; `changePassword({ currentPassword, password, passwordConfirmation })` in `apiClient.js` that stores the returned user with `storeAuthSession({ user })`.

- [ ] **Step 1: Write the failing test:** `needsPasswordChange({ must_change_password: true }, "/bhc/dashboard")` is true; same user on `"/change-password"` is false; `{ must_change_password: false }` is false; `null` user is false. Add to `test:access`.
- [ ] **Step 2: Run** `npm run test:access`. Expected: FAIL.
- [ ] **Step 3: Implement.** `ProtectedPage` redirects with `<Navigate to="/change-password" replace />` when `needsPasswordChange`; `/change-password` renders `ChangePassword` for any signed-in user and sends signed-out visitors to `/login`. `apiClient` on a 403 with `code === "PASSWORD_CHANGE_REQUIRED"` calls `window.location.assign("/change-password")`. `Login.jsx` goes to `/change-password` when `user.must_change_password`. Page: heading "Change your temporary password", fields Temporary password, New password, Confirm new password with `fieldState` icons and the `passwordRules` list; on success navigate to the user's dashboard. Show `TEMP_PASSWORD_EXPIRED` from login as the error text on the Login page.
- [ ] **Step 4: Verify** `npm run test:access`, eslint, `npx vite build`.
- [ ] **Step 5: Commit** `feat(auth): forced password change page`.

---

### Task 13: End-to-end check in the browser

- [ ] Run the full backend suite: `cd backend && php artisan test`. Expected: all pass, or only failures that also fail on the commit before Task 2 (list them).
- [ ] With `MAIL_MAILER=log` for the session, create a BHC account: see the notice, find the invite URL in `storage/logs/laravel.log`, open it, set a password, sign in.
- [ ] On Password & Invites: the new row shows Complete; issue a temporary password for another new account, sign in with it, get sent to Change password, change it, and land on the dashboard; the row shows Complete ("Temporary password changed").
- [ ] Check the validation icons on Create Account, Accept invite and Change password, and the four status badges with tooltips on both tabs.
- [ ] Restore the original `MAIL_MAILER` value. Report what was checked and anything not checked.
