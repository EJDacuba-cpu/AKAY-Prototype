# Nutrition Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a BHC Nutrition Report (`?type=nutrition`) with period + age filters, four adult BMI cards (no progress bars), status bar chart, enrollment radial coverage chart, and summary table — all from real facility patient/record data.

**Architecture:** Client-side metrics in a focused `nutritionReporting.js` module; register `nutrition` in `bhcReporting.js`; Nutrition-aware filter + layout branches in `BHCReports.jsx`; extend `BhcReportCharts` with `kind: "radial"`.

**Tech Stack:** React + Vite, Recharts, TanStack Query, `node:test`. Spec: `docs/superpowers/specs/2026-11-05-nutrition-report-design.md`.

## Global Constraints

- Category key `nutrition`, slug `nutrition`, label `Nutrition Report` (sidebar from `REPORT_CATEGORIES`).
- BMI: adult WHO only when age at visit ≥ 18; unique patient; latest paired vitals in period.
- Ever enrolled: unique patients with finalized Nutrition record dated ≤ period.end, age filter as of period.end.
- Eligible: registered facility patients matching age filter as of period.end.
- Coverage = everEnrolled / eligible.
- Age groups: `all`, `0-4` (&lt;5), `5-19` (5–&lt;20), `20+` (≥20).
- No progress bars on cards. No demo data. No pediatric z-scores. Do not change other report categories’ metrics.
- Commands: `cd frontend && node --test src/utils/nutritionReporting.test.js src/utils/bhcReporting.test.js`; `npm run lint -- --quiet`.

---

### Task 1: `nutritionReporting.js` metrics + tests

**Files:**
- Create: `frontend/src/utils/nutritionReporting.js`
- Create: `frontend/src/utils/nutritionReporting.test.js`

**Interfaces:**
- `NUTRITION_AGE_GROUPS = [{ value:'all', label:'All Ages' }, { value:'0-4', label:'0–4' }, { value:'5-19', label:'5–19' }, { value:'20+', label:'20+' }]`
- `patientAgeYears(patient, asOfDate): number|null`
- `matchesAgeGroup(ageYears, group): boolean`
- `isNutritionEnrollmentRecord(record): boolean` (reuse enrollment helper or category/selectedPrograms)
- `buildNutritionReportMetrics({ patients, records, period, ageGroup }): { categories: {Underweight,Normal,Overweight,Obese: {count, percent}}, classifiedCount, notApplicableCount, incompleteAdultCount, everEnrolled, eligible, coveragePercent, notes: string[] }`

- [ ] **Step 1:** Write failing tests for unique adult BMI, child exclusion, ever enrolled, eligible, age filters, empty period.
- [ ] **Step 2:** Implement until green.
- [ ] **Step 3:** Commit `feat(reports): nutrition report metrics from finalized vitals and enrollment`

---

### Task 2: Register Nutrition category in `bhcReporting.js`

**Files:**
- Modify: `frontend/src/utils/bhcReporting.js`
- Modify: `frontend/src/utils/bhcReporting.test.js`

**Interfaces:**
- Add REPORT_CATEGORIES entry + aliases.
- `buildBhcReport({ ..., ageGroup = 'all' })` passes ageGroup into nutrition metrics.
- `views.nutrition` → four BMI cards (value=count, hint=`{percent}% of classified adults`), charts: bar + radial descriptor, summary rows.

```js
function radialChart(title, description, period, { enrolled, eligible, coveragePercent }) {
  return {
    kind: "radial",
    title,
    description,
    periodLabel: period?.label || "",
    valueKey: "coverage",
    enrolled,
    eligible,
    coveragePercent,
    data: [{ key: "coverage", coverage: coveragePercent, fill: CHART_COLORS.brand }],
    config: { coverage: { label: "Coverage", color: CHART_COLORS.brand } },
  };
}
```

- [ ] **Step 1–4:** Tests + implement + commit `feat(reports): register Nutrition Report category and view`

---

### Task 3: Age group in Filter popover + BHCReports wiring

**Files:**
- Modify: `frontend/src/components/features/reports/BhcReportPeriodFilter.jsx` (accept optional `includeAgeGroup` + `ageGroup` in applied/onApply)
- Modify: `frontend/src/pages/bhc/BHCReports.jsx` — age state when category===nutrition; pass to `buildBhcReport`; Nutrition note under subtitle; card hint already %; PrintReport includes enrollment/coverage rows

- [ ] **Step 1–3:** Wire UI + commit `feat(reports): Nutrition Report filters and page layout`

---

### Task 4: Radial chart rendering

**Files:**
- Modify: `frontend/src/components/features/reports/BhcReportCharts.jsx`

Use Recharts `RadialBarChart` / `RadialBar` with background track; center text `{enrolled}` + `Patients Enrolled`; empty when eligible=0 and enrolled=0.

- [ ] **Step 1–3:** Implement + lint + commit `feat(reports): Nutrition enrollment radial chart`

---

### Task 5: Verification

- [ ] Run `node --test` nutritionReporting + bhcReporting tests; record counts.
- [ ] Confirm other categories still normalize; sidebar shows Nutrition.
- [ ] Commit only if fixes needed.
