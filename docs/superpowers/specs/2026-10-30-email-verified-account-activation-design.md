# Email-verified account activation design

Status: planning only; no implementation authorized by this document. Eric requested the implementation plan without implementation on 2026-10-30.

## Intent

MHO creates staff accounts and assigns facilities and permissions. A new account may be saved with an email address that has not yet been proven reachable, but cannot access AKAY until its owner completes the invitation through that mailbox. AKAY does not create Gmail accounts or establish that an address belongs to the intended staff member. MHO remains responsible for staff identity and correct email entry. Any supported email provider is acceptable.

## Selected direction and alternatives

The direction discussed with Eric is invitation-first activation, with backend enforcement. Preserve the existing one-time, 48-hour email invitation and password setup in one flow. A temporary password must not activate an unverified account.

Rejected: validating only email syntax (does not establish mailbox control), requiring Gmail specifically (does not establish mailbox control), or hiding frontend buttons without protecting APIs (direct requests still bypass the screen). Do not add a second verification email after successful invitation acceptance.

## Rules

- Keep administrative active/inactive status separate from Pending Setup; an account requires both active status and completed email verification for access.
- `users.email_verified_at` already exists. Set it only when a valid invitation for the current account email is accepted and its password is saved successfully in the same transaction. A GET preview or mail-delivery success must not verify the account.
- Login, token issuance, refresh, and authenticated APIs enforce verification, including existing tokens. Logout remains available. Preserve existing permission, facility and temporary-password gates.
- A generated password, password change, or reset completion must not set email verification or complete a pending invitation. Unverified accounts use invitation resend/correction instead of reset-based activation.
- The existing invite copy-link/manual-sharing path cannot remain an activation path for unverified accounts: possession of a token supplied by an admin does not demonstrate mailbox access. Retire this action and reject its direct endpoint. Invalidate previously copied pending tokens before enforcement.
- Existing temporary-password functionality may remain only where reachable for an already verified account under current endpoint lifecycle rules; do not invent a new recovery product. Never auto-grant verification to preserve a temporary-password shortcut.
- Correcting an email clears verification, invalidates old invitations/reset tokens, and revokes sessions; issue an invitation to the corrected address. Case-only spelling changes use normalized comparison and do not constitute a new mailbox. Do not fold Gmail dots or plus aliases.
- Retain the case-insensitive login fix and reject ambiguous case-colliding identities. Never select an arbitrary matching account.
- Mail failures leave setup pending. Show resend/correct-email actions; do not expose activation tokens in API responses, logs, clipboard or admin screens.
- Keep historical audit records and completion reasons. Remove unused executable code only after finding every caller.

## Architecture

Laravel owns verification policy, invitation validation, atomic password/verification writes, and token authorization. PostgreSQL stores existing verification timestamps, invitation hashes and transactional state; no new stored procedure is needed. React/shadcn/Tailwind communicates Pending Setup, mail delivery and recovery actions. TanStack Query may refresh affected account/invite views where already used; it cannot authorize access. Existing event-based list refreshes can remain.

## Evidence from the current code

User creation stores an active account with an unknown random password, then sends an invitation. `AccountInviteService::temporaryPassword()` installs a usable password and retires its invitation token. `PasswordSetRecorder` currently completes open invitations through reset or temporary-password changes. Invite copy actions return a raw token-bearing URL. Login and refresh check status/role/facility but not verification. `users.email_verified_at` exists and is already cast as datetime.

## Rollout decisions requiring review before implementation/deployment

Existing accounts may have null verification even when staff already use them. Do not infer mailbox ownership from active status, invite completion via reset/temporary password, or successful historical email delivery. Prepare a read-only aggregate report and a separately reviewed re-invitation/bootstrap procedure before enforcement. Ensure at least one MHO/admin completes email setup through a controlled inbox; no permanent admin exemption. Previously copied or unknown-provenance pending tokens must be rotated through email.

Verified-account email changes will require reactivation and end sessions; this behavior must be visible to MHO. If staff lack inbox access, an alternative identity-verification workflow is a separate design decision, not an implicit bypass.

## Acceptance

An unverified account cannot receive an access/refresh session, call protected APIs using old credentials/tokens, generate a temporary password, or activate through copied invite/reset links. Successful current-email invitation acceptance verifies once and sets a personal password atomically. Invalid, expired, replayed, stale-email and concurrent losing requests cannot activate or modify credentials. Existing verified recovery remains functional. Tests use fake mail and disposable databases; never send test invitations to arbitrary live addresses.
