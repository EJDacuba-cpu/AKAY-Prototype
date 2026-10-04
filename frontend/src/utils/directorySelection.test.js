import test from "node:test";
import assert from "node:assert/strict";
import {
  getPatientKey,
  reconcileSelection,
  selectCard,
} from "./directorySelection.js";

test("selectCard opens the panel on the first click", () => {
  assert.deepEqual(selectCard({ selectedId: null, open: false }, "12"), {
    selectedId: "12",
    open: true,
  });
});

test("selectCard switches patients while the panel stays open", () => {
  assert.deepEqual(selectCard({ selectedId: "12", open: true }, "13"), {
    selectedId: "13",
    open: true,
  });
});

test("selectCard closes and clears on the selected card while open", () => {
  assert.deepEqual(selectCard({ selectedId: "12", open: true }, "12"), {
    selectedId: null,
    open: false,
  });
});

test("selectCard reopens on the selected card after a chevron collapse", () => {
  assert.deepEqual(selectCard({ selectedId: "12", open: false }, "12"), {
    selectedId: "12",
    open: true,
  });
});

test("selectCard ignores a card without a key", () => {
  const state = { selectedId: "12", open: true };
  assert.equal(selectCard(state, ""), state);
});

test("getPatientKey prefers id, falls back to patientId, never yields 'undefined'", () => {
  assert.equal(getPatientKey({ id: 12, patientId: "P-9" }), "12");
  assert.equal(getPatientKey({ patientId: "P-9" }), "P-9");
  assert.equal(getPatientKey({}), "");
  assert.equal(getPatientKey(null), "");
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
