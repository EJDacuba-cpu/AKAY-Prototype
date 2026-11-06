# Admin Account & Role Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Admin municipal referral reports with Account & Role Analytics driven by an authoritative `GET /reports/admin` role×status matrix plus system-wide pending invite/reset counts from `/password-invites/summary`.

**Architecture:** Extend `ReportController::admin` with zero-filled `account_analytics` (SQL groupBy + invariants). Frontend loads analytics and summary independently; `adminAccountReporting.js` validates, filters client-side, and builds Chart.js / table view-models. Rewrite `AdminReports.jsx` to the approved Editorial Split Grid with BHC/RHU-style print/PDF controls.

**Tech Stack:** Laravel feature tests, React + Vite, Chart.js / react-chartjs-2, TanStack Query (optional; match existing Admin page patterns), `node:test`. Spec: `docs/superpowers/specs/2026-11-06-admin-account-role-analytics-design.md`.

## Global Constraints

- Scope: Admin Reports + `ReportController::admin` aggregates only. Do not modify BHC/RHU Reports, Account Directory, invite/reset security, or schema.
- Canonical roles: `admin`, `bhc`, `rhu`. Canonical statuses: `active`, `inactive`.
- Invariants: `canonical_accounts = active + inactive`; `accounts = canonical_accounts + other_accounts`; `accounts = sum(matrix) + other_accounts`; `by_role[r] = matrix[r].active + matrix[r].inactive`.
- Pending counts: only from `GET /password-invites/summary`; always labeled system-wide / unfiltered.
- Never display fabricated zeros for failed or malformed aggregates.
- Subtitle copy: `System Administration · Current Account Snapshot`.
- Export PDF = same `window.print()` as Print; UI must mention Save as PDF in the browser dialog.
- Commands: `cd backend && php artisan test --filter=AdminAccountAnalyticsReportTest`; `cd frontend && node --test src/utils/adminAccountReporting.test.js`; `cd frontend && npm run lint -- --quiet`.

## File map

| File | Responsibility |
|------|----------------|
| `backend/app/Http/Controllers/Api/ReportController.php` | Build `account_analytics`; keep legacy fields |
| `backend/tests/Feature/AdminAccountAnalyticsReportTest.php` | Aggregate accuracy, invariants, auth |
| `frontend/src/services/adminReportsService.js` | `loadAdminAccountAnalytics()` |
| `frontend/src/utils/adminAccountReporting.js` | Validate, filter, view-models |
| `frontend/src/utils/adminAccountReporting.test.js` | Util unit tests |
| `frontend/src/pages/admin/AdminReports.jsx` | Full UI rewrite (Editorial Split Grid + print) |

---

### Task 1: Backend `account_analytics` aggregate + feature tests

**Files:**
- Modify: `backend/app/Http/Controllers/Api/ReportController.php`
- Create: `backend/tests/Feature/AdminAccountAnalyticsReportTest.php`

**Interfaces:**
- `ReportController::admin` response includes `data.account_analytics` with shape from the spec.
- Private helper e.g. `accountAnalytics(): array` returns the block from one grouped query + `User::count()`.

- [ ] **Step 1: Write failing feature tests**

```php
<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminAccountAnalyticsReportTest extends TestCase
{
    use RefreshDatabase;

    private function actingAdmin(): User
    {
        $admin = User::create([
            'name' => 'MHO',
            'email' => 'mho-report@example.test',
            'password' => 'password123',
            'role' => User::ROLE_ADMIN,
            'status' => User::STATUS_ACTIVE,
            'permissions' => [],
        ]);
        Sanctum::actingAs($admin, ['*']);

        return $admin;
    }

    private function staff(string $role, string $status): User
    {
        static $n = 0;
        $n++;

        return User::create([
            'name' => "Staff {$n}",
            'email' => "staff{$n}@example.test",
            'password' => 'password123',
            'role' => $role,
            'staff_role' => $role === User::ROLE_ADMIN ? null : 'midwife',
            'status' => $status,
            'permissions' => [],
        ]);
    }

    public function test_admin_report_returns_reconciled_account_analytics_matrix(): void
    {
        $this->actingAdmin(); // 1 admin active
        $this->staff(User::ROLE_BHC, User::STATUS_ACTIVE);
        $this->staff(User::ROLE_RHU, User::STATUS_ACTIVE);
        $this->staff(User::ROLE_RHU, User::STATUS_INACTIVE);

        $response = $this->getJson('/api/reports/admin')->assertOk();
        $analytics = $response->json('data.account_analytics');

        $this->assertSame(['admin', 'bhc', 'rhu'], $analytics['roles']);
        $this->assertSame(['active', 'inactive'], $analytics['statuses']);
        $this->assertSame(1, $analytics['matrix']['admin']['active']);
        $this->assertSame(0, $analytics['matrix']['admin']['inactive']);
        $this->assertSame(1, $analytics['matrix']['bhc']['active']);
        $this->assertSame(0, $analytics['matrix']['bhc']['inactive']);
        $this->assertSame(1, $analytics['matrix']['rhu']['active']);
        $this->assertSame(1, $analytics['matrix']['rhu']['inactive']);

        $totals = $analytics['totals'];
        $this->assertSame(4, $totals['accounts']);
        $this->assertSame(3, $totals['active']);
        $this->assertSame(1, $totals['inactive']);
        $this->assertSame(4, $totals['canonical_accounts']);
        $this->assertSame(0, $analytics['other_accounts']);
        $this->assertSame(4, $totals['active'] + $totals['inactive']);
        $this->assertSame($totals['accounts'], $totals['canonical_accounts'] + $analytics['other_accounts']);
        $this->assertSame(1, $totals['by_role']['admin']);
        $this->assertSame(1, $totals['by_role']['bhc']);
        $this->assertSame(2, $totals['by_role']['rhu']);

        // Legacy fields still present
        $this->assertArrayHasKey('users_by_role', $response->json('data'));
        $this->assertArrayHasKey('users_by_status', $response->json('data'));
    }

    public function test_other_accounts_are_counted_not_charted(): void
    {
        $this->actingAdmin();
        \DB::table('users')->insert([
            'name' => 'Legacy',
            'email' => 'legacy@example.test',
            'password' => bcrypt('password123'),
            'role' => 'municipal', // non-canonical
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $analytics = $this->getJson('/api/reports/admin')->assertOk()->json('data.account_analytics');
        $this->assertSame(1, $analytics['other_accounts']);
        $this->assertSame(2, $analytics['totals']['accounts']);
        $this->assertSame(1, $analytics['totals']['canonical_accounts']);
        $this->assertSame(
            $analytics['totals']['accounts'],
            $analytics['totals']['canonical_accounts'] + $analytics['other_accounts']
        );
    }

    public function test_non_admin_cannot_access_admin_report(): void
    {
        $bhc = User::create([
            'name' => 'BHC',
            'email' => 'bhc-report@example.test',
            'password' => 'password123',
            'role' => User::ROLE_BHC,
            'staff_role' => 'midwife',
            'status' => User::STATUS_ACTIVE,
            'permissions' => [],
        ]);
        Sanctum::actingAs($bhc, ['*']);

        $this->getJson('/api/reports/admin')->assertForbidden();
    }
}
```

- [ ] **Step 2: Run tests — expect FAIL** (missing `account_analytics`)

Run: `cd backend && php artisan test --filter=AdminAccountAnalyticsReportTest`  
Expected: FAIL / missing key or assertion failure.

- [ ] **Step 3: Implement aggregate in `ReportController::admin`**

```php
public function admin(Request $request, AuditLogger $auditLogger)
{
    $auditLogger->log($request, 'generated', 'reports', 'Generated admin report.');

    return response()->json([
        'data' => [
            'account_analytics' => $this->accountAnalytics(),
            'users_by_role' => User::selectRaw('role, count(*) as total')->groupBy('role')->pluck('total', 'role'),
            'users_by_status' => User::selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status'),
            'audit_logs_by_module' => AuditLog::selectRaw('module, count(*) as total')->groupBy('module')->pluck('total', 'module'),
            'system_activity_total' => AuditLog::count(),
        ],
    ]);
}

private function accountAnalytics(): array
{
    $roles = [User::ROLE_ADMIN, User::ROLE_BHC, User::ROLE_RHU];
    $statuses = [User::STATUS_ACTIVE, User::STATUS_INACTIVE];

    $matrix = [];
    foreach ($roles as $role) {
        $matrix[$role] = array_fill_keys($statuses, 0);
    }

    $rows = User::query()
        ->selectRaw('role, status, count(*) as total')
        ->groupBy('role', 'status')
        ->get();

    $otherAccounts = 0;
    foreach ($rows as $row) {
        $role = (string) $row->role;
        $status = (string) $row->status;
        $total = (int) $row->total;
        if (isset($matrix[$role]) && array_key_exists($status, $matrix[$role])) {
            $matrix[$role][$status] = $total;
        } else {
            $otherAccounts += $total;
        }
    }

    $active = 0;
    $inactive = 0;
    $byRole = [];
    foreach ($roles as $role) {
        $roleActive = $matrix[$role][User::STATUS_ACTIVE];
        $roleInactive = $matrix[$role][User::STATUS_INACTIVE];
        $byRole[$role] = $roleActive + $roleInactive;
        $active += $roleActive;
        $inactive += $roleInactive;
    }

    $canonicalAccounts = $active + $inactive;
    $accounts = (int) User::query()->count();

    return [
        'roles' => $roles,
        'statuses' => $statuses,
        'matrix' => $matrix,
        'totals' => [
            'accounts' => $accounts,
            'canonical_accounts' => $canonicalAccounts,
            'active' => $active,
            'inactive' => $inactive,
            'by_role' => $byRole,
        ],
        'other_accounts' => $otherAccounts,
    ];
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd backend && php artisan test --filter=AdminAccountAnalyticsReportTest`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Controllers/Api/ReportController.php backend/tests/Feature/AdminAccountAnalyticsReportTest.php
git commit -m "$(cat <<'EOF'
feat(admin-reports): add reconciled account role-status aggregates

EOF
)"
```

---

### Task 2: `adminAccountReporting` utility + unit tests

**Files:**
- Create: `frontend/src/utils/adminAccountReporting.js`
- Create: `frontend/src/utils/adminAccountReporting.test.js`

**Interfaces:**
- `DEFAULT_ACCOUNT_FILTERS = { role: "all", status: "all" }`
- `ROLE_OPTIONS`, `STATUS_OPTIONS` for UI labels
- `parseAccountAnalytics(raw) => { ok: true, analytics } | { ok: false, error: string }`
- `buildAdminAccountReport({ analytics, accessSummary, accessSummaryError, filters }) => report view-model`

View-model shape (minimum):

```js
{
  ok: true,
  filters,
  filterLabel: string, // e.g. "All Roles · All Statuses" or "BHC · Active"
  roleChartTitle: string, // "Accounts by Recognized Roles" when unfiltered
  databaseTotal: number,
  recognizedTotal: number,
  otherAccounts: number,
  showOtherWarning: boolean,
  filteredRegisteredTotal: number,
  roleDistribution: [{ role, label, total }],
  statusByRole: [{ role, label, active, inactive }],
  statusTotals: { active, inactive },
  summaryRows: [{ role, label, total, active, inactive }],
  summaryTotals: { total, active, inactive },
  emptyKind: "none" | "no-accounts" | "no-matches",
  accessRequests:
    | { available: true, pendingInvitations: number, pendingPasswordResets: number, scopeLabel: "System-wide (unfiltered)" }
    | { available: false, reason: string },
}
```

- [ ] **Step 1: Write failing tests** covering:
  - Valid matrix parses and reconciles
  - Missing cell / negative / broken invariant → `ok: false`
  - Role filter + status filter slice charts/table consistently
  - Unfiltered title vs filtered titles
  - `other_accounts > 0` → `showOtherWarning`
  - `emptyKind`: no-accounts vs no-matches (filters yield 0 while recognizedTotal > 0)
  - Access summary missing → `accessRequests.available === false` (not zeros)
  - Access summary present → system-wide counts

- [ ] **Step 2: Run** `cd frontend && node --test src/utils/adminAccountReporting.test.js` — expect FAIL

- [ ] **Step 3: Implement util** — validate strictly; filter by slicing matrix; never invent summary zeros when unavailable

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/adminAccountReporting.js frontend/src/utils/adminAccountReporting.test.js
git commit -m "$(cat <<'EOF'
feat(admin-reports): add account analytics reporting utility

EOF
)"
```

---

### Task 3: Frontend service loader

**Files:**
- Create: `frontend/src/services/adminReportsService.js`

**Interfaces:**
- `loadAdminAccountAnalytics(): Promise<object>` — `unwrapData(await apiRequest("/reports/admin"))`, throw on HTTP failure; caller validates `account_analytics` via util.

```js
import { apiRequest, unwrapData } from "./apiClient";

export async function loadAdminAccountAnalytics() {
  return unwrapData(await apiRequest("/reports/admin"));
}
```

- [ ] **Step 1: Add the service file**
- [ ] **Step 2: Commit**

```bash
git add frontend/src/services/adminReportsService.js
git commit -m "$(cat <<'EOF'
feat(admin-reports): add reports/admin analytics loader

EOF
)"
```

---

### Task 4: Rewrite `AdminReports.jsx` Editorial Split Grid

**Files:**
- Modify: `frontend/src/pages/admin/AdminReports.jsx` (replace municipal referral UI entirely)

**Behavior:**
- Independent loads: accounts via `loadAdminAccountAnalytics`; access via `getPasswordInviteSummary`.
- Primary error → `PageStateWrapper` full-page error + Retry (re-fetch analytics).
- Summary error → keep grid; right-lower Unavailable + retry summary only.
- Draft filters + Apply/Clear (do not live-apply on every dropdown change unless matching an existing compact filter pattern; prefer Apply like list toolbars).
- Chart.js Doughnut (or bar) for role distribution; grouped Bar for Active/Inactive by role.
- Warning banner when `showOtherWarning`; show database total vs recognized total distinctly.
- Empty states per `emptyKind`.
- Header subtitle: `System Administration · Current Account Snapshot`.
- Export PDF button label/tooltip or helper text: user selects Save as PDF in the print dialog; both buttons call `window.print()`.
- Print article `#admin-account-report-print` with applied view-models only (no referral content).
- Remove CSV municipal export and all clinical/referral helpers previously in this file.

- [ ] **Step 1: Replace page implementation** with Editorial Split Grid wired to util + services
- [ ] **Step 2: Lint** `cd frontend && npm run lint -- --quiet` — fix issues introduced
- [ ] **Step 3: Manual smoke** against running API: load, filter Apply/Clear, summary failure path (optional network block), print preview
- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/AdminReports.jsx
git commit -m "$(cat <<'EOF'
feat(admin-reports): ship account and role analytics workspace

EOF
)"
```

---

### Task 5: Verification checklist

- [ ] Backend: `php artisan test --filter=AdminAccountAnalyticsReportTest` PASS
- [ ] Frontend: `node --test src/utils/adminAccountReporting.test.js` PASS
- [ ] Confirm charts/table/status cards share filtered totals; pending cards stay system-wide
- [ ] Confirm malformed analytics shows full-page error (not zeros)
- [ ] Confirm filtered-empty copy ≠ no-accounts when `other_accounts > 0` or recognized accounts exist
- [ ] Confirm print article has filter metadata + numerical summaries + access counts/Unavailable
- [ ] Confirm BHC/RHU Reports untouched (`git diff --stat` excludes those paths)
- [ ] Commit any verification fixes only if needed

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| `account_analytics` matrix + invariants + legacy fields | Task 1 |
| `other_accounts` warning, not chart series | Tasks 1–2, 4 |
| Pending from summary endpoint only | Tasks 2, 4 |
| Strict validation / no silent zero-fill of bad payloads | Task 2 |
| Client Role/Status filter; system-wide access labels | Tasks 2, 4 |
| Independent summary failure handling | Task 4 |
| Editorial Split Grid + Chart.js | Task 4 |
| Subtitle + Save as PDF clarity + A4 print article | Task 4 |
| Remove referral/CSV content | Task 4 |
| Auth admin-only | Task 1 |
| No BHC/RHU / schema / directory changes | Global constraints |
