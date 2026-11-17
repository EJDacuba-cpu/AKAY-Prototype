import test from "node:test";
import assert from "node:assert/strict";
import { durationFields, prescriptionOptions, selectionFor, OTHER, changePrescriptionField } from "./prescriptionFields.js";
import { prescriptionErrors, prescriptionsForSave, restorePrescriptions, visitPrescriptionStatus } from "./rhuPrescriptions.js";

test("legacy values restore without guessing or replacing custom text", () => {
  assert.equal(selectionFor("oral", prescriptionOptions.route), "Oral");
  assert.equal(selectionFor("PO", prescriptionOptions.route), OTHER);
  assert.deepEqual(durationFields("2 weeks"), { value: "2", unit: "weeks", legacy: "" });
  assert.deepEqual(durationFields("1 month"), { value: "1", unit: "months", legacy: "" });
  assert.deepEqual(durationFields("until review"), { value: "", unit: "", legacy: "until review" });
  const rows = [{ id: "a", route: "PO", duration: "until review" }, { id: "b", medicineName: "Partial" }];
  const restored = restorePrescriptions({ prescriptions: rows });
  assert.deepEqual(restored.map(({ id }) => id), ["a", "b"]);
  assert.equal(restored[0].duration, "until review");
});

test("positive durations and quantities validate at completion; partial state stays available", () => {
  const rx = { id: "rx", diagnosisIds: ["dx"], medicineName: "Medicine", strength: "100 mg/mL", dose: "5 mL", route: "Oral", frequency: "As needed (PRN)", duration: "2 days", authorizedQuantity: 2.5, authorizedUnit: "Milliliters (mL)" };
  const errors = (overrides) => prescriptionErrors([{ ...rx, ...overrides }], [{ id: "dx" }]);
  assert.deepEqual(errors({}), {});
  for (const quantity of [0, -1, "", "abc"]) assert.ok(errors({ authorizedQuantity: quantity })["prescriptions.rx.authorizedQuantity"]);
  assert.ok(errors({ authorizedUnit: "Tablets" })["prescriptions.rx.authorizedQuantity"]);
  for (const duration of ["0 days", "-1 weeks", "2", "until review"]) assert.ok(errors({ duration })["prescriptions.rx.duration"]);
  let partial = changePrescriptionField(rx, "durationUnit", OTHER);
  assert.equal(partial.durationEditor.unit, OTHER);
  assert.ok(prescriptionErrors([partial], [{ id: "dx" }])["prescriptions.rx.duration"]);
  partial = changePrescriptionField(partial, "durationUnit", "cycles");
  assert.equal(partial.duration, "2 cycles");
  assert.equal(prescriptionsForSave([rx])[0].authorizedQuantity, 2.5);
  assert.equal(visitPrescriptionStatus([rx], [{ prescriptionId: "rx", quantity: 1 }]).orders[0].remaining, 1.5);
});
