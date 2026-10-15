---
version: 1
slug: "frontend-src-pages-bhc-patientdetails-jsx"
primary_target: "frontend/src/pages/bhc/PatientDetails.jsx"
related_targets: ["frontend/src/index.css","frontend/src/components/layout/DashboardLayout.jsx"]
---

# Patient Profile (BHC) — pilot of the "Calm Clinical Workspace" world

## Scope

Pilot surface for the app-wide visual replacement. Mode: Operate. Build path: code-led (Operate surface; no image generation).
In scope: global tokens (`frontend/src/index.css`), app shell (sidebar, top bar, breadcrumbs, working-facility select), and the BHC patient profile (`PatientDetails.jsx` and `components/features/patients/profile/*`). Other screens change only through the tokens.

## Audience and task

BHC staff (BHW, midwife, nurse) open a patient to read the latest vitals, conditions, findings, allergies, medications, background, referrals, follow-ups, and programs, then start a consultation. Desktop or laptop at the health center, often a short window (about 600px tall), sometimes a weak connection.

## Constraints

No behavior, data, route, permission, or API changes. Records stay read-only. Locked sections stay visible placeholders. No clinical suggestions. English UI.

## Direction contract

THESIS: A patient chart that reads like a modern clinical SaaS workspace, calm, roomy, and precise, with the BHC to RHU care path as its one visual signature. It refuses the flat red-ruled ledger and the generic dashboard of same-size icon cards.

OWN-WORLD: Tinted cool-gray shell (sidebar and frame share one soft gray) holding a white, 12px-rounded content canvas. Cards are white, 1px soft border, faint offset shadow, 12px radius; controls are 8px. Navy-ink (#1b2433-ish) carries primary actions and active text; brand red appears only in the logo, the active-nav icon, and true danger. Status in green, amber, blue pills. Inter throughout, tabular numerals, sentence-case semibold section titles.

STORY: The worker sees who the patient is and where they are in care, scans vitals and the clinical summary, and starts a consultation without hunting.

FIRST VIEWPORT: Shell left (tinted rail, active item a white pill with a red icon), slim top bar with breadcrumbs and facility. Canvas: patient header card (avatar initials, name, ID/age/sex/barangay as quiet meta, Care Path line, navy Start consultation on the right), underline tabs, then the three-column overview board as separate rounded cards.

FORM: Pinned by the user (clinical SaaS x modern productivity; canon played straight at full craft). No concept-seed roll. Signature move: Care Path — a three-stop line (BHC detected, RHU confirmed, BHC monitoring) drawn from real referral and condition data.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Care Path data source per patient (referrals + RHU-confirmed conditions); show only what the data supports, never inferred.
- Roll-out of the world to other screens after the pilot is approved.
