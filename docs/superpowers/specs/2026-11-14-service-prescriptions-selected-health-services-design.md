# Service Prescriptions under Selected Health Services

Status: **approved** (2026-11-14). Approach 1 — same visit-level `prescriptions[]` with optional `serviceKeys`, one fixed Prescriptions block under Selected Health Services so orders continue to To Dispense.

## Intent

Add the exact RHU structured Prescription fields (Medicine Name, Strength, Dose, Route, Frequency, Duration, Instructions, Authorized Quantity/Unit; Add / Save / Cancel) as **one fixed block** under Selected Health Services (Maternal Care / EPI / Family Planning / Nutrition). Orders use the same visit-level `prescriptions` array as diagnosis cards so drafts autosave and finalized records reach **To Dispense**.

## Locked decisions

1. Reuse `RhuPrescriptionsSection` and visit-level `payload.prescriptions` / `monitoring_data.prescriptions`.
2. Add optional `serviceKeys: string[]` (care-plan program keys). An order is valid when it has **at least one** of `diagnosisIds` or `serviceKeys`.
3. One fixed Prescriptions UI after the per-service next-action list (not one block per service).
4. Show the block when at least one care-plan service is selected.
5. Editor ownership uses sentinel `ownerDiagnosisId === "services"` so only one editor is open visit-wide (shared with diagnosis cards).
6. No separate nested `carePlan.servicePrescriptions` list.

## Data contract

Existing prescription fields unchanged. Additive:

| Field | Rule |
|---|---|
| `serviceKeys` | Optional array of care-plan keys (`Maternal`, `EPI`, `Family Planning`, `Nutrition`), max 20, distinct. Drafts allow incomplete rows. Finalize: required link = non-empty `diagnosisIds` **or** non-empty `serviceKeys`. |

Draft schema and finalize payload must allowlist `serviceKeys`. Clinical authority hash/persistence includes `serviceKeys`.

## UI

- Host: `NextStepsSection` Selected Health Services section (RHU wires props via `RhuDiagnosisCarePlanSection`).
- Copy: “Record the medicines for selected health services.”
- New orders from this block get `serviceKeys` = currently selected care-plan programs; `diagnosisIds` may be empty.
- Diagnosis cards still filter by `diagnosisIds` only; service-linked-only orders appear under Selected Health Services.

## Out of scope

- BHC structured prescriptions / To Dispense for BHC
- Per-service separate prescription editors
- Changing dispense queue UI (already ignores `diagnosisIds`)
