# Persistent Body Findings implementation report

Completed in the working tree on 2026-10-28. No migration, deployment, or commit performed.

## Diagnosis and implementation

Existing body findings were visit-local. Storage, validation, draft recovery, one marker per side/region, immutable official records, pagination, and the finalization transaction already existed. Overview selected only the latest visit, so an empty later visit hid earlier observations.

The implementation reuses those paths. Original body_findings remain unchanged. Explicit reassessment events are appended to the new consultation's monitoring_data.bodyFindingReassessments. The finding identity is the original record ID and its immutable array position, including missing/duplicate legacy UUIDs. Location and text never identify or merge observations.

- Legacy and untouched findings default to Not Yet Reassessed, never confirmed conditions.
- Each consultation starts with no reassessment choices; a previous Still Present remains labeled as the last documented status.
- Staff can select Still Present or No Longer Present, reset to Not Yet Reassessed, and add independent new findings.
- Existing area markers count both previous and new findings. Front/back remain distinct.
- Pending choices travel through existing server drafts and frontend draft snapshots. They do not update Overview.
- Successful finalization alone appends canonical server snapshots, inside the existing database transaction. Failed finalization rolls back, keeps the draft, and leaves original records unchanged.
- Laravel checks the patient, facility-scoped source, original array position, duplicate references, valid statuses, and expected revision. Patient locking serializes reassessments; stale or already closed findings are rejected inline.
- No Longer Present removes an observation from the ongoing projection. Original records and linked reassessment visits remain visible in Health Record Details.
- Body findings never update confirmed diagnoses, reporting classifications, or follow-up tasks.

Laravel owns validation, authorization and transactional persistence. TanStack Query owns loading and cache refresh. No new PostgreSQL stored procedure is needed because this behavior fits the existing Laravel finalization transaction and existing JSON columns.

## Review findings addressed

1. Referred BHC patients may have no patient-level RHU assignment. Patient-filtered history and read-only record detail now reuse the existing PatientDetail record scope; unrelated record lists and mutation authorization remain unchanged. Tests prove that an unlinked BHC record stays inaccessible.
2. RHU record details previously searched only the first page of the global record list. They now fetch the requested authorized record directly, allowing older history links to work.
3. Keyed objects and malformed reassessment entries are rejected with validation errors rather than server errors.
4. Raw historical metadata cannot replace an immutable source position. Invalid legacy entries are filtered without shifting valid source indices.
5. RHU Body Preview now receives its existing assessment lock, patient figure attributes, and front/back control so reassessment cannot bypass the form lock and posterior findings are reachable.

## Files changed

| File | Purpose |
| --- | --- |
| backend/app/Services/BodyFindingReassessments.php | Shared event rules, source snapshots, authorization scope and stale revision validation. |
| backend/app/Http/Controllers/Api/HealthRecordController.php | Transaction integration and consistent read-only patient history scope. |
| backend/app/Http/Requests/HealthRecordRequest.php | Official reassessment validation. |
| backend/app/Services/HealthRecordDraftPayloadService.php | Backward-compatible draft allowlist and validation. |
| backend/tests/Feature/BodyFindingReassessmentTest.php | Eight persistence, security, draft, replay and rollback tests. |
| backend/tests/Feature/RhuItrConsultationTest.php | Referred-patient reassessment and source isolation regression. |
| frontend/src/utils/bodyFindings.js | Stable normalization of original finding positions. |
| frontend/src/utils/bodyFindingsSummary.js | Ongoing/history projection and independent pending choices. |
| frontend/src/utils/bodyFindingReassessment.test.js | Eight legacy identity and reassessment behavior tests. |
| frontend/src/services/healthRecordService.js | Normalize history and serialize decisions through the existing save API. |
| frontend/src/utils/consultationSteps.js | Route server reassessment errors to Physical Examination. |
| frontend/src/components/features/health-records/BodyFindingReassessment.jsx | Shared shadcn/ui choices, inline recovery, and record history. |
| frontend/src/components/features/health-records/BodyFindingReassessment.test.js | Six rendering, marker, history, pagination and payload tests. |
| frontend/src/components/features/health-records/wizard/BodyPreviewPanel.jsx | Reuse existing grouped markers/dialog for previous and new findings. |
| frontend/src/components/features/patients/BodyFigureSvg.jsx | Show documented status in Overview popovers. |
| frontend/src/components/features/patients/profile/AnatomyFindingsPanel.jsx | Use ongoing observations and explain historical uncertainty. |
| frontend/src/pages/bhc/ConsultationWorkspace.jsx | Existing BHC draft, review, finalization, errors and cache integration. |
| frontend/src/pages/rhu/RhuConsultationWorkspace.jsx | Equivalent RHU integration, locked controls and front/back support. |
| frontend/src/pages/bhc/HealthRecordDetails.jsx | Accessible original and reassessment history. |
| frontend/src/pages/rhu/RHURecordDetails.jsx | History section and direct record lookup. |
| docs/superpowers/plans/2026-10-27-body-finding-reassessment.md | Implementation decisions and checklist. |
| docs/body-finding-reassessment-implementation.md | This report. |

The existing .claude/settings.local.json was left untouched.

## Verification

- Backend: 181 tests passed, 972 assertions. Included BodyFindingReassessmentTest, HealthRecordDraftTest, HealthRecordDraftFinalizationTest, HealthRecordIdempotencyTest, BhcGeneralConsultationV2Test, RhuItrConsultationTest, and FacilityIsolationSecurityTest.
- Frontend: 190 focused tests passed across body findings/geometry, consultation steps/identity/workflow, follow-up schedules, diagnosis reporting, component rendering, and record details.
- After final UI adjustments: all 14 reassessment/component tests passed again.
- Focused ESLint: passed for both new test files, the new shared component, and modified body-finding utilities.
- Final Vite production build: passed. Existing large-bundle warning remains.
- Independent review: two important RHU integration findings were corrected and covered by focused regression tests.
- No live browser surface was available, so desktop/mobile visual and click-through verification remains outstanding. Component rendering was verified through React server rendering, not a browser.
- SQLite tests verify transaction rollback and stale-version behavior. Live PostgreSQL concurrent-request testing remains outstanding.

## Remaining limitations

- Separate legacy entries may describe the same real-world observation. They intentionally remain independent; historical absence never implies resolution.
- Only records allowed by existing patient/facility authorization participate in the displayed history. Findings are not a global diagnosis or condition registry.
- Invalid legacy entries with unknown regions or blank findings remain in their original records but are not plotted.
- Up to 500 explicit reassessment choices can be saved per consultation; the existing limit of 50 new findings is unchanged. Existing total draft-payload limits also apply.
- Reopening a finding after No Longer Present is not added. A new observation can be recorded in a later consultation.
- Reassessment history is added to on-screen Health Record Details. The BHC print document remains unchanged.
- The C: drive reported zero free bytes during the last command-runner attempt. Final frontend checks completed through the available Node runtime without deleting files. Disk space still needs attention for normal tooling.
