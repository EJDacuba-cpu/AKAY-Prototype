# Task 1 Report — Frontend prescription contract utilities

Status: **DONE**
Commits: none (forbidden)
Files created only:

- `frontend/src/utils/rhuPrescriptions.js`
- `frontend/src/utils/rhuPrescriptions.test.js`

No existing TB, Form 4B, or referral files were modified. No migration was run.

## TDD evidence

### RED 1 — module missing

Command: `node --test frontend/src/utils/rhuPrescriptions.test.js`  
Working directory: `AKAY-Prototype`  
Result: FAIL before any assertion.

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'...\frontend\src\utils\rhuPrescriptions.js'
imported from ...\frontend\src\utils\rhuPrescriptions.test.js
tests 1 / pass 0 / fail 1
```

Failure reason: the production module did not exist. The test file imported `createPrescriptionId`, `emptyPrescription`, `normalizePrescriptions`, `prescriptionsForSave`, `prescriptionErrors`, `reconcilePrescriptionsForDiagnosisRemoval`, `formatPrescriptionLine`, `prescriptionsForDiagnosis`, and `visitPrescriptionStatus`.

### GREEN 1

Same command after implementing `rhuPrescriptions.js`: **13 passed, 0 failed**.

### RED 2 — self-review, no silent drop past the cap

A follow-up test required `normalizePrescriptions` to keep all 51 orders and all 21 diagnosis links, while `prescriptionErrors` still reports the spec maximum. It failed on the implementation that sliced to 50:

```
AssertionError: Expected values to be strictly equal:
50 !== 51
test: normalize keeps every order, including past the 50-order maximum
tests 14 / pass 13 / fail 1
```

The slice was removed. Diagnosis-link truncation was removed with it. The maximum stays a field error (`prescriptions`), not a discard.

### GREEN 2

```
node --test frontend/src/utils/rhuPrescriptions.test.js
tests 14 / pass 14 / fail 0 / duration_ms 151.4911
```

ESLint: `npx eslint src/utils/rhuPrescriptions.js src/utils/rhuPrescriptions.test.js` from `frontend` — exit 0.

## What the utilities do

| Function | Behavior |
|---|---|
| `createPrescriptionId()` | `crypto.randomUUID()`, with the same fallback shape as `createDiagnosisId` (`rx-…`) |
| `emptyPrescription(partial)` | Full order. `source` defaults to `itr`. `authorizedQuantity` stays `null` unless that field is a whole number ≥ 1 |
| `normalizePrescriptions(list)` | Canonical orders. Stable ids. Duplicate diagnosis ids collapsed. Incomplete orders kept. Non-objects skipped. Unknown `source` becomes `itr`. No `tbCaseId` invented from a diagnosis name |
| `prescriptionsForSave(list)` | Save payload. Omits `authorization`. Omits quantity/unit unless a valid quantity or an explicit unit is present |
| `prescriptionErrors(list, diagnoses)` | Map keyed `prescriptions.{id}.{field}` (index if id is blank). Required clinical fields, visit diagnosis ids, quantity/unit pair, `tb_form4b_ref` requires `tbCaseId`, max 50 on key `prescriptions` |
| `reconcilePrescriptionsForDiagnosisRemoval(prescriptions, diagnosisId)` | Sole link: `{ blocked: true, error, prescriptions }` and the order is unchanged. Shared link: not blocked; that id is removed and every order remains. A blocked sibling prevents partial relink |
| `formatPrescriptionLine(rx)` | `Name strength · dose · route · frequency · duration · instructions · {qty unit}`. Quantity segment only when authorized |
| `prescriptionsForDiagnosis(list, diagnosisId)` | Orders whose `diagnosisIds` include that id |
| `visitPrescriptionStatus(orders, releases)` | `{ status, orders: [{ id, status, releasedQuantity, remaining }] }` |

Visit and per-order labels: `Pending`, `Partially Dispensed`, `Dispensed`, `Unavailable`.

- Authorized quantity set: remaining is `authorized − released` (floor 0). Released sum ≥ authorized → Dispensed. Partial sum → Partially Dispensed.
- Authorized quantity omitted: first positive release → Dispensed, and `remaining` is `null` (no computed remaining).
- Unavailable releases (`status: "unavailable"` or `unavailable: true`) add 0 to the released sum, even if a quantity is present.
- Release rows match `prescriptionId` or `prescription_id`. Quantity may be `quantity` or `qty`.
- Roll-up: all pending → Pending; all dispensed → Dispensed; all unavailable → Unavailable; any mix → Partially Dispensed.

## Behaviors covered by tests

- UUID format, uniqueness, and id stability through `normalizePrescriptions`
- One order linked to two diagnoses (duplicate ids in the array collapse; the order is not split)
- Required fields and unknown diagnosis ids
- Quantity without unit, unit without quantity, zero, and prose `"30 tablets"` rejected
- Instructions such as "Dispense 21 capsules" do not create `authorizedQuantity`
- Digit string `"30"` plus unit is an explicit quantity and is saved
- Sole-diagnosis removal blocks and keeps the order
- Multi-diagnosis removal relinks to the remaining id and keeps other orders
- A blocked removal does not relink a different order in the same list
- Incomplete orders are kept
- Lists over 50 are kept; `prescriptionErrors(...).prescriptions` is set
- `tb_form4b_ref` without `tbCaseId` errors; a real case id is saved; a guessed source does not become a TB reference
- Client `authorization` is not written by `prescriptionsForSave`
- Non-arrays become empty results
- Fulfillment roll-up cases above, including unavailable quantity not counting as dispensed

## Self-review

- Matches the spec contract: visit-level orders, multi-diagnosis single order, no free-text quantity guessing, diagnosis removal does not drop the order, Form 4B source is a reference plus case id, authorization stays server-side.
- `createPrescriptionId` mirrors `frontend/src/utils/diagnoses.js` `createDiagnosisId`.
- Field-path keys match the brief (`prescriptions.{id}.{field}`).
- No other workspace files were edited.

## Concerns

None blocking.

Contract notes for later tasks:

1. Error sentences are not specified in the plan. They follow the nearby RHU validators (for example "Enter the medicine name.", "Enter the unit for the authorized quantity.").
2. `visitPrescriptionStatus` returns an object, not a string, so the visit roll-up and per-order status travel together. Labels are the spec words, not the Task 6 queue slugs (`pending|partial|dispensed|unavailable|given`). Map those at the queue boundary.
3. Call `prescriptionErrors` on the raw list. `normalizePrescriptions` / `emptyPrescription` coerce an unknown `source` to `itr` and turn an invalid quantity into `null`. `prescriptionsForSave` then omits that quantity instead of storing prose.
4. Clinical strings are clipped on normalize (medicine name 255, strength/dose/frequency 100, route/unit 50, instructions 2000, ids 64). Over-length is reported only when `prescriptionErrors` sees the raw value.
5. More than 50 orders are retained so nothing disappears; finalize must still block on `errors.prescriptions`.

## Review fix — invalid quantity and illegal source stay visible

`canonical` (`emptyPrescription` / `normalizePrescriptions`) no longer hides values `prescriptionErrors` must reject.

- Missing or `""` `source` still defaults to `itr`. An explicit source outside `{itr, tb_form4b_ref}` is kept as given (for example `guessed-from-name`).
- A present invalid `authorizedQuantity` is kept (`0`, `"30 tablets"`, and any other present non-integer). Omitted quantity is still `null`. A valid digit string still becomes an integer.
- `prescriptionsForSave`, `formatPrescriptionLine`, and `visitPrescriptionStatus` still treat only a whole number ≥ 1 as authorized, so invalid quantity is not stored, printed as authorized, or used for remaining quantity.
- The older assertion that `source: "guessed-from-name"` becomes `itr` now expects the raw source. `tbCaseId` is still not invented, and the source does not become `tb_form4b_ref`.

New test: `normalize keeps invalid quantity and illegal source visible to prescriptionErrors`.

- `prescriptionErrors(normalizePrescriptions([{ authorizedQuantity: 0, authorizedUnit: "" }]), diagnoses)` reports `authorizedQuantity`.
- `prescriptionErrors(normalizePrescriptions([{ source: "guessed-from-name" }]), diagnoses)` reports `source`.

This supersedes concern 3 above. Callers may validate `normalizePrescriptions(...)` results. An illegal source is also left on the save payload, so finalize must still block when `prescriptionErrors` is non-empty.

```
node --test frontend/src/utils/rhuPrescriptions.test.js
Working directory: AKAY-Prototype
tests 15 / pass 15 / fail 0 / duration_ms 82.434
```
