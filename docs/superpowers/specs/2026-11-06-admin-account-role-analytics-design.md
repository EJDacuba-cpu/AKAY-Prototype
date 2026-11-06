# Admin Account & Role Analytics — Design

**Date:** 2026-11-06  
**Status:** Approved  
**Route:** `/admin/reports` (existing Reports sidebar item; no report sub-sidebar)  
**Scope:** Admin Reports only. Do not modify BHC/RHU Reports, Account Directory, invitation/reset workflows, or database schema.

## Problem

`AdminReports.jsx` presents municipal referral and clinical statistics that do not match Admin (MHO) responsibilities. Admins need a compact **Account & Role Analytics** workspace: system roles (Admin / BHC / RHU), account statuses, invitations, and password-reset requests — from real AKAY records, with reconciled totals.

## Approach

**Compact matrix payload + thin reporting utility (Approach 1), with Mixed filtering:**

1. Extend `GET /reports/admin` with an authoritative `account_analytics` block (role × status matrix + reconciled totals) aggregated in SQL from `users`.
2. Keep Pending Invitations and Pending Password Reset Requests on existing `GET /password-invites/summary` (AccessRequestStatus::PENDING).
3. Build `adminAccountReporting.js` for validation, client-side Role/Status slicing, and chart/table view-models.
4. Rewrite `AdminReports.jsx` to an Editorial Split Grid; remove referral/clinical/medicine content and municipal CSV export.

## §1 — API contract (`GET /reports/admin`)

**Auth:** unchanged — `role:admin` middleware group.

**Keep legacy fields** (unused by the new UI; may have other consumers later):

- `users_by_role`
- `users_by_status`
- `audit_logs_by_module`
- `system_activity_total`

**Add `account_analytics`** from a single consistent snapshot (one grouped query; derived totals computed from that result set + `User::count()` in the same request):

```json
{
  "data": {
    "account_analytics": {
      "roles": ["admin", "bhc", "rhu"],
      "statuses": ["active", "inactive"],
      "matrix": {
        "admin": { "active": 0, "inactive": 0 },
        "bhc": { "active": 0, "inactive": 0 },
        "rhu": { "active": 0, "inactive": 0 }
      },
      "totals": {
        "accounts": 0,
        "canonical_accounts": 0,
        "active": 0,
        "inactive": 0,
        "by_role": { "admin": 0, "bhc": 0, "rhu": 0 }
      },
      "other_accounts": 0
    }
  }
}
```

### Aggregation rules

- Canonical roles: `User::ROLE_ADMIN|ROLE_BHC|ROLE_RHU` (`admin`, `bhc`, `rhu`).
- Canonical statuses: `User::STATUS_ACTIVE|STATUS_INACTIVE` (`active`, `inactive`).
- Zero-fill every cell of the 3×2 matrix.
- `totals.accounts` = total row count of `users` (database total).
- `other_accounts` = rows whose role or status is outside the canonical sets (never silently dropped).
- Canonical Active/Inactive totals are sums over the matrix only (not “other”).

### Reconciliation invariants (backend tests)

- `canonical_accounts = active + inactive`
- `accounts = canonical_accounts + other_accounts`
- `accounts = sum(matrix cells) + other_accounts`
- `by_role[r] = matrix[r].active + matrix[r].inactive`

Verified against live DB at design time: only `admin|bhc|rhu` and `active|inactive` present; create/update constrained by `UserRequest`.

### Pending access counts

Remain on `GET /password-invites/summary` only:

- Expires stale invites/resets, then counts PENDING via `AccessRequestStatus::applyToInvites` / `applyToResetRequests`.
- System-wide; no role filter. Admin Reports must label them **System-wide (unfiltered)**.

## §2 — Frontend utility & filters

### Service

- Small loader (e.g. `loadAdminAccountAnalytics()` → `GET /reports/admin` → `unwrapData`) used only by Admin Reports.
- `getPasswordInviteSummary()` unchanged for pending counts.

### Utility: `frontend/src/utils/adminAccountReporting.js`

Pure functions. Inputs: `accountAnalytics`, optional `accessSummary`, applied filters `{ role, status }`.

**Validation (reject; do not silently repair):**

- Nonnegative integers for all matrix cells and totals.
- Complete canonical role × status matrix keys.
- All reconciliation invariants above.
- Malformed/missing required fields → `{ ok: false, error }` (full-page error). Never invent zeros for a failed/malformed payload.

**Filtering (client-side Apply/Clear):**

- Role: `all` | `admin` | `bhc` | `rhu`
- Status: `all` | `active` | `inactive`
- Slice canonical matrix only; rebuild chart/table view-models from the slice.
- Access-request counts never filtered.

**View-models:**

- `roleDistribution`, `statusByRole`, `statusTotals`, `summaryRows` (+ totals row)
- Labels: unfiltered left chart **Accounts by Recognized Roles**; filtered → contextual labels
- Distinguish: **database total** (`totals.accounts`), **recognized-role total** (`canonical_accounts`), **filtered totals**
- If `other_accounts > 0`: explicit warning that unclassified accounts are excluded from charts/table; do not add an Other chart series
- `accessRequests`: `{ pendingInvitations, pendingPasswordResets, scope: "system-wide" }` or unavailable

### Independent loading / errors

- Do **not** fail the whole page via `Promise.all` when only the summary fails.
- Account analytics primary: failure or invalid aggregate → full-page error + Retry.
- Summary-only failure → charts/table remain; access-request panel = **Unavailable** (+ optional panel retry).

## §3 — Editorial Split Grid UI, Print & PDF

### Header

- Title: **Account & Role Analytics**
- Subtitle: **System Administration · Current Account Snapshot**
- Controls (BHC/RHU-style, `no-print`): Role + Account Status filters with Apply/Clear · Export PDF · Print
- Export PDF uses the same `window.print()` path as Print; copy must make clear the user chooses **Save as PDF** in the browser print dialog.
- No search; no weekly/monthly period controls.

### Layout

| Region | Content |
|--------|---------|
| Left | Accounts by Recognized Roles chart (Chart.js); Total Registered (recognized / filtered as labeled); compact role breakdown |
| Right upper | Grouped Active vs Inactive by role; Total Active / Total Inactive indicators |
| Right lower | Pending Invitations + Pending Password Resets, labeled system-wide; or Unavailable |
| Bottom | Summary table: Role, Total, Active, Inactive + totals row |

Visual language: AKAY white surfaces, subtle borders, compact spacing, soft red accents, existing Chart.js palette. Responsive: split grid stacks below desktop; target baseline 1366×768.

### Empty vs filtered-empty

- Truly empty recognized matrix (and filters clear): empty messaging for no registered recognized-role accounts.
- Filters yield zero cells but data exists: **No accounts match the current filters**.
- If `other_accounts > 0`, never imply the database has zero accounts.

### Print / PDF article

- Hidden `#admin-account-report-print` (or equivalent) mirrors **applied** view-models.
- Includes: title/subtitle, generated timestamp, filter metadata, database vs recognized vs filtered totals, role breakdown, status-by-role figures, summary table, system-wide pending counts or Unavailable.
- Remove all municipal referral print/CSV content.
- `@page` A4 portrait; tabular figures are authoritative for PDF.

## Non-goals

- BHC/RHU Reports changes
- Account Directory, invite email/token flows, password-reset security changes
- Schema migrations
- Report sub-sidebar / multi-report navigation
- Period-based account history
- Embedding pending counts into `/reports/admin`
- Hardcoded demo statistics

## Success criteria

- `/admin/reports` shows only Account & Role Analytics in the Editorial Split Grid.
- Charts, indicators, and summary table reconcile with the same applied view-models.
- Pending counts match `/password-invites/summary` PENDING rules and stay labeled system-wide.
- Backend feature tests cover aggregate accuracy, invariants, status/role mapping, and admin-only authorization.
- Frontend util tests cover validation, filtering, empty vs filtered-empty, and `other_accounts` warning behavior.
- PDF/Print reflect applied filters; no referral export leftovers.
- API failures and malformed aggregates never appear as legitimate zero counts.
