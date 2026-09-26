# EHR Minimalism UI Rework — Design

Date: 2026-09-27
Branch: `Rework-Patch-AKAY-1.0`
Status: awaiting spec review

## 1. Intent

Restyle five existing areas of the AKAY frontend to the **medical-ehr-minimalism**
skill (flat surfaces, sharp corners, thin gray dividers, dense data, red reserved
for primary actions and urgency), using `D:\Documents\AKAY Reference Inspiration Ui.jpg`
as the layout reference where the user asked for it.

Areas: navbar (sidebar), topbar, patient module (list), patient profile, new
consultation.

**Success criteria**

- The five areas read as one system: same grays, one red, square corners
  (2px on badges only), no shadows, Geiza-first sans type.
- Patient list is a fixed 2-column card grid with a permanent right-hand preview
  panel (no slide-in on desktop).
- Patient profile uses the reference's layout: a left identity panel, with the
  chart sections and records timeline beside it.
- Nothing about behavior, data, routes, permissions or API calls changes.

**Non-goals**

- Restyling other screens (admin, RHU, dashboards, login, referrals, etc.).
  Only what the global token change reaches automatically changes there.
- Any edit feature for saved health records (records stay immutable after save;
  corrections are new/follow-up records only).
- Adding the Geiza font files (not available; stack falls back to Public Sans).
- A visible step indicator or patient panel in the consultation wizard.

## 2. Decisions taken during brainstorming

| # | Decision |
|---|---|
| 1 | Follow the skill exactly: replace the existing "calm medical sanctuary" tokens (warm greige, clay brand, serif headings) with the skill's palette, font and radius. |
| 2 | Tokens change **globally** in `index.css`; layouts are restyled only in the five areas. |
| 3 | Font stack `"Geiza", "Public Sans Variable", …`. Geiza is used if ever installed. Headings become bold sans (serif removed). |
| 4 | Topbar keeps breadcrumbs + working-facility selector + notification bell. Only styling changes. |
| 5 | Patient list: 2-column card grid + permanent right preview panel (reference image), instead of the skill's table. |
| 6 | Preview panel starts **empty** ("Select a patient to preview"); no auto-selection. |
| 7 | Profile follows the reference layout (left identity panel) using the skill's styling. |
| 8 | Consultation: cleanup only; layout unchanged. |

## 3. Blast radius of the global token change

Measured on the current tree: only **3** files use the `neutral-/brand-/alert-`
Tailwind tokens; **138** hard-code `slate-*` or `#B91C1C`-style values. So remapping
color ramps is low risk and will **not** recolor most screens. What *does* change
app-wide:

- Base font (`body`) and headings (`h1–h4` serif → sans).
- `--radius-*` and `--shadow-*` variables, and Tailwind's `rounded-*` scale if
  overridden (see 4.1).
- `.akay-card` / `.akay-card-hover` (border only, no shadow, no lift).

Screens outside the five areas will therefore be square and flat but keep their
old grays/reds until converted later.

## 4. Design

### 4.1 Tokens (`frontend/src/index.css`, `docs/design-tokens.md`)

- **Neutral ramp** → skill grays: 50 `#F9FAFB`, 100 `#F3F4F6`, 200 `#E5E7EB`,
  300 `#D1D5DB`, 400 `#9CA3AF`, 500 `#6B7280`, 600 `#4B5563`, 700 `#374151`,
  800 `#1F2937`, 900 `#111827`.
- **Brand ramp** → red: 50 `#FEF2F2`, 100 `#FEE2E2`, 200 `#FECACA`, 600 `#DC2626`
  (primary), 700 `#B91C1C` (hover), 800 `#991B1B` (pressed). Semantic
  `--color-primary*` re-pointed to these.
- **Alert** stays for critical only, mapped to `#EF4444` family. **Status**:
  success `#059669`, warning `#F59E0B`, info `#0891B2` (with light 50/100 fills for badges).
- **Radius**: `--radius-row/input/card/card-sm/lg/modal` → `0`; new
  `--radius-badge: 2px`. `--radius-pill` stays for dots/avatars/spinners only.
  Tailwind's `rounded-md/lg/xl/2xl/3xl` are overridden to `0` and `rounded-sm` to
  `2px` so hard-coded classes elsewhere go square too. *(Review item: confirm this
  app-wide squaring is wanted.)*
- **Shadow**: `--shadow-2xs/xs/sm/md/card` → flat (`0 0 #0000`); `--shadow-lg/xl/2xl` keep one subtle value (`0 4px 12px rgba(17,24,39,0.08)`) for floating layers.
- **Type**: `--font-sans` → Geiza first; `h1–h4` use sans; `body` text 14px. The `--text-*` scale is unchanged (only inherited, un-classed text gets denser).
- **Body/page background** `#F9FAFB`; `.akay-card` = 1px `#E5E7EB` border, no shadow.
- `.ehr-consult` overrides in `consultation-ehr.css` that duplicate the global
  rules are deleted; only overrides for shared components that still hard-code
  old values are kept.
- `docs/design-tokens.md` and `/design-tokens` preview page updated to describe
  the new direction (they currently describe the retired one).

### 4.2 Navbar and topbar (`components/layout/…`)

- Structure and behavior unchanged (`DashboardLayout.jsx`, `DesktopSidebar.jsx`,
  `MobileSidebarDrawer.jsx`, `FullSidebarNav.jsx`, `sidebarStyles`,
  `TopBarBreadcrumbs.jsx`, `WorkingFacility.jsx`).
- Page background `#F8FAFC` → `#F9FAFB`; text `#0F172A` → `#111827`.
- Active nav item is already skill-compliant (`border-l-red-600`, `bg-red-50`, `text-red-700` in `sidebarStyles.js`); unchanged. The sidebar files need no edits.
- Mobile drawer scrim: plain `bg-black/25`, no `backdrop-blur`.
- Content scrollbar thumb square, not `999px`.
- Brand text and notification badge on the new red.

### 4.3 Patient module (`pages/bhc/PatientsModule.jsx`, `clinical-directory.css`, `PatientDirectoryCard.jsx`, `PatientSummaryPanel.jsx`)

- Layout at `xl+` (1280px): results (left) and a 380px sticky preview panel (right, own scroll). Below `xl` there is not enough width for both, so the preview keeps the existing `Drawer`.
- Card grid: 1 column, switching to 2 columns when the *results area* (a named CSS container) is at least 560px wide — so it is 2 columns beside the panel at `xl+` and on tablets, 1 on phones. Cards: 1px gray border, no shadow, no hover lift, square; selected card gets a red left border. Content per card unchanged.
- Toolbar unchanged in function (search, filters, chips, "+ New Patient");
  restyled to the skill's toolbar.
- Preview panel: `PatientSummaryPanel`, rendered inline, restructured to the
  reference's "Profile Staff" panel and **shortened** (decision from brainstorming):
  1. title bar "Patient Summary" with the status badge at the right;
  2. centered identity: name, "Patient ID #…", age / sex;
  3. **Alerts** box: allergies and active conditions as chips (allergy red when
     recorded; muted "Allergies not recorded" / "No known allergies");
  4. Profile Details rows (age/sex, date of birth, civil status, occupation,
     contact, address, PhilHealth);
  5. Current Vital Signs grid;
  6. Latest Consultation rows (date, program, chief complaint, initial diagnosis,
     medicine/treatment, outcome);
  7. sticky "View Full Profile" button.
  Removed from the preview (still on the full profile): hospitalizations,
  surgeries, family history, social history, maternal/prenatal. Alerts, vitals and
  latest consultation stay gated by `clinical.history`, as today. The title bar is
  drawn by the panel only in the inline preview (`showTitle`); the `Drawer` keeps
  its own title bar, with the status badge under the identity. Cards keep their
  current content (no avatar; the reference's photos have no equivalent data).
  With no selection the panel shows an empty placeholder: "Select a patient to
  preview". Clicking the selected card again clears it (current
  `toggleSelectedPatient` behavior is kept). Patient changes, search, filters or
  list changes that remove the selected patient clear the selection.
- The allergy/condition chips are one shared component (`PatientAlertChips`) used
  by both this preview and the profile's left identity panel.
- Selection state lives where it does today (`PatientsModule`); the panel/drawer
  switch is presentational (breakpoint), not a second source of truth.

### 4.4 Patient profile (`pages/bhc/PatientDetails.jsx`, `components/features/patients/profile/*`)

- New layout at `lg+`: **left identity panel** (fixed ~300px) containing name, ID,
  age/sex, address, alerts (allergies, active conditions), programs, care status
  (next follow-up, open referrals), latest vitals, and the Start/Resume/Discard
  consultation controls (the existing `PatientProfileHeader` content, regrouped).
  **Right column**: registration + background sections and the records timeline
  (existing sections, unchanged in content and order).
- Below `lg`: the panel stacks above the sections. The right area is one column until `xl`, where it becomes the existing 5fr/7fr two-column split.
- All controls, permission gates (`canViewHistory`), the unfinished-draft notice,
  and `ConfirmationModal` behavior are preserved. No record editing is added.
- Restyle: `slate-*` → gray tokens, `#B91C1C` → `#DC2626`/`brand-600`, chips/buttons
  `rounded-md` → square, badges `rounded-sm`, labels 12px uppercase `tracking-wide`,
  skill status badges, skill alert bars (red left rule for critical).

### 4.5 New consultation (`pages/bhc/ConsultationWorkspace.jsx`, `wizard/*`, `consultation-ehr.css`)

- Cleanup only. Convert leftover `slate-*`, `#B91C1C`, `rounded-*` classes to the
  tokens/skill values; delete redundant `.ehr-consult` rules.
- Layout, steps, autosave, program panel, review and submit behavior untouched.

## 5. Data flow and error handling

No data or API changes. Existing loading, error, empty and offline states
(`SoftLoadingArea`, `PatientDirectoryState`, `RefreshingIndicator`,
`ConfirmationModal`) are kept and restyled. The preview panel reuses
`usePatientSummary`; its loading/error states come from there.

## 6. Testing and verification

- Repo tests are `node --test` utils tests; there is no component-test harness.
  Any new logic (selection reconciliation when the list changes) is extracted into
  a small pure util with a `node --test` file, in the style of `patientUtils.test.js`.
- Run existing suites relevant to touched code (`test:patient-utils`,
  `test:patient-profile`, `test:breadcrumbs`, `test:consultation-steps`,
  `test:consultation-identity`) and `npm run lint` and `npm run build`.
- Visual check in the running app (via `/run`) at mobile, tablet (`md`) and
  desktop (`lg`+) widths for each of the five areas, comparing against the
  reference for the patient module and profile.
- Grep gate on the five areas' files: no `slate-`, `#B91C1C`, `rounded-(md|lg|xl|2xl)`,
  `shadow-` (except floating layers) left.

## 7. Order of work

1. Tokens + docs. 2. Navbar/topbar. 3. Patient module. 4. Profile.
5. Consultation cleanup. Verify after each step; commit per step.

## 8. Risks

- Global squaring/flattening changes the look of un-converted screens (accepted).
- Profile regrouping moves consultation controls into the left panel; must keep
  the draft/resume flow reachable on small screens.
- `ConsultationWorkspace.jsx` is ~6.9k lines; class conversion must be mechanical
  and reviewed by diff, not rewritten.
- Geiza is not shipped; type metrics are Public Sans until it is added.
