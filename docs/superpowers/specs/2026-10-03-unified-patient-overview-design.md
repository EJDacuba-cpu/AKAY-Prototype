# Unified Patient Overview - Design

Date: 2026-10-03
Scope: BHC `PatientDetails` Overview tab only (UI/layout; no backend or data-flow change)

## Goal

Replace the Overview tab's stacked white cards (`OverviewDashboard` + `PatientHealthSummary`) and the
separate identity header with one continuous, compact 3-column dashboard on a single tinted surface
that fills the available content area, inspired by the provided medical dashboard reference.

## Decisions

| Topic | Decision |
|---|---|
| Layout | 3 columns ~25% identity / 40% anatomy / 35% clinical, one edge-to-edge surface, hairline dividers, no white cards |
| Header | On Overview, `PatientProfileHeader` content merges into the top of the left column. Other tabs keep the current header unchanged |
| Anatomy figure | Reuse the Physical Exam SVG silhouette (shared geometry) |
| Markers | Only from recorded `bodyFindings` on the patient's health records - no condition-to-body mapping, no inference |
| Marker scope | Default "Latest visit" = the single most recent record by record date, even when it has no findings (empty note with its date). "View history" toggle = all loaded records |
| Vitals | Latest value + mini sparkline of the last 6 recorded readings; values only, no normal/abnormal colouring |
| Below the board | Medical / Family / Social Background stays on Overview, still inline-editable |
| Removed | Recent Health Records preview card; `OverviewDashboard`; `PatientHealthSummary`; the placeholder PNG usage |
| Responsive | >=1280px 3 columns; 768-1279px identity + clinical side by side, anatomy full width below; <768px identity -> clinical -> anatomy |
| Accent | AKAY brand red only; neutral cool surface (`slate-100`) |
| Restricted roles (no `clinical.history`) | Left column shows identity, demographics and the consultation action; centre + right become one area with the existing lock note |
| Data | Only data `PatientDetails` already loads (records list default page of 25 most recent). No extra fetches |
| RHU | `RHUPatientDetails` unchanged |

## Architecture

```
pages/bhc/PatientDetails.jsx              Overview branch rewired; other tabs untouched
└─ profile/PatientOverviewBoard.jsx       tinted surface, tab strip slot, responsive grid, background slot
   ├─ profile/OverviewIdentityColumn.jsx  back link, identity, ConsultationActions, demographics, allergy, vitals
   ├─ profile/VitalsTrendList.jsx         latest vitals + sparklines
   ├─ profile/AnatomyFindingsPanel.jsx    BodyFigureSvg + markers, Latest/History toggle, findings list
   └─ profile/ClinicalOverviewColumn.jsx  Conditions, Care Tracking, Referrals, Follow-ups

profile/ConsultationActions.jsx           extracted from PatientProfileHeader (button, draft notice, modals)
features/patients/BodyFigureSvg.jsx       read-only figure + marker buttons + desktop hover callout
utils/bodyFigureGeometry.js               FIGURE_SHAPES + DOT_POSITIONS (moved out of BodyPreviewPanel; shared)
utils/bodyFindingsSummary.js              latest-visit vs history grouping per region (pure)
utils/vitalTrends.js                      last-N readings per vital (pure)
```

`PatientDetails` keeps every query, query key, mutation, permission check and navigation target. The board
receives `patient`, `patientId`, `backPath`, `records`, `recordsLoading`, `referrals`, `referralsLoading`,
`referralsError`, `activeFollowUps`, `careTracking`, `programLabels`, `canViewHistory`, `updating`, and
navigation callbacks built from existing routes.

## Layout and visual system

- On Overview the board replaces the page's padded wrapper and cancels the layout's scroll-area padding
  (`-m-3 sm:-m-4 lg:-m-5`) so the surface fills the content area; `min-h-full` flex column: tab strip,
  then the grid filling remaining height, then the Background sections on the same surface.
- Grid DOM order identity -> clinical -> anatomy. xl: `grid-cols-[25fr_40fr_35fr]` with `order` putting
  anatomy in the centre; md: 2 columns with anatomy `col-span-2`; mobile: single stack.
- xl: anatomy column `sticky top-0`.
- Surface `slate-100`; centre radial white glow; 1px `slate-200` hairlines between columns (vertical on xl,
  horizontal when stacked) and between sections. No borders, shadows or white fills on sections.
- Type: name 20px bold; section label 11px semibold uppercase tracking-wide slate-500; values 14px semibold
  tabular-nums; meta 11-12px slate-500. 16px column padding, 20px between sections.
- Status chips keep existing palettes (condition status, care status, `FollowUpStateBadge`, `StatusBadge`).
- Loading: page-level states unchanged; vitals and anatomy show inline "Loading..." while records load.

## Columns

### Left - identity
1. Back link to `backPath`.
2. Initials avatar, name, Patient ID (mono), "42 yrs · Male".
3. `ConsultationActions` (same behaviour as today's header) + updating indicator.
4. Demographics: Birthdate, Contact, Address, PhilHealth, NHTS, Civil status; "—" when missing.
5. (`clinical.history`) Allergy line: red when recorded; muted "No known allergies" / "Allergies not recorded".
6. (`clinical.history`) Latest Vital Signs with timestamp: BP (systolic + diastolic lines), Pulse, Temp, SpO₂,
   Weight, Height, BMI, FBS (only when recorded). Sparkline only with >= 2 readings.

### Centre - Visual Health Summary
- Label + segmented toggle "Latest visit | View history".
- Caption: "Latest visit · <date> · N findings" / "No body findings on latest visit (<date>)" /
  "All visits · N findings across M visits" / "No health records yet".
- Figure scaled to the column, R/L labels; markers only on regions with findings (brand red, white ring,
  count badge when >= 2). Markers are buttons with labels like "Chest, 2 findings".
- Desktop hover/focus: dark callout with that region's findings. Click/tap selects the region and filters
  the findings list; "Clear selection" resets.
- Findings list: grouped by region; each row "Location: finding (note) · visit date" opens
  `/bhc/health-records/:id`.

### Right - Clinical Overview
1. Current Conditions: name, status chip, first noted / confirmed dates.
2. Care Tracking / Monitoring: enrolled-program chips line (`programLabels`), one row per care entry
   (label, status chip, next or last visit); View all -> Care & Programs tab.
3. Referrals: latest 3, destination · date, `StatusBadge`; row opens referral; View all (n) -> Referrals tab;
   one-line loading / error notes.
4. Upcoming Follow-ups: next 3 active, due date + `FollowUpStateBadge`; row opens `/bhc/follow-ups/:id`;
   View all -> Follow-ups tab.

## Testing

- `node --test` unit tests (new script `test:patient-overview`): `bodyFindingsSummary`, `vitalTrends`,
  `bodyFigureGeometry` (every `BODY_REGIONS` key has a dot position).
- Existing util test scripts still pass; `npm run lint` and `npm run build` clean.
- Grep confirms no imports remain before deleting `OverviewDashboard` / `PatientHealthSummary`.
- Browser: 1440 / 1024 / 390 px; latest-visit-empty case; marker hover/click/keyboard; consultation
  start/resume/discard; other tabs; restricted role; Background edit; exam-step body map unchanged.

## Out of scope

RHU patient details; tab strip styling; backend/API; condition-to-body mapping; dark mode.

## Revision 1 (2026-10-03) - compact card dashboard

Supersedes the layout, header, surface and Background decisions above after review against the reference.

| Topic | Revised decision |
|---|---|
| Shell | Overview uses the same shell as other tabs: existing `PatientProfileHeader`, tab strip, then the board. No bleed, no fill-height - the board is content-sized |
| Board | `xl:grid-cols-[24fr_46fr_30fr]`, `items-start`, 8px gaps; md: left + right side by side, centre below; phone: left -> right -> centre |
| Cards | White, 1px gray-200 border, square corners, no shadow, 12px padding, 8px between stacked cards, on the page's gray-50 (`OverviewCard`) |
| Left | Alerts & Allergies; Latest Vital Signs (values + sparklines); Patient Background read-only summary (`summarizeBackground`: past medical, family, social - one line each) with Edit -> Patient Information tab. No avatar, no demographics |
| Centre | Visual Health Summary card: toggle, caption, figure capped at 340px (300px below lg), centred with a light radial glow; compact flat findings list (4 rows, then Show all) |
| Right | Current Conditions; Care Tracking & Monitoring; Referrals (3); Upcoming Follow-ups (3); Recent Visits (3 latest records, View all -> Health Records tab) |
| Background editing | Medical / Family / Social editors move to the Patient Information tab below registration (`clinical.history` roles only) |
| Restricted roles | Header + tabs, then the existing lock note on Overview |
