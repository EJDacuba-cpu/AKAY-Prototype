# Account Details with Access Actions — Design

Date: 2026-10-12
Status: Draft for review
Builds on: `2026-10-12-account-invites-design.md` (invite and reset statuses are unchanged).

## Goal

The MHO sees one account in one place. Account details shows who the account is and how it signs in, and holds every
invite and password action for it. Password & Invites becomes a queue of work to do, laid out like Facilities.

## What was said and what is assumed

Said by the product owner:
- "Additional Assignments" is not needed as a column; the table should show which facility the account is active in.
- Remove Password & Invites from the Users row menu and add View details: role, facility, status (Active or Inactive),
  date created with time.
- The View details on Password & Invites repeats the account's details, and Edit email and Generate temporary password
  are confusing.
- The Reset requests and Invites tabs should use the same alignment as Facilities.
- Account details stays a modal, not a full screen.
- A pencil icon in Account details edits the account's name and contact number, because they can be entered wrongly.
  Included in this work.

Assumptions (correct me if wrong):
- Editing is limited to name and contact number. Role, facility and status change access or routing, so they are not
  edited here; status already has Activate/Deactivate. Email stays under Access (Edit email), because it is the login and
  changing it sends a new invite.
- The Password & Invites sidebar page stays, because reset requests come from users and need an approval queue.
- "Inactive" stays the label for a deactivated account, as the table and filters already use it.
- No change to invite or reset rules, statuses, expiry times or emails.

## Decisions

| # | Decision |
|---|---|
| D1 | One shared `AccountDetailsModal` replaces the modal now inside `UserManagement.jsx` and the details dialog inside `AccessRequestTable`. |
| D2 | It opens from Users (⋯ > View details) and from Password & Invites (⋯ > View account). It stays a modal; promote it to `/admin/users/:id` only if it gains audit history, more edit fields or a need for shareable links. |
| D3 | Account block: Name, Contact number, Role, Facility, Status, Date created (date and time), with a pencil icon to edit Name and Contact number (D8). Footer link to Staff Assignments for nurse accounts. |
| D4 | An Access section holds the invite and reset status and all their actions. Edit email and Temporary password are inline panels, never a dialog on top of the modal. |
| D5 | The Password & Invites ⋯ menu keeps only queue actions: Approve and Decline on a Pending reset request, plus View account. Everything else moves into the Access section. |
| D6 | Reset requests and Invites tabs become pill buttons in the toolbar row, as on Facilities. A plain description line sits above, and an empty list shows a centered message with no card. |
| D7 | One new read endpoint supplies the Access data. Actions use the existing endpoints. |
| D8 | A pencil icon in the Account block turns Name and Contact number into inputs (Save / Cancel). Only those two fields; saved with the existing `PATCH /users/{id}`. |

## Users page

Already done in the working tree (uncommitted): the Additional Assignments column is removed from the table and cards,
and the row menu has View details and Activate/Deactivate. This spec moves that modal into the shared component.

## Account details modal

```
┌ Account details ───────────────────────────────┐
│ email                                          │
├────────────────────────────────────────────────┤
│ ACCOUNT                                    ✎   │
│ Name            Eric Jhosh C. Dacuba           │
│ Contact number  09XXXXXXXXX                    │
│ Role            Midwife                        │
│ Facility        Pitpitan Health Center         │
│ Status          ● Active                       │
│ Date created    Oct 12, 2026, 1:12 PM          │
├────────────────────────────────────────────────┤
│ ACCESS                                         │
│ [In progress]  Link sent · expires in 41 h     │
│ [ Resend invite ]   Copy link   Edit email     │
│                                                │
│ Other ways to sign in                          │
│ Generate temporary password                    │
│ Use only if the email can't be delivered.      │
│ This also stops the invite link.               │
├────────────────────────────────────────────────┤
│ Additional assignments → Staff Assignments     │
└────────────────────────────────────────────────┘
```

### Editing name and contact number

- The pencil sits in the Account block header, with the label "Edit name and contact number" (tooltip and
  `aria-label`). It shows for every account, Inactive ones included, because a wrong name should be fixable on a
  deactivated account too.
- Pressing it turns the Name and Contact number rows into inputs, with Save and Cancel under them. Role, Facility,
  Status and Date created stay as text. Only one panel is in edit mode at a time; the Access section's own inline panels
  (Edit email, Temporary password) stay usable.
- Validation matches the account form: Name required ("Enter the full name."); Contact number must be a valid mobile
  number (`isValidContactNumber`, the `09XXXXXXXXX` format the server enforces), shown on blur and on Save.
- Save is disabled until a value changed and while saving. Only changed fields are sent; the contact number is sent
  after `normalizeContactNumber`, as the account form does.
- On success the inputs return to text, the Users table updates without a reload, and the modal shows the new values. A
  server 422 shows its message under the field it names; any other failure shows a message above the buttons and keeps
  the inputs.
- Cancel and Esc discard the edit. Closing the modal while editing discards it too (two short fields; no draft kept).
- Every change is recorded by the existing audit log entry on update. Changing name or contact number does not sign the
  account out (only access, role, facility or status changes do, on the server).

### Access section rules

The section shows the state of the account's latest invite and its open reset request, using the existing
`inviteStatus` and `resetRequestStatus` functions (`accessRequestStatus.js`). Their `actions` lists decide which controls
appear; nothing is shown that the list does not allow.

| Account state | Access section shows |
|---|---|
| Invite open (Pending or In progress) | Status badge and reason. Primary: Resend invite. Quiet links: Copy link, Edit email. "Other ways to sign in" with Generate temporary password. |
| Invite expired | Same, with Resend invite as the primary. |
| Temporary password active | Status and expiry. Generate temporary password only (to issue a new one). |
| Invite Complete | "Password set" with how it was completed. No controls. |
| Reset request Pending | Status "Awaiting approval". Primary: Approve. Quiet link: Decline. |
| Reset request Approved or expired | Status and reason. Primary: Resend link. Quiet link: Copy link. |
| Account Inactive | "Account deactivated. No access actions." No controls. |
| Account without an invite or reset (existing accounts, per D8 of the invites spec; the admin account) | "Password set by the user." No controls. |

When both an invite and a reset request are open, the invite block shows first, then the reset block, each with its own
status line.

### Action behavior

- One primary button per block. Copy link and Edit email are text links beside it.
- **Edit email** turns the email line into an input with "Save and resend" and Cancel. It keeps the current validation
  (format check, then the availability check on blur) and the note "A new invite is sent to this address. The old link
  stops working."
- **Generate temporary password** first expands an inline warning ("Any invite link stops working.") with Confirm and
  Cancel. After Confirm, the same area shows the password, a Copy button and its expiry, once.
- **Copy link** copies the link and notes that the emailed link no longer works; if the clipboard is blocked, it shows
  the link in a read-only field inside the section (replacing the separate manual-copy dialog).
- While any action runs, all controls in the section are disabled.

## Password & Invites page

- Tabs are pill buttons in the `heading` slot of `ListToolbar`, in the same row as Search and Filters, styled like
  Facilities (`bg-[#B91C1C] text-white` active, white inactive, `h-10 rounded-xl px-5 text-sm font-medium`). The page
  renders the tabs and passes them to `AccessRequestTable`, so both tabs share one toolbar.
- The tab description (for example "Review requests and send secure one-time reset links. Links expire after 60
  minutes.") is a plain line above the toolbar. The card header and shield icon are removed.
- When there are no rows, the table card is not rendered. A centered block shows an icon in a circle and "No password
  reset requests found." (or "No account invites found."), with "Try adjusting your search or filters." when a filter or
  search is active.
- Row menus follow D5. The tables, columns, statuses and mobile cards are otherwise unchanged. The tab selected in
  `?tab=invites` keeps working.

## Data and backend

- New: `GET /users/{user}/access` (admin only, in the existing `role:admin` group). It returns
  `{ invite, reset_request }`, each in the same shape the Password & Invites list rows already use (including `user`
  with `status`, `staff_role`, `facility`), or `null`. `invite` is the account's latest invite. `reset_request` is its
  latest request that is not completed or declined.
- The existing `toResponse` builders in `AccountInviteController` and `PasswordResetRequestController` are reused so the
  shape cannot drift. Making them reachable from the new action (public, or moved to a shared resource) is an
  implementation detail for the plan.
- Stale invites and reset requests are expired before the read, as the list endpoints do.
- `created_at` already comes back from `GET /users`; no change there.
- Name and contact number edits use the existing `PATCH /users/{id}` with only `name` and/or `contact_number`.
  `UserRequest` already validates them on update (`name` string max 255; `contact_number` `^09\d{9}$`), and `update`
  already writes the audit entry. No backend change for editing.
- No new action endpoints. Resend, Copy link, Edit email and Temporary password call the existing
  `/account-invites/...` routes; Approve, Decline, Resend and Copy link for resets call `/password-reset-requests/...`.

### Frontend structure

- `components/features/accounts/AccountDetailsModal.jsx`: the shell, account block (with the pencil edit) and footer
  link.
- `services/adminAccountsService.js`: add `updateAdminAccountProfile(id, { name, contact_number })`, which patches,
  normalizes and updates the account cache like `updateAdminAccountStatus`.
- `utils/accountForm.js`: add `validateAccountProfile({ name, contact_number })`, reusing the Personal Details rules.
- `components/features/accounts/AccountAccessSection.jsx`: loads `/users/{id}/access`, renders the blocks and inline
  panels, runs the actions.
- `utils/accountAccess.js`: a pure function that turns `{ invite, reset_request, user }` into the blocks and controls to
  render (kept out of JSX so it can be tested).
- `services/accountAccessService.js`: the one new API call.
- `AccessRequestTable.jsx`: drops `DetailsModal`; "View details" becomes "View account" and opens the shared modal;
  gains a `toolbarHeading` prop and the new empty state.
- `InvitesTab.jsx` and `ResetRequestsTab.jsx`: keep list logic; the invite email and temporary password dialogs move
  into the Access section.
- `TemporaryPasswordDialog.jsx`: its content moves into the inline panel; the file is removed when nothing else uses it.

## Errors

- A failed action shows its message inside the Access section; the modal stays open and controls re-enable.
- If an action finds the invite or request already closed, the section reloads and shows the new status.
- If the access data cannot load, the account block still shows and the Access section shows "Could not load access
  details" with Try again.
- After any successful action the section reloads, and the Password & Invites lists and counts refresh.

## Testing

- `utils/accountAccess.test.js` (node test runner, like `facilityFilters.test.js`): the table above, one case per row,
  including both blocks open, Inactive account and no invite.
- `utils/accountForm.test.js`: `validateAccountProfile` for an empty name, a bad contact number and valid values.
- Backend feature test for editing: an admin `PATCH` with only `name` and `contact_number` changes those fields and
  nothing else, writes an audit entry and does not revoke the account's sessions; a bad contact number returns 422.
- Backend feature test for `GET /users/{user}/access`: admin gets invite and reset request; non-admin is refused; an
  account with neither returns nulls; stale rows are expired first.
- Browser walk-through at desktop and narrow width: Users > View details; Password & Invites > View account from each
  tab; pencil edit of name and contact number (save, cancel, invalid number); resend, copy, edit email, temporary
  password, approve and decline; empty state; tab pills in the toolbar row.

## Out of scope

- A full-screen account page.
- Editing role, facility, permissions or position from Account details.
- Changing an email after the invite is complete.
- Any change to invite or reset rules, statuses, expiry or email content.
- Pending counts on the tabs (the summary endpoint stays unused by the UI, as now).
- Filters other than Status on Password & Invites.
