# RHU prescription and dispense desk

Status: planning only; no implementation authorized by this document until the implementation plan is written and approved.

Prototype assumption: there is no RHU doctor/staff dispensing interview. The locked split is **RHU doctor writes a prescription, RHU staff reviews it and dispenses after the consult is finalized.** This is not a DOH or facility protocol claim.

This document **supersedes** consult-time RHU dispensing from `docs/superpowers/specs/2026-10-30-rhu-health-commodities-design.md`. Inventory ownership, `items.dispense` vs `inventory.manage`, prescription-does-not-deduct-stock, FEFO/quarantine, and BHC consult dispensing stay as in that spec. **Where** RHU staff confirm given changes: Health Commodities, not the RHU consultation wizard.

## Intent

Remove catalog prescribing and in-consult dispensing from the RHU wizard. The doctor types one prescription. Finalize with non-empty text places the visit in a **To dispense** queue. Staff with `items.dispense` work that queue on Health Commodities without opening Patient Details or needing `clinical.history`. They review the prescription, may print a slip for the patient (including when nothing is in stock), then confirm given against RHU inventory.

## Job and audience

- **RHU doctor** (encode/finalize): write how the patient should take medicine. They are not the bodegero.
- **RHU staff** (dispense): see who is waiting, read the doctor’s text, print a copy if needed, pick stock, confirm given. They are not sent into Overview, Background, or other clinical profile tabs.

Visitor mode: Operate.

## Selected direction

Approach 1: Health Commodities gains an RHU-only **To dispense** tab beside **Inventory**. Two tabs, two tables, never one mixed grid.

Rejected:

- Dispense from Patient Details / Health Record Details (staff lack Overview access; extra clinical fields).
- Extra doctor “send to prescription” button (finalize with text is the send).
- Keep Medicines / Supplies Dispensed on the RHU consult.
- Catalog picker, quantity-from-stock, and Add prescription on the RHU consult.
- Structured Rx lines or an Add-row control (not enough evidence; one textarea).
- A Done / complete button (confusing without line items). Pending = no confirmed item yet; Given = at least one confirmed item. Staff may open Given again to add more.
- Condom / FP / vaccine / walk-in issue without a doctor prescription (later).
- Changing BHC consult dispensing.

## Architecture

**Consult (RHU ITR wizard)**

- Replace `PrescribedMedicinesSection` with one English **Prescription** textarea on Diagnosis & Care Plan (same slot as today’s catalog UI).
- Do not require `inventory.view` to type or save that text.
- Remove `DispensedMedicinesSection` from `RhuConsultationWorkspace`.
- Persist a single `prescriptionText` string on the RHU ITR record (`monitoring_data`), not catalog `medicineId` lines. Drafts store the same string. Empty text is allowed; that visit never enters To dispense.
- Stop requiring `prescribed_medicines` catalog IDs on RHU finalize. `assertRhuPrescribedMedicines` does not apply to the textarea.
- Review step shows the textarea value, not medicine rows. No “Confirmed dispensed” rows from this consult.

**Health Commodities (RHU only)**

- `MedicineInventoryPage` with `role="rhu"`: tabs **Inventory** | **To dispense**.
- Inventory tab remains the existing stock table, filters, add, restock, expiry. No patient rows.
- To dispense tab is a different table: patient name, visit date, status Pending or Given, search by name, row action **Review prescription**.
- Eligibility: finalized RHU ITR health records owned by the signed-in RHU, trimmed `prescriptionText` non-empty. Drafts never appear. Other RHUs and BHC records never appear.
- Legacy records that only have catalog `prescribedMedicines` lines: show joined display text in the queue so in-flight visits are not orphaned. New writes use `prescriptionText` only.
- `items.dispense` (and existing `inventory.view` requirement) gates the tab, review, print, and confirm given. `clinical.history` is not required. `inventory.manage` stays stock management only.

**Review prescription modal**

- Patient name, visit date, prescription text (read-only). No diagnosis, vitals, anatomy, background, or stock table.
- **Print**: prescription slip only (patient name, visit date, facility, prescription text). No batch, quantity, or inventory. Available when Pending and when Given. Covers “no stock, patient still gets a copy.”
- **Dispense** opens the second modal. Does not deduct stock.

**Dispense modal**

- Reuse existing `DispensedMedicinesSection` / confirm-given path against this health record and this RHU catalog.
- Confirm given deducts stock. Unauthorized, cross-facility, expired, or quarantined allocations fail with no partial write. Retries must not double-deduct.
- After success, the row is Given. Closing returns to To dispense.

**Patient chart**

- Do not add a Prescription tab or Confirm given on RHU Patient Details.
- Workers with `clinical.history` may still **read** saved prescription text and confirmed dispensed lines on the health record. That is not the dispense desk.

**BHC**

- Health Commodities stays inventory-only (no To dispense tab).
- Consult still hosts Medicines / Supplies Dispensed.

## Data

- Queue payload: record id, patient id, patient display name, visit date, prescription display text, whether any confirmed dispense exists. Not the full chart.
- Confirm given: existing dispensed-medicine payload (medicine id, quantity, allocations). Tied to the health record. Prescription text is never a stock mutation.
- Server enforces RHU ownership of the record and of each medicine. Query keys stay `"rhu"`. TanStack Query is not the authz boundary.

## Errors and empty

- Keep consult and Commodities loading / connection shells.
- To dispense empty: ordinary empty table, not an error.
- Catalog failure in the Dispense modal: visible error and Retry; do not confirm silently.
- Print with empty prescription cannot happen (those visits are not in the queue).

## Testing

- RHU consult source: Prescription textarea present; no category/search/medicine/quantity/Add catalog controls; no Medicines / Supplies Dispensed block.
- Finalize with non-empty text → To dispense Pending for that RHU. Draft or empty text → absent.
- Inventory table and To dispense table are separate tabs; a medicine row never appears in To dispense.
- Review modal exposes prescription text, Print, and Dispense only.
- Print works with zero confirmed items and does not include inventory fields.
- Confirm given deducts; other RHU / expired / missing `items.dispense` fail.
- A user with `items.dispense` and without `clinical.history` can review, print, and dispense on Commodities without Patient Overview.
- BHC consult dispensing tests stay green. Do not change BHC consult files for this task.

## Scope and anti-goals

In:

- RHU consult prescription textarea
- Remove RHU consult dispensing and catalog prescribe
- RHU Health Commodities To dispense tab, review modal, print slip, dispense modal
- Post-finalize confirm given for that record

Out:

- BHC consult or BHC Commodities queue
- Patient Details / Overview as a dispense desk
- Protocol items without a prescription (condom, FP, vaccine, OTC walk-in)
- Done button, doctor send-to-queue button, print on consult or Inventory
- Redesign of inventory stock actions
- Claims of legal or DOH pharmacy compliance

## Next (flagged, not this task)

- RHU Start Consultation wizard visual match to BHC (already flagged).
- Program/protocol stock issue without a doctor prescription.
- Print from the consult room if doctors must hand a slip before the window.

## Constraints

- English UI. Clinic Ledger tokens.
- Prototype workflow, labeled as such.
- Prescription never deducts stock. Only confirm given does.
- RHU 1 must not read or mutate RHU 2 or BHC queue or stock.
- No production migration execution in this work.
