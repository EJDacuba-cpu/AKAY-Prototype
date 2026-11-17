import test from "node:test";
import assert from "node:assert/strict";
import { prescriptionPrintData, savedPrescriptionRows } from "./prescriptionPrint.js";

function record() {
  return { id: 1, finalized_at: "2026-11-17", dateOfVisit: "2026-11-17",
    patient: { name: "Test Patient", birthDate: "2000-12-01", sex: "Female", streetAddress: "Street", purokArea: "Zone", barangay: "Barangay", municipality: "Town" },
    prescription_prescriber: { id: 7, name: "Saved Doctor", prcLicenseNumber: "001234" },
    monitoring_data: { prescriptions: [{ medicineName: "Medicine", strength: "10 mg", dose: "1 tablet", route: "Custom route", frequency: "Custom frequency", duration: "2 custom units", authorizedQuantity: 3, authorizedUnit: "Custom unit", authorization: { physicianId: 7 } }] } };
}
test("prints saved values, order and age at consultation without mutating records", () => {
  const saved = record();
  saved.monitoring_data.prescriptions.push({ ...saved.monitoring_data.prescriptions[0], medicineName: "Second" });
  const before = structuredClone(saved);
  const result = prescriptionPrintData(saved);
  assert.equal(result.patient.age, 25);
  assert.equal(result.patient.address, "Street, Zone, Barangay, Town");
  assert.equal(result.doctor.prcLicenseNumber, "001234");
  assert.deepEqual(result.medicines, saved.monitoring_data.prescriptions);
  assert.deepEqual(saved, before);
});
test("rejects drafts, empty prescriptions, missing license, wrong prescriber and missing demographics", () => {
  for (const change of [
    r => { r.finalized_at = null; },
    r => { r.monitoring_data.prescriptions = []; },
    r => { r.prescription_prescriber.prcLicenseNumber = ""; },
    r => { r.prescription_prescriber.id = 8; },
    r => { r.patient.birthDate = "2026-02-30"; },
    r => { r.patient.name = ""; },
    r => { r.monitoring_data.prescriptions[0].route = "__other__"; },
    r => { r.monitoring_data.prescriptions[0].authorizedUnit = "Other"; },
  ]) {
    const saved = record(); change(saved);
    assert.throws(() => prescriptionPrintData(saved));
  }
  assert.deepEqual(savedPrescriptionRows({ monitoring_data: record().monitoring_data }), []);
});
