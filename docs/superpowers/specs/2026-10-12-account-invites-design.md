# Account Invites and Temporary Passwords — Design

**Date:** 2026-10-12
**Status:** Draft, awaiting review
**Branch:** `Rework-Patch-AKAY-1.0`
**Scope:** How a new account gets its first password, how the MHO follows that up, and the live field checks on the account forms.

Goal: the MHO creates accounts but never knows a user's password. A new user receives an email link, opens it, and chooses their own password; opening the link also proves the email address works, which the password reset flow depends on. When email cannot reach someone, the MHO can issue a one-time temporary password that must be changed at first sign-in.

Out of band, the MHO phones the person before creating the account to confirm who they are and read back their email address. That call is a procedure, not software, and is not built here.

---

## A. Decisions

| # | Decision |
|---|---|
| D1 | Create Account no longer has password fields. Saving a new account sets an unusable random password and sends an **invite email** with a one-time link. |
| D2 | The invite link is valid for **48 hours** and works once. Accepting it sets the password the user chooses and returns them to the **login page**. |
| D3 | Edit Account loses its "New password" field. The MHO never sets a password directly; the only ways in are the invite, the temporary password (D5) and the existing reset flow. |
| D4 | The MHO handles invites on the existing Password Resets page, renamed **Password & Invites**, with two tabs: **Reset requests** (existing) and **Invites** (new). The Invites tab reuses the same table layout as the reset requests. |
| D5 | Fallback: **Issue temporary password**. The system generates a random, unique password, shows it to the MHO **once**, and it is valid for **72 hours**. Until the user changes it, the backend refuses every request except changing the password and signing out. |
| D6 | Password rules for accepting an invite and for the forced change are the same as the existing reset: at least 8 characters, upper and lower case, and a number. |
| D7 | Invites live in a new table, `account_invites`, separate from `password_reset_requests`: invites have no approval step and a different lifecycle. |
| D8 | Existing accounts, including the test accounts, keep their passwords and get no invite. The Invites tab lists only accounts created after this change. |
| D9 | Forgot password is unchanged: the user asks, the MHO approves, a link is emailed. Only its wording changes (section F). |
| D10 | Every field on the account forms shows a live, animated validation icon on its right edge (section E1). |
| D11 | No SMS. Emails go through the existing mailer (Gmail SMTP). |

---

## B. Data

New migration `backend/database/migrations/2026_10_12_000001_create_account_invites.php`.

### B1. `account_invites`
| Column | Notes |
|---|---|
| `id` | |
| `user_id` | FK `users`, cascade on delete, **unique**: one invite row per account. Resending rotates the token in place. |
| `email` | The address the current link was sent to. |
| `token_hash` | `sha256` of the raw token, nullable. Cleared when the invite is accepted, expired or superseded. |
| `status` | `pending`, `accepted`, `expired`, `superseded`. |
| `delivery` | `sent` or `failed`: whether the last send reached the mailer. |
| `expires_at` | 48 hours after the last send. |
| `sent_at`, `accepted_at` | Timestamps. |
| `created_by` | FK `users` (the MHO), nullable on delete. |
| timestamps | |

`superseded` means the account got its password another way: a temporary password was issued, or a reset request was completed.

### B2. `users`
- `must_change_password` boolean, default `false`.
- `temp_password_expires_at` timestamp, nullable.

### B3. `password_reset_requests`
- `delivery` string, nullable: `sent` or `failed` for the last emailed link (section F3).

---

## C. Backend

### C1. Creating an account (`UserController@store`, `UserRequest`)
- `password` and `password_confirmation` are no longer accepted on create or update (`prohibited`).
- On create, the user's password is set to a random 64-character string that nobody knows, so the account cannot sign in yet.
- In the same request, an invite is created and emailed. If the mailer throws, the account is still created, the invite is saved with `delivery = failed`, and the response says so (`invite.delivery`), so the page can warn the MHO.
- MHO accounts are invited the same way.

### C2. Invite links (new `AccountInviteService`, `AccountInviteController`)
Public, throttled routes, matching the reset routes:
- `GET /api/auth/invites/verify?token=` → `{ name, email, expires_at }`, or 422 "This invite link is invalid or expired."
- `POST /api/auth/invites/accept` `{ token, password, password_confirmation }` → sets the password, `must_change_password = false`, invite `accepted`, token cleared, audit log; returns a message. The frontend then goes to `/login`.
- An expired token is marked `expired` when it is checked, as resets do today.

Admin routes (inside `role:admin`):
- `GET /api/account-invites` → paginated list with the same filters as reset requests (`status`, `search`).
- `POST /api/account-invites/{invite}/resend` → new token, new 48-hour window, email sent again. The old link stops working.
- `PATCH /api/account-invites/{invite}/email` `{ email }` → updates the user's email (unique, same rule as `UserRequest`) and resends. Only while `pending` or `expired`.
- `POST /api/account-invites/{invite}/link` → **Copy link**: rotates the token and returns the new URL for the MHO to share another way (Messenger, Viber). The emailed link stops working. Tokens are stored hashed, so an existing link cannot be shown again.
- `POST /api/account-invites/{invite}/temporary-password` → D5. Generates the password, sets `must_change_password = true` and `temp_password_expires_at = now + 72h`, marks the invite `superseded`, revokes the user's sessions, and returns the password **in this response only**.

Accepted invites refuse every action with 422.

### C3. Temporary passwords at sign-in (`AuthController`, new middleware)
- Login with a temporary password past `temp_password_expires_at` fails with code `TEMP_PASSWORD_EXPIRED` and "This temporary password has expired. Ask the MHO for a new one."
- The session payload gains `must_change_password`.
- New `POST /api/auth/change-password` `{ current_password, password, password_confirmation }` for a signed-in user. It clears `must_change_password` and `temp_password_expires_at`.
- New middleware `password.current`, added to the authenticated route group, returns 403 with code `PASSWORD_CHANGE_REQUIRED` for every route except `auth/profile`, `auth/logout`, `auth/refresh` and `auth/change-password` while `must_change_password` is true.

### C4. Reset requests
- Completing a password reset marks a `pending` invite for the same user `superseded`.
- `toResponse` adds `staff_role` so the Reset requests tab can show "Midwife" instead of the facility type (section F).

### C5. Mail
- New `AccountInviteMail` with the view `emails/account-invite.blade.php`: greeting, "The Municipal Health Officer created your AKAY account", facility and role, a **Set up your account** button, "This link works once and expires in 48 hours", and "If you did not expect this email, do not open the link and tell your MHO."
- The frontend URL helper used by reset links moves to a small shared class so invites and resets build links the same way.

### C6. Audit log
`account invite sent`, `account invite resent`, `account invite email changed`, `account invite link copied`, `account invite accepted`, `temporary password issued`, `password changed`. Passwords and tokens are never written to logs; email addresses are masked as reset logs do.

---

## D. Frontend: pages

### D1. Create and Edit Account (`AddUser.jsx`)
- Personal Details has three fields: Full name, Email, Contact number.
- After a create, the page returns to Users with a notice: "Account created. An invite was sent to {email}." If delivery failed: "Account created, but the invite email could not be sent. Resend it from Password & Invites."
- Review shows "Sign-in: invite link by email" instead of the credentials line.

### D2. Accept invite (`/accept-invite?token=`)
Built on the existing `ResetPassword.jsx` layout: "Welcome to AKAY, {name}", the email (read-only), password and confirm fields with the three rules listed, and **Save and continue**. On success it goes to `/login` with "Your password is set. Sign in to continue." An invalid or expired link shows "This invite link is invalid or expired. Ask your MHO to send a new one."

### D3. Forced password change (`/change-password`)
When the session says `must_change_password`, every route redirects here. Fields: current (temporary) password, new password, confirm. On success the user continues to their dashboard. A 403 `PASSWORD_CHANGE_REQUIRED` from any API call also lands here.

### D4. Password & Invites (`PasswordResetRequests.jsx`)
- Sidebar label and page title become **Password & Invites**. The URL stays `/admin/password-reset-requests`; `?tab=invites` opens the second tab.
- Two tabs with pending counts: **Reset requests (n)** and **Invites (n)**.
- The Invites tab uses the same table component, toolbar (search, status filter) and detail drawer as reset requests. Columns: Account, Email, Role, Facility, Sent, Status, Actions.
- Invite actions: **Resend**, **Edit email**, **Copy link**, **Issue temporary password**. Copy link puts the URL on the clipboard and says "Link copied. The emailed link no longer works." Issue temporary password confirms first, then shows the password once in a dialog with a copy button and "This is the only time it is shown. It expires in 72 hours."

---

## E. Frontend: live field validation

### E1. Validation icon (`Field` in `FieldError.jsx`)
`Field` gains a `state` prop that places an icon inside the right edge of its input:
- `valid`: a green check (`--color-success-500`) that draws itself in about 200 ms.
- `checking`: a small spinner (email availability).
- `invalid`: a red alert icon; the message below the field stays as it is today.
- no state: no icon.

A field becomes `valid` only after the person filling in the form has left it once and it passes; email becomes `valid` only after the server says it is available. With reduced motion the icon appears without animation. Inputs get right padding so text never runs under the icon.

Used on: Create/Edit Account (name, email, contact number), Accept invite and Change password (password, confirm).

---

## F. Wording: one vocabulary for both tabs

Password & Invites is one module, so the same event has the same name on both tabs. Each tab shows only the terms that can happen to it. UI text only; stored status values do not change.

### F1. Statuses
| Term | Meaning | Reset requests (stored value) | Invites (stored value) |
|---|---|---|---|
| **Awaiting approval** | The MHO has to decide. | `pending` | does not happen |
| **Link sent** | A one-time link was emailed; waiting for the user. | `approved` + `delivery = sent` | `pending` + `delivery = sent` |
| **Email not sent** | The link could not be emailed. Resend, or copy the link. | `approved` + `delivery = failed` | `pending` + `delivery = failed` |
| **Link expired** | The link was not used in time. | `expired` | `expired` |
| **Password set** | The user chose their password through the link. | `completed` | `accepted` |
| **Declined** | The MHO turned the request down. | `rejected` | does not happen |
| **Temporary password issued** | The MHO gave a temporary password instead. | does not happen | `superseded` by a temporary password |
| **Closed by reset** | A completed reset made the invite unnecessary. | does not happen | `superseded` by a reset |

### F2. Shared labels
| Where | Today | New (both tabs) |
|---|---|---|
| Sidebar, page title, Users page link | Password Resets / Password Reset Requests | Password & Invites |
| Tabs | (none) | Reset requests (n) · Invites (n), where n counts rows that need the MHO: Awaiting approval, Email not sent and Link expired |
| Status filter | All Status | All statuses, listing only that tab's terms |
| Summary cards | Pending Review / Visible Requests / Security: Admin approval required | Needs action / Showing / Links expire in: 60 minutes (resets) or 48 hours (invites) |
| Table columns | User, Email, Role, Facility, Requested, Status | Account, Email, Role (staff role, e.g. "Midwife"), Facility, Date (requested or invited), Status |
| Link actions | Approve and send link | **Approve** stays on Awaiting approval (it sends the link). **Resend link** on both tabs for Link sent, Email not sent and Link expired |
| Copy link | (none) | **Copy link** on both tabs for Link sent and Email not sent |
| Row actions | View details, Approve, Reject | View details plus the status's main action. Invites keep Copy link, Edit email and Issue temporary password in a `⋯` menu; Reset requests show Copy link as a button |
| Reject action and dialog | Reject request / Reject password reset? | Decline request / Decline this reset request? (Reset requests only) |

### F3. What this adds to reset requests
For "Email not sent", "Resend link" and "Copy link" to mean the same on both tabs, reset requests gain what invites have:
- `password_reset_requests.delivery` (`sent` or `failed`, nullable), set when a link is emailed. Today an approval whose email fails returns a server error but leaves the request `approved`, so the MHO sees a sent link that never arrived; after this change the approval saves with `delivery = failed` and shows **Email not sent**.
- `POST /api/password-reset-requests/{request}/resend` and `/link` behave like the invite actions: rotate the token, restart the 60-minute window, email it or return the URL.

---

## G. Errors and edge cases

- Mail failure on create or resend: the action still saves; the invite shows **Email not sent**.
- Editing the email of a pending invite checks uniqueness and resends; an accepted invite cannot be edited from this tab (use Edit Account).
- A user who signs in with a temporary password and closes the tab stays forced to change it on the next sign-in, until it expires.
- Deactivating an account leaves its invite as is; verify and accept refuse inactive accounts, as resets do.
- Two MHOs acting on the same invite: the last token wins; the earlier link simply stops working.

---

## H. Testing

Backend (PHPUnit):
- Create sends an invite, stores a hashed token, sets an unusable password; a mailer failure still creates the account with `delivery = failed`.
- `password` on create or update is rejected.
- Verify and accept: valid, used, expired, wrong token, inactive account; weak passwords rejected.
- Resend, edit email (uniqueness), copy link: each rotates the token and kills the old one; refused once accepted; admin only.
- Temporary password: returned once, never logged; expired one cannot sign in; `password.current` blocks other routes until changed; change-password clears the flags.
- Completing a reset supersedes a pending invite.
- Reset requests: an approval whose email fails saves `delivery = failed`; resend and copy link rotate the token and restart the 60-minute window.

Frontend (`node --test`): the shared status terms (each stored value on each tab maps to the right term), the Field state rules (when a field becomes valid), and the forced-change redirect rule.

Browser: create an account and see the notice, open the invite link from the mail log, set a password and sign in; issue a temporary password and get forced to change it; check the icons and the new wording.

---

## I. Build order

1. Live validation icons on Create Account (E1). Independent and small.
2. Backend: migration, invite service and routes, mail, create-account change, temporary password and `password.current`.
3. Accept invite page and Create/Edit Account changes (D1, D2).
4. Password & Invites tabs, the shared wording, and the reset-request delivery, resend and copy-link additions (D4, F).
5. Forced password change page (D3).

---

## J. Not in scope

- SMS, and the MHO's phone call.
- Changing the forgot-password approval flow.
- Self-service email changes by users.
- Invites for accounts that already existed before this change.
