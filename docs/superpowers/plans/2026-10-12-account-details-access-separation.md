# Account Details and Invite Controls (Separation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the human chose inline execution). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users shows and edits account details only; Password & Invites holds every invite and reset control in a clear View details dialog and is laid out like Facilities.

**Architecture:** This revises `2026-10-12-account-details-access.md`. Its Tasks 2 (profile helpers), 3 (account services), and 4 (shared Account details modal with pencil edit) stay. Its Task 1 endpoint and Task 5 Access-in-modal are removed; its Task 6 is replaced. The Task 5 action-running code is reused as `AccessControls` inside a new `AccessDetailsDialog` fed by a Password & Invites list row (no extra endpoint).

**Tech Stack:** Laravel (PHPUnit), React 19 + React Router + TanStack Query, Tailwind, lucide-react, `node --test` for pure helpers.

**Spec:** `docs/superpowers/specs/2026-10-12-account-details-access-design.md` (revised)

**Already committed and kept:** `AccountProfileEditTest`, `validateAccountProfile`/`profileChanges` (extended with the email in Task R2), `getAdminAccount`/`updateAdminAccountProfile`, `AccountDetailsModal` (Users; gets the email in Task R4), `AccountStatusBadge`, and the Users page change.

**Email moved to Users:** changing the email there already does the right thing on the server (`UserController::followEmailChange`, covered by `AccountInviteAdminTest`), so there is no backend change. Edit email leaves Password & Invites.

## Global Constraints

- Same as the first plan: UI copy in English; "Inactive" for a deactivated account; Facilities pill style `bg-[#B91C1C] text-white` active / `bg-white text-slate-600 hover:bg-red-50` inactive, `h-10 rounded-xl px-5 text-sm font-medium`; `?tab=invites` keeps working.
- No new endpoint. No change to invite or reset rules, statuses, expiry or email.
- No modal on top of the View details dialog: Edit email, Temporary password, Copy link fallback, Approve and Decline confirmation are inline.
- Do not click actions that send real email while verifying in the browser (the mailer is SMTP): use Copy link, Generate temporary password, Decline, and Edit email validation without saving.

## Review Focus

1. A list row whose `user` is null — View details still opens, no crash, no controls beyond the status. Pinned in Task R2 (`queueMenuItems`) and Task R5 Step 4.
2. Double-click on Generate temporary password — one request, controls disabled meanwhile. Pinned in Task R5 Step 4.
3. After an action the dialog shows the row's new status without closing (and closes if the row vanished from the list). Pinned in Task R5 Step 4.
4. Temporary password is not shown again after closing and reopening the dialog. Pinned in Task R5 Step 4.
5. Empty search result shows the hint; no data at all shows no hint and no card. Pinned in Task R5 Step 4.
6. An email that only differs in letter case from the stored one is not a change, and an address used by another account is refused before and after Save. Pinned in Task R2 (`profileChanges`) and Task R4 Step 4.

---

### Task R1: Remove the access endpoint

**Files:**
- Delete: `backend/app/Support/AccessRows.php`, `backend/tests/Feature/AccountAccessTest.php`
- Modify (restored): `backend/app/Http/Controllers/Api/AccountInviteController.php`, `PasswordResetRequestController.php`, `UserController.php`, `backend/routes/api.php`
- Keep: `backend/tests/Feature/AccountProfileEditTest.php`

**Interfaces:** none produced.

- [ ] **Step 1:** Run `git revert --no-commit 0c1ed5a`, then `git checkout 0c1ed5a -- backend/tests/Feature/AccountProfileEditTest.php` (the revert also drops that test, which stays).
- [ ] **Step 2:** Verify — Run: `cd backend && php artisan test --filter="AccountProfileEdit|AccountInvite|PasswordReset"` — Expected: all PASS, and `git status` shows `AccessRows.php`, `AccountAccessTest.php` removed and the three controllers/routes restored.
- [ ] **Step 3:** Commit — `git commit -m "refactor(accounts): drop the per-account access endpoint"`.

### Task R2: One-row controls helper

**Files:**
- Modify: `frontend/src/utils/accountAccess.js`, `frontend/src/utils/accountAccess.test.js`, `frontend/src/utils/accountForm.js`, `frontend/src/utils/accountForm.test.js`

**Interfaces:**
- Consumes: `inviteStatus(row, now)`, `resetRequestStatus(row, now)` from `utils/accessRequestStatus.js`.
- Produces:
  - `accessControls(kind: "invite"|"reset", row, now = new Date()) -> { status: { status, label, reason }, primary: Action|null, links: Action[], fallback: "temporaryPassword"|null }`, where `Action = "approve"|"decline"|"resend"|"copy"|"editEmail"|"temporaryPassword"`; `primary` is the first of `["approve","resend"]` the status allows, `links` those of `["decline","copy"]` in that order (Edit email is not offered here), `fallback` is `"temporaryPassword"` when allowed.
  - `queueMenuItems(statusActions: Action[], hasAccount: boolean) -> ("viewDetails"|"approve"|"decline")[]` — `"viewDetails"` always (a row stays viewable even when its account is gone); then `"approve"`, `"decline"` only when present in `statusActions`.
  - `actionLabel(kind, action)` and `RESET_CONFIRM` unchanged. `accountAccessBlocks` is removed.
  - In `accountForm.js`: `validateAccountProfile({ name, contact_number, email }) -> { name?, contact_number?, email? }` adds `email: "Enter a valid email address."` for a bad format; `profileChanges(account, form)` also returns `email` (trimmed) when it differs from `account.email` ignoring letter case.

- [ ] **Step 1: Rewrite the failing tests** in `accountAccess.test.js` (same fixtures: `now = 2026-10-12T08:00:00Z`, `owner = { status: "active" }`):

```js
test("an open invite: Resend invite primary, Copy link link, temporary password fallback")
  // accessControls("invite", openInvite, now): primary "resend", links ["copy"], fallback "temporaryPassword", status.status "in_progress"
test("an expired invite keeps Resend invite as primary")          // primary "resend", links [], fallback "temporaryPassword"
test("an active temporary password offers only a new one")        // primary null, links [], fallback "temporaryPassword"
test("a complete invite has no controls")                         // completed_via "temporary_password": status.reason "Temporary password changed", primary null, links [], fallback null
test("an invite whose account is inactive has no controls")       // user { status: "inactive" }: status.status "cancelled", primary null, links [], fallback null
test("a pending reset request: Approve primary, Decline link")    // kind "reset": primary "approve", links ["decline"], fallback null
test("an approved reset request: Resend link primary, Copy link") // primary "resend", links ["copy"]
test("a declined reset request has no controls")                  // status "rejected": primary null, links [], fallback null
test("queue menu: View details always, approve and decline only when allowed", () => {
  assert.deepEqual(queueMenuItems(["approve", "decline"], true), ["viewDetails", "approve", "decline"]);
  assert.deepEqual(queueMenuItems(["resend", "copy", "editEmail", "temporaryPassword"], true), ["viewDetails"]);
  assert.deepEqual(queueMenuItems(["approve", "decline"], false), ["viewDetails", "approve", "decline"]);
  assert.deepEqual(queueMenuItems([], false), ["viewDetails"]);
});
test("labels and reset confirmation copy")  // unchanged
```

Add to `accountForm.test.js` (replacing the old profile tests): `validateAccountProfile({ name: "Ana", contact_number: "09171234567", email: "ana" })` is `{ email: "Enter a valid email address." }`, and a valid triple is `{}`; `profileChanges({ name: "Ana Cruz", contact_number: "09171234567", email: "Ana@Example.test" }, { name: "Ana Cruz", contact_number: "0917 123-4567", email: " ana@example.test " })` is `{}`; a different email gives `{ email: "new@example.test" }`; name and number cases from before still hold.

(The `accountAccessBlocks` tests are deleted.) The `hasAccount` argument is accepted so callers read clearly but does not change the result.

- [ ] **Step 2:** Run `cd frontend && npm run test:accounts` — Expected: FAIL (`accessControls` / `queueMenuItems` not exported).
- [ ] **Step 3:** Implement the two functions in `accountAccess.js` (reuse the existing `toBlock` logic as `accessControls`).
- [ ] **Step 4:** Run `cd frontend && npm run test:accounts` — Expected: all PASS.
- [ ] **Step 5:** Commit — `git commit -m "feat(accounts): per-row invite and reset controls helper, email in profile helpers"` (`AccountAccessSection` is deleted in R3, so run only the tests here, not the build).

### Task R3: Controls component and View details dialog

**Files:**
- Move: `frontend/src/components/features/accounts/CopyValue.jsx` → `frontend/src/components/features/password-access/CopyValue.jsx` (update the import in `TemporaryPasswordDialog.jsx`).
- Delete: `features/accounts/InlineEmailEdit.jsx` (its availability check becomes a hook in Task R4; until then `git show` it from commit e60a12d).
- Move + rewrite: `features/accounts/AccountAccessSection.jsx` → `features/password-access/AccessControls.jsx`.
- Create: `features/password-access/AccessDetailsDialog.jsx`
- Modify: `features/accounts/AccountDetailsModal.jsx` (remove the Access section import and render)
- Delete: `frontend/src/services/accountAccessService.js`; remove `accountAccess` from `frontend/src/utils/queryKeys.js`

**Interfaces:**
- Consumes: Task R2 `accessControls`, `actionLabel`, `RESET_CONFIRM`; existing services `resendInvite`, `copyInviteLink`, `updateInviteEmail`, `issueTemporaryPassword`, `approvePasswordResetRequest`, `rejectPasswordResetRequest`, `resendResetLink`, `copyResetLink`; `copyText`; `useNotification`; `AccessStatusBadge`; `formatDateTime` and `accountName` from `AccessRequestTable.jsx`.
- Produces:
  - `<AccessControls kind row onChanged />`: the status line, primary button, links, "Other ways to sign in", the inline panels (temporary password confirm/reveal, approve/decline confirm, copy fallback) and the action runner from the first plan's Task 5 (`run` with a busy ref, failures shown in the component, `onChanged()` after every run). It takes the row as a prop and does **not** load data.
  - `<AccessDetailsDialog kind row onChanged onClose />`: `ModalShell` titled "Account invite" or "Password reset request", subtitle `{name} · {email}` (`row.user?.name || "Unknown account"`), the detail rows (invite: Invited `sent_at`, Link expires `expires_at`, Temporary password expires `temp_password_expires_at`, Completed `completed_at`; reset: Requested `requested_at`, Approved `approved_at`, Declined `rejected_at`, Completed `completed_at`, Link expires `expires_at`, Admin note `admin_note`; empty ones omitted), then `<AccessControls />`. For an invite, a line under the account name reads "To change the email, edit the account in Users." Footer: Close.

- [ ] **Step 1:** `git mv` the files; fix imports; rewrite `AccessControls` to take `{ kind, row, onChanged }` and use `accessControls(kind, row)` (no `useQuery`; `onChanged` only, no query invalidation); create `AccessDetailsDialog`; remove the Access section from `AccountDetailsModal`; delete the service and the query key.
- [ ] **Step 2:** Verify — Run: `cd frontend && npx eslint src && npm run test:accounts && npx vite build` — Expected: no lint errors, tests PASS, build succeeds; `grep -rn "accountAccessService\|AccountAccessSection\|accountAccessBlocks" src` returns nothing.
- [ ] **Step 3:** Commit — `git commit -m "refactor(accounts): move invite controls into a Password & Invites details dialog"`.

### Task R4: Email in the Users pencil edit

**Files:**
- Create: `frontend/src/hooks/useEmailAvailability.js`
- Modify: `frontend/src/components/features/accounts/AccountDetailsModal.jsx`

**Interfaces:**
- Consumes: Task R2 `validateAccountProfile` / `profileChanges` (now with `email`); `apiRequest`; `isValidEmail`; `fieldState`; `Field`; `Input`; `updateAdminAccountProfile(id, changes)` (already sends any of `name`, `contact_number`, `email`).
- Produces: `useEmailAvailability({ ignoreId }) -> { check(email: string): Promise<boolean|null>, isTaken(email: string): boolean, checking: boolean, onBlur(email: string): void }` — `check` resolves `true` when the address belongs to another account, `false` when free, `null` for a bad format or a failed lookup (a failed lookup is forgotten and retried); results are cached per lowercased address; the lookup is `GET /users/email-available?email=<email>&ignore=<ignoreId>`.

- [ ] **Step 1:** Implement `useEmailAvailability` from the availability logic in `features/accounts/InlineEmailEdit.jsx` (the `checkEmail`/`handleBlur`/`taken` code), then delete `InlineEmailEdit.jsx` if Task R3 has not.
- [ ] **Step 2:** In `AccountDetailsModal`, add an Email row (between Name and Contact number) and an Email field to the pencil form, with the live status icon (`fieldState`), the error "Enter a valid email address." or "Email is already taken." (shown after blur), and the note "If this account's invite is still open, a new invite is sent to the new address and the old link stops working." Save is blocked while the address is known to be taken; on Save run `check` once more and stop if it is taken; a 422 `errors.email[0]` shows under the Email field. Change the pencil `aria-label` and `title` to "Edit name, email and contact number".
- [ ] **Step 3:** Verify — Run: `cd frontend && npx eslint src && npm run test:accounts && npx vite build` — Expected: clean.
- [ ] **Step 4:** Browser (Users, with a throwaway account created directly in the database, with no invite, so no email is sent; delete it afterwards): pencil shows Name, Email, Contact number; `not-an-email` + blur shows "Enter a valid email address."; the seeded admin address shows "Email is already taken." and Save is blocked; changing only the letter case of the email leaves Save disabled; a new valid address saves, the table row and modal show it without a reload, then restore the old address.
- [ ] **Step 5:** Commit — `git commit -m "feat(accounts): edit email with name and contact number from Account details"`.

### Task R5: Password & Invites layout and wiring

**Files:**
- Modify: `frontend/src/pages/admin/PasswordResetRequests.jsx`, `features/password-access/AccessRequestTable.jsx`, `InvitesTab.jsx`, `ResetRequestsTab.jsx`, `useAccessRows.js`
- Delete: `features/password-access/TemporaryPasswordDialog.jsx` (and `ManualCopyDialog` with it)

**Interfaces:**
- Consumes: Task R2 `queueMenuItems`, `RESET_CONFIRM`; Task R3 `AccessDetailsDialog`. Removes the old Edit email dialog and its handlers from `InvitesTab`.
- Produces: `AccessRequestTable` props — remove `detailTitle`, `detailsOf`, `heading`, `description`; add `toolbarHeading` (node for `ListToolbar`'s `heading`) and `onViewDetails(row)`. `useAccessRows` also returns `refresh()`. Each tab takes `{ rolesData, toolbarHeading }`.

- [ ] **Step 1: Page layout.** `PasswordResetRequests.jsx` keeps `TABS` and adds each tab's `description`; renders the description line (`text-sm text-slate-500`) above and builds the pills (`role="tablist"`/`role="tab"`/`aria-selected`) passed to the active tab as `toolbarHeading`. Remove the underline tab nav.
- [ ] **Step 2: Table.** `AccessRequestTable`: pass `toolbarHeading` to `ListToolbar`; drop the card header (heading, description, `ShieldCheck`) and the old `DetailsModal`; the error banner shows above the card; with no rows render only the centered empty state copied from `Facilities.jsx:133-150` (icon circle with `Search`, the tab's `emptyMessage`, and "Try adjusting your search or filters." only when `filters.search` or `filters.status !== "all"`). The row menu is built from `queueMenuItems(statusOf(row).actions, Boolean(row.user?.id))`: "View details" calls `onViewDetails(row)`; "Approve"/"Decline" call `onAction`.
- [ ] **Step 3: Tabs.** `InvitesTab` keeps only the list and `selectedId` state; it renders `<AccessDetailsDialog kind="invite" row={...} onChanged={list.refresh} onClose=... />` for `list.rows.find((r) => r.id === selectedId)`, and clears `selectedId` when the row is no longer in the list after a load. Remove `EditEmailDialog`, the temporary-password and manual-copy dialogs and their handlers. `ResetRequestsTab` does the same with `kind="reset"`, keeps its Approve/Decline `ConfirmationModal` (now using `RESET_CONFIRM` from `utils/accountAccess.js`), and drops resend/copy handlers. Delete `TemporaryPasswordDialog.jsx`.
- [ ] **Step 4: Verify**
  - Run: `cd frontend && npx eslint src && npm run test:accounts && npx vite build`; `grep -rn "TemporaryPasswordDialog\|ManualCopyDialog\|EditEmailDialog\|InlineEmailEdit" src` returns nothing.
  - Browser (sign in with the seeded test admin from `backend/database/seeders/DatabaseSeeder.php`; create two throwaway accounts directly in the database without mail: one with a pending invite, one with a pending reset request; delete them afterwards):
    - Tabs are pills on the same row as Search and Filters at desktop and at 390 px width; `?tab=invites` opens Invites; a search with no match shows the centered message with the hint and no card; clearing it returns the table.
    - Invite row: ⋯ has only View details; the dialog shows status, dates, Resend invite, Copy link, the note about changing the email in Users, "Other ways to sign in" (there is no Edit email); Generate temporary password → confirm → one request on a double click (count `fetch` calls to `/temporary-password`) → password shown; the dialog's status changes to "Temporary password generated" without closing; close and reopen: no password shown.
    - Reset row: ⋯ has View details, Approve, Decline; the dialog shows Approve primary and Decline link; Decline from the dialog closes the request and the list reloads.
    - A row whose `user` is null (set `user_id` null is not possible; instead verify `queueMenuItems` test) — covered by the unit test.
    - Users > View details still shows no invite controls; the pencil edit (name, email, contact number) still works.
- [ ] **Step 5:** Commit — `git commit -m "feat(accounts): Password & Invites in Facilities layout with a clear View details dialog"`.

### Task R6: Final verification

- [ ] **Step 1:** Run `cd backend && php artisan test` — Expected: all PASS.
- [ ] **Step 2:** Run `cd frontend && npm run lint && npm run test:accounts && npx vite build` — Expected: clean.
- [ ] **Step 3:** Confirm each Review Focus item and the spec's out-of-scope list once more.
