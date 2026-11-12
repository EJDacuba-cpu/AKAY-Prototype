# RHU Diagnosis-Linked Structured Prescription & Dispensing

Status: **approved with required corrections** (2026-11-11). Implementation may proceed from the companion plan. Do not execute migrations, commit, push, merge, or deploy unless the product owner explicitly requests it.

Supersedes structured-Rx rejection in `2026-10-30-rhu-prescription-dispense-desk-design.md` for **new** RHU ITR consultations. Preserves that desk’s split: doctor writes prescriptions; RHU staff dispense only after authorized finalization via Medicine and Supply → To Dispense. Preserves BHC consult dispensing and inventory ownership rules from `2026-10-30-rhu-health-commodities-design.md`.

## Intent

Replace the RHU ITR free-text Prescription textarea for new consultations with diagnosis-linked structured prescriptions. Physicians authorize those orders through a physician-gated clinical boundary. After authorization, RHU staff review orders in the existing To Dispense module, match RHU inventory, and Confirm Given. Only Confirm Given deducts RHU stock. Form 4B remains the canonical TB regimen source and must not be duplicated into ITR orders.

## Locked decisions

1. Approach 1: canonical `monitoring_data.prescriptions[]` plus a small additive relational dispensing-link migration (create file only; do not run without approval).
2. Preserve all uncommitted TB, Form 4B, referral, and consultation fixes on the working tree.
3. No BHC dispensing integration in this work.
4. No unnecessary UI redesign; keep AKAY Clinic Ledger patterns.
5. Until the migration is applied, keep historical dispensing behavior and **disable** unsupported structured per-prescription Confirm Given instead of silently falling back to incorrect fulfillment tracking.

## Current system (source of truth)

| Area | Today |
|---|---|
| Diagnoses | Stable entry `id` + `name` in draft/finalize; labs via `supportingLaboratoryTests[{reference}]` |
| Prescription | Visit-level `monitoring_data.prescriptionText` free text; not diagnosis-linked |
| Display / queue | `HealthRecord::prescriptionDisplayText()` prefers `prescriptionText`, else joins legacy `prescribedMedicines` |
| To Dispense | `RhuToDispenseController@index` — finalized RHU ITR, non-empty display text, status `pending`/`given` by dispensed count |
| Confirm Given | `HealthRecordController::dispenseMedicines` → `MedicineStockService::dispense`; one-shot abort if any `dispensedMedicines` exist |
| History row | `health_record_medicines` — no `prescription_id` |
| Form 4B | Separate `TbTreatmentCase.card_data.regimen`; physician gate via `TbClinicalAuthority` (RHU doctor + `conditions.confirm`) |

## Architecture

```
RHU Doctor (ITR)
  diagnoses[] + prescriptions[] (draft → finalize)
       │ physician authority attestation (server)
       ▼
Finalized HealthRecord.monitoring_data.prescriptions[]
       │
       ├─ Review / print (structured or legacy text)
       ▼
RHU To Dispense queue
       │ staff items.dispense + facility ownership
       ▼
Confirm Given (migration applied)
       │ atomic stock + prescription_id link + remaining qty
       ▼
health_record_medicines (+ inventory transactions)
```

TB Form 4B regimen is resolved through the registered `TbTreatmentCase` (including delayed registration). Dispense eligibility for TB uses that case reference; finalized ITR JSON is never mutated later to insert Form 4B rows.

## Data contract

### Canonical collection

`monitoring_data.prescriptions` — array, max 50. Visit-level (not nested exclusively under diagnoses). Diagnosis cards filter/display by `diagnosisIds`.

Each prescription object:

| Field | Rule |
|---|---|
| `id` | Required stable UUID string |
| `diagnosisIds` | Required non-empty array of diagnosis entry IDs (not names, not indices) |
| `medicineName` | Required string |
| `strength` | Required string |
| `dose` | Required string |
| `route` | Required string |
| `frequency` | Required string |
| `duration` | Required string |
| `instructions` | Optional string |
| `authorizedQuantity` | Required integer ≥ 1 when partial fulfillment / remaining quantity will be tracked for this order |
| `authorizedUnit` | Required string when `authorizedQuantity` is present |
| `source` | `itr` \| `tb_form4b_ref` |
| `tbCaseId` | Required when `source === tb_form4b_ref` (registered case id); never invent from diagnosis name |
| `authorization` | Written server-side on authorize/finalize: `{ physicianId, physicianName, ruralHealthUnitId, authorizedAt, prescriptionHash }` |

Rules:

- One medication for two diagnoses = **one** prescription with two `diagnosisIds`.
- Never auto-create prescriptions when a diagnosis is added.
- Never calculate authorized totals by parsing free-text dose/frequency/duration.
- If `authorizedQuantity` is omitted, staff may still release stock under existing manual verification rules, but the UI must **not** show a computed remaining quantity and partial-remaining tracking is unavailable for that order.
- Do not write new structured orders back into editable `prescriptionText`.
- Legacy `prescriptionText` remains for historical records and display fallback.

### Diagnosis removal reconciliation

Removing a diagnosis that is still referenced by a prescription must not silently drop the order.

- Block removal or block finalize with a field error until the physician relinks or explicitly removes the prescription.
- Historical finalized records are never rewritten to delete prescriptions.

### Draft recovery

Draft payload includes `prescriptions` beside `prescriptionText` / diagnoses. Autosave, resume, discard, and finalization preserve stable prescription IDs and diagnosis ID references exactly.

## Physician authorization (server-side)

Structured prescriptions are a licensed clinical act, narrower than generic `consultations.finalize`.

Mirror the Form 4B pattern (`TbClinicalAuthority`):

- Introduce `PrescriptionClinicalAuthority` (or equivalent shared helper):
  - RHU user
  - `staff_role === 'doctor'`
  - `conditions.confirm` allowed
- When RHU ITR finalize/store payload contains one or more `prescriptions`:
  - Reject unless the acting user passes that gate.
  - Persist per-collection or per-order authorization attestation and a hash over the ordered clinical fields.
- A non-physician who can finalize must not be able to authorize structured prescription orders for dispensing.
- Empty `prescriptions` + legacy empty/non-empty `prescriptionText` keeps today’s finalize permission model for non-structured visits.
- Dispense eligibility for structured orders requires a valid physician authorization attestation on the finalized record (not merely `finalized_at` / `finalized_by`).

## TB Form 4B integration

- Form 4B regimen (`TbTreatmentCase.card_data.regimen`) remains the canonical TB prescription.
- ITR may show a linked TB prescription **summary/reference** (`source: tb_form4b_ref`) pointing at the registered case. Do not duplicate regimen drug rows into `prescriptions[]` as independent editable ITR medicines.
- Delayed registration: Form 4B may be registered after ITR finalization. Do **not** mutate the finalized ITR `monitoring_data` to insert later Form 4B data. Resolve eligibility by joining the registered case via `source_health_record_id` / stable case id at queue and review time.
- Only when registration + physician authorization requirements for that treatment are satisfied may TB regimen appear as dispense-eligible.
- If an existing ITR `source: itr` prescription conflicts with a subsequent Form 4B regimen (same clinical intent / overlapping TB medicine orders), require explicit reconciliation messaging — never silent merge or replace.
- Preserve DS-TB, DR-TB, TPT, and delayed-registration restrictions already in code.
- Future BHC dispensing must reuse stable prescription id / TB case id; this task does not implement BHC stock deduction or RHU visibility of BHC dispensing.

## Doctor UI (RHU ITR Diagnosis & Care Plan)

- Remove the standalone free-text Prescription textarea for **new** consultations.
- Inside each diagnosis card, near Supporting Laboratory Tests, add a compact **Prescriptions** list and **Add Prescription**.
- Add Prescription fields: Linked Diagnosis (required, multi-select from current diagnoses), Medicine Name, Strength, Dose, Route, Frequency, Duration, Instructions (optional), Authorized Quantity + Unit when tracking remaining qty.
- Support add, edit, remove, review before finalization.
- Match existing diagnosis-card / modal / input density; no new color scheme, badges, or helper banners.
- Validation errors beside affected fields.
- No inventory selection or stock deduction on the doctor form.

## Review, printing, compatibility

- Review & Finalize shows consolidated structured prescriptions grouped by diagnosis when present.
- Print slip renders structured lines for new records; legacy `prescriptionText` / `prescribedMedicines` display text remains printable for old records.
- `prescriptionDisplayText()` gains a structured formatter when `prescriptions[]` is non-empty, else existing behavior.
- Existing saved consultation records remain unchanged; never delete or rewrite historical prescriptions.
- Legacy backend consumers of `prescriptionText` remain until focused tests prove all consumers handle structured data.

## To Dispense

Enhance existing `RhuToDispenseTab` / `RhuToDispenseController` / `MedicineStockService` only. Do not create a second dispensing module.

### Queue

Eligible when:

- Finalized RHU ITR owned by the signed-in RHU, and
- Either non-empty structured dispense-eligible prescriptions (physician-authorized; TB refs only when case eligibility is met), or
- Legacy non-empty `prescriptionDisplayText()` for historical visits.

Payload stays narrow: record id, patient id/name, visit date, prescription summary suitable for staff, fulfillment status, flags for structured vs legacy. Do not expose unrelated clinical chart data (vitals, background, full narrative, unrelated labs).

Staff may see dispensing-relevant diagnosis names that are linked to orders. They must not edit physician prescriptions.

### Review UI

- Group authorized orders by diagnosis.
- Show medicine, strength, dose, route, frequency, duration, instructions, authorized qty/unit when present, and per-order fulfillment status.
- TB refs show regimen summary from the registered case, not a forged ITR duplicate.

### Confirm Given

- Staff select matching RHU inventory medicines, verify quantity, batch, expiration, availability.
- **Only Confirm Given** deducts inventory.
- Saved prescription, draft, finalization, queue entry, print, or Unavailable marking never deducts stock.
- Preserve `items.dispense` and facility ownership checks in `MedicineStockService`.

### Status (per prescription id, and roll-up on the visit)

| Status | Meaning |
|---|---|
| Pending | Nothing dispensed for that order |
| Partially Dispensed | Some authorized quantity released; remaining > 0 (only when `authorizedQuantity` is set) |
| Dispensed | When `authorizedQuantity` is set: released sum ≥ authorized. When omitted: first successful stock release for that `prescription_id` marks the order Dispensed (no remaining-qty UI; further releases for that id are refused unless a later approved clinical adjustment exists — default refuse) |
| Unavailable | Stock unavailable recorded; **no** deduction |

Visit roll-up derives from order statuses (e.g. all pending → Pending; mix → Partially Dispensed; all dispensed → Dispensed).

### Partial / multi-transaction / concurrency

- Multiple stock-release transactions per `prescription_id` allowed after migration.
- Each release validates remaining authorized quantity when `authorizedQuantity` is set; refuse over-release without an explicit approved clinical adjustment path (out of scope unless already present — default: hard refuse).
- Atomic stock deduction + row insert in one DB transaction.
- Concurrency: lock health record / use existing stock operation keys; idempotency key on Confirm Given requests so retries do not double-deduct.
- Unavailable: record non-stock event; does not count toward dispensed quantity.

## Migration (create only)

Additive migration file (do not execute without explicit approval), for example:

- `health_record_medicines.prescription_id` nullable UUID/string index
- `health_record_medicines.idempotency_key` nullable unique (or equivalent unique constraint scoped to record)
- Any minimal columns required to store authorized quantity snapshot on the release row if needed for audit (prefer reading authorized qty from finalized `monitoring_data.prescriptions`)

No new unnecessary tables if columns on `health_record_medicines` suffice. No destructive changes. No backfill that rewrites historical prescription text.

### Migration-not-applied runtime

Detect `Schema::hasColumn('health_record_medicines', 'prescription_id')` (or a dedicated feature helper).

| Path | Behavior until migration applied |
|---|---|
| Structured Rx UI, draft, finalize, review, print, queue listing | Allowed |
| Legacy free-text queue + one-shot Confirm Given | Unchanged historical behavior |
| Structured per-prescription Confirm Given / partial remaining tracking | **Disabled** with clear 422/UI error — do not silently use whole-record one-shot fulfillment as if it were per-Rx |

### Migration-ready verification checklist

Before approving migrate on any environment:

1. Migration is additive only (nullable columns / new indexes); `migrate:rollback` documented.
2. Feature detection flips structured Confirm Given on only after column exists.
3. Focused tests pass for: authorize gate, multi-diagnosis one order, diagnosis remove reconciliation, draft restore, queue eligibility, legacy display, TB ref without ITR mutation, partial release, over-release refuse, unavailable no deduction, idempotent retry, cross-RHU 403.
4. No rewrite of existing `monitoring_data.prescriptionText` rows.
5. BHC dispense paths unchanged in regression tests.
6. Uncommitted TB/Form 4B/referral fixes still present and green in their focused suites.
7. Operator explicitly approves `php artisan migrate` for that environment.

## BHC boundary

- Preserve RHU→BHC endorsement and BHC DOTS monitoring.
- Do not change BHC inventory or BHC consult dispensing.
- Keep stable prescription id and TB case id for a future BHC-owned dispensing integration.

## Testing requirements (minimum)

1. Hypertension → add structured prescription.
2. Diabetes → multiple prescriptions.
3. TB → authorized Form 4B reference without duplication; delayed registration does not mutate ITR.
4. One prescription linked to multiple diagnoses.
5. Edit/remove diagnosis with reconciliation (no silent discard).
6. Draft save / leave / resume exact restoration.
7. Finalize → To Dispense queue.
8. Staff review with facility permissions only.
9. Confirm Given → correct RHU stock deduction (migration-on path).
10. Partial dispensing and unavailable (no deduction).
11. Retry/concurrent Confirm Given → no double deduction.
12. Print structured and historical prescriptions.
13. No unauthorized cross-RHU access.
14. BHC consultation/dispensing unchanged.
15. Existing Form 4B registration and consultation workflow still work.
16. Migration-off: structured Confirm Given disabled with explicit error; legacy Confirm Given still works.

Run relevant frontend/backend focused tests, ESLint, and frontend build. Report failures accurately. Do not claim completion without verifying the full RHU flow under the active migration state.

## Non-goals

- Executing migrations without approval
- Commit / push / merge / deploy as part of default implementation
- BHC stock deduction or RHU view of BHC dispensing
- Rewriting or deleting historical records
- New dispensing module or UI redesign of unrelated sections
- Inferring authorized quantity from free-text instructions

## Genuine blockers (report only these)

Stop and report before proceeding if:

1. Clinical safety: cannot enforce physician authorization distinct from `consultations.finalize` with existing role/permission data.
2. Irreversible data loss would be required to meet a requirement.
3. A requirement cannot be met without executing a migration or weakening stock/authorization safety, and no safe disable/feature-gate exists.

Under the locked constraints above, Approach 1 with migration-create-only and structured Confirm Given feature-gating is the intended safe path.
