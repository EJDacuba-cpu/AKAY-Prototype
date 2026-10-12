# Admin Dashboard — Design

Date: 2026-10-12
Status: Draft for review
Replaces the content of `frontend/src/pages/admin/AdminDashboard.jsx`.

## Goal

The admin account is used by the Municipal Health Officer (MHO), who does two jobs in it: overseeing health operations
across the municipality and handling account housekeeping. The dashboard answers both questions at a glance —
"is there an account task waiting for me?" and "how are health operations doing?" — without showing any patient name or
clinical detail.

## What was said and what is assumed

Said by the product owner:
- The admin user is the MHO, who does both oversight and housekeeping ("C — pareho").
- Layout: a "Needs attention" strip on top, the municipal health overview as the main body, side sections below/beside.
- Overview metrics: referral flow, per-barangay table, follow-ups, patients, medicines.
- Medicines are shown with RHU and BHC stock separated.
- Period selector: Today / This week / This month / This year, default This month.
- Needs attention: pending reset requests, pending invites, facilities without staff, stale priority referrals.
- A Priority referral is stale when it is still Pending more than 2 days after its referral date.
- Keep: quick actions, RHU doctor availability, account counts (as a small line, not big cards), recent activity.
- Per-barangay table: the full version with all signals.
- Data comes from one new backend endpoint (approach 1).

Assumptions (correct me if wrong):
- The dashboard is read-only; every action happens on the page a link leads to.
- Opening the dashboard is not audit-logged (it would flood the logs); `/reports/admin` keeps its own logging.

## Layout

```
┌ Header: greeting, date/time, "Municipal health operations and account tasks at a glance." ┐
┌ Needs attention strip (amber, items with count > 0)  — or —  "✓ All caught up" (green line) ┐
MUNICIPAL HEALTH OVERVIEW                                              [ This month ▾ ]
[ Referrals ] [ Follow-ups ] [ Patients ] [ Medicines ]
┌ Per-barangay table ───────────────────────┐ ┌ Quick actions ┐
│                                           │ ├ RHU doctors   ┤
└───────────────────────────────────────────┘ ├ Account counts┤
┌ Recent activity ──────────────────────────┐ └───────────────┘
```

Phone order (one column): strip, cards (2×2), barangay cards, recent activity, quick actions, doctors, account counts.

## Backend: `GET /admin/dashboard`

- New `App\Services\AdminDashboardService` does all counting; new `App\Http\Controllers\Api\AdminDashboardController`
  calls it. The route goes in the existing `role:admin` group in `routes/api.php`. BHC and RHU users get 403.
- Uses Laravel query builder (no Postgres stored function), so it runs the same on the SQLite test DB.
- Query parameter `period` = `today | week | month | year`; any other value or none means `month`. Periods use the app
  timezone. Weeks start on Monday.
  - Current period: from the start of the period until now.
  - Previous period: the same length, shifted back one period (Oct 1–12 now → Sep 1–12 before).

### Response

```
data: {
  period:     { key, from, to, previous_from, previous_to },
  attention:  { reset_requests, invites, stale_priority_referrals,
                facilities_without_staff: [ { type: "bhc" | "rhu", id, name } ] },
  referrals:  { total, previous_total, completed, no_show, pending, priority_pending },
  follow_ups: { overdue, no_show },
  patients:   { total, new },
  medicines:  { rhu_low_stock, bhc_low_stock, bhc_barangays_affected },
  barangays:  [ { id, name, barangay, referrals, no_show, pending, overdue_follow_ups, low_stock, has_staff } ],
  accounts:   { total, active, inactive, bhc, rhu },
  generated_at
}
```

### Definitions

"In period" means the timestamp is between `period.from` and `period.to`. "Now" values ignore the period.

| Field | Rule | Scope |
|---|---|---|
| `attention.reset_requests` | Reset requests that are Pending per `AccessRequestStatus` (same as Password & Invites page; run the same stale-expiry first) | now |
| `attention.invites` | Account invites that are Pending per `AccessRequestStatus` | now |
| `attention.stale_priority_referrals` | `urgency_level = Priority`, normalized status Pending, `referral_datetime` older than now − 2 days | now |
| `attention.facilities_without_staff` | Active BHC with no active user whose `barangay_health_center_id` is that BHC **and** no current staff assignment (not revoked, `starts_on` ≤ today, `ends_on` empty or ≥ today); active RHU with no active `rhu` user whose `rural_health_unit_id` is that RHU | now |
| `referrals.total` | Referrals with `referral_datetime` in period | period |
| `referrals.previous_total` | Same, in the previous period | previous period |
| `referrals.completed` / `no_show` | Of `referrals.total`, those whose normalized status is Completed / No-Show | period |
| `referrals.pending` | All referrals whose normalized status is Pending | now |
| `referrals.priority_pending` | Of `pending`, those with `urgency_level = Priority` | now |
| `follow_ups.overdue` | Follow-up tasks with `state = pending` and `due_date` before today | now |
| `follow_ups.no_show` | Follow-up tasks with `state = no_show` and `no_show_at` in period | period |
| `patients.total` | All patients | now |
| `patients.new` | Patients with `created_at` in period | period |
| `medicines.rhu_low_stock` | Active medicines with an RHU id and `availability_status` Low Stock or Unavailable | now |
| `medicines.bhc_low_stock` | Same, with a BHC id | now |
| `medicines.bhc_barangays_affected` | Number of distinct BHCs counted in `bhc_low_stock` | now |
| `barangays[]` | One row per active BHC; the same rules as above, limited to that BHC's `barangay_health_center_id` | mixed, as above |
| `barangays[].has_staff` | False exactly when that BHC is in `facilities_without_staff` | now |
| `accounts.*` | Users counted by `status` (active/inactive) and `role` (bhc/rhu); `total` includes admins | now |

Status comparisons use `Referral::normalizeWorkflowStatus`, so legacy values ("For Monitoring", "complete", …) count
in their canonical bucket, as in `ReportController`.

Counts only: no patient names, record contents or other clinical fields are returned.

### Not in this endpoint

- Recent activity uses the existing `GET /audit-logs?per_page=5`.
- RHU doctors use the existing `useRhuProviders` hook.

Each loads on its own, so one failing does not take down the others.

## Frontend

### Files

```
pages/admin/AdminDashboard.jsx          page: layout and data hooks only
services/adminDashboardService.js       loadAdminDashboard(period)
utils/adminDashboard.js                 pure logic (tested): period parsing, attention items, barangay sort/highlight
utils/adminDashboard.test.js
components/features/admin-dashboard/
  AttentionStrip.jsx
  PeriodSelect.jsx
  OverviewCards.jsx
  BarangayTable.jsx
  AccountCounts.jsx
  QuickActions.jsx        moved out of AdminDashboard.jsx
  DoctorAvailability.jsx  moved out of AdminDashboard.jsx
  RecentActivity.jsx      moved out of AdminDashboard.jsx
```

The old placeholder "Barangay Referral Summary" (always empty, hard-coded "14 barangays"), the five big account stat
cards and the "Inventory Alerts" list (which only saw the first 25 medicines) are removed.

### Data and state

- Summary: one `useQuery` with key `queryKeys.adminDashboard(period)` (new key). While a new period loads, the previous
  numbers stay on screen with `RefreshingIndicator` (`placeholderData: keepPreviousData`).
- The period lives in the URL: `/admin/dashboard?period=week`. Invalid or missing → `month`. Changing it uses
  `replace` so the back button is not flooded.
- Loading and failure follow the Phase 1 rules: the summary uses `PageStateWrapper skeleton="dashboard"` (full-page
  skeleton / full-page `ConnectionErrorState`); recent activity and doctors use `SectionSkeleton` and
  `ConnectionErrorState size="compact"` inside their own section.

### Needs attention strip

- Items, in this order, each shown only when its count > 0:
  - "N password reset requests" → `/admin/password-reset-requests`
  - "N pending invites" → `/admin/password-reset-requests?tab=invites`
  - "N facilities without staff" → `/admin/staff-assignments`; the names show in an expandable list (first 5, then
    "+N more")
  - "N priority referrals pending over 2 days" → `/admin/reports`
- Amber background, ⚠ icon, count, label and link per item. One item per line on phones.
- When every count is 0: one thin green line, "✓ All caught up — no pending account tasks."

### Overview cards

Four in a row on desktop, 2×2 on phones.

- **Referrals** — big number: total in period. Comparison line: "▲ N vs last period", "▼ N vs last period" or "Same as
  last period". Sub-line: Pending now (with Priority count), Completed, No-show. Links to `/admin/reports`.
- **Follow-ups** — big number: overdue. Sub-line: no-show in period. Amber when overdue > 0.
- **Patients** — big number: total registered. Sub-line: "+N new" in period.
- **Medicines** — "RHU: N low stock" and "BHCs: N low stock · M barangays". Amber when either is > 0. No link (admin has
  no medicine page).

### Per-barangay table

- Columns: Barangay, Referrals (period), Pending, No-show (period), Overdue F/U, Low stock, Staff. A small caption says
  which columns follow the period.
- Highlight: amber cell when Pending, No-show, Overdue F/U or Low stock is > 0; red Staff cell with "None" when the BHC
  has no staff. Highlights always pair colour with an icon or text.
- Default sort: no staff first, then most highlighted cells, then name A–Z. Column headers sort on click.
- Phones: one card per barangay, listing only signals that are > 0.
- No active BHCs: "No active barangay health centers yet." with a link to `/admin/facilities`.
- "View report" link → `/admin/reports`.

### Side sections

- **Quick actions** — unchanged: Add user, Account directory, Reports, Audit logs.
- **RHU doctors** — unchanged content.
- **Account counts** — one small card: "N users · N active · N inactive · N BHC · N RHU" and a link to Account Directory.
- **Recent activity** — latest 5 audit entries, "View audit logs" link.

### Visual style

Existing palette only: brand red `#B91C1C`, slate text, amber for warnings, emerald for "OK". No new design tokens.
The header keeps the greeting and date; its description becomes "Municipal health operations and account tasks at a
glance."

## Testing

Backend (PHPUnit, `tests/Feature/AdminDashboardTest.php`):
- 403 for BHC and RHU users; 200 for admin.
- Each metric counts the right records, including legacy referral statuses.
- Period boundaries for today/week/month/year and the previous period; invalid period → month.
- Stale threshold: a Priority Pending referral at 2 days minus a minute is not stale; past 2 days is.
- Facilities without staff: a BHC covered only by a current staff assignment counts as staffed; revoked, not-yet-started
  and ended assignments do not; inactive facilities are not listed.
- No patient-identifying fields appear in the response.

Frontend (`node --test`, added as `test:admin-dashboard` in `package.json`):
- Period parsing (valid, invalid, missing).
- Attention items: empty → "all caught up"; only counts > 0 appear; order is fixed.
- Barangay sort and highlight rules.

Manual: open the dashboard as admin in the browser with and without pending items; switch periods; check phone width.

## Out of scope

- Deep links into Admin Reports filtered by barangay.
- Any action taken directly on the dashboard.
- Auto-refresh beyond the app's existing react-query defaults.
- Changes to BHC or RHU dashboards.
