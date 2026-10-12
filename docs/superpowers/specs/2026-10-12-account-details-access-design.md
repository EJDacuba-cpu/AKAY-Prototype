# Account Details and Invite Controls — Design

Date: 2026-10-12
Status: Revised after review (separation of Users and Password & Invites). Supersedes the first version of this spec.
Builds on: `2026-10-12-account-invites-design.md` (invite and reset statuses are unchanged).

## Goal

Two modules, two jobs:
- **Users** shows who an account is and lets the MHO correct it: view details, edit name and contact number.
- **Password & Invites** is where the MHO controls how an account signs in: generate, resend, copy, edit email, approve,
  decline.

Password & Invites is laid out like Facilities.

## What was said and what is assumed

Said by the product owner:
- "Additional Assignments" is not needed as a column; the table should show which facility the account is active in.
- Replace Password & Invites in the Users row menu with View details: role, facility, status (Active or Inactive), date
  created with time.
- A pencil icon in Account details edits full name, contact number and email together. Included in this work.
- Account details stays a modal, not a full screen.
- The View details on Password & Invites repeats the account's details, and Edit email and Generate temporary password are
  confusing.
- The Reset requests and Invites tabs use the same alignment as Facilities.
- Separation: generate, resend and copy belong to Password & Invites; viewing and editing account details, **including
  the email**, belong to Users. Invite controls do **not** go inside Account details, and Edit email leaves Password &
  Invites.

Assumptions (correct me if wrong):
- Editing in Account details is limited to name, contact number and email. Role, facility and status change access or
  routing, so they are not edited there; status already has Activate/Deactivate.
- Changing the email in Users already does the right thing on the server (`UserController::followEmailChange`): an open
  invite on an active account gets a fresh link at the new address and the old link stops working; an inactive account
  gets no email and its old link is retired; a completed invite is left alone. No backend change.
- The Password & Invites sidebar page stays.
- "Inactive" stays the label for a deactivated account.
- No change to invite or reset rules, statuses, expiry times or emails.

## Decisions

| # | Decision |
|---|---|
| D1 | Account details is a modal opened only from Users (⋯ > View details). It shows the account and has the pencil edit (name, contact number, email). It has no invite or reset controls. |
| D2 | It stays a modal; promote it to `/admin/users/:id` only if it gains audit history, more edit fields or a need for shareable links. |
| D3 | Account block: Name, Email, Contact number, Role, Facility, Status, Date created (date and time). Footer link to Staff Assignments for nurse accounts. |
| D4 | The ⋯ menu on a Password & Invites row has **View details**, plus **Approve** and **Decline** on a Pending reset request. Nothing else. |
| D5 | Password & Invites **View details** is one dialog for both tabs, about the invite or reset request: who it is for (name and email only, no role or facility, which are table columns), the status, the dates, and the controls. |
| D6 | The controls are grouped by intent and use inline panels, never a dialog on top of the dialog. |
| D7 | Reset requests and Invites tabs become pill buttons in the toolbar row, as on Facilities. A plain description line sits above, and an empty list shows a centered message with no card. |
| D8 | A pencil icon in the Account block turns Name, Email and Contact number into inputs (Save / Cancel), saved with the existing `PATCH /users/{id}`. Email is removed from the Password & Invites controls. |
| D9 | No new endpoint. |

## Users: Account details

```
┌ Account details ───────────────────────────────┐
│ email                                          │
├────────────────────────────────────────────────┤
│ ACCOUNT                                    ✎   │
│ Name            Eric Jhosh C. Dacuba           │
│ Email           name@example.com               │
│ Contact number  09XXXXXXXXX                    │
│ Role            Midwife                        │
│ Facility        Pitpitan Health Center         │
│ Status          ● Active                       │
│ Date created    Oct 12, 2026, 1:12 PM          │
│ Additional assignments → Staff Assignments     │
└────────────────────────────────────────────────┘
```

### Editing name, email and contact number

- The pencil sits in the Account block header (tooltip and `aria-label` "Edit name, email and contact number"). It shows
  for every account, Inactive ones included.
- Pressing it turns the Name, Email and Contact number rows into inputs with Save and Cancel under them. Other rows stay
  text.
- Validation matches the account form: Name required ("Enter the full name."); Email a valid address ("Enter a valid email
  address.") not used by another account (checked on blur with `GET /users/email-available?email=&ignore=<id>`, "Email is
  already taken.", and checked again on Save); Contact number a valid mobile number (`09XXXXXXXXX`).
- Under the Email input: "If this account's invite is still open, a new invite is sent to the new address and the old link
  stops working."
- Save is disabled until a value changed and while saving. Only changed fields are sent; the number is sent after
  `normalizeContactNumber`, the email trimmed (a change of letter case alone counts as unchanged).
- On success the inputs return to text and the Users table updates without a reload. A server 422 shows its message under
  the field it names (name, email or contact number); any other failure shows a message above the buttons and keeps the inputs.
- Cancel and closing the modal discard the edit. Every change is audit-logged by the existing update. It does not sign the
  account out.

## Password & Invites

### Page layout

- Tabs are pill buttons in the `heading` slot of `ListToolbar`, in the same row as Search and Filters, styled like
  Facilities (`bg-[#B91C1C] text-white` active, white inactive, `h-10 rounded-xl px-5 text-sm font-medium`). The page
  renders the tabs and passes them to the active tab.
- The tab description is a plain line above the toolbar ("Review requests and send secure one-time reset links. Links
  expire after 60 minutes." / "New accounts set their own password from a one-time invite link. Links expire after 48
  hours."). The card header and shield icon are removed.
- With no rows, the table card is not rendered. A centered block shows an icon in a circle and "No password reset requests
  found." (or "No account invites found."), with "Try adjusting your search or filters." when a filter or search is
  active.
- Tables, columns, statuses, mobile cards and `?tab=invites` are otherwise unchanged.

### Row menu (D4)

View details; and for a Pending reset request, Approve and Decline (they open the existing confirmation). A row whose
account is gone still has View details. Resend, Copy link and Generate temporary password are no longer in the menu.

### View details dialog (D5, D6)

```
┌ Account invite ────────────────────────────────┐
│ Eric Jhosh C. Dacuba · email                   │
├────────────────────────────────────────────────┤
│ [In progress]  Link sent · expires in 41 h     │
│ Invited          Oct 12, 2026, 1:12 PM         │
│ Link expires     Oct 14, 2026, 1:12 PM         │
│ ────────────────────────────────────────────── │
│ [ Resend invite ]   Copy link                  │
│                                                │
│ Other ways to sign in                          │
│ Generate temporary password                    │
│ Use only if the email can't be delivered.      │
│ This also stops the invite link.               │
└────────────────────────────────────────────────┘
```

The detail rows are the dates the tab already lists (invite: Invited, Link expires, Temporary password expires, Completed;
reset request: Requested, Approved, Declined, Completed, Link expires, Admin note), omitting empty ones.

Controls come from the existing `inviteStatus` / `resetRequestStatus` (`accessRequestStatus.js`); nothing is shown that the
status does not allow.

| Row state | Controls |
|---|---|
| Invite open (Pending or In progress) | Primary Resend invite; link Copy link; "Other ways to sign in": Generate temporary password. |
| Invite expired | Primary Resend invite; Generate temporary password. |
| Temporary password active | Generate temporary password only (to issue a new one). |
| Invite Complete or Cancelled (account Inactive) | Status and reason only. |
| Reset request Pending | Primary Approve; link Decline. |
| Reset request Approved or expired | Primary Resend link; link Copy link. |
| Reset request Complete, Declined or Cancelled | Status and reason only. |

Action behavior:
- One primary button per dialog. Copy link is a text link beside it. There is no Edit email here; the email is changed in
  Users, and a short note under the account line says so: "To change the email, edit the account in Users."
- **Generate temporary password** first expands an inline warning ("Any invite link stops working.") with Confirm and
  Cancel; after Confirm the same area shows the password, a Copy button and "This is the only time it is shown. It expires
  in 72 hours." Closing the dialog discards it.
- **Approve / Decline** from the dialog use the same inline confirmation text as the menu.
- **Copy link** copies and says the emailed link no longer works; if the clipboard is blocked, the link appears in a
  read-only field inside the dialog.
- While any action runs, every control is disabled and a second click is ignored.
- After an action the list reloads, and the dialog shows the row's new status.

## Frontend structure

- `components/features/accounts/AccountDetailsModal.jsx` (exists): the Users modal. Remove its Access section; add the
  Email row and field to the pencil edit.
- `components/features/password-access/AccessDetailsDialog.jsx`: the View details dialog above; holds the controls and
  their inline panels and runs the actions.
- `components/features/password-access/CopyValue.jsx`: moved from `features/accounts/`.
- `hooks/useEmailAvailability.js`: the on-blur availability check (cached per address, retried after a failed check) taken from
  the old Edit email form, used by the Users edit form.
- `utils/accountAccess.js`: keep `RESET_CONFIRM` and `actionLabel`; replace `accountAccessBlocks` with
  `accessControls(kind, row, now) -> { status, primary, links, fallback }` for one row, and add `queueMenuItems`.
- `AccessRequestTable.jsx`, `InvitesTab.jsx`, `ResetRequestsTab.jsx`, `useAccessRows.js`,
  `pages/admin/PasswordResetRequests.jsx`: layout, slim menu, dialog.
- Remove: `AccountAccessSection.jsx`, `InlineEmailEdit.jsx`, `services/accountAccessService.js`,
  `queryKeys.accountAccess`, the `GET /users/{user}/access` endpoint and its test, and `TemporaryPasswordDialog.jsx`
  (after nothing uses it). `PATCH /account-invites/{id}/email` and `updateInviteEmail` are left in place, unused by the UI
  (a later cleanup).

## Errors

- A failed action shows its message inside the dialog; the dialog stays open and controls re-enable.
- If an action finds the row already closed, the list reloads and the dialog shows the new status.
- If the row disappears after a reload, the dialog closes.

## Testing

- `utils/accountAccess.test.js`: `accessControls` for each table row above, `queueMenuItems` (View details, approve and
  decline only, no View details without an account), labels and reset confirmation copy.
- `utils/accountForm.test.js`: profile validation and changes, now including the email (bad format; a case-only change is
  unchanged).
- Backend: `AccountProfileEditTest` (exists). No endpoint test is needed; no endpoint is added.
- Browser walk-through at desktop and narrow width: Users > View details and pencil edit; Password & Invites tabs, menu,
  View details, each control that does not send email, the empty state, tab pills in the toolbar row.

## Out of scope

- A full-screen account page.
- Editing role, facility, permissions or position from Account details.
- Any change to invite or reset rules, statuses, expiry or email content.
- Pending counts on the tabs.
- Filters other than Status on Password & Invites.
