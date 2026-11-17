# Print Prescription after consultation

Implemented on `Eric-Manually-Fixer`. Existing account/license and prescription-editor changes were preserved; no account creation fields, draft validation, or dispensing logic were changed for this feature.

## Behavior and data

- The existing Health Record Saved modal retains its title, message, icon and button styles. Its optional inline-actions layout gives Back to Queue | Print Prescription | View Health Record on desktop and stacked buttons on small screens. The primary button remains View Health Record. Without saved prescriptions the original two actions remain.
- Availability comes from the finalized POST response, never form state. Opening the preview performs GET `/health-records/{id}` again. Loading and failures use existing toast notifications.
- The preview uses ModalShell, ModalFooter, ModalButton and usePrintDocument. Close returns to the completion interface. Saved RHU record details also expose reprinting.
- Only `monitoring_data.prescriptions` for this finalized record is used, in stored order. Standard/custom values remain verbatim; incomplete entries and unresolved Other markers block printing. Empty instructions are omitted.
- The server stores `prcLicenseNumber` in its existing physician attestation. Detail GET returns `prescription_prescriber` from the attested physician ID. Historical names/licenses use snapshots where available; older missing license snapshots fall back only to that identified account. No current-user or creator substitution occurs. Records lacking a verifiable prescriber cannot print.
- Patient data comes from the detail response. Address combines the stored street, purok, barangay, municipality and province when present. Age is calculated at the consultation date from birth date. Missing required demographics or PRC information blocks printing with an explanatory error.
- Browser printing clones only the prescription into AKAY's existing isolated print frame. A4 portrait, white background, standard print margins, medicine/signature page-break avoidance, a blank signature area and Generated through AKAY footer are provided. No PDF library was added.
- Preview/reprint performs only a GET. There are no draft, order, dispensing, inventory, quantity or completion mutations. New finalizations additionally snapshot the doctor's existing license in prescription metadata.

## Files touched for this feature

- `backend/app/Http/Controllers/Api/HealthRecordController.php`
- `backend/app/Services/PrescriptionClinicalAuthority.php`
- `backend/tests/Unit/Services/PrescriptionClinicalAuthorityTest.php`
- `frontend/src/components/common/modals/SuccessModal.jsx` (optional inline-actions layout)
- `frontend/src/components/features/health-records/PrescriptionPreviewModal.jsx` (new)
- `frontend/src/components/features/health-records/prescription-document.css` (new)
- `frontend/src/pages/rhu/RhuConsultationWorkspace.jsx`
- `frontend/src/pages/rhu/RHURecordDetails.jsx`
- `frontend/src/utils/prescriptionPrint.js` (new)
- `frontend/src/utils/prescriptionPrint.test.js` (new)
- `docs/2026-11-17-print-prescription.md` (this report)

## Validation

- Production Vite build passes; bundle-size warning remains.
- Focused frontend consultation/prescription tests: 40 passed. Additional print-utility/record-detail tests: 7 passed (includes two overlapping prescription tests).
- PrescriptionClinicalAuthorityTest: 15 passed, 135 assertions, including snapshot preservation, legacy lookup, draft exclusion, GET prescriber output and unchanged stored record after GET.
- Full backend run: 1,865 tests; 1,816 passed, 23 failed, 26 skipped; runner also reports one risky test. Failures cover account permissions/PRC fixtures, historical laboratory access, body-finding reassessment, deployment preflight, medicine-create idempotency, registration/household rules, Manage-to-BHC validation, TB access/lifecycle and CSP expectations. None is in PrescriptionClinicalAuthorityTest. These broader failures remain unresolved; a clean baseline run was not performed, so they are not certified pre-existing.
- Full frontend test run: 2,209 tests; 2,202 passed, 7 failed. Failures: LaboratoryEvidence (historical prenatal result), RhuToDispenseLoading (empty queue), clinicalConsultationLease (occupancy), and four consultationRoute expectations. These failures are outside the new print implementation; they were not repaired as part of this task.
- Targeted ESLint: no errors; six existing hook dependency warnings in RhuConsultationWorkspace. `git diff --check` passes.

Manual browser verification remains: finalize with/without medicines; click both existing navigation buttons; check mobile three-button layout and focus return; review multiple/custom medication entries; close/reopen preview; exercise loading/API errors and missing PRC/patient data; inspect A4 print preview for long multi-page prescriptions, signature placement and absence of dashboard controls; cancel/print and confirm inventory, dispensing and draft state stay unchanged. No authenticated browser or physical printer verification was performed.

## Philippine clinical-use review

This implements the requested minimal template; it is **not certified ready for clinical use**. The FDA-hosted Philippine National Drug Formulary lists prescriber office address and professional tax receipt information in addition to patient and professional registration details. The requested template excludes those additional fields. RA 9502 requires generic terminology in prescribing; this feature faithfully prints the doctor's saved medicine name and does not establish that it is generic. Controlled drugs have additional S-2 and special prescription requirements which this generic A4 document does not implement. The MHO's responsible clinician/pharmacist must confirm applicable current requirements and resolve those gaps before clinical rollout.

Sources checked November 17, 2026:

- [FDA Philippine National Drug Formulary](https://www.fda.gov.ph/wp-content/uploads/2021/03/PNDF-2008.pdf)
- [Republic Act 9502](https://lawphil.net/statutes/repacts/ra2008/ra_9502_2008.html)
- [DOH AO 2012-0002, controlled prescription pads](https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/10/50688)

Historical limitation: records predating structured prescriptions/physician attestations are not reconstructed from free text or guessed prescribers. Patient demographics use the existing current profile relation; this feature does not add historical patient snapshots.
