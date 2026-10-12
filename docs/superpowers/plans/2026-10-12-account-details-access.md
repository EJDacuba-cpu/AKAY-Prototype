# Account Details with Access Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared Account details modal (with name/contact editing and an Access section holding every invite and reset action), opened from Users and Password & Invites, and a Password & Invites page laid out like Facilities.

**Architecture:** The backend gains one read endpoint, `GET /users/{user}/access`, built from the same row shapes the Password & Invites lists use (moved into one support class). The frontend gets two pure helpers (which access blocks and controls to show; which profile fields changed), a shared `AccountDetailsModal` that loads the account by id, and an `AccountAccessSection` that runs existing invite/reset endpoints inline. Password & Invites keeps its lists but drops its own details dialog and most row actions.

**Tech Stack:** Laravel (PHPUnit feature tests, Sanctum), React 19 + React Router + TanStack Query, Tailwind, lucide-react, `node --test` for pure JS helpers.

**Spec:** `docs/superpowers/specs/2026-10-12-account-details-access-design.md`

## Global Constraints

- UI copy is English. Labels: "View details" (Users menu), "View account" (Password & Invites menu), "Account details" (modal title), "Edit name and contact number" (pencil `aria-label` and `title`).
- Status label for a deactivated account is "Inactive", as on the Users table.
- Date created format: `toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })`, fallback "Not recorded".
- Editable fields are only `name` and `contact_number`. Role, facility, status, permissions, position and email are never edited from the pencil.
- No new action endpoints. No change to invite or reset rules, statuses, expiry or emails; `inviteStatus` and `resetRequestStatus` in `frontend/src/utils/accessRequestStatus.js` stay the source of truth.
- No modal on top of the Account details modal: Edit email, Temporary password, Copy link fallback, and Approve/Decline confirmation are inline panels inside it.
- Facilities pill style for the tabs: active `bg-[#B91C1C] text-white`, inactive `bg-white text-slate-600 hover:bg-red-50`, both `h-10 rounded-xl px-5 text-sm font-medium`.
- `?tab=invites` keeps selecting the Invites tab.
- The pending `UserManagement.jsx` change in the working tree (Additional Assignments column removed, View details added) is kept and committed in Task 4.

## Review Focus

1. Rapid double clicks on an Access action (Resend, Generate temporary password) — only one request is sent; every control in the section is disabled while one runs. Pinned in Task 5, Step 4.
2. Contact number typed with spaces or dashes ("0917 123-4567") that equals the stored number — counts as unchanged, Save stays disabled. Pinned in Task 2 (`profileChanges` test).
3. Editing an invite's email also changes the account's login email — the Users table and the open modal show the new email without a reload. Pinned in Task 5, Step 4.
4. A Password & Invites row whose `user` is null (account removed) — no View account item, no crash. Pinned in Task 6, Step 3.
5. Temporary password shown, then the modal is closed and reopened — the password is not shown again. Pinned in Task 5, Step 4.

---

## File Structure

Backend
- Create `backend/app/Support/AccessRows.php` — the one place that turns an `AccountInvite` / `PasswordResetRequest` into the row array the admin UI reads.
- Modify `backend/app/Http/Controllers/Api/AccountInviteController.php`, `PasswordResetRequestController.php` — `toResponse` delegates to `AccessRows`.
- Modify `backend/app/Http/Controllers/Api/UserController.php` — add `access(User $user)`.
- Modify `backend/routes/api.php` — register the route.
- Create `backend/tests/Feature/AccountAccessTest.php`, `backend/tests/Feature/AccountProfileEditTest.php`.

Frontend
- Create `frontend/src/utils/accountAccess.js` (+ `.test.js`) — pure: which blocks, statuses and controls the Access section shows; action labels; reset confirmation copy.
- Modify `frontend/src/utils/accountForm.js` (+ `accountForm.test.js`) — pure: `validateAccountProfile`, `profileChanges`.
- Modify `frontend/src/services/adminAccountsService.js` — `getAdminAccount`, `updateAdminAccountProfile`.
- Create `frontend/src/services/accountAccessService.js` — `getAccountAccess`.
- Modify `frontend/src/utils/queryKeys.js` — `adminAccount(id)`, `accountAccess(id)`.
- Create `frontend/src/components/features/accounts/AccountDetailsModal.jsx` — shell, account block, pencil edit, assignments link.
- Create `frontend/src/components/features/accounts/AccountAccessSection.jsx` — loads access, renders blocks, inline panels, runs actions.
- Create `frontend/src/components/features/accounts/InlineEmailEdit.jsx` — the email edit form moved out of `InvitesTab.jsx`.
- Create `frontend/src/components/features/accounts/CopyValue.jsx` — moved from `TemporaryPasswordDialog.jsx`.
- Modify `frontend/src/pages/admin/UserManagement.jsx` — use the shared modal.
- Modify `frontend/src/components/features/password-access/AccessRequestTable.jsx`, `InvitesTab.jsx`, `ResetRequestsTab.jsx`, `useAccessRows.js`, `frontend/src/pages/admin/PasswordResetRequests.jsx`.
- Delete `frontend/src/components/features/password-access/TemporaryPasswordDialog.jsx` (nothing uses it after Task 6).

---

### Task 1: Backend access endpoint

**Files:**
- Create: `backend/app/Support/AccessRows.php`
- Modify: `backend/app/Http/Controllers/Api/AccountInviteController.php:244-270`, `backend/app/Http/Controllers/Api/PasswordResetRequestController.php:353-385`, `backend/app/Http/Controllers/Api/UserController.php`, `backend/routes/api.php:151-153`
- Test: `backend/tests/Feature/AccountAccessTest.php`, `backend/tests/Feature/AccountProfileEditTest.php`

**Interfaces:**
- Produces: `GET /api/users/{user}/access` → `{ data: { invite: InviteRow|null, reset_request: ResetRow|null } }`, where `InviteRow` / `ResetRow` are exactly what `GET /account-invites` and `GET /admin/password-reset-requests` return per row today.
- Produces: `App\Support\AccessRows::invite(AccountInvite $invite): array`, `AccessRows::resetRequest(PasswordResetRequest $request): array`, `AccessRows::INVITE_WITH = ['user.barangayHealthCenter', 'user.ruralHealthUnit']`, `AccessRows::RESET_WITH = ['user.barangayHealthCenter', 'user.ruralHealthUnit', 'approver', 'rejecter']`.

- [ ] **Step 1: Write the failing tests** in `AccountAccessTest` (set up like `AccountInviteAdminTest`: an RHU, a BHC, an admin via `Sanctum::actingAs`, a `makeUser` helper).

```php
test_admin_gets_the_invite_and_the_open_reset_request
  // invite (pending, sent) + reset requests: one completed (older), one pending (newer)
  ->getJson("/api/users/{$user->id}/access")->assertOk()
  ->assertJsonPath('data.invite.id', $invite->id)
  ->assertJsonPath('data.invite.user.status', 'active')
  ->assertJsonPath('data.reset_request.id', $pending->id)
  ->assertJsonPath('data.reset_request.status', 'pending');

test_completed_and_declined_reset_requests_are_not_returned
  // only completed + rejected requests exist → data.reset_request is null

test_an_account_without_invite_or_reset_returns_nulls
  ->assertExactJson(['data' => ['invite' => null, 'reset_request' => null]]);

test_stale_rows_are_expired_before_reading
  // invite pending with expires_at = now()->subMinute() → data.invite.status === 'expired'
  // reset approved with expires_at past → data.reset_request.status === 'expired'

test_non_admin_is_refused
  // Sanctum::actingAs(bhc user) → getJson(...)->assertForbidden();

test_row_shape_matches_the_lists
  // the invite from /api/account-invites (first row) equals data.invite from /access
```

And in `AccountProfileEditTest`:

```php
test_admin_edits_only_name_and_contact_number
  // $user->createToken('t'); patchJson("/api/users/{$user->id}", ['name' => 'Fixed Name', 'contact_number' => '09171234567'])->assertOk()
  // fresh(): name/contact changed; role, staff_role, status, email, barangay_health_center_id unchanged
  // $user->tokens()->count() === 1  (not signed out)
  // AuditLog::where('module', 'users')->where('action', 'updated')->exists()

test_a_bad_contact_number_is_rejected
  ->patchJson(..., ['contact_number' => '12345'])->assertStatus(422)->assertJsonValidationErrors('contact_number');
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && php artisan test --filter="AccountAccessTest|AccountProfileEditTest"`
Expected: `AccountAccessTest` fails with 404 / 405 on `/access`. `AccountProfileEditTest` may already pass (it pins existing behavior); that is fine.

- [ ] **Step 3: Move the row builders into `App\Support\AccessRows`**

Move the bodies of both private `toResponse` methods unchanged into the two static methods; each controller's `toResponse` becomes a one-line delegate (or callers use `AccessRows` directly). Replace `AccountInviteController::WITH_FACILITY` uses with `AccessRows::INVITE_WITH`, and the reset index `with([...])` with `AccessRows::RESET_WITH`.

- [ ] **Step 4: Add `UserController::access(User $user): JsonResponse`**

Call `AccessRequestStatus::expireStaleInvites()` and `expireStaleResetRequests()` first. Invite: `$user->accountInvite()->with(AccessRows::INVITE_WITH)->first()`. Reset: `$user->passwordResetRequests()->whereNotIn('status', [PasswordResetRequest::STATUS_COMPLETED, PasswordResetRequest::STATUS_REJECTED])->with(AccessRows::RESET_WITH)->latest('requested_at')->latest('id')->first()`. Register `Route::get('/users/{user}/access', [UserController::class, 'access']);` in the `role:admin` group next to `users/email-available`, before `apiResource('users', ...)`.

- [ ] **Step 5: Run the new and the existing access tests**

Run: `cd backend && php artisan test --filter="AccountAccessTest|AccountProfileEditTest|AccountInvite|PasswordReset"`
Expected: all PASS (the existing invite and reset tests prove the move kept the row shape).

- [ ] **Step 6: Commit**

```bash
git add backend/app/Support/AccessRows.php backend/app/Http/Controllers/Api backend/routes/api.php backend/tests/Feature/AccountAccessTest.php backend/tests/Feature/AccountProfileEditTest.php
git commit -m "feat(accounts): read an account's invite and open reset request"
```

---

### Task 2: Pure helpers for the Access section and the profile edit

**Files:**
- Create: `frontend/src/utils/accountAccess.js`, `frontend/src/utils/accountAccess.test.js`
- Modify: `frontend/src/utils/accountForm.js`, `frontend/src/utils/accountForm.test.js`
- Modify: `frontend/package.json` (add `"test:accounts": "node --test src/utils/accountAccess.test.js src/utils/accountForm.test.js"`)

**Interfaces:**
- Consumes: `inviteStatus(row, now)`, `resetRequestStatus(row, now)` from `utils/accessRequestStatus.js` (return `{ status, label, reason, actions }`).
- Produces (`utils/accountAccess.js`):
  - `accountAccessBlocks({ account, invite, resetRequest }, now = new Date()) -> { message: string|null, blocks: Block[] }`
  - `Block = { kind: "invite"|"reset", row, status: { status, label, reason }, primary: Action|null, links: Action[], fallback: "temporaryPassword"|null }`
  - `Action = "approve"|"decline"|"resend"|"copy"|"editEmail"|"temporaryPassword"`
  - `actionLabel(kind, action) -> string`
  - `RESET_CONFIRM = { approve: { title, description, confirmText }, decline: { ... } }` (the copy now in `ResetRequestsTab.jsx`, moved here unchanged)
- Produces (`utils/accountForm.js`):
  - `validateAccountProfile({ name, contact_number }) -> { name?: string, contact_number?: string }`
  - `profileChanges(account, form) -> { name?: string, contact_number?: string }` (only changed fields, name trimmed, number normalized)

- [ ] **Step 1: Write the failing tests**

`accountAccess.test.js` — one test per spec row (use fixed `now = new Date("2026-10-12T08:00:00Z")`; `active = { status: "Active" }`; invite rows carry `user: { status: "active" }`):

```js
test("an open invite: Resend invite primary, Copy link and Edit email links, temporary password fallback", () => {
  const { message, blocks } = accountAccessBlocks({ account: active, invite: openInvite, resetRequest: null }, now);
  assert.equal(message, null);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, "invite");
  assert.equal(blocks[0].primary, "resend");
  assert.deepEqual(blocks[0].links, ["copy", "editEmail"]);
  assert.equal(blocks[0].fallback, "temporaryPassword");
});
test("an expired invite keeps Resend invite as primary")          // primary "resend", links ["editEmail"], fallback "temporaryPassword"
test("an active temporary password offers only a new one")       // primary null, links [], fallback "temporaryPassword"
test("a complete invite shows its reason and no controls")       // status.status "complete", primary null, links [], fallback null
test("a pending reset request: Approve primary, Decline link")   // kind "reset", primary "approve", links ["decline"], fallback null
test("an approved reset request: Resend link primary, Copy link") // primary "resend", links ["copy"]
test("both open: invite block first, then reset block")          // blocks.map(b => b.kind) deepEqual ["invite", "reset"]
test("an inactive account shows the deactivated message and no blocks") // account { status: "Inactive" } → message "Account deactivated. No access actions.", blocks []
test("no invite and no reset request: password set by the user") // message "Password set by the user.", blocks []
test("labels", () => {
  assert.equal(actionLabel("invite", "resend"), "Resend invite");
  assert.equal(actionLabel("reset", "resend"), "Resend link");
  assert.equal(actionLabel("invite", "temporaryPassword"), "Generate temporary password");
});
```

`accountForm.test.js` additions:

```js
test("profile validation", () => {
  assert.deepEqual(validateAccountProfile({ name: " ", contact_number: "09171234567" }), { name: "Enter the full name." });
  assert.deepEqual(validateAccountProfile({ name: "Ana", contact_number: "12345" }), { contact_number: "Enter mobile number." });
  assert.deepEqual(validateAccountProfile({ name: "Ana", contact_number: "0917 123-4567" }), {});
});
test("profile changes send only what changed", () => {
  const account = { name: "Ana Cruz", contact_number: "09171234567" };
  assert.deepEqual(profileChanges(account, { name: " Ana Cruz ", contact_number: "0917 123-4567" }), {});
  assert.deepEqual(profileChanges(account, { name: "Ana M. Cruz", contact_number: "09171234567" }), { name: "Ana M. Cruz" });
  assert.deepEqual(profileChanges(account, { name: "Ana Cruz", contact_number: "0918 000 0000" }), { contact_number: "09180000000" });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npm run test:accounts`
Expected: FAIL — `accountAccessBlocks`, `validateAccountProfile`, `profileChanges` are not exported.

- [ ] **Step 3: Implement**

`accountAccessBlocks`: if `account.status === "Inactive"` return the deactivated message. Build an invite block from `inviteStatus(invite, now)` when `invite` exists and a reset block from `resetRequestStatus(resetRequest, now)` when it exists. For each, from `status.actions`: `primary` = first of `["approve", "resend"]` present; `links` = those of `["decline", "copy", "editEmail"]` present, in that order; `fallback` = `"temporaryPassword"` if present. No blocks → `"Password set by the user."`. `validateAccountProfile` reuses the Personal Details messages and `isValidContactNumber`; `profileChanges` uses `normalizeContactNumber` from `staffRoles.js`.

- [ ] **Step 4: Run them to verify they pass**

Run: `cd frontend && npm run test:accounts`
Expected: PASS, including the existing `accountForm` tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/accountAccess.js frontend/src/utils/accountAccess.test.js frontend/src/utils/accountForm.js frontend/src/utils/accountForm.test.js frontend/package.json
git commit -m "feat(accounts): decide access blocks and profile changes in pure helpers"
```

---

### Task 3: Services and query keys

**Files:**
- Modify: `frontend/src/services/adminAccountsService.js`, `frontend/src/utils/queryKeys.js`
- Create: `frontend/src/services/accountAccessService.js`

**Interfaces:**
- Consumes: `GET /users/{id}` (existing `show`), `PATCH /users/{id}`, `GET /users/{id}/access` (Task 1).
- Produces:
  - `getAdminAccount(id) -> Promise<Account>` (normalized with the file's `normalizeAccount`)
  - `updateAdminAccountProfile(id, changes: { name?, contact_number? }) -> Promise<Account>` (patches, normalizes, updates `accountCache`, dispatches `ADMIN_ACCOUNTS_UPDATED_EVENT`, like `updateAdminAccountStatus`)
  - `getAccountAccess(userId) -> Promise<{ invite: object|null, resetRequest: object|null }>` (reset row through `normalizePasswordResetRequest`, invite row as returned)
  - `queryKeys.adminAccount(id) = ["admin-accounts", String(id)]`, `queryKeys.accountAccess(id) = ["account-access", String(id)]`

- [ ] **Step 1: Implement the three functions and two keys** as above.
- [ ] **Step 2: Verify** — Run: `cd frontend && npx eslint src/services src/utils/queryKeys.js` → no errors.
- [ ] **Step 3: Commit** — `git commit -m "feat(accounts): services for one account and its access"` (the three files).

---

### Task 4: Shared Account details modal with the pencil edit

**Files:**
- Create: `frontend/src/components/features/accounts/AccountDetailsModal.jsx`
- Modify: `frontend/src/pages/admin/UserManagement.jsx` (remove its local `AccountDetailsModal`, `formatDateTime`, `assignmentSummary`; render the shared one)

**Interfaces:**
- Consumes: Task 2 `validateAccountProfile`, `profileChanges`; Task 3 `getAdminAccount`, `updateAdminAccountProfile`, `queryKeys.adminAccount`, `queryKeys.adminAccounts`.
- Produces: `<AccountDetailsModal accountId={string} account={Account|undefined} rolesData={object|null} onClose={fn} onChanged={fn|undefined} />`. It loads with `useQuery(queryKeys.adminAccount(accountId), () => getAdminAccount(accountId), { placeholderData: account })`. `onChanged()` is called after any successful save or access action. Task 5 adds `<AccountAccessSection>` inside it, between the account block and the assignments link.

- [ ] **Step 1: Build the modal** with `ModalShell` (`title="Account details"`, `subtitle={email}`, `size="md"`, footer Close). Account block rows in order: Name, Contact number, Role (`roleLabel` from `utils/accountSetup`), Facility, Status (the same badge styles as the Users table, moved into the modal file and imported back by `UserManagement.jsx`), Date created (format in Global Constraints). Header row "Account" with a pencil (`Pencil` from lucide, `aria-label="Edit name and contact number"`). Staff Assignments link at the bottom for non-admin accounts (the current `assignmentSummary` text and `/admin/staff-assignments?userId=` link). While loading with no placeholder, show `SoftLoadingArea`; on load error, show the message with Try again.
- [ ] **Step 2: Pencil edit.** Name and Contact number rows become `Input`s inside `Field` (as in `InvitesTab.jsx`'s email form), errors from `validateAccountProfile` on blur and on Save. Save disabled when `profileChanges` is empty or while saving; it sends `profileChanges(...)` through `updateAdminAccountProfile`, then `setQueryData` on `adminAccount(id)` and maps the row inside `adminAccounts()`, calls `onChanged?.()`, and returns to text. A 422 shows `error.errors.name[0]` / `error.errors.contact_number[0]` under its field; other failures show `error.message` above the buttons. Cancel discards. Closing the modal discards.
- [ ] **Step 3: Use it on Users.** `AccountsTable` keeps `detailsUser` state and renders `<AccountDetailsModal accountId={detailsUser.id} account={detailsUser} rolesData={rolesData} onClose=... />`.
- [ ] **Step 4: Verify**
  - Run: `cd frontend && npx eslint src/pages/admin/UserManagement.jsx src/components/features/accounts && npx vite build` → no lint errors, build succeeds.
  - Browser (Admin > Users > ⋯ > View details): six rows shown; pencil → change contact to `0917 123-4567` equal to the stored number → Save stays disabled; change the name → Save → the table row shows the new name without a reload; `12345` → "Enter mobile number."
- [ ] **Step 5: Commit** — `git commit -m "feat(accounts): shared account details modal with name and contact editing"` (includes the earlier uncommitted Users page change).

---

### Task 5: Access section inside the modal

**Files:**
- Create: `frontend/src/components/features/accounts/AccountAccessSection.jsx`, `InlineEmailEdit.jsx`, `CopyValue.jsx`
- Modify: `frontend/src/components/features/accounts/AccountDetailsModal.jsx` (render the section between the account block and the assignments link)

**Interfaces:**
- Consumes: Task 2 `accountAccessBlocks`, `actionLabel`, `RESET_CONFIRM`; Task 3 `getAccountAccess`, `queryKeys.accountAccess`; existing `resendInvite`, `copyInviteLink`, `updateInviteEmail`, `issueTemporaryPassword` (`accountInviteService.js`) and `approvePasswordResetRequest`, `rejectPasswordResetRequest`, `resendResetLink`, `copyResetLink` (`passwordResetService.js`); `copyText` (`utils/clipboard.js`); `useNotification`.
- Produces: `<AccountAccessSection account={Account} onChanged={fn} />`; `InlineEmailEdit({ row, onCancel, onSave(email) })` (the `EditEmailDialog` form body from `InvitesTab.jsx`, without `ModalShell`, buttons inline); `CopyValue({ value, label, mono })` moved unchanged from `TemporaryPasswordDialog.jsx`.

- [ ] **Step 1: Render the blocks.** `useQuery(queryKeys.accountAccess(account.id), () => getAccountAccess(account.id))`. Heading "Access". `message` as plain text. Each block: `AccessStatusBadge` + reason; one primary `ModalButton` (`variant="primary"`), links as text buttons (`text-red-700`); for `fallback`, a sub-heading "Other ways to sign in", the link "Generate temporary password", and the two lines "Use only if the email can't be delivered." / "This also stops the invite link." Load error: "Could not load access details" with Try again.
- [ ] **Step 2: Inline panels, one open at a time** (state `{ kind, action, blockKind }`):
  - `editEmail` → `InlineEmailEdit`; Save calls `updateInviteEmail`, then success toast `Invite sent to {email}.` (or the existing failed-delivery message).
  - `temporaryPassword` → warning "Any invite link stops working." with Confirm / Cancel → after `issueTemporaryPassword`, `CopyValue` of the password plus "This is the only time it is shown. It expires in 72 hours. {name} must change it the first time they sign in." The password lives only in component state.
  - `approve` / `decline` → `RESET_CONFIRM[action]` title, description and confirm text inline.
  - `copy` → `copyText(url)`; success toast "Link copied. The emailed link no longer works."; if the clipboard is blocked, show the URL in `CopyValue` inline.
  - `resend` runs at once, toast as in today's tabs.
- [ ] **Step 3: Action runner.** One `busy` flag guards every control (`disabled` on all buttons/links while true; a second click while busy is ignored). On success: `invalidateQueries(accountAccess(id))`, `invalidateQueries(adminAccount(id))` and `adminAccounts()` (email may change), then `onChanged?.()`. On failure: the server's `message` inside the section above the controls; the panel stays open, and the section's access query is invalidated so a row closed elsewhere (the backend answers 422 "This invite is already completed." / "This password reset request is closed.") shows its new status. `InlineEmailEdit` keeps its field-level 422 errors (it rethrows like today's `saveEmail`).
- [ ] **Step 4: Verify**
  - Run: `cd frontend && npx eslint src/components/features/accounts && npx vite build` → clean.
  - Browser, with a freshly created account (Add User Account): View details → Access shows "Link sent · expires in 48 h", Resend invite, Copy link, Edit email, temporary password fallback.
  - Double-click Resend invite fast → Network shows one `POST .../resend`; controls disabled during it.
  - Edit email → Save and resend → the modal subtitle and the Users row show the new email without reload.
  - Generate temporary password → Confirm → password shown; close and reopen the modal → no password shown; status reads "Temporary password generated".
  - Deactivate that account → reopen → "Account deactivated. No access actions."
  - The admin account → "Password set by the user."
- [ ] **Step 5: Commit** — `git commit -m "feat(accounts): access section with inline invite and reset actions"`.

---

### Task 6: Password & Invites layout and slim row menus

**Files:**
- Modify: `frontend/src/pages/admin/PasswordResetRequests.jsx`, `frontend/src/components/features/password-access/AccessRequestTable.jsx`, `InvitesTab.jsx`, `ResetRequestsTab.jsx`, `useAccessRows.js`
- Delete: `frontend/src/components/features/password-access/TemporaryPasswordDialog.jsx`

**Interfaces:**
- Consumes: Task 4 `AccountDetailsModal`; Task 2 `RESET_CONFIRM`, `actionLabel`.
- Produces: `AccessRequestTable` props change: remove `detailTitle`, `detailsOf`; add `toolbarHeading` (node passed to `ListToolbar`'s `heading`) and `onViewAccount(row)`; `heading`/`description` are rendered by the page, not the card. `useAccessRows` also returns `refresh()`.

- [ ] **Step 1: Page layout.** `PasswordResetRequests.jsx` renders the description line (`text-sm text-slate-500`, the tab's current description text) and the tab pills (Global Constraints style), and passes the pills to the active tab as `toolbarHeading`. Remove the underline tab nav. Keep `role="tablist"`/`role="tab"`/`aria-selected` on the pills.
- [ ] **Step 2: Table.** `AccessRequestTable`: pass `toolbarHeading` to `ListToolbar` as `heading`; delete the card header (heading, description, `ShieldCheck`) and `DetailsModal`; when `rows.length === 0`, render no card, only the centered empty state copied from `Facilities.jsx:133-150` (icon circle with `Search`, the tab's `emptyMessage`, and "Try adjusting your search or filters." when `filters.search` or `filters.status !== "all"`).
- [ ] **Step 3: Row menus.** Menu items: `View account` (only when `row.user?.id`), then `approve` / `decline` only when present in `statusOf(row).actions`. `View account` opens `<AccountDetailsModal accountId={String(row.user.id)} rolesData={rolesData} onChanged={list.refresh} onClose=... />` from the tab. Remove from `InvitesTab.jsx`: `EditEmailDialog`, confirm-temp state, `TemporaryPasswordDialog`, `ManualCopyDialog`, and the resend/copy/editEmail/temporaryPassword handlers. Remove from `ResetRequestsTab.jsx`: resend/copy handlers and `ManualCopyDialog`; its `ConfirmationModal` uses `RESET_CONFIRM`. Delete `TemporaryPasswordDialog.jsx`.
- [ ] **Step 4: Verify**
  - Run: `cd frontend && npx eslint src/pages/admin src/components/features && npx vite build` → clean; `grep -rn "TemporaryPasswordDialog\|ManualCopyDialog" src` → no results.
  - Browser: tabs are pills on the same row as Search and Filters, at desktop and at 390 px width; `?tab=invites` opens Invites; a search with no match shows the centered empty state with the hint and no card; a Pending reset row's menu has View account, Approve, Decline; Approve from the Access section updates the row in the list behind the modal.
- [ ] **Step 5: Commit** — `git commit -m "feat(accounts): Password & Invites in Facilities layout, actions moved to account details"`.

---

### Task 7: Final verification

- [ ] **Step 1:** Run `cd backend && php artisan test` → all PASS.
- [ ] **Step 2:** Run `cd frontend && npm run lint && npm run test:accounts && npx vite build` → clean.
- [ ] **Step 3:** Walk the spec's browser checklist once more end to end (Users and Password & Invites, desktop and 390 px), and confirm each Review Focus item.
