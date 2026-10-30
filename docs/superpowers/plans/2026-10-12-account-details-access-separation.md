# Account Details and Invite Controls (Separation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the human chose inline execution). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users shows and edits account details (name, email, contact number); Password & Invites is a menu of controls with one confirmation modal per action, laid out like Facilities, with no details view.

**Architecture:** This revises `2026-10-12-account-details-access.md`. Its Tasks 2 (profile helpers), 3 (account services) and 4 (shared Account details modal with pencil edit) stay; its Task 1 endpoint and Task 5 Access-in-modal are removed; its Task 6 is replaced. A pure helper decides which menu groups a row gets and what each confirmation says; the Password & Invites tabs render them through the existing `ActionMenu` and `ConfirmationModal`.

**Tech Stack:** Laravel (PHPUnit), React 19 + React Router + TanStack Query, Tailwind, lucide-react, `node --test` for pure helpers.

**Spec:** `docs/superpowers/specs/2026-10-12-account-details-access-design.md` (third revision)

**Already committed and kept:** `AccountProfileEditTest`, `validateAccountProfile`/`profileChanges` (extended with the email in Task R2), `getAdminAccount`/`updateAdminAccountProfile`, `AccountDetailsModal` (Users; gets the email in Task R4), `AccountStatusBadge`, and the Users page change.

**No backend change for the email:** changing it in Users already follows the open invite on the server (`UserController::followEmailChange`, covered by `AccountInviteAdminTest`).

## Global Constraints

- UI copy in English. "Inactive" for a deactivated account. Facilities pill style `bg-[#B91C1C] text-white` active / `bg-white text-slate-600 hover:bg-red-50` inactive, `h-10 rounded-xl px-5 text-sm font-medium`. `?tab=invites` keeps working.
- No new endpoint. No change to invite or reset rules, statuses, expiry or email text.
- Edit email is never listed in Password & Invites.
- While verifying in the browser, do not run actions that send real email (the mailer is SMTP): confirm only Copy link, Generate temporary password and Decline; open the Resend and Approve modals and cancel.

## Review Focus

1. A row with no allowed control (Complete, Declined, Cancelled) has no ⋯ menu, and a row whose `user` is null does not crash. Pinned in Task R2 (`menuSections` tests) and Task R5 Step 4.
2. Double-click on a Confirm button — one request, buttons disabled meanwhile. Pinned in Task R5 Step 4.
3. After an action the list reloads and the row's menu and status match the new state. Pinned in Task R5 Step 4.
4. A temporary password is shown once and not again after the modal is closed. Pinned in Task R5 Step 4.
5. An empty search shows the hint; no data at all shows no hint and no card. Pinned in Task R5 Step 4.
6. An email that only differs in letter case is not a change, and an address used by another account is refused before and after Save. Pinned in Task R2 (`profileChanges`) and Task R4 Step 4.
7. `ActionMenu` `section` entries leave every other page's menu unchanged. Pinned in Task R5 Step 4 (spot check Health Records).

---

### Task R1: Remove the access endpoint

**Files:**
- Delete: `backend/app/Support/AccessRows.php`, `backend/tests/Feature/AccountAccessTest.php`
- Modify (restored): `backend/app/Http/Controllers/Api/AccountInviteController.php`, `PasswordResetRequestController.php`, `UserController.php`, `backend/routes/api.php`
- Keep: `backend/tests/Feature/AccountProfileEditTest.php`

**Interfaces:** none produced.

- [ ] **Step 1:** Run `git revert --no-commit 0c1ed5a`, then `git checkout 0c1ed5a -- backend/tests/Feature/AccountProfileEditTest.php` (the revert also drops that test, which stays).
- [ ] **Step 2:** Verify — Run: `cd backend && php artisan test --filter="AccountProfileEdit|AccountInvite|PasswordReset"` — Expected: all PASS; `git status` shows `AccessRows.php` and `AccountAccessTest.php` removed and the controllers and routes restored.
- [ ] **Step 3:** Commit — `git commit -m "refactor(accounts): drop the per-account access endpoint"`.

### Task R2: Menu and confirmation helpers, email in profile helpers

**Files:**
- Modify: `frontend/src/utils/accountAccess.js`, `frontend/src/utils/accountAccess.test.js`, `frontend/src/utils/accountForm.js`, `frontend/src/utils/accountForm.test.js`

**Interfaces:**
- Consumes: `inviteStatus(row, now)`, `resetRequestStatus(row, now)` from `utils/accessRequestStatus.js` (each returns `{ status, label, reason, actions }`).
- Produces (`utils/accountAccess.js`; `accountAccessBlocks` and `RESET_CONFIRM` are removed):
  - `menuSections(kind: "invite"|"reset", statusActions: string[]) -> { label: string|null, actions: Action[] }[]`, `Action = "approve"|"decline"|"resend"|"copy"|"temporaryPassword"`. Groups: first group `["approve","decline","resend","copy"]` filtered to those in `statusActions` (label `null`); second group `["temporaryPassword"]` if allowed, labelled `"Other ways to sign in"`. Empty groups are dropped; `editEmail` is ignored; a lone group keeps `label: null`. No groups means no menu.
  - `ACTION_CONFIRM: { invite: { resend, copy, temporaryPassword }, reset: { approve, decline, resend, copy } }`, each `{ title, description, confirmText }` with the spec's texts. Placeholders `{email}` appear literally in `description` for `resend`; callers replace them with `String.replace("{email}", email)`.
  - `actionLabel(kind, action) -> string` ("Resend invite" / "Resend link", "Copy link", "Generate temporary password", "Approve", "Decline").
- Produces (`utils/accountForm.js`): `validateAccountProfile({ name, contact_number, email }) -> { name?, contact_number?, email? }` (email: `"Enter a valid email address."`); `profileChanges(account, form) -> { name?, contact_number?, email? }` — email returned trimmed only when it differs from `account.email` ignoring letter case.

- [ ] **Step 1: Write the failing tests.** In `accountAccess.test.js` (fixtures: `now = 2026-10-12T08:00:00Z`; actions come straight from `inviteStatus` / `resetRequestStatus`):

```js
test("an open invite: Resend, Copy link, then Other ways to sign in with Generate temporary password")
  // menuSections("invite", inviteStatus(openInvite, now).actions) deepEqual
  // [{ label: null, actions: ["resend","copy"] }, { label: "Other ways to sign in", actions: ["temporaryPassword"] }]
test("an expired invite: Resend, then Generate temporary password")      // [{ null, ["resend"] }, { "Other ways to sign in", ["temporaryPassword"] }]
test("an active temporary password: only Generate temporary password")   // [{ label: "Other ways to sign in", actions: ["temporaryPassword"] }]
test("Edit email is never listed")                                       // statusActions ["resend","copy","editEmail","temporaryPassword"] → no "editEmail" in any group
test("a pending reset request: Approve, Decline")                        // [{ null, ["approve","decline"] }]
test("an approved reset request: Resend link, Copy link")                // [{ null, ["resend","copy"] }]
test("complete, declined and cancelled rows have no menu")               // statusActions [] → []
test("confirmation copy", () => {
  assert.equal(ACTION_CONFIRM.invite.temporaryPassword.description, "Any invite link stops working.");
  assert.equal(ACTION_CONFIRM.reset.decline.title, "Decline this reset request?");
  assert.equal(ACTION_CONFIRM.reset.approve.confirmText, "Approve and send link");
  assert.equal(ACTION_CONFIRM.invite.resend.title, "Resend invite?");
  assert.equal(ACTION_CONFIRM.reset.resend.title, "Resend reset link?");
  assert.equal(ACTION_CONFIRM.invite.copy.confirmText, "Copy link");
});
test("labels", () => { /* actionLabel("invite","resend") "Resend invite"; ("reset","resend") "Resend link"; ("invite","temporaryPassword") "Generate temporary password" */ });
```

In `accountForm.test.js` replace the profile tests: `validateAccountProfile({ name: "Ana", contact_number: "09171234567", email: "ana" })` is `{ email: "Enter a valid email address." }`; a valid triple is `{}`; the earlier name and number cases still hold (with a valid email); `profileChanges({ name: "Ana Cruz", contact_number: "09171234567", email: "Ana@Example.test" }, { name: "Ana Cruz", contact_number: "0917 123-4567", email: " ana@example.test " })` is `{}`; a different email gives `{ email: "new@example.test" }`; a changed name or number alone gives only that field.

- [ ] **Step 2:** Run `cd frontend && npm run test:accounts` — Expected: FAIL (`menuSections` / `ACTION_CONFIRM` not exported; profile email cases fail).
- [ ] **Step 3:** Implement the two modules' changes as specified above.
- [ ] **Step 4:** Run `cd frontend && npm run test:accounts` — Expected: all PASS.
- [ ] **Step 5:** Commit — `git commit -m "feat(accounts): menu groups and confirmation copy helpers, email in profile helpers"` (do not run the build here; `AccountAccessSection` still imports the removed exports until Task R3).

### Task R3: Take the Access section out of the Users modal

**Files:**
- Modify: `frontend/src/components/features/accounts/AccountDetailsModal.jsx` (remove the Access section import and render)
- Delete: `features/accounts/AccountAccessSection.jsx`, `features/accounts/InlineEmailEdit.jsx` (its availability logic is needed in Task R4: read it from commit `e60a12d` with `git show`), `frontend/src/services/accountAccessService.js`; remove `accountAccess` from `frontend/src/utils/queryKeys.js`

**Interfaces:** consumes nothing new; produces nothing.

- [ ] **Step 1:** Make the removals above.
- [ ] **Step 2:** Verify — Run: `cd frontend && npx eslint src && npm run test:accounts && npx vite build` — Expected: clean; `grep -rn "accountAccessService\|AccountAccessSection\|accountAccessBlocks\|InlineEmailEdit" src` returns nothing.
- [ ] **Step 3:** Commit — `git commit -m "refactor(accounts): keep invite controls out of Account details"`.

### Task R4: Email in the Users pencil edit

**Files:**
- Create: `frontend/src/hooks/useEmailAvailability.js`
- Modify: `frontend/src/components/features/accounts/AccountDetailsModal.jsx`

**Interfaces:**
- Consumes: Task R2 `validateAccountProfile` / `profileChanges`; `apiRequest`; `isValidEmail`; `fieldState`; `Field`; `Input`; `updateAdminAccountProfile(id, changes)` (already sends any of `name`, `contact_number`, `email`).
- Produces: `useEmailAvailability({ ignoreId }) -> { check(email: string): Promise<boolean|null>, isTaken(email: string): boolean, checking: boolean, onBlur(email: string): void }` — `check` resolves `true` when another account uses the address, `false` when free, `null` for a bad format or a failed lookup (a failed lookup is forgotten and retried); results cache per lowercased address; the lookup is `GET /users/email-available?email=<email>&ignore=<ignoreId>`.

- [ ] **Step 1:** Implement `useEmailAvailability` from the `checkEmail` / `handleBlur` / `taken` code in the old `InlineEmailEdit` (`git show e60a12d:frontend/src/components/features/accounts/InlineEmailEdit.jsx`).
- [ ] **Step 2:** In `AccountDetailsModal`, add an Email row (between Name and Contact number) and an Email field to the pencil form with the live status icon (`fieldState`), the errors "Enter a valid email address." / "Email is already taken." (after blur), and the note "If this account's invite is still open, a new invite is sent to the new address and the old link stops working." Save is blocked while the address is known to be taken; on Save run `check` once more and stop if taken; a 422 `errors.email[0]` shows under the Email field. Change the pencil `aria-label` and `title` to "Edit name, email and contact number".
- [ ] **Step 3:** Verify — Run: `cd frontend && npx eslint src && npm run test:accounts && npx vite build` — Expected: clean.
- [ ] **Step 4:** Browser (Users; sign in with the seeded test admin from `backend/database/seeders/DatabaseSeeder.php`; create a throwaway account directly in the database with no invite, so no email is sent, and delete it afterwards): the pencil shows Name, Email, Contact number; `not-an-email` + blur shows "Enter a valid email address."; the seeded admin's address shows "Email is already taken." and Save is blocked; changing only the letter case of the email leaves Save disabled; a new valid address saves, the table row and the modal show it without a reload, then restore the old address.
- [ ] **Step 5:** Commit — `git commit -m "feat(accounts): edit email with name and contact number from Account details"`.

### Task R5: Password & Invites: layout, grouped menu, modal per action

**Files:**
- Modify: `frontend/src/components/common/tables/ActionMenu.jsx`, `frontend/src/pages/admin/PasswordResetRequests.jsx`, `features/password-access/AccessRequestTable.jsx`, `InvitesTab.jsx`, `ResetRequestsTab.jsx`

**Interfaces:**
- Consumes: Task R2 `menuSections`, `ACTION_CONFIRM`, `actionLabel`; existing `ConfirmationModal`, `TemporaryPasswordDialog`, `ManualCopyDialog`, `useAccessRows` (`runAction`), and the services already used by the tabs.
- Produces: `ActionMenu` `actions` entries may be `{ section: string }` (drawn as a thin divider with a small grey label; entries without `section` behave exactly as before). `AccessRequestTable` props: remove `detailTitle`, `detailsOf`, `heading`, `description`; add `toolbarHeading` (node for `ListToolbar`'s `heading`) and `menuFor(row) -> { label: string, onClick: () => void }[] | { section: string }[]` entries consumed as `ActionMenu` `actions` (an empty list means no menu is rendered). Each tab takes `{ rolesData, toolbarHeading }`.

- [ ] **Step 1: ActionMenu.** In the `actions.map`, when `action.section` is set render `<div class="mt-1 border-t border-[#F1F5F9] px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">{label}</div>` and nothing else.
- [ ] **Step 2: Page layout.** `PasswordResetRequests.jsx` keeps `TABS`, adds each tab's `description`, renders the description line (`text-sm text-slate-500`) above, and builds the pills (`role="tablist"` / `role="tab"` / `aria-selected`) passed to the active tab as `toolbarHeading`. Remove the underline tab nav.
- [ ] **Step 3: Table.** `AccessRequestTable`: pass `toolbarHeading` to `ListToolbar`; drop the card header (heading, description, `ShieldCheck`) and the `DetailsModal`; the error banner shows above the card; with no rows render only the centered empty state copied from `Facilities.jsx:133-150` (icon circle with `Search`, the tab's `emptyMessage`, and "Try adjusting your search or filters." only when `filters.search` or `filters.status !== "all"`). `RowActions` renders `ActionMenu` from `menuFor(row)` and nothing when it is empty.
- [ ] **Step 4: Tabs.** In each tab, `menuFor(row)` flattens `menuSections(kind, statusOf(row).actions)` into `ActionMenu` entries (a `{ section: label }` entry before a labelled group, then `{ label: actionLabel(kind, action), onClick: () => setPending({ action, row }) }`). One `ConfirmationModal` per tab is driven by `pending` and `ACTION_CONFIRM[kind][pending.action]` (`{email}` replaced with `row.email || row.user?.email`); Confirm runs the action through `list.runAction`: invite — `resendInvite`, `copyInviteLink` (toast, or `ManualCopyDialog` when the clipboard is blocked), `issueTemporaryPassword` (then `TemporaryPasswordDialog`); reset — `approvePasswordResetRequest`, `rejectPasswordResetRequest`, `resendResetLink`, `copyResetLink`; toasts as in the spec. Remove `EditEmailDialog`, the temporary-password confirm state and the old per-action handlers they replace.
- [ ] **Step 5: Verify**
  - Run: `cd frontend && npx eslint src && npm run test:accounts && npx vite build`; `grep -rn "EditEmailDialog\|DetailsModal\|detailsOf" src/components/features/password-access` returns nothing.
  - Browser (sign in with the seeded test admin; create throwaway accounts directly in the database without mail: one with a pending invite, one with a pending reset request; delete them afterwards):
    - Tabs are pills on the same row as Search and Filters at desktop width and at 390 px; `?tab=invites` opens Invites; a search with no match shows the centered message with the hint and no card; clearing it returns the table.
    - Invite row ⋯: header with name and email, Resend invite, Copy link, a divider labelled "Other ways to sign in", Generate temporary password; no View details, no Edit email. Cancel on the Resend modal sends nothing. Copy link → confirm → toast. Generate temporary password → confirm → password modal; a double-click on Confirm sends one request (count `fetch` calls to `/temporary-password`); close, reopen the menu: the row now reads "Temporary password generated" and offers only the temporary password group; the password is not shown again.
    - Reset row ⋯: Approve, Decline (no label, one group); Decline → confirm → toast, the row leaves Pending, and its menu disappears.
    - Open a ⋯ menu on Health Records (BHC/RHU lists use `ActionMenu`) to confirm it looks unchanged.
    - Users > View details still shows no invite controls; the pencil edit (name, email, contact number) still works.
- [ ] **Step 6:** Commit — `git commit -m "feat(accounts): Password & Invites in Facilities layout with a grouped menu and a modal per action"`.

### Task R6: Final verification

- [ ] **Step 1:** Run `cd backend && php artisan test` — Expected: all PASS.
- [ ] **Step 2:** Run `cd frontend && npm run lint && npm run test:accounts && npx vite build` — Expected: clean.
- [ ] **Step 3:** Confirm each Review Focus item and the spec's out-of-scope list once more.
