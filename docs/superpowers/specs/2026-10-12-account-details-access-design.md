# Account Details and Invite Controls — Design

Date: 2026-10-12
Status: Revised (third revision): Users edits the account; Password & Invites is a menu of controls with a modal per action.
Builds on: `2026-10-12-account-invites-design.md` (invite and reset statuses are unchanged).

## Goal

Two modules, two jobs:
- **Users** shows who an account is and lets the MHO correct it: view details, edit full name, email and contact number.
- **Password & Invites** is where the MHO controls how an account signs in. Each row has one ⋯ menu listing the controls
  (resend, copy link, generate temporary password, approve, decline); choosing one opens a modal. There is no separate
  details view, because the row already shows the account, status and date.

Password & Invites is laid out like Facilities.

## What was said and what is assumed

Said by the product owner:
- "Additional Assignments" is not needed as a column; the table should show which facility the account is active in.
- Replace Password & Invites in the Users row menu with View details: role, facility, status (Active or Inactive), date
  created with time.
- A pencil icon in Account details edits full name, contact number and email together.
- Account details stays a modal, not a full screen.
- Separation: generate, resend and copy belong to Password & Invites; viewing and editing account details, including the
  email, belong to Users. Edit email leaves Password & Invites.
- Password & Invites has no View details: the action menu lists the controls and a modal pops up for the chosen one.
- The Reset requests and Invites tabs use the same alignment as Facilities.

Assumptions (correct me if wrong):
- Editing in Account details is limited to name, contact number and email. Role, facility and status change access or
  routing, so they are not edited there; status already has Activate/Deactivate.
- Changing the email in Users already does the right thing on the server (`UserController::followEmailChange`): an open
  invite on an active account gets a fresh link at the new address and the old link stops working; an inactive account
  gets no email and its old link is retired; a completed invite is left alone. No backend change.
- A row with no allowed control (Complete, Declined, Cancelled) has no ⋯ menu; its status badge and tooltip already say
  why.
- "Inactive" stays the label for a deactivated account. No change to invite or reset rules, statuses, expiry or emails.

## Decisions

| # | Decision |
|---|---|
| D1 | Account details is a modal opened only from Users (⋯ > View details). It shows the account and has the pencil edit. |
| D2 | It stays a modal; promote it to `/admin/users/:id` only if it gains audit history, more edit fields or a need for shareable links. |
| D3 | Account block: Name, Email, Contact number, Role, Facility, Status, Date created (date and time). Footer link to Staff Assignments for nurse accounts. |
| D4 | The pencil turns Name, Email and Contact number into inputs (Save / Cancel), saved with the existing `PATCH /users/{id}`. |
| D5 | Password & Invites rows have a ⋯ menu of the controls the row's status allows, grouped; no View details. |
| D6 | Every control opens a modal that says what will happen before it happens. |
| D7 | Reset requests and Invites tabs become pill buttons in the toolbar row, as on Facilities, with a description line above and a centered empty state with no card. |
| D8 | No new endpoint. |

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
  the field it names (name, email or contact number); any other failure shows a message above the buttons and keeps the
  inputs.
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
- Tables, columns, statuses, mobile cards and `?tab=invites` are otherwise unchanged. The old View details dialog is removed.

### The ⋯ menu (D5)

The menu shows the row's name and email as its header (existing `ActionMenu`), then the controls the status allows
(`inviteStatus` / `resetRequestStatus` in `accessRequestStatus.js`; Edit email is never listed). Controls are grouped; a
group label appears only when the menu has more than one group.

| Row state | Menu |
|---|---|
| Invite open (Pending or In progress) | Resend invite · Copy link · *Other ways to sign in:* Generate temporary password |
| Invite expired | Resend invite · *Other ways to sign in:* Generate temporary password |
| Temporary password active | *Other ways to sign in:* Generate temporary password |
| Reset request Pending | Approve · Decline |
| Reset request Approved or expired | Resend link · Copy link |
| Complete, Declined, Cancelled | no menu |

### The modal for each control (D6)

Every control opens a confirmation modal with the consequence, then runs on Confirm. While it runs, the buttons are
disabled and a second click is ignored.

| Control | Modal title and text | Confirm button | Result |
|---|---|---|---|
| Resend invite / Resend link | "Resend invite?" / "Resend reset link?" — "A new link is emailed to {email}. The previous link stops working." | Resend invite / Resend link | Toast "Invite sent to {email}." / "Reset link sent to {email}." or the failed-delivery message. |
| Copy link | "Copy a new link?" — "This creates a new one-time link and copies it. The emailed link stops working." | Copy link | Toast "Link copied. The emailed link no longer works."; if the clipboard is blocked, a modal shows the link to copy by hand. |
| Generate temporary password | "Generate a temporary password?" — "Any invite link stops working." | Generate temporary password | A modal shows the password once with a Copy button: "This is the only time it is shown. It expires in 72 hours. {name} must change it the first time they sign in." |
| Approve | "Approve password reset?" — "This will send a secure one-time reset link to the user's email." | Approve and send link | Toast as for Resend link. |
| Decline | "Decline this reset request?" — "The request will be closed and no link will be sent." | Decline | Toast "Reset request declined." |

After any action the list reloads. A failure shows an error toast with the server's message.

## Frontend structure

- `components/features/accounts/AccountDetailsModal.jsx` (exists): the Users modal. Remove its Access section; add the
  Email row and field to the pencil edit.
- `hooks/useEmailAvailability.js`: the on-blur availability check (cached per address, retried after a failed check), taken
  from the old Edit email form and used by the Users edit form.
- `utils/accountAccess.js`: `menuSections(kind, statusActions) -> [{ label: string|null, actions: Action[] }]`,
  `ACTION_CONFIRM[kind][action] -> { title, description, confirmText }` (reset kind keeps today's approve/decline text),
  and `actionLabel(kind, action)`. `accountAccessBlocks` is removed.
- `components/common/tables/ActionMenu.jsx`: an `actions` entry may be `{ section: "Label" }`, drawn as a divider with a
  small label (additive; other pages are unaffected).
- `features/password-access/AccessRequestTable.jsx`, `InvitesTab.jsx`, `ResetRequestsTab.jsx`, `useAccessRows.js`,
  `pages/admin/PasswordResetRequests.jsx`: layout, grouped menu, one confirmation modal per tab driven by `ACTION_CONFIRM`.
  `TemporaryPasswordDialog` and `ManualCopyDialog` stay.
- Remove: `AccountAccessSection.jsx`, `InlineEmailEdit.jsx`, `services/accountAccessService.js`,
  `queryKeys.accountAccess`, the `GET /users/{user}/access` endpoint and its test, the Password & Invites `DetailsModal`
  and `EditEmailDialog`. `PATCH /account-invites/{id}/email` and `updateInviteEmail` stay in place, unused by the UI (a
  later cleanup).

## Errors

- A failed action shows an error toast with the server's message; the modal closes and the list reloads so the row shows its
  true status.
- If the row was already closed elsewhere, the server refuses and the list reload removes its actions.

## Testing

- `utils/accountAccess.test.js`: `menuSections` for each table row above (including no menu for Complete/Declined/Cancelled
  and a single group without a label), `ACTION_CONFIRM` texts, `actionLabel`.
- `utils/accountForm.test.js`: profile validation and changes, now including the email (bad format; a case-only change is
  unchanged).
- Backend: `AccountProfileEditTest` (exists); email-follow behavior is covered by `AccountInviteAdminTest`. No endpoint is
  added.
- Browser walk-through at desktop and narrow width: Users > View details and the pencil edit (name, email, contact number);
  Password & Invites tabs, menus, each modal that does not send email, the empty state, tab pills in the toolbar row.

## Out of scope

- A full-screen account page.
- Editing role, facility, permissions or position from Account details.
- Any change to invite or reset rules, statuses, expiry or email content.
- Pending counts on the tabs.
- Filters other than Status on Password & Invites.
- Removing the unused `PATCH /account-invites/{id}/email` route.
