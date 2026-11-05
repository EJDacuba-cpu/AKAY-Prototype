# RHU Reports category workspace implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework RHU Reports into a category-based reporting workspace matching BHC Reports layout, with accurate visit- and referral-scoped indicators and RHU clinical/program categories.

**Architecture:** Keep `/rhu/reports` with `?type=` category navigation like BHC. Add `rhuReporting.js` as the RHU report engine (visits + incoming referrals + RHU-scoped clinical reuse). Reuse `BhcReportPeriodFilter`, `BhcReportCharts`, print shell, and Clinic Ledger card patterns. Do not copy BHC referral “sent” semantics into RHU Referral Reports.

**Tech Stack:** React, Vite, TanStack Query, React Router search params, existing shadcn/ui Button/Card/charts, `prepareBhcReportPeriod` / `resolveReportPeriod`, Vitest.

**Spec source:** User goal (2026-11-05 RHU Reports rework) + BHC Reports page as UI reference + RHU visit queue design (D1–D13).

## Global Constraints

- Preserve RHU facility-scoped access, `reports` module permissions, and `/rhu/reports` route.
- Statistics must come from actual scoped records; never invent totals or copy BHC facility records.
- Do not mix patients, visits, consultations, referrals, and health records into one misleading total.
- Referral Reports: Total Referrals, Referring BHCs, Completed Cases only as primary cards — no Pending / Received / No-Show as primary indicators; no patient names, tracking IDs, or per-referral actions.
- Patient Visits: count each visit once from queue entries; exclude `checked_in_by_mistake`; preserve patient vs visit vs consultation distinctions.
- Completed Cases = referrals with verified Completed workflow status in the submitted cohort; Completed consultation = visit `close_reason === consultation_completed`.
- Reuse BHC Filter popover period UX (`BhcReportPeriodFilter`: Weekly / Monthly / Custom, Apply, Clear).
- Clinic Ledger look: white cards, subtle borders, restrained red accents; remove Chart.js dashboard clutter.
- No Patient Intake / Today's Queue / consultation workspace / BHC Reports redesign.
- Avoid unnecessary backend changes and database migrations. Prefer existing `include_closed` visit API param.
- Prefer uncommitted reviewable work only if the partner forbids commits; otherwise commit per task as usual for SDD.
- Work in place on current non-main branch (`Eric-Manually-Fixer`); prior preference was no worktree.

## File map

| File | Responsibility |
|------|----------------|
| `frontend/src/utils/rhuReporting.js` | RHU categories, normalize, `buildRhuReport` |
| `frontend/src/utils/rhuReporting.test.js` | Calculation, period, facility isolation, empty states |
| `frontend/src/services/rhuVisitService.js` | `listRhuVisits({ includeClosed })` for report source |
| `frontend/src/components/layout/sidebar/sidebarData.js` | Collapsible RHU Reports children |
| `frontend/src/utils/sidebarNavigation.js` | `/rhu/reports?type=` active matching |
| `frontend/src/utils/sidebarNavigation.test.js` | Category nav + refresh behavior |
| `frontend/src/pages/rhu/RHUReports.jsx` | BHC-parity shell; remove legacy Chart.js dashboard |
| Existing BHC report components | Reuse as-is; do not fork unless RHU needs a rename alias |

---

### Task 1: RHU report categories and sidebar navigation

**Files:**
- Create: `frontend/src/utils/rhuReporting.js` (categories + normalize only in this task)
- Modify: `frontend/src/components/layout/sidebar/sidebarData.js`
- Modify: `frontend/src/utils/sidebarNavigation.js`
- Modify: `frontend/src/utils/sidebarNavigation.test.js`
- Test: `frontend/src/utils/rhuReporting.test.js` (normalize cases)

**Interfaces:**
- Produces: `RHU_REPORT_CATEGORIES` (`{ key, slug, label }[]`), `normalizeRhuReportCategory(value) → key`
- Category keys/slugs (exact):

| key | slug | label |
|-----|------|-------|
| `overview` | `overview` | Overview |
| `patient_visits` | `patient-visits` | Patient Visits |
| `referrals` | `referrals` | Referral Reports |
| `epi` | `epi` | EPI / Immunization |
| `maternal` | `maternal` | Maternal Care |
| `family_planning` | `family-planning` | Family Planning |
| `nutrition` | `nutrition` | Nutrition |
| `morbidity` | `morbidity` | Morbidity |
| `notifiable` | `notifiable` | Notifiable Diseases |
| `surveillance` | `surveillance` | Surveillance |

- Default missing/invalid `type` → `overview`
- Aliases: `all` / `all-categories` → `overview`; `referral-reports` → `referrals`; shared clinical aliases may mirror BHC where useful

- [ ] **Step 1: Write failing normalize + sidebar active tests**

```js
import { describe, expect, it } from "vitest";
import { normalizeRhuReportCategory } from "./rhuReporting.js";
import { isSidebarPathActive } from "./sidebarNavigation.js";

describe("normalizeRhuReportCategory", () => {
  it("defaults missing and unknown to overview", () => {
    expect(normalizeRhuReportCategory(null)).toBe("overview");
    expect(normalizeRhuReportCategory("nope")).toBe("overview");
  });

  it("maps aliases and slugs", () => {
    expect(normalizeRhuReportCategory("all")).toBe("overview");
    expect(normalizeRhuReportCategory("patient-visits")).toBe("patient_visits");
    expect(normalizeRhuReportCategory("referral-reports")).toBe("referrals");
    expect(normalizeRhuReportCategory("family_planning")).toBe("family_planning");
  });
});

describe("RHU reports sidebar type matching", () => {
  it("highlights the normalized category for /rhu/reports", () => {
    const location = { pathname: "/rhu/reports", search: "?type=patient-visits" };
    expect(isSidebarPathActive("/rhu/reports?type=patient-visits", location, "rhu")).toBe(true);
    expect(isSidebarPathActive("/rhu/reports?type=overview", location, "rhu")).toBe(false);
  });

  it("treats missing type as overview", () => {
    const location = { pathname: "/rhu/reports", search: "" };
    expect(isSidebarPathActive("/rhu/reports?type=overview", location, "rhu")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd frontend && npx vitest run src/utils/rhuReporting.test.js src/utils/sidebarNavigation.test.js`
Expected: FAIL (module / matching missing)

- [ ] **Step 3: Implement categories, normalize, sidebar children, path matching**

In `rhuReporting.js`, export frozen `RHU_REPORT_CATEGORIES` and `normalizeRhuReportCategory` as specified.

In `sidebarData.js`, replace flat RHU Reports item with a collapsible group patterned after BHC:

```js
{
  label: "Reports",
  path: "/rhu/reports",
  icon: Activity,
  defaultPath: "/rhu/reports?type=overview",
  children: RHU_REPORT_CATEGORIES.map((category) => ({
    label: category.label,
    path: `/rhu/reports?type=${category.slug}`,
  })),
}
```

In `isSidebarPathActive`, add `/rhu/reports` + `type` branch using `normalizeRhuReportCategory` (same structure as BHC’s `normalizeReportCategory` branch).

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd frontend && npx vitest run src/utils/rhuReporting.test.js src/utils/sidebarNavigation.test.js`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/rhuReporting.js frontend/src/utils/rhuReporting.test.js frontend/src/components/layout/sidebar/sidebarData.js frontend/src/utils/sidebarNavigation.js frontend/src/utils/sidebarNavigation.test.js
git commit -m "$(cat <<'EOF'
feat(rhu-reports): add category navigation and sidebar children

EOF
)"
```

---

### Task 2: Visit report source and Patient Visits metrics

**Files:**
- Modify: `frontend/src/services/rhuVisitService.js`
- Modify: `frontend/src/utils/rhuReporting.js`
- Modify: `frontend/src/utils/rhuReporting.test.js`

**Interfaces:**
- Consumes: `isDateInReportPeriod`, `normalizeDateValue` from existing report/filter utils; visit fields `id`, `source`, `referral`/`referral_id`, `checked_in_at`, `closed_at`, `close_reason`, `status`
- Produces:
  - `listRhuVisits({ includeClosed = false } = {})` → `GET /rhu-visits` or `GET /rhu-visits?include_closed=1`
  - `buildPatientVisitMetrics(visits, period)` → `{ total, walkIn, referred, completedConsultations, trend, summaryRows, charts }`
- Visit cohort: `checked_in_at` in period; **exclude** `close_reason === "checked_in_by_mistake"`
- Walk-in vs referred: `source === "referral"` **or** linked referral id → referred; else walk-in. Count each visit once (D4 linked walk-in+referral stays one visit).
- Completed Consultations: `close_reason === "consultation_completed"`
- Active (open) visits in period still count toward Total / Walk-in / Referred

- [ ] **Step 1: Write failing visit metrics tests**

```js
const period = { start: "2026-11-01", end: "2026-11-05", label: "Nov 1–5, 2026", preset: "custom" };

function visit(overrides) {
  return {
    id: 1,
    source: "walk_in",
    referral: null,
    checked_in_at: "2026-11-03T02:00:00Z",
    closed_at: null,
    close_reason: null,
    ...overrides,
  };
}

it("counts each visit once and excludes mistaken check-ins", () => {
  const metrics = buildPatientVisitMetrics(
    [
      visit({ id: 1, source: "walk_in" }),
      visit({ id: 2, source: "referral" }),
      visit({
        id: 3,
        source: "walk_in",
        referral: { id: 9 },
        close_reason: "consultation_completed",
        closed_at: "2026-11-03T04:00:00Z",
      }),
      visit({ id: 4, close_reason: "checked_in_by_mistake", closed_at: "2026-11-03T03:00:00Z" }),
      visit({ id: 5, checked_in_at: "2026-10-01T02:00:00Z" }),
    ],
    period,
  );
  expect(metrics.total).toBe(3);
  expect(metrics.walkIn).toBe(1);
  expect(metrics.referred).toBe(2);
  expect(metrics.completedConsultations).toBe(1);
});

it("counts repeat patient visits separately", () => {
  const metrics = buildPatientVisitMetrics(
    [
      visit({ id: 1, patient_id: 7, checked_in_at: "2026-11-01T02:00:00Z", close_reason: "consultation_completed", closed_at: "2026-11-01T03:00:00Z" }),
      visit({ id: 2, patient_id: 7, checked_in_at: "2026-11-04T02:00:00Z" }),
    ],
    period,
  );
  expect(metrics.total).toBe(2);
  expect(metrics.completedConsultations).toBe(1);
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd frontend && npx vitest run src/utils/rhuReporting.test.js`

- [ ] **Step 3: Implement `listRhuVisits` option + `buildPatientVisitMetrics`**

```js
// rhuVisitService.js
export async function listRhuVisits({ includeClosed = false } = {}) {
  const path = includeClosed ? "/rhu-visits?include_closed=1" : "/rhu-visits";
  const response = await apiRequest(path);
  return response?.data ?? [];
}
```

Keep `useRhuVisits` calling `listRhuVisits()` with defaults (active-only). In `rhuReporting.js`, implement metrics + chart descriptors compatible with `BhcReportCharts` (`kind: "area" | "bar"`, etc.), mirroring helper patterns in `bhcReporting.js` without importing private helpers if awkward — duplicate small `card`/`barChart`/`trendSeries` locals or export shared chart helpers only if already public.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/rhuVisitService.js frontend/src/utils/rhuReporting.js frontend/src/utils/rhuReporting.test.js
git commit -m "$(cat <<'EOF'
feat(rhu-reports): add patient visit metrics from queue entries

EOF
)"
```

---

### Task 3: Referral Reports metrics (incoming, aggregate-only)

**Files:**
- Modify: `frontend/src/utils/rhuReporting.js`
- Modify: `frontend/src/utils/rhuReporting.test.js`

**Interfaces:**
- Produces: `buildIncomingReferralMetrics(referrals, period)`
- Cohort: referrals **submitted** in period via the same date resolution as BHC `getReferralDate` semantics (prefer shared export or copy the small date picker logic into `rhuReporting.js` — do not change BHC totals).
- Cards:
  - `total` — cohort size
  - `referringBhcs` — distinct source BHC / barangay health center names (fallback field order: `originating_facility`, `barangay_health_center`, `from_facility`, `barangay`)
  - `completedCases` — `status` normalized to Completed (include legacy aliases already used in RHU/referral utils)
- Charts: bar “Referrals by Barangay / BHC”
- Summary table rows: `{ label: sourceBhc, value: total, note: `${completed} completed` }` sorted by total desc
- Must **not** expose Pending/Received/No-Show as primary cards; must not include patient name / tracking id columns

- [ ] **Step 1: Write failing referral metrics tests**

```js
it("counts submitted referrals, distinct BHCs, and completed cases without patient rows", () => {
  const metrics = buildIncomingReferralMetrics(
    [
      { id: 1, referral_date: "2026-11-02", status: "Completed", barangay_health_center: "BHC San Jose", patient_name: "Secret" },
      { id: 2, referral_date: "2026-11-03", status: "Pending", barangay_health_center: "BHC San Jose" },
      { id: 3, referral_date: "2026-11-03", status: "Received", barangay_health_center: "BHC Mabini" },
      { id: 4, referral_date: "2026-10-01", status: "Completed", barangay_health_center: "BHC Old" },
    ],
    period,
  );
  expect(metrics.total).toBe(3);
  expect(metrics.referringBhcs).toBe(2);
  expect(metrics.completedCases).toBe(1);
  expect(JSON.stringify(metrics)).not.toMatch(/Secret/);
  expect(metrics.bySource.find((row) => row.label === "BHC San Jose")).toEqual(
    expect.objectContaining({ value: 2, completed: 1 }),
  );
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `buildIncomingReferralMetrics`**

Reuse status normalization already used for referrals if a public helper exists; otherwise a local `normalizeReferralStatus` mapping For Monitoring → Received and Completed variants.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/rhuReporting.js frontend/src/utils/rhuReporting.test.js
git commit -m "$(cat <<'EOF'
feat(rhu-reports): add incoming referral aggregate metrics

EOF
)"
```

---

### Task 4: `buildRhuReport` Overview + clinical categories

**Files:**
- Modify: `frontend/src/utils/rhuReporting.js`
- Modify: `frontend/src/utils/rhuReporting.test.js`

**Interfaces:**
- Produces: `buildRhuReport({ visits, patients, records, referrals, category, period, ageGroup })` → same shape as BHC report object: `{ category, categoryLabel, period, ageGroup, notes, cards, charts, summary, empty, printRows }`
- Overview cards (exact intents):
  1. Total Visits (from visit metrics)
  2. Referrals Submitted (incoming referral total)
  3. Completed Consultations (visit close_reason)
  4. Optional fourth: Referring BHCs **or** a single clinical highlight only if derived from real RHU records — never patients+visits+records summed
- Overview charts: walk-in vs referred trend; referrals by source (aggregate)
- Overview summary: Indicator / Count / Notes rows for the three primary indicators
- Clinical categories (`epi`, `maternal`, `family_planning`, `nutrition`, `morbidity`, `notifiable`, `surveillance`): call `buildBhcReport({ patients, records, referrals: [], category: mappedBhcKey, period, ageGroup })` and re-label with RHU category labels. Mapping: `overview` is RHU-only; `patient_visits` / `referrals` RHU-only; clinical keys match BHC keys except RHU `overview` ≠ BHC `all`.
- If a clinical view has zero reliable rows → `empty: true` and empty-state summary (do not invent). For nutrition, preserve ageGroup passthrough.
- Facility isolation test: metrics ignore visits/referrals clearly belonging to another facility **only if** such an id field is present on fixtures; otherwise document that API scoping is the isolation boundary and assert client filters by period/category only.

- [ ] **Step 1: Write failing `buildRhuReport` tests** for overview, patient_visits view wiring, referrals view wiring, clinical passthrough empty state, and “does not sum unrelated units”

```js
it("overview does not sum visits + referrals + records into one total", () => {
  const report = buildRhuReport({
    visits: [visit({ id: 1 })],
    referrals: [{ id: 1, referral_date: "2026-11-02", status: "Pending", barangay_health_center: "BHC A" }],
    records: [{ id: 1, consultation_date: "2026-11-02" }],
    patients: [],
    category: "overview",
    period,
  });
  const values = report.cards.map((c) => c.value);
  expect(values).not.toContain(3); // would be the misleading sum of 1+1+1 if wrongly combined
  expect(report.cards.find((c) => c.key === "total_visits").value).toBe(1);
  expect(report.cards.find((c) => c.key === "referrals_submitted").value).toBe(1);
});

it("shows empty clinical state when RHU has no matching records", () => {
  const report = buildRhuReport({
    visits: [],
    patients: [],
    records: [],
    referrals: [],
    category: "epi",
    period,
  });
  expect(report.empty).toBe(true);
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `buildRhuReport` views**

Wire `patient_visits` and `referrals` to Task 2/3 builders. Implement overview from those metrics. Delegate clinical categories to `buildBhcReport` with RHU-scoped inputs.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/rhuReporting.js frontend/src/utils/rhuReporting.test.js
git commit -m "$(cat <<'EOF'
feat(rhu-reports): assemble category report views including overview

EOF
)"
```

---

### Task 5: RHUReports page shell (BHC parity)

**Files:**
- Modify: `frontend/src/pages/rhu/RHUReports.jsx` (rewrite to BHC shell)
- Optionally touch query keys if a dedicated visits report key is needed

**Interfaces:**
- Consumes: `normalizeRhuReportCategory`, `buildRhuReport`, `BhcReportPeriodFilter`, `prepareBhcReportPeriod`, `BhcReportCharts`, `getAllPatients("rhu")`, `getAllHealthRecords("rhu")`, `getAllReferrals()`, `listRhuVisits({ includeClosed: true })`
- Layout (exact parity with BHCReports):
  - Title upper-left + facility · period subtitle
  - Filter / Export PDF / Print row upper-right (`no-print`)
  - Summary cards grid
  - `BhcReportCharts`
  - Reporting summary table (Indicator, Count, Notes)
  - `#rhu-report-print` print section + `@media print` rules (mirror BHC, rename ids)
- Remove: Chart.js imports, ListToolbar filters, mixed referral dashboard, embedded `FamilyPlanningReportSection` on this page (FP category uses aggregate report view)
- Loading: TanStack Query + `PageStateWrapper` skeleton `reports`
- Period state: same applied/draft pattern as BHC via `BhcReportPeriodFilter`
- Nutrition: pass `includeAgeGroup` when category is nutrition

- [ ] **Step 1: Rewrite `RHUReports.jsx` to the BHC shell pattern** using RHU category/report builders and four queries (patients, records, referrals, visits). Keep `role="rhu"`.

Sketch (implement fully in file):

```jsx
const [searchParams] = useSearchParams();
const category = normalizeRhuReportCategory(searchParams.get("type"));
const [appliedPeriod, setAppliedPeriod] = useState(() => {
  const initial = prepareBhcReportPeriod({ preset: "monthly" });
  return { selection: { ...initial.selection, ageGroup: "all" }, period: initial.period };
});
// useQuery ×4 → buildRhuReport(...)
```

- [ ] **Step 2: Manual/static sanity** — ensure no Chart.js import remains; print id is `rhu-report-print`.

- [ ] **Step 3: Run related frontend tests**

Run: `cd frontend && npx vitest run src/utils/rhuReporting.test.js src/utils/sidebarNavigation.test.js src/utils/bhcReporting.test.js`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/rhu/RHUReports.jsx
git commit -m "$(cat <<'EOF'
feat(rhu-reports): replace legacy dashboard with category report workspace

EOF
)"
```

---

### Task 6: Navigation regressions, empty states, print consistency verification

**Files:**
- Modify tests as needed: `sidebarNavigation.test.js`, `rhuReporting.test.js`
- Fix any gaps found in Tasks 1–5

**Focus:**
- Category navigation + browser refresh with `?type=`
- Locked Reports item still locks children (existing access helpers)
- Empty period → empty cards/summary/print rows consistent
- Applied period label appears in subtitle and print block (assert via report object `period.label` in unit tests; print DOM is structural copy of BHC)

- [ ] **Step 1: Add any missing regression tests** called out above that are not already green

- [ ] **Step 2: Run focused suite + production build**

Run:
```bash
cd frontend && npx vitest run src/utils/rhuReporting.test.js src/utils/sidebarNavigation.test.js src/utils/bhcReporting.test.js
cd frontend && npm run build
```

Expected: tests pass; build succeeds (existing bundle-size warning OK)

- [ ] **Step 3: Commit verification fixes if any**

- [ ] **Step 4: Finish** — use finishing-a-development-branch after final review

---

## Spec coverage checklist

| Requirement | Task |
|-------------|------|
| Collapsible Reports children + URL categories | 1 |
| BHC layout: title, Filter/PDF/Print, cards, charts, summary | 5 |
| Period Weekly/Monthly/Custom popover | 5 (reuse component) |
| Overview accurate indicators | 4 |
| Patient Visits from queue | 2, 4, 5 |
| Referral Reports aggregates only | 3, 4, 5 |
| Clinical categories from RHU records | 4, 5 |
| Print/PDF period consistency | 5, 6 |
| Tests: calculations, dates, completion, repeats, nav, empty | 1–6 |
| No Intake/Queue/BHC redesign; no migrations | Global |

## Pre-flight notes for executors

1. `listRhuVisits` today is active-only; Task 2 adds `includeClosed` without backend changes (`RhuVisitController` already accepts `include_closed`).
2. Do not wire unused `GET /api/reports/rhu` unless needed — client engine is the source of truth for this rework.
3. BHC `buildReferralMetrics` is outbound/sent — never reuse it for RHU Referral Reports.
4. Closing a visit does not complete a referral (D13) — keep Completed Cases on referral status only.
)
