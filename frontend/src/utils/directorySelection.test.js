import test from "node:test";
import assert from "node:assert/strict";
import {
  getPatientKey,
  reconcileSelection,
  toggleSelection,
} from "./directorySelection.js";

test("getPatientKey prefers id, falls back to patientId, never yields 'undefined'", () => {
  assert.equal(getPatientKey({ id: 12, patientId: "P-9" }), "12");
  assert.equal(getPatientKey({ patientId: "P-9" }), "P-9");
  assert.equal(getPatientKey({}), "");
  assert.equal(getPatientKey(null), "");
});

test("toggleSelection selects, switches and clears", () => {
  assert.equal(toggleSelection(null, "12"), "12");
  assert.equal(toggleSelection("12", "13"), "13");
  assert.equal(toggleSelection("12", "12"), null);
});

test("toggleSelection ignores a card without a key", () => {
  assert.equal(toggleSelection(null, ""), null);
  assert.equal(toggleSelection("12", ""), "12");
});

test("reconcileSelection keeps a patient that is still listed", () => {
  const patients = [{ id: 12 }, { patientId: "P-9" }];
  assert.equal(reconcileSelection("12", patients), "12");
  assert.equal(reconcileSelection("P-9", patients), "P-9");
});

test("reconcileSelection clears when the patient was filtered out or the list is empty", () => {
  assert.equal(reconcileSelection("12", [{ id: 13 }]), null);
  assert.equal(reconcileSelection("12", []), null);
});

test("reconcileSelection with no selection stays null", () => {
  assert.equal(reconcileSelection(null, [{ id: 1 }]), null);
  assert.equal(reconcileSelection("", [{ id: 1 }]), null);
});
