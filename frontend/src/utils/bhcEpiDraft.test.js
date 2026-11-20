import assert from "node:assert/strict";
import test from "node:test";
import { clinicalVaccineEntries, restoreBhcDispensingDraft } from "./bhcEpiDraft.js";

const dose = { vaccineName: "BCG", dose: "Birth dose", dateGiven: "2026-11-18", timeGiven: "10:05" };
const catalogItem = { id: 8, name: "BCG vial", unit: "vials", quantity: 15 };
const stock = { medicineId: "8", inventoryQuantity: 1, confirmedGiven: true };
const manual = { allocations: [{ expiry_group_id: 5, quantity: 1 }], override_reason: "Opened vial" };
function restore(vaccineEntries, dispensedMedicines = [], medicineSelections = []) {
  return restoreBhcDispensingDraft({ payload: { dispensedMedicines }, vaccineEntries, inventory: [catalogItem], medicineSelections });
}

test("clinical EPI tracking, including a historical dose, creates no dispensing intent", () => {
  const entries = [dose, { vaccineName: "Newborn Screening", dateGiven: dose.dateGiven }];
  assert.deepEqual(clinicalVaccineEntries(entries), entries);
  assert.deepEqual(restore(entries), { medicines: [], warnings: [] });
});

test("an old confirmed vaccine selection transfers its stock quantity and batch only once", () => {
  const old = [{ ...dose, ...stock, ...manual }];
  const clinical = clinicalVaccineEntries(old);
  assert.deepEqual(clinical, [dose]);
  const { medicines, warnings } = restore(old);
  assert.deepEqual(warnings, []);
  assert.equal(medicines.length, 1);
  assert.equal(medicines[0].confirmedGiven, true);
  assert.equal(medicines[0].quantity, 1);
  assert.equal(medicines[0].medicineName, catalogItem.name);
  assert.deepEqual(medicines[0].allocations, manual.allocations);
  assert.equal(medicines[0].override_reason, manual.override_reason);
  assert.deepEqual(restore(clinical, medicines).medicines, medicines);
});

test("overlap with a dispensing row and unconfirmed selections prompt review without doubling stock", () => {
  const existing = [{ medicineId: 8, quantity: 2, confirmedGiven: true, remarks: "Existing entry", ...manual }];
  const { medicines, warnings } = restore([{ ...dose, ...stock }, { ...dose, ...stock, confirmedGiven: false }], existing);
  assert.deepEqual(medicines.map(row => row.quantity), [2]);
  assert.deepEqual(medicines[0].allocations, manual.allocations);
  assert.equal(warnings.length, 2);
  assert.deepEqual(restore([{ ...dose, ...stock, confirmedGiven: false }]).medicines, []);
});

test("multiple previously confirmed doses using automatic allocation keep their total quantity", () => {
  const { medicines } = restore([{ ...dose, ...stock }, { ...dose, ...stock, vaccineName: "Another dose" }]);
  assert.deepEqual(medicines.map(row => row.quantity), [2]);
});
