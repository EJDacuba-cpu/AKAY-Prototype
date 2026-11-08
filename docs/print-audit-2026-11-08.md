# AKAY print audit — 8 November 2026

The audit found **13 existing visible actions**, including the three Export PDF actions that use browser printing, and **two receiving `?print=1` routes**. No additional Print controls were added. Backend authorization, report counting functions, normal screen layouts, clinical submission/dispensing behavior, dependencies, and database schema were not changed. The workspace was clean when the audit began.

## Action checklist

“Passed” means the existing control was exercised against synthetic data in the actual page/component, its prepared document was checked at the print boundary, and the applicable document template was rendered to PDF. Interactive printer selection and physical printer output are outside this verification.

| ID | Existing action / location | Status and coverage |
|---|---|---|
| P01 | Admin Reports → Print | Passed; current account snapshot and applied role/status filters |
| P02 | Admin Reports → Export PDF | Passed; same document as P01 |
| P03 | BHC Reports → Print | Passed; all nine report categories |
| P04 | BHC Reports → Export PDF | Passed; same document as P03 |
| P05 | RHU Reports → Print | Passed; all ten report categories |
| P06 | RHU Reports → Export PDF | Passed; same document as P05 |
| P07 | BHC Health Record Details → Print | Passed; selected record and patient; optional fields and program sections |
| P08 | RHU Health Record Details → Print | Passed; selected record, current laboratory results, originals and addendum provenance |
| P09 | Consultation saved-result actions → Print Record | Passed with a seeded, in-memory saved-result modal; navigation invokes the real record route and auto-print handler. No consultation was saved to a backend. |
| P10 | BHC Referral Details → Print Referral Slip | Passed; selected referral, correct facilities, fresh authorized QR read; QR failure and retry |
| P11 | Create Referral → Referral sent modal → Print Slip | Passed through a fully mocked synthetic submission; printing itself performs no submission or update |
| P12 | Create Referral → legacy success screen → Print Slip | Passed with seeded synthetic success state. Current successful submissions populate `successReferral`, so this historical `submitted && !successReferral` branch has no current natural submission path. Tracking resolution supplies the persisted referral ID for printing. |
| P13 | RHU To Dispense → Review prescription → Print | Passed; selected patient, record, facility, visit date and prescription; no dispensing request |
| R01 | `/bhc/health-records/:recordId?print=1` | Passed; data-driven auto-print, one invocation, print parameter removed afterward |
| R02 | `/rhu/health-records/:recordId?print=1` | Passed; waits for laboratory data as well as record/patient/referral data |

General consultation, maternal/prenatal, family planning, EPI, and TB program sections retain their existing structures. The separate existing TB PDF download is not a Print action and was not modified.

## Permissions and report scope

| Surface | Existing authorization retained |
|---|---|
| Admin reports | Admin protected route and existing account analytics / access-summary APIs |
| BHC/RHU reports | Facility-role protected route and `reports.view`; existing facility-scoped patient, record, referral and visit APIs |
| Record details and saved-result print route | `clinical.history` / History module; existing record, patient and referral authorization |
| Referral creation success | Existing `referrals.submit` workflow; printing only reads the saved QR or resolves its tracking ID |
| Referral history | Existing History module and referral/QR management authorization |
| Prescription review | Existing Dispensing module / `items.dispense`; printing does not call the dispensing mutation |

The five staff duties (BHW, midwife, encoder, nurse and doctor) have no separate print-handler branches. Existing facility role and effective permissions continue to control entry. Route/module permission tests were run; real authenticated sessions for every duty/facility combination were not used.

Reviewed `App.jsx`, `accessModules.js`, `accessPolicy.js`, backend API routes, `FacilityAccessService` call sites in the record/patient/referral controllers, QR management authorization, laboratory read authorization, report source pagination, and the BHC/RHU/Admin reporting builders. No authorization was relaxed and no new data endpoint was introduced. Reports reuse the existing applied view and source lists, preserving reporting periods, age filters, facility scope, separate counting units, and enrollment/diagnosis/referral counting rules.

## Implementation

- The selected existing template is cloned into a temporary same-origin Blob document; the browser prints that document rather than the dashboard or modal shell. Blob frames are permitted by the existing CSP.
- The runner waits for stylesheet loading, image loading/decoding, and used fonts. Empty/disconnected, loading, failed, or changed sources cannot print. Print preparation has a bounded timeout.
- Referral preparation uses the existing authorized QR GET and, for the legacy success view, the existing tracking resolver. It never calls QR regeneration.
- A4 portrait, dark text, white paper, readable typography, wrapping and repeating table headings are isolated to the print document. Small fixed Admin sections remain together; long clinical narratives and tables can continue across pages.
- Failures display an explicit Retry printing action. Retries use current query state after batched query notifications have reached React. Completion/cancellation releases the temporary frame; the next app interaction also releases it on browsers that omit `afterprint`.
- Record printouts use saved facility identity, keep age zero, and do not replace missing medicine quantities with zero. RHU results include saved originals/addenda and attachment names. Supporting attachment file contents are not merged into the record printout.

## Changed files and reasons

All paths below are relative to the repository root.

| File | Why it changed |
|---|---|
| `frontend/src/utils/printDocument.js` | Shared isolated print runner, readiness checks, scoped print layout, cleanup, and actionable error/retry handling |
| `frontend/src/hooks/usePrintDocument.js` | Stable handlers with current query state, unmount protection and reliable refetch/retry ordering |
| `frontend/src/utils/referralPrinting.js` | Reuse authorized QR generation/rendering utilities for a complete selected referral print document |
| `frontend/src/pages/admin/AdminReports.jsx` | Wire Print/Export PDF to the selected article and block incomplete analytics/access summaries |
| `frontend/src/pages/bhc/BHCReports.jsx` | Wire Print/Export PDF, retain applied category/period/age view, and guard all report sources |
| `frontend/src/pages/rhu/RHUReports.jsx` | Same print-only changes for RHU, including visit sources |
| `frontend/src/pages/bhc/HealthRecordDetails.jsx` | Replace delay-based auto-print/manual print; retain supplemental request failures as print blockers |
| `frontend/src/pages/rhu/RHURecordDetails.jsx` | Same fixes plus reuse the authorized laboratory query for complete RHU output |
| `frontend/src/pages/bhc/ReferralDetails.jsx` | Route the existing print action through selected-slip preparation and loading/error checks |
| `frontend/src/pages/bhc/CreateReferral.jsx` | Repair both success Print Slip actions and null-guard the success-slip preview that previously crashed before success |
| `frontend/src/components/features/referrals/ReferralPrintSlip.jsx` | Identify the exact referral/QR slot, format saved names safely, and remove global receipt-size/visibility rules |
| `frontend/src/components/features/health-records/BhcHealthRecordPrintDocument.jsx` | Preserve program structures; correct facility/source identity; include laboratory provenance; improve readable pagination and missing-value handling |
| `frontend/src/components/features/medicine/RhuPrescriptionReviewModal.jsx` | Wire printing, validate the saved prescription, and use the actual facility instead of the staff display name |
| `frontend/src/components/features/medicine/RhuPrescriptionPrintSlip.jsx` | Include record identity and explicit missing-field labels |
| `frontend/src/components/features/medicine/rhu-prescription-print.css` | Remove global visibility/absolute-position rules that affected unrelated print documents |
| `frontend/src/utils/printDocument.test.js` | Regression coverage for unavailable/incomplete sources and failed/loading assets |
| `frontend/src/pages/bhc/ReferralDetails.test.js` | Update the old 80mm/global-style assertion for document-scoped A4 printing |
| `frontend/src/components/features/health-records/HealthRecordDetailsView.test.js` | Verify newborn age, original facility identity and laboratory addendum provenance |
| `frontend/tests/fixtures/print-preview.html` | Entry point for isolated synthetic browser verification |
| `frontend/tests/fixtures/print-preview.jsx` | Actual page/component harness with self-hosted Inter and entirely mocked API calls |
| `frontend/tests/print-browser.cjs` | Repeatable action, filter, readiness, retry, multi-page PDF and CSP checks using an existing browser runtime |
| `frontend/tests/print-production-server.mjs` | Build/serve the synthetic fixture under production CSP without Vite development scripts or a clinical backend |
| `docs/print-audit-2026-11-08.md` | Action inventory, file-by-file rationale, verification and limitations |

## Validation and evidence

- **157/157** relevant Node/SSR tests passed: print preparation, clinical templates, report builders/counting, pagination, access policy, dashboard access, referral selection/history, laboratory data and dispensing behavior.
- **27/27** browser scenarios passed in installed Microsoft Edge/Chromium. All 13 visible actions and both auto-print receiver routes were covered. The two post-save/historical states noted above were seeded only in memory.
- After the final spacing correction, **12/12 affected scenarios** passed again. The Admin and EPI samples each fit on one readable page; long BHC/RHU records still paginate cleanly with all 90 medicine entries preserved.
- All **19 BHC/RHU report categories** were compared with their selected printable source. Applied weekly/age filters and Admin role/status filters were exercised through the existing controls.
- Failure/recovery checks covered QR loading failure, missing document images, failed report sources, failed linked patient/laboratory requests, blocked native-print invocation, and omitted `afterprint` events.
- Native, unmodified `window.print()` dispatched `beforeprint` with complete documents/assets for all seven template/page families under production CSP. A second native invocation also succeeded after an omitted `afterprint` event.
- Browser-generated PDFs cover short records, long narratives, a 90-row medicine table, a 100-instruction prescription, missing optional fields, program forms, reports and QR slips. Text-boundary checks found no content outside page bounds; table headings repeat. Visual review found and corrected an EPI footer-only page and a split small Admin table.
- The final reviewed set contains **17 PDFs / 36 A4 pages**, with no empty pages or text outside page bounds.
- Targeted ESLint and `git diff --check` passed. The production build passed with its existing large-bundle warning; no packages were changed.

Synthetic evidence is written under `%TEMP%/akay-print-verification`; the final pagination confirmation is under `%TEMP%/akay-print-verification-confirm`. The latest version of each PDF and the result manifests are collected in `%TEMP%/akay-print-verification-final`. These are test documents with invented, explicitly synthetic identities, never clinical exports.

### Reproduction

From `frontend`, start the usual Vite server and run `node tests/print-production-server.mjs` separately. The latter serves only the synthetic build on `127.0.0.1:5176`, with build files in a new temporary directory.

Set `AKAY_PRINT_TEST_URL` to the Vite origin (the audit used `http://127.0.0.1:5175`), `AKAY_PLAYWRIGHT_MODULE` to an already-installed Playwright module, and `AKAY_BROWSER_EXECUTABLE` to an installed Chromium/Edge executable. Then run `node tests/print-browser.cjs`. `AKAY_PRINT_ONLY` optionally selects scenario names by regular expression; `AKAY_PRINT_OUTPUT` selects an output directory. No installation is required.

## Remaining verification limits

- This was synthetic browser/PDF verification, not a test against real clinical records or live authenticated accounts. Existing authorization paths were audited and relevant permission tests passed; live per-duty access remains unexercised.
- Headless Chromium exposes native print lifecycle events but not an interactive printer selection UI. Physical printer output, driver settings, and Firefox/Safari dialogs were not exercised.
- The legacy referral success branch and consultation saved-result modal were seeded as described above; their preceding real clinical submission workflows were not changed or exercised against a database.
- Browser/printer-added headers, footers, paper selection and scaling remain user-controlled. The application supplies A4 portrait defaults.

## Follow-up: Count column alignment

The reported RHU preview exposed a cascade mismatch: the shared `th` rule left-aligned Count while its values remained right-aligned, and fixed table layout gave Count an unnecessarily wide column. BHC and RHU printable summaries now use explicit 44% / 12% / 44% Indicator / Count / Notes widths, with the Count heading and values centered together. This styling applies only to the isolated report print templates.

The production fixture's BHC, RHU and Admin Print/Export PDF checks passed; browser assertions now verify the Count width and matching header/value alignment. All 34 targeted report/print tests and targeted ESLint checks passed. The regenerated RHU PDF was visually inspected. Follow-up artifacts: `%TEMP%/akay-count-alignment`.
