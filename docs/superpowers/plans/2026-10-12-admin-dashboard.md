# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin (MHO) dashboard with a "Needs attention" strip, a period-filtered municipal health overview and a per-barangay table, fed by one new admin-only summary endpoint.

**Architecture:** A Laravel `AdminDashboardService` counts everything with the query builder (no stored function) and `GET /api/admin/dashboard?period=` returns it. The React page reads it with one `useQuery`; pure rules (period parsing, attention items, barangay sort/highlight) live in `utils/adminDashboard.js` and are tested with `node --test`; components are thin display.

**Tech Stack:** Laravel 13 + PHPUnit (SQLite in-memory), React 19 + react-router 7 + @tanstack/react-query 5, Tailwind, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-12-admin-dashboard-design.md`

## Global Constraints

- Counts only: the response and UI never contain patient names, record contents or other clinical fields.
- Admin only: route sits in the `role:admin` group; BHC and RHU get 403.
- Opening the dashboard is not audit-logged.
- `period` ∈ `today | week | month | year`; anything else → `month`. Weeks start Monday. App timezone.
- Previous period = same length shifted back one period, without month/year overflow (Oct 31 → Sep 30).
- Referral date = `COALESCE(referral_datetime, created_at)`.
- Referral statuses are compared after `Referral::normalizeWorkflowStatus` (legacy values count in their canonical bucket), so group by raw `status` in SQL and normalize in PHP.
- Stale priority referral: `urgency_level = 'Priority'`, normalized Pending, referral date older than now − 2 days.
- Low stock: active medicine (`is_active = true`) with `availability_status` in `Low Stock`, `Unavailable`.
- Palette only: `#B91C1C` brand red, slate text, amber warnings, emerald OK. Every highlight pairs colour with an icon or text.
- Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- UI copy in English. Header description: "Municipal health operations and account tasks at a glance." Empty strip: "✓ All caught up — no pending account tasks."

## Review Focus

- A referral with an empty `referral_datetime` must still be counted (by `created_at`), not silently dropped from totals and per-barangay rows. → test in Task 2.
- Opening "This month" on the 31st must compare against the whole previous month up to its last day, not spill into the current month. → test in Task 1.
- A BHC whose only user is **inactive** must show as "without staff"; a BHC staffed only by a current RHU-nurse assignment must show as staffed. → tests in Task 3.
- Legacy status spellings (`"pending "`, `"For Monitoring"`, `"complete"`) must land in the right bucket everywhere, including per-barangay Pending and the stale count. → test in Task 2 and Task 3.
- A hand-edited URL (`?period=<script>` or `?period=MONTH`) must fall back to month on both sides without an error. → tests in Task 1 and Task 4.

---

### Task 1: Endpoint, period window and account counts

**Files:**
- Create: `backend/app/Services/AdminDashboardService.php`
- Create: `backend/app/Http/Controllers/Api/AdminDashboardController.php`
- Modify: `backend/routes/api.php` (inside the `Route::middleware('role:admin')->group(...)` block that starts at line 145, next to `/reports/admin`)
- Test: `backend/tests/Feature/AdminDashboardTest.php`

**Interfaces:**
- Produces:
  - `AdminDashboardService::summary(string $periodKey, ?CarbonImmutable $now = null): array` — returns the full `data` payload from the spec; Tasks 2–3 add keys to it.
  - `AdminDashboardService::window(string $periodKey, CarbonImmutable $now): array` → `['key' => string, 'from' => CarbonImmutable, 'to' => CarbonImmutable, 'previous_from' => CarbonImmutable, 'previous_to' => CarbonImmutable]`
  - `GET /api/admin/dashboard?period=` → `{ data: {...} }`, dates as ISO-8601 strings, plus `generated_at`.
  - Test helpers in `AdminDashboardTest` (private, reused by Tasks 2–3): `makeRhu(string $name, string $status = 'active')`, `makeBhc(string $name, RuralHealthUnit $rhu, string $status = 'active')`, `makeUser(string $role, array $attrs = [])`. Records are created with `Model::create` (the project has no factories; see `tests/Feature/AccountInviteAdminTest.php` setUp for the field set).

- [ ] **Step 1: Write the failing tests**

```php
public function test_only_admin_can_open_the_dashboard(): void
// admin → 200; a bhc user and an rhu user (Sanctum::actingAs) → 403 on GET /api/admin/dashboard

public function test_period_windows(): void
// Freeze time with $this->travelTo(CarbonImmutable::parse('2026-10-31 15:00'))
// period=month → from 2026-10-01 00:00, previous_from 2026-09-01 00:00, previous_to 2026-09-30 15:00
// period=week  → from Monday 2026-10-26 00:00, previous_from 2026-10-19 00:00
// period=today → from 2026-10-31 00:00, previous_from 2026-10-30 00:00
// period=year  → from 2026-01-01 00:00, previous_from 2025-01-01 00:00
// assert via assertJsonPath('data.period.key', ...) and the from/previous_* strings

public function test_unknown_period_falls_back_to_month(): void
// ?period=MONTH, ?period=<script>, no param → data.period.key === 'month'

public function test_account_counts(): void
// 1 admin (the actor) + 2 active bhc + 1 inactive bhc + 1 active rhu
// data.accounts == ['total' => 5, 'active' => 4, 'inactive' => 1, 'bhc' => 3, 'rhu' => 1]
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && php artisan test --filter=AdminDashboardTest`
Expected: FAIL (404 on the route).

- [ ] **Step 3: Implement**

`window()` uses `startOfDay/startOfWeek(Carbon::MONDAY)/startOfMonth/startOfYear` for `from`, `to = $now`, and shifts both back with `subDay/subWeek/subMonthNoOverflow/subYearNoOverflow`. Unknown keys map to `month` (a `const PERIODS = ['today','week','month','year']` with strict `in_array`). The controller passes `(string) $request->query('period', 'month')` and wraps the result in `['data' => ...]`. Route: `Route::get('/admin/dashboard', [AdminDashboardController::class, 'show']);`. No `AuditLogger` call.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && php artisan test --filter=AdminDashboardTest`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/Services/AdminDashboardService.php backend/app/Http/Controllers/Api/AdminDashboardController.php backend/routes/api.php backend/tests/Feature/AdminDashboardTest.php
git commit -m "feat(admin): dashboard summary endpoint with period window and account counts"
```

---

### Task 2: Health metrics — referrals, follow-ups, patients, medicines

**Files:**
- Modify: `backend/app/Services/AdminDashboardService.php`
- Test: `backend/tests/Feature/AdminDashboardTest.php`

**Interfaces:**
- Consumes: `window()` and test helpers from Task 1.
- Produces: `data.referrals { total, previous_total, completed, no_show, pending, priority_pending }`, `data.follow_ups { overdue, no_show }`, `data.patients { total, new }`, `data.medicines { rhu_low_stock, bhc_low_stock, bhc_barangays_affected }`. Also a private `referralCountsByBhc(array $window): array` keyed by BHC id → `['referrals', 'no_show', 'pending']`, and private per-BHC maps for overdue follow-ups and low stock, which Task 3 reuses for `barangays[]`.
- Test helpers added: `makePatient(BarangayHealthCenter $bhc, array $attrs = [])`, `makeReferral(Patient $p, string $status, array $attrs = [])` (fields as in `tests/Feature/AkayApiTest.php:625`, unique `tracking_id`), `makeFollowUp(Patient $p, array $attrs)` (needs a `HealthRecord`; see `tests/Feature/CareOverviewTest.php:39`), `makeMedicine(array $attrs)` (see `tests/Feature/AkayApiTest.php:164`).

- [ ] **Step 1: Write the failing tests**

```php
public function test_referral_counts_use_period_and_normalized_status(): void
// travelTo 2026-10-12 10:00; period=month
// in period: Pending (Priority), "pending " (Routine), Completed, "complete", No-Show, "For Monitoring"
// previous period (2026-09-05): 2 Completed referrals; older (2026-08-01): 1 Pending (Routine)
// one Received referral with referral_datetime null and created_at 2026-10-03 → counted in total
// expect total 7, previous_total 2, completed 2, no_show 1,
//        pending 3 (two in period + the August one; "now" ignores period), priority_pending 1

public function test_follow_up_counts(): void
// pending due yesterday → overdue; pending due today → not overdue; fulfilled due last week → not overdue
// no_show with no_show_at in period → 1; no_show_at last month → not counted (period=month)
// expect follow_ups == ['overdue' => 1, 'no_show' => 1]

public function test_patient_counts(): void
// 3 patients created before the period, 2 inside → total 5, new 2

public function test_medicine_low_stock_split_by_rhu_and_bhc(): void
// RHU: Low Stock, Unavailable, Available → rhu_low_stock 2
// BHC A: Low Stock ×2; BHC B: Unavailable; BHC C: Available; inactive Low Stock at BHC C (is_active false) → ignored
// expect bhc_low_stock 3, bhc_barangays_affected 2

public function test_response_contains_no_patient_identifiers(): void
// seed a patient named "Zyxwq Unique" with a referral; assertStringNotContainsString('Zyxwq', $response->getContent())
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && php artisan test --filter=AdminDashboardTest`
Expected: the 5 new tests FAIL (missing keys); Task 1 tests still pass.

- [ ] **Step 3: Implement**

Referrals: one query `selectRaw('barangay_health_center_id, status, urgency_level, count(*) as total')` grouped by those three, once for the current window, once for the previous window (on `COALESCE(referral_datetime, created_at)`), and once with no date filter for the "now" pending numbers; normalize each `status` with `Referral::normalizeWorkflowStatus` and sum in PHP. Follow-ups, patients and medicines are plain `count()` / `groupBy('barangay_health_center_id')` queries. Medicines filter `is_active = true`; RHU rows have `rural_health_unit_id` set, BHC rows `barangay_health_center_id`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && php artisan test --filter=AdminDashboardTest`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/Services/AdminDashboardService.php backend/tests/Feature/AdminDashboardTest.php
git commit -m "feat(admin): dashboard referral, follow-up, patient and medicine counts"
```

---

### Task 3: Needs-attention items and per-barangay rows

**Files:**
- Modify: `backend/app/Services/AdminDashboardService.php`
- Test: `backend/tests/Feature/AdminDashboardTest.php`

**Interfaces:**
- Consumes: per-BHC maps from Task 2; `AccessRequestStatus::expireStaleInvites()`, `expireStaleResetRequests()`, `applyToInvites($q, AccessRequestStatus::PENDING)`, `applyToResetRequests($q, AccessRequestStatus::PENDING)` (same sequence as `AccountInviteController::summary`).
- Produces: `data.attention { reset_requests, invites, stale_priority_referrals, facilities_without_staff: [{type, id, name}] }` and `data.barangays: [{ id, name, barangay, referrals, no_show, pending, overdue_follow_ups, low_stock, has_staff }]` — one row per **active** BHC, ordered by `name`; `has_staff` is false exactly when that BHC is in `facilities_without_staff`.

- [ ] **Step 1: Write the failing tests**

```php
public function test_reset_requests_and_invites_match_password_and_invites_counts(): void
// create 2 pending reset requests + 1 completed, 1 pending invite + 1 cancelled
// assert data.attention.reset_requests === GET /api/password-invites/summary data.reset_requests (2)
// and data.attention.invites === its data.invites (1)

public function test_stale_priority_referrals_use_a_two_day_threshold(): void
// travelTo 2026-10-12 10:00
// Priority Pending at now−2d+1min → not stale; Priority Pending at now−2d−1min → stale;
// Priority "pending " (legacy) at now−5d → stale; Routine Pending at now−5d → not stale;
// Priority Received at now−5d → not stale
// expect stale_priority_referrals 2

public function test_facilities_without_staff(): void
// BHC "Alpha": active bhc user → staffed
// BHC "Bravo": only an inactive bhc user → without staff
// BHC "Charlie": no users; current assignment of an active rhu nurse (starts_on today−1, ends_on null, not revoked) → staffed
// BHC "Delta": no users; assignments revoked / starts tomorrow / ended yesterday → without staff
// BHC "Echo": status inactive, no users → not listed, no barangay row
// RHU "North": active rhu user → staffed; RHU "South": no rhu users → without staff
// expect facilities_without_staff == [bhc Bravo, bhc Delta, rhu South] (ids, names, types; BHCs first, then RHUs, each by name)
// and barangays[*].has_staff for Alpha/Bravo/Charlie/Delta == [true, false, true, false]

public function test_barangay_rows_combine_per_bhc_signals(): void
// two active BHCs with referrals, a no-show, a legacy "pending " referral, an overdue follow-up and a low-stock medicine at the first only
// expect the first row's referrals/no_show/pending/overdue_follow_ups/low_stock as seeded and the second row all zeros
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && php artisan test --filter=AdminDashboardTest`
Expected: the 4 new tests FAIL.

- [ ] **Step 3: Implement**

Staffed BHC ids = active `users.barangay_health_center_id` ∪ `facility_assignments.barangay_health_center_id` where `revoked_at` is null, `starts_on <= today`, `ends_on` is null or `>= today`, and the assigned user is active. Staffed RHU ids = `rural_health_unit_id` of active users with `role = rhu`. Stale count reuses the "now" referral grouping from Task 2 with an extra date bound (filter by date in SQL, normalize status in PHP).

- [ ] **Step 4: Run the whole backend suite**

Run: `cd backend && php artisan test`
Expected: all tests PASS (13 in `AdminDashboardTest`, no regressions elsewhere).

- [ ] **Step 5: Commit**

```bash
git add backend/app/Services/AdminDashboardService.php backend/tests/Feature/AdminDashboardTest.php
git commit -m "feat(admin): dashboard attention items and per-barangay rows"
```

---

### Task 4: Frontend rules — `utils/adminDashboard.js`

**Files:**
- Create: `frontend/src/utils/adminDashboard.js`
- Create: `frontend/src/utils/adminDashboard.test.js`
- Modify: `frontend/package.json` (add `"test:admin-dashboard": "node --test src/utils/adminDashboard.test.js"`)

**Interfaces:**
- Produces (all pure, no React):
  - `PERIOD_OPTIONS: Array<{ value: "today"|"week"|"month"|"year", label: string }>` — labels "Today", "This week", "This month", "This year".
  - `parsePeriod(value: unknown): "today"|"week"|"month"|"year"` — exact lowercase match, else `"month"`.
  - `buildAttentionItems(attention): Array<{ key, count, label, href, names? }>` — order: `resets`, `invites`, `facilities`, `stale`; only count > 0; labels pluralise ("1 password reset request" / "3 password reset requests", "N pending invite(s)", "N facility/facilities without staff", "N priority referral(s) pending over 2 days"); hrefs `/admin/password-reset-requests`, `/admin/password-reset-requests?tab=invites`, `/admin/staff-assignments`, `/admin/reports`; `names` (facilities only) = the facility names.
  - `barangaySignals(row): { pending: boolean, noShow: boolean, overdue: boolean, lowStock: boolean, noStaff: boolean, flagged: number }` — `flagged` counts the true amber flags (not `noStaff`).
  - `sortBarangays(rows, sort = { key: "default", direction: "asc" }): rows[]` — `default`: no staff first, then `flagged` desc, then `name` A–Z; any other key sorts by that numeric field (or `name`) in the given direction, ties by `name`. Never mutates the input.
  - `referralTrend(total, previousTotal): { direction: "up"|"down"|"same", difference: number, label: string }` — labels "▲ N vs last period", "▼ N vs last period", "Same as last period".

- [ ] **Step 1: Write the failing tests** (style of `src/utils/tablePaging.test.js`)

```js
test("parsePeriod accepts the four keys and falls back to month", () => {
  for (const key of ["today", "week", "month", "year"]) assert.equal(parsePeriod(key), key);
  for (const bad of [undefined, null, "", "MONTH", "<script>", "decade"]) assert.equal(parsePeriod(bad), "month");
});
test("buildAttentionItems keeps a fixed order and skips zeros", () => {
  const items = buildAttentionItems({ reset_requests: 0, invites: 1, stale_priority_referrals: 2,
    facilities_without_staff: [{ type: "bhc", id: 1, name: "Bravo" }] });
  assert.deepEqual(items.map((i) => i.key), ["invites", "facilities", "stale"]);
  assert.equal(items[0].label, "1 pending invite");
  assert.equal(items[0].href, "/admin/password-reset-requests?tab=invites");
  assert.equal(items[1].label, "1 facility without staff");
  assert.deepEqual(items[1].names, ["Bravo"]);
  assert.equal(items[2].label, "2 priority referrals pending over 2 days");
});
test("buildAttentionItems returns [] when everything is zero or missing", () => {
  assert.deepEqual(buildAttentionItems({ reset_requests: 0, invites: 0, stale_priority_referrals: 0, facilities_without_staff: [] }), []);
  assert.deepEqual(buildAttentionItems(undefined), []);
});
test("sortBarangays default puts no-staff first, then most flags, then name", () => {
  const rows = [
    { name: "Alpha", pending: 0, no_show: 0, overdue_follow_ups: 0, low_stock: 0, has_staff: true },
    { name: "Bravo", pending: 1, no_show: 1, overdue_follow_ups: 0, low_stock: 0, has_staff: true },
    { name: "Charlie", pending: 0, no_show: 0, overdue_follow_ups: 0, low_stock: 0, has_staff: false },
    { name: "Aaron", pending: 1, no_show: 0, overdue_follow_ups: 1, low_stock: 0, has_staff: true },
  ];
  assert.deepEqual(sortBarangays(rows).map((r) => r.name), ["Charlie", "Aaron", "Bravo", "Alpha"]);
  assert.equal(rows[0].name, "Alpha"); // input untouched
});
test("sortBarangays by a column sorts numerically in both directions", () => {
  // referrals [3, 10, 3] named C, A, B → asc: B, C, A ; desc: A, B, C
});
test("referralTrend labels", () => {
  assert.equal(referralTrend(48, 36).label, "▲ 12 vs last period");
  assert.equal(referralTrend(5, 9).label, "▼ 4 vs last period");
  assert.equal(referralTrend(0, 0).label, "Same as last period");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npm run test:admin-dashboard`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the functions listed in Interfaces**

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npm run test:admin-dashboard`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/adminDashboard.js frontend/src/utils/adminDashboard.test.js frontend/package.json
git commit -m "feat(admin): dashboard period, attention and barangay rules"
```

---

### Task 5: Service, query key and the summary components

**Files:**
- Create: `frontend/src/services/adminDashboardService.js`
- Modify: `frontend/src/utils/queryKeys.js` (add next to `dashboardSummary`)
- Create: `frontend/src/components/features/admin-dashboard/AttentionStrip.jsx`
- Create: `frontend/src/components/features/admin-dashboard/PeriodSelect.jsx`
- Create: `frontend/src/components/features/admin-dashboard/OverviewCards.jsx`
- Create: `frontend/src/components/features/admin-dashboard/AccountCounts.jsx`

**Interfaces:**
- Consumes: `apiRequest`, `unwrapData` from `services/apiClient.js`; Task 4 utils.
- Produces:
  - `loadAdminDashboard(period: string): Promise<object>` → `unwrapData(await apiRequest(\`/admin/dashboard?period=${encodeURIComponent(period)}\`))`, returning the raw snake_case `data` object.
  - `queryKeys.adminDashboard(period) => ["admin-dashboard", period]`.
  - `<AttentionStrip attention={data.attention} />` — uses `buildAttentionItems`; amber section with `AlertTriangle` icon per item and a `Link`; the facilities item has a "Show" toggle listing the first 5 names then "+N more"; when empty renders the thin emerald line with the exact copy from Global Constraints.
  - `<PeriodSelect value={period} onChange={(period) => void} />` — native `<select>` labelled "Period" (visually hidden label) built from `PERIOD_OPTIONS`.
  - `<OverviewCards referrals followUps patients medicines />` — the four cards from the spec section "Overview cards", using `referralTrend`; Referrals card is a `Link` to `/admin/reports`; Follow-ups and Medicines cards switch to amber border/icon when overdue > 0 / any low stock > 0. Grid `grid-cols-2 xl:grid-cols-4`.
  - `<AccountCounts accounts={data.accounts} />` — one card: "N users · N active · N inactive · N BHC · N RHU" and a "Account directory" link to `/admin/users`.

- [ ] **Step 1: Implement the service, key and four components** (style: copy card/border classes from the current `StatCard` / `QuickAction` in `pages/admin/AdminDashboard.jsx`).

- [ ] **Step 2: Verify lint and build**

Run: `cd frontend && npx eslint src/services/adminDashboardService.js src/utils/queryKeys.js src/components/features/admin-dashboard && npm run build`
Expected: no lint errors; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/adminDashboardService.js frontend/src/utils/queryKeys.js frontend/src/components/features/admin-dashboard
git commit -m "feat(admin): dashboard attention strip, period select, overview and account cards"
```

---

### Task 6: Per-barangay table

**Files:**
- Create: `frontend/src/components/features/admin-dashboard/BarangayTable.jsx`

**Interfaces:**
- Consumes: `sortBarangays`, `barangaySignals` from Task 4.
- Produces: `<BarangayTable rows={data.barangays} />`.

- [ ] **Step 1: Implement**

- Columns: Barangay, Referrals, Pending, No-show, Overdue F/U, Low stock, Staff. Caption under the title: "Referrals and No-show follow the selected period; the other columns are as of now."
- Sort state `{ key, direction }` starts at `{ key: "default", direction: "asc" }`; header buttons (`aria-sort`) for every column; clicking the active column flips direction.
- Amber cell (`bg-amber-50 text-amber-800` + small `AlertTriangle`) when the signal is true; Staff cell shows `✓` with "Staffed" (sr-only) or a red "None" badge.
- `md` and up: table. Below `md`: one card per row listing only true signals, or "No issues" when none.
- Empty `rows`: "No active barangay health centers yet." with a `Link` "Manage facilities" → `/admin/facilities`.
- Footer link "View report" → `/admin/reports`.

- [ ] **Step 2: Verify lint and build**

Run: `cd frontend && npx eslint src/components/features/admin-dashboard/BarangayTable.jsx && npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/features/admin-dashboard/BarangayTable.jsx
git commit -m "feat(admin): per-barangay dashboard table"
```

---

### Task 7: Assemble the page

**Files:**
- Create: `frontend/src/components/features/admin-dashboard/QuickActions.jsx` (move `QuickAction` + the Quick Actions section out of the page, unchanged)
- Create: `frontend/src/components/features/admin-dashboard/DoctorAvailability.jsx` (move the Doctor Availability section + `DoctorStatusBadge`; it now calls `useRhuProviders()` itself and shows `InlineSpinner` while loading and `ConnectionErrorState size="compact"` with `onRetry={refetch}` on error)
- Create: `frontend/src/components/features/admin-dashboard/RecentActivity.jsx` (own `useQuery` with key `["admin-dashboard", "recent-activity"]` on `apiRequest("/audit-logs?per_page=5")` + `unwrapList`; same loading/error handling; keeps `formatRelativeTime` and the row markup)
- Modify: `frontend/src/pages/admin/AdminDashboard.jsx` (rewrite)

**Interfaces:**
- Consumes: everything from Tasks 5–6.

- [ ] **Step 1: Rewrite `AdminDashboard.jsx`**

- `const [searchParams, setSearchParams] = useSearchParams(); const period = parsePeriod(searchParams.get("period"));` — changing the select calls `setSearchParams({ period }, { replace: true })`.
- `useQuery({ queryKey: queryKeys.adminDashboard(period), queryFn: () => loadAdminDashboard(period), placeholderData: keepPreviousData, retry: false })`.
- `PageStateWrapper skeleton="dashboard"` around the summary-driven content with `hasData={Boolean(data)}`; `RefreshingIndicator label="Updating dashboard..."` while `isFetching && data`.
- Layout per the spec's Layout section: header (keep greeting/date helpers, new description), `AttentionStrip`, "Municipal health overview" heading with `PeriodSelect`, `OverviewCards`, then `xl:grid-cols-[minmax(0,1fr)_320px]` with `BarangayTable` + `RecentActivity` on the left and `QuickActions`, `DoctorAvailability`, `AccountCounts` on the right. On phones the order is strip, cards, table, activity, quick actions, doctors, account counts.
- Remove: `loadAdminAccounts`, `loadMedicineAvailability`, the five `StatCard`s, the placeholder barangay table, `InventoryAlert`, `StatusBadge`, `StatCard`.

- [ ] **Step 2: Verify lint, build and the existing frontend tests**

Run: `cd frontend && npm run lint && npm run build && npm run test:admin-dashboard && npm run test:access`
Expected: all clean / PASS.

- [ ] **Step 3: Manual check in the browser (admin account)**

Start backend and frontend dev servers; sign in as admin; open `/admin/dashboard`:
- with no pending tasks → green "All caught up" line;
- create a reset request → the strip shows "1 password reset request" and its link opens the Reset requests tab;
- switch each period → URL changes, numbers update, previous numbers stay visible while loading;
- `?period=bogus` → behaves as This month;
- 375 px wide → single column, barangay cards, no horizontal scroll.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/AdminDashboard.jsx frontend/src/components/features/admin-dashboard
git commit -m "feat(admin): rebuild the MHO dashboard on the summary endpoint"
```
