# Task 2 Report — Doctor UI prescriptions on diagnosis cards

Status: **DONE**
Commits: none (forbidden)

## Files

- Created: `frontend/src/components/features/health-records/wizard/RhuPrescriptionsSection.jsx`
- Modified: `frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.jsx`
- Modified: `frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.test.js`
- Modified: `frontend/src/pages/rhu/RhuConsultationWorkspace.test.js`

`RhuConsultationWorkspace.jsx` was not edited. TB assessment, Form 4B registration intent, referral walk-in Next Action, and `data-field` wiring in the diagnosis section were left as they were. `prescriptionText` is still passed into TB case registration.

## TDD evidence

### RED

Command (cwd `frontend`):

`node --test src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.test.js src/pages/rhu/RhuConsultationWorkspace.test.js`

Result: **7 failed, 17 passed**.

Failures were the missing feature:

- Rendered care plan had no `Add Prescription`. It still rendered `name="prescriptionText"` and the label `Prescription`.
- No `Prescriptions` block after Supporting Laboratory Tests, so a Losartan order was not filtered onto the linked cards.
- Add / Edit buttons were absent.
- Removing Hypertension while it was the only link on Losartan still called remove (`['htn']`).
- Removing one of two linked diagnoses did not return a relinked order.
- Care-plan source had no `RhuPrescriptionsSection` or `reconcilePrescriptionsForDiagnosisRemoval`.

Existing TB, referral, and workspace tests that were not about the free-text prescription field stayed green.

### GREEN

Same command after the UI:

```
tests 24
pass 24
fail 0
duration_ms 2021.5961
```

ESLint: `npx eslint` on the four frontend files above — exit 0.

## What the UI does

Each diagnosis card renders a compact Prescriptions fieldset immediately after Supporting Laboratory Tests. It uses the same border, legend size, and compact buttons as that picker. There is no new color, badge, or banner.

- The list is visit-level `prescriptions`, filtered with `prescriptionsForDiagnosis`.
- One order linked to two diagnoses is one row on each card.
- Add / Edit opens an inline form: Linked Diagnosis (multi-select), Medicine Name, Strength, Dose, Route, Frequency, Duration, Instructions, Authorized Quantity, Authorized Unit.
- Save runs `emptyPrescription` and `prescriptionErrors`. Field errors stay beside the controls and the order is not written.
- A closed row shows parent errors such as `prescriptions.{id}.medicineName`.
- `source: tb_form4b_ref` is listed and can be removed. Its medicine fields are not edited here.
- The standalone `label="Prescription"` textarea is gone. Actions Taken / Treatment remains.

Diagnosis remove calls `reconcilePrescriptionsForDiagnosisRemoval`:

- Sole link: removal is blocked and the helper error is shown on the card (`Remove or relink Losartan before removing this diagnosis.`). The order stays until the physician removes it or links another diagnosis.
- Shared link: that diagnosis id is dropped and the order remains on the other diagnosis. Then the card is removed.

## Concerns for Task 3

- The section is controlled. It defaults `prescriptions` to `[]`. The live consult does not pass `prescriptions` / `onPrescriptionsChange` yet, so Add Prescription will not stick in the running workspace, and diagnosis removal will not see orders, until Task 3 holds that state.
- Draft autosave, review rows, and finalize still use `prescriptionText` only. Finalize does not yet call `prescriptionErrors`. Blocking diagnosis removal is in the section; blocking finalize when an order points at a missing diagnosis is Task 3.
- `prescriptionText` remains in the workspace for legacy restore and for seeding Form 4B. New consults no longer edit it.

## Important finding — one prescription editor per visit

Status: **FIXED**. Not committed.

Each diagnosis card kept its own draft. A shared order could be open on two cards at once, so the second Save replaced the first, and Save after Remove on the other card appended the order again.

`RhuDiagnosisCarePlanSection` now holds one `prescriptionEditor` (`draft`, `mode` `add`|`edit`, `ownerDiagnosisId`, `localErrors`) and passes it to every `RhuPrescriptionsSection`.

- Edit or Add on one card replaces that editor, so the other card closes. The form renders only on the owning card.
- Remove of the open order clears the editor. An edit whose id is no longer in the latest `prescriptions` list is cancelled in `commitPrescriptionDraft` and is not appended. A real edit replaces that id in the latest list and leaves every other order as it is.
- Add is disabled once the visit has 50 prescriptions.
- TB assessment, Form 4B registration intent, referral walk-in Next Action, and `prescriptionText` were not changed.

### RED

Command (cwd `frontend`), before the editor was lifted:

`node --test src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.test.js`

```
tests 14
pass 10
fail 4
```

The four new tests failed for the finding:

- Edit on Hypertension and Diabetes left two `Save Prescription` controls.
- Add on the other card left the first editor open.
- Save after Remove on the other card put `rx-losartan` back.
- Add stayed enabled when the visit already had 50 prescriptions.

Existing TB, referral, and prescription tests in that file stayed green.

### GREEN

`node --test src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.test.js src/pages/rhu/RhuConsultationWorkspace.test.js`

```
tests 29
pass 29
fail 0
duration_ms 1916.555
```

Also run, before the final merge assertion was added (those util files were not edited): `rhuCarePlan.test.js`, `carePlan.test.js`, `carePlanWorkspace.test.js`, `recordCarePlan.test.js`, together with the care-plan section and workspace tests — 96 pass, 0 fail. The merge assertion is included in the 29 above.

ESLint: `npx eslint` on `RhuPrescriptionsSection.jsx`, `RhuDiagnosisCarePlanSection.jsx`, and `RhuDiagnosisCarePlanSection.test.js` — exit 0.
