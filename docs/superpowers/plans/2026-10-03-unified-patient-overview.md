# Unified Patient Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the BHC patient profile's Overview tab with one continuous 3-column dashboard (identity / anatomy / clinical) on a single tinted surface, with no backend or data-flow change.

**Architecture:** Pure utils (`bodyFigureGeometry`, `bodyFindingsSummary`, `vitalTrends`) are unit-tested with `node --test`. Presentational components consume them; `PatientDetails.jsx` keeps every query and handler and only swaps its Overview branch for `PatientOverviewBoard`. The consultation action is extracted from `PatientProfileHeader` so header and left column share it.

**Tech Stack:** React 19, react-router, TanStack Query, Tailwind v4, lucide-react, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-03-unified-patient-overview-design.md`

## Global Constraints

- UI/layout only: no change to services, query keys, mutations, permissions, routes or backend.
- Markers come only from recorded `bodyFindings`; no condition-to-body mapping, no inferred findings.
- Vitals are shown as values only - never coloured or labelled normal/abnormal.
- Column split at >=1280px (`xl`): `grid-cols-[25fr_40fr_35fr]`; DOM order identity -> clinical -> anatomy.
- Surface `bg-slate-100`; hairlines `slate-200`; accent brand red only; no white cards, borders or shadows on sections.
- "Latest visit" = the single most recent record by date, even if it has no findings.
- Sparklines use the last 6 readings; none with < 2 readings.
- `RHUPatientDetails` and the tab strip styling stay unchanged.
- Utils imported by tests must use explicit `.js` import specifiers (node ESM).

## Review Focus

- Records with no parseable date: must not crash or become "latest"; excluded from latest selection, listed last in history.
- A finding saved on a region key the figure doesn't know: dropped silently (via `normalizeBodyFindings`), never a marker at (undefined, undefined).
- Vital values stored as strings like `"120"`, `" "` or `"abc"`: non-numeric readings skipped from sparklines but the latest raw value still displays.
- Patient with zero records: centre shows "No health records yet", vitals "No vital signs recorded yet", no toggle errors.
- Switching patients (route param change) while a region is selected: selection and mode reset (component keyed by `patientId`).

---

### Task 1: Shared body figure geometry

**Files:**
- Create: `frontend/src/utils/bodyFigureGeometry.js`
- Create: `frontend/src/utils/bodyFigureGeometry.test.js`
- Modify: `frontend/src/components/features/health-records/wizard/BodyPreviewPanel.jsx` (remove local `FIGURE_SHAPES` / `DOT_POSITIONS`, import them)

**Interfaces:**
- Produces: `export const FIGURE_SHAPES` (array, unchanged values), `export const DOT_POSITIONS` (object region -> `[x, y]`, unchanged values), `export const FIGURE_VIEWBOX = { width: 200, height: 400 }`.

- [ ] **Step 1: Write failing test** `every BODY_REGIONS key has a dot position inside the viewBox` - for each `BODY_REGIONS` key, `DOT_POSITIONS[key]` is a 2-number array with `0 <= x <= 200`, `0 <= y <= 400`; and `FIGURE_SHAPES.length === 9`.
- [ ] **Step 2: Run** `node --test src/utils/bodyFigureGeometry.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Move the two constants verbatim** into `bodyFigureGeometry.js`; import them in `BodyPreviewPanel.jsx`.
- [ ] **Step 4: Run** `node --test src/utils/bodyFigureGeometry.test.js` -> PASS; `npx eslint src/components/features/health-records/wizard/BodyPreviewPanel.jsx src/utils/bodyFigureGeometry.js` clean.
- [ ] **Step 5: Commit** `refactor(body-map): share figure geometry for the profile overview`.

### Task 2: Body findings summary util

**Files:**
- Create: `frontend/src/utils/bodyFindingsSummary.js`
- Create: `frontend/src/utils/bodyFindingsSummary.test.js`

**Interfaces:**
- Consumes: `normalizeBodyFindings`, `getBodyRegionLabel` from `./bodyFindings.js`; `getVitalRecordDate` from `./currentPatientVitals.js` (record date parser).
- Produces:
  - `getRecordId(record) -> string` (id / health_record_id / healthRecordId / record_id / recordId / _id, else "").
  - `summarizeBodyFindings(records, mode) -> { mode, visitDate: Date|null, visitCount, findings: Item[], countByRegion: Record<region, number> }` where `mode` is `"latest" | "history"` and `Item = { id, region, regionLabel, location, finding, note, recordId, visitDate: Date|null }`.
  - `latest`: picks the single record with the greatest parseable date (ignores undated records); `visitDate` = its date; `visitCount` = 1 if a record was picked else 0; findings only from that record.
  - `history`: all records; findings sorted by visitDate desc (undated last); `visitCount` = records contributing >= 1 finding; `visitDate` = null.

- [ ] **Step 1: Write failing tests**
  - `latest picks newest record even when it has no findings` -> records A (2026-09-01, chest finding), B (2026-09-28, none): `findings.length === 0`, `visitDate` equals B's date, `visitCount === 1`.
  - `latest returns the newest record's findings with counts` -> B has two chest + one head: `countByRegion.chest === 2`, `countByRegion.head === 1`, each item `recordId === "B"`.
  - `history merges all records newest first` -> order of `visitDate` descending, `visitCount === 2`.
  - `unknown regions and blank findings are dropped` -> `{ region: "tail", finding: "x" }` yields no item.
  - `undated records are never latest and sort last in history`.
  - `no records` -> latest `{ visitDate: null, visitCount: 0, findings: [] }`.
- [ ] **Step 2: Run** `node --test src/utils/bodyFindingsSummary.test.js` -> FAIL.
- [ ] **Step 3: Implement** in `bodyFindingsSummary.js` (reads `record.bodyFindings`).
- [ ] **Step 4: Run** -> PASS.
- [ ] **Step 5: Commit** `feat(patient-overview): summarize recorded body findings by visit`.

### Task 3: Vital trends util

**Files:**
- Create: `frontend/src/utils/vitalTrends.js`
- Create: `frontend/src/utils/vitalTrends.test.js`
- Modify: `frontend/package.json` (add `"test:patient-overview": "node --test src/utils/bodyFigureGeometry.test.js src/utils/bodyFindingsSummary.test.js src/utils/vitalTrends.test.js"`)

**Interfaces:**
- Consumes: `hasVitalValue`, `getVitalRecordDate`, `getLatestVitalRecord` from `./currentPatientVitals.js`; `calculateBmi`, `formatBmi` from `./bmi.js`.
- Produces: `export const TREND_LENGTH = 6`; `buildVitalRows(records) -> { record, recordedAt: Date|null, rows: Row[] }`, `Row = { key, label, unit, display: string, series: number[][] }`:
  - Keys / labels / units in order: `bp` "BP" "mmHg" (display `"sys/dia"`, series `[systolic[], diastolic[]]`), `pulse` "Pulse" "bpm", `temperature` "Temp" "°C", `spo2` "SpO₂" "%", `weight` "Weight" "kg", `height` "Height" "cm", `bmi` "BMI" "kg/m²" (per-record BMI from that record's weight + height), `fbs` "FBS" "mg/dL" (row only when the latest record has FBS).
  - `display` uses the latest vital record's raw value, "—" when missing (BP: each side "—" independently; whole "—" if both missing).
  - Each series = last `TREND_LENGTH` numeric readings (parseFloat finite) from dated records sorted oldest -> newest; a series with < 2 points becomes `[]`. BP keeps `[sys, dia]` only when each has >= 2 points, otherwise `[]`.
  - No records with vitals -> `{ record: null, recordedAt: null, rows: [] }`.

- [ ] **Step 1: Write failing tests**
  - `returns the last 6 readings oldest to newest` -> 8 records with pulse 60..67: pulse series `[[62,63,64,65,66,67]]`.
  - `skips blank and non-numeric readings but keeps latest display` -> latest temperature `"abc"`: display `"abc"`, series excludes it.
  - `bp pairs systolic and diastolic` -> series length 2, display `"120/80"`.
  - `bmi uses each record's own weight and height` -> 2 records -> series values equal `calculateBmi` per record.
  - `fbs row only when latest record has fbs`.
  - `single reading has no trend` -> series `[]`.
  - `no vitals` -> `{ record: null, rows: [] }`.
- [ ] **Step 2: Run** `node --test src/utils/vitalTrends.test.js` -> FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test:patient-overview` -> all PASS.
- [ ] **Step 5: Commit** `feat(patient-overview): vital sign trend series for sparklines`.

### Task 4: Extract ConsultationActions

**Files:**
- Create: `frontend/src/components/features/patients/profile/ConsultationActions.jsx`
- Modify: `frontend/src/components/features/patients/profile/PatientProfileHeader.jsx`

**Interfaces:**
- Produces (no default export):
  - `export function useConsultationActions(patient, patientId) -> { consultation, onStart, startModal }` - owns `usePatientConsultation`, the start-modal open state and navigation; `onStart` is `undefined` unless `consultation.needsStartModal`; `startModal` is the portaled `StartConsultationModal` element or `null`.
  - `export function ConsultationButton({ consultation, onStart })` (moved verbatim).
  - `export function ConsultationNotice({ consultation })` (moved verbatim, discard confirm included).
- Header and left column each call the hook once and place button / notice / `startModal` where they need. `PatientProfileHeader`'s rendered output and behaviour are unchanged.

- [ ] **Step 1: Move** `ConsultationButton`, `ConsultationNotice` and the modal state into `ConsultationActions.jsx`; add `useConsultationActions`.
- [ ] **Step 2: Rewire** `PatientProfileHeader` to the hook; diff the rendered JSX structure by eye - same classes and order.
- [ ] **Step 3: Verify** `npx eslint` on both files clean; `npm run build` succeeds.
- [ ] **Step 4: Commit** `refactor(patient-profile): share consultation actions between header and overview`.

### Task 5: BodyFigureSvg + AnatomyFindingsPanel

**Files:**
- Create: `frontend/src/components/features/patients/BodyFigureSvg.jsx`
- Create: `frontend/src/components/features/patients/profile/AnatomyFindingsPanel.jsx`

**Interfaces:**
- Consumes: Task 1 geometry; Task 2 `summarizeBodyFindings`; `formatShortDate` from `utils/patientProfile`; `getBodyRegionLabel`.
- Produces:
  - `BodyFigureSvg({ countByRegion, findingsByRegion, selectedRegion, onSelectRegion, isDesktop })` - SVG (viewBox 0 0 200 400) with outline shapes (`fill-white/70 stroke-slate-300`), R / L labels, a `<g role="button" tabIndex=0>` marker only for regions with count > 0 (brand-red dot r=6 with white stroke, ring when selected/hovered, count badge when >= 2), aria-label `"<Region label>, N finding(s)"`, Enter/Space selects; desktop-only hover/focus dark callout listing up to 3 findings of that region (`aria-hidden`). Height: `h-full max-h-[560px] w-auto` on xl, `max-h-[420px]` stacked.
  - `AnatomyFindingsPanel({ records, recordsLoading, onViewRecord })` - state `mode` ("latest" default) and `selectedRegion`; header label "Visual Health Summary" + segmented toggle (`aria-pressed`) "Latest visit" / "View history"; caption per spec copy; figure; findings list grouped by region (filtered when selected) with "Clear selection"; each row a button calling `onViewRecord(recordId)`. Changing mode clears selection. Copy (exact):
    - `Latest visit · {date} · {n} finding(s)`
    - `No body findings on latest visit ({date})`
    - `All visits · {n} finding(s) across {m} visit(s)`
    - `No health records yet`
    - footnote `Shows body findings as recorded during visits.`
- [ ] **Step 1: Implement both components.**
- [ ] **Step 2: Verify** `npx eslint` clean.
- [ ] **Step 3: Commit** `feat(patient-overview): anatomy panel with recorded body findings`.

### Task 6: Identity column, vitals list, clinical column

**Files:**
- Create: `frontend/src/components/features/patients/profile/VitalsTrendList.jsx`
- Create: `frontend/src/components/features/patients/profile/OverviewIdentityColumn.jsx`
- Create: `frontend/src/components/features/patients/profile/ClinicalOverviewColumn.jsx`
- Modify: `frontend/src/components/features/patients/profile/FollowUpsAndReferrals.jsx` (export existing `getReferralDate`, `getReferralDestination`)

**Interfaces:**
- `VitalsTrendList({ records, isLoading })` - uses `buildVitalRows`; heading "Latest Vital Signs" + recorded-at text (same "Today, h:mm" / "Mon D, YYYY, h:mm" formatting as the old card); rows `label | display unit | <Sparkline series/>` (60x18 SVG polyline(s) `stroke-slate-400`, last point dot `fill-slate-600`); loading / empty copy "Loading vital signs..." / "No vital signs recorded yet."
- `OverviewIdentityColumn({ patient, patientId, backPath, updating, canViewHistory, records, recordsLoading })` - back link (`aria-label="Back"`, text "Back"), initials avatar, name (`formatPatientName`), Patient ID mono, age/sex; consultation button + notice + startModal via `useConsultationActions`; demographics dl (Birthdate, Contact, Address via `formatPatientAddress`, PhilHealth status + number, NHTS, Civil status; "—" when missing; values read with `createPatientForm(patient)`); when `canViewHistory`: allergy line (`NO_ALLERGY_PATTERN`) and `VitalsTrendList`.
- `ClinicalOverviewColumn({ patient, careTracking, programLabels, referrals, referralsLoading, referralsError, activeFollowUps, onViewPrograms, onViewReferrals, onViewReferral, onViewFollowUps, onViewFollowUp })` - four sections per spec, shared `SectionHeading({ title, meta, action })` local helper; tone maps moved from `OverviewDashboard` (`CONDITION_STATUS_TONE`, `CARE_STATUS_TONE`).
- [ ] **Step 1: Export referral helpers; implement the three components.**
- [ ] **Step 2: Verify** `npx eslint` clean.
- [ ] **Step 3: Commit** `feat(patient-overview): identity and clinical overview columns`.

### Task 7: Board + PatientDetails wiring, remove old cards

**Files:**
- Create: `frontend/src/components/features/patients/profile/PatientOverviewBoard.jsx`
- Modify: `frontend/src/pages/bhc/PatientDetails.jsx`
- Delete: `frontend/src/components/features/patients/profile/OverviewDashboard.jsx`, `frontend/src/components/features/patients/profile/PatientHealthSummary.jsx`

**Interfaces:**
- `PatientOverviewBoard({ tabStrip, identity, clinical, anatomy, restricted, below })` - layout only: outer `-m-3 sm:-m-4 lg:-m-5 flex min-h-full flex-col bg-slate-100`; tab strip padded `px-4 pt-3 sm:px-6`; grid `grid flex-1 grid-cols-1 md:grid-cols-2 xl:grid-cols-[25fr_40fr_35fr]` with hairlines; anatomy cell `md:col-span-2 xl:col-span-1 xl:order-2` and `xl:sticky xl:top-0 xl:self-start`, radial glow `bg-[radial-gradient(...)]`; clinical `xl:order-3`; when `restricted` is a node it replaces clinical + anatomy as one cell (`md:col-span-1 xl:col-span-2`); `below` sits after a top hairline.
- `PatientDetails`: when `activeTab === "overview"`, render the board instead of `ProfileShell`'s padded wrapper + header (other tabs keep header + current wrapper). Board slots receive existing data and handlers: `onViewPrograms -> setActiveTab("programs")`, `onViewReferrals -> setActiveTab("referrals")`, `onViewFollowUps -> setActiveTab("follow-ups")`, `onViewReferral -> navigate(\`/bhc/referrals/${id}\`)`, `onViewFollowUp -> navigate(\`/bhc/follow-ups/${id}\`)`, `onViewRecord -> navigate(\`/bhc/health-records/${id}\`)`. Background sections render in `below` (only when `canViewHistory`, as today). `AnatomyFindingsPanel` keyed by `patientId`.
- [ ] **Step 1: Implement board and rewire page.**
- [ ] **Step 2: Grep** `OverviewDashboard|PatientHealthSummary` -> no importers; delete both files.
- [ ] **Step 3: Verify** `npm run lint`, `npm run build`, `npm run test:patient-overview test:patient-profile` scripts, `test:profile-navigation`, `test:program-tabs`, `test:breadcrumbs` all pass.
- [ ] **Step 4: Commit** `feat(patient-overview): unified three-column overview on the patient profile`.

### Task 8: Browser verification

- [ ] **Step 1:** Run the app (frontend + backend) and log in as a BHC user.
- [ ] **Step 2:** Check each scenario in the spec's Testing section at 1440 / 1024 / 390 px; fix defects in the owning task's files.
- [ ] **Step 3:** Confirm exam-step body map (consultation Physical Exam) renders as before.
- [ ] **Step 4: Commit** any fixes `fix(patient-overview): ...`.
