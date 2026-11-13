# AKAY Reports Rework Design

**Status:** Approved for implementation (user brief 2026-11-13)  
**Branch:** `Eric-Manually-Fixer` @ `a591ca9`  
**Constraint:** No commit / push / merge / deploy in this pass.

## Goal

Unify BHC and RHU Reports navigation into four sidebar children (Referrals, Overview, TCL, Morbidity), add in-page Filter popovers for TCL programs and Morbidity destinations, keep Clinic Ledger report layout, enable RHU `diagnoses[].reportIn` checkboxes, and preserve clinical data.

## Navigation

Sidebar (BHC and RHU), exact order:

1. Referrals  
2. Overview  
3. TCL  
4. Morbidity  

Notifiable Diseases and Community Surveillance are **not** sidebar entries; they are Morbidity filter options. EPI / Maternal / Nutrition / Family Planning are **not** sidebar entries; they are TCL filter options.

### URL aliases (engines preserved)

| Legacy `?type=` | Resolves to |
|---|---|
| `referrals`, `referral-reports` | Referrals |
| `overview`, `all`, `all-categories`, bare `/bhc/reports` | Overview |
| `tcl`, `epi`, `maternal`, `family-planning`, `nutrition`, and program aliases | TCL (program from alias when present) |
| `morbidity`, `notifiable`, `surveillance`, and disease aliases | Morbidity (destination from alias when present) |
| RHU `patient-visits` | Overview (safe alias; visits metrics remain inside Overview engine) |

Report engines (`buildBhcReport` / `buildRhuReport` category keys) stay intact. Pages map nav + filter → existing category key.

## Filters

Reuse `ListFilterPopover` pattern (draft → Apply commits; dismiss without Apply keeps last commit; Reset restores defaults).

**Morbidity:** All Morbidity (default) | Notifiable Diseases | Community Surveillance  

**TCL:** EPI / Immunization (default) | Maternal Care | Nutrition | Family Planning  

## Layout

Match Clinic Ledger + existing EPI-style grid: header + compact controls; 4 KPI cards; primary chart 2/3 + secondary 1/3; full-width summary; full-width table/TCL. Responsive stack on tablet/phone.

## RHU reporting checkboxes

Under each RHU Consultation diagnosis: independent optional Morbidity / Notifiable Diseases / Community Surveillance checkboxes via canonical `reportIn`. Allow `diagnoses.*.reportIn` on RHU ITR only (same destination validation as BHC v2). Draft allowlist already supports `reportIn`. Do not change next-action, TB, Rx, dispense, follow-up, or referral behavior.

## Reporting ownership / linkage

- BHC local counts: BHC `reportIn` + actual clinical status.  
- RHU counts: RHU facility records + RHU `reportIn` + RHU clinical status.  
- RHU→BHC: only via existing referral / verified patient-linkage; never copy RHU health records onto BHC; never rewrite BHC checkboxes; dedupe linked disease episodes; facility isolation.

### Known architectural risk

BHC report pages load only BHC-scoped health records. RHU-confirmed diagnoses live on RHU-owned records. Referral feedback exposes confirmation names for Referrals KPIs, not a full authorized cross-facility morbidity feed with status + `reportIn` + episode keys. If safe reconciliation cannot be completed without inventing classification or a new data path, document the exact blocker and leave counts correct for local data only.

## Out of scope

Redesign of Referrals/Overview metrics, TCL program rules/forms, unrelated consultation workflows, destructive migrations, commits/deploys.
