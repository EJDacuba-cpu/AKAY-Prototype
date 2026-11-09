import test from "node:test";
import assert from "node:assert/strict";
import { clinicalRecoveryChoice, clinicalDeviceDraft } from "./clinicalDraftRecovery.js";

const local = { record: { draft: { consultationUuid: "same", patient: { id: "7" }, payload: { chiefComplaint: "Device edits" } } }, base: { serverPayload: JSON.stringify({ chiefComplaint: "Before" }), pendingPayload: "", version: 2 } };
const current = { consultationUuid: "same", patient: { id: "7" }, payload: { chiefComplaint: "Before" }, version: 4 };
test("a newer editor lease does not make an unchanged server payload conflict", () => {
  assert.equal(clinicalRecoveryChoice(local, current), "device");
  assert.equal(clinicalRecoveryChoice(local, null), "device");
});
test("advanced server content requires a deliberate source decision", () => {
  assert.equal(clinicalRecoveryChoice(local, { ...current, payload: { chiefComplaint: "Other clinician" } }), "conflict");
  assert.equal(clinicalRecoveryChoice({ ...local, base: null }, current), "conflict");
});
test("known committed payload after a lost response can reconcile without overwriting unknown changes", () => {
  const pending = { ...local, base: { ...local.base, pendingPayload: JSON.stringify({ chiefComplaint: "In flight" }) } };
  assert.equal(clinicalRecoveryChoice(pending, { ...current, payload: { chiefComplaint: "In flight" } }), "device");
  assert.equal(clinicalRecoveryChoice(local, { ...current, payload: local.record.draft.payload }), "server");
});
test("another patient, consultation or occupied editor cannot be silently restored", () => {
  assert.equal(clinicalRecoveryChoice(local, { ...current, consultationUuid: "different" }), "conflict");
  assert.equal(clinicalRecoveryChoice(local, { ...current, patient: { id: "9" } }), "conflict");
  assert.equal(clinicalRecoveryChoice(local, { ...current, canEdit: false }), "locked");
});

test("recovery retains newly entered medicine quantities while refreshing known stock metadata", () => {
  const local = { ...current, payload: { dispensedMedicines: [{ medicineId: "3", quantity: "2", remarks: "New remark" }] }, medicineSelections: [{ medicine_id: 3, quantity: "2", remarks: "New remark", medicine: { quantity: 5 } }] };
  const server = { ...current, id: "draft", version: 9, medicineSelections: [{ medicine_id: 3, quantity: 1, remarks: "Old remark", medicine: { quantity: 10 } }] };
  const restored = clinicalDeviceDraft(local, server);
  assert.equal(restored.version, 9);
  assert.equal(restored.medicineSelections[0].quantity, "2");
  assert.equal(restored.medicineSelections[0].remarks, "New remark");
  assert.equal(restored.medicineSelections[0].medicine.quantity, 10);
});
