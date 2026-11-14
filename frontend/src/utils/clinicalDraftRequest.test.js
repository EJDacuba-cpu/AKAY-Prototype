import test from "node:test";
import assert from "node:assert/strict";
import { clinicalDraftRequest } from "./clinicalDraftRequest.js";
import { continuePrenatalPrefill } from "./prenatalForm.js";

test("continuing a finalized prenatal visit sends canonical draft fields without losing entered values", () => {
  const maternalData = continuePrenatalPrefill({ maternalData: {
    lmp: "2026-08-01", gravida: "2", para: "1", term: "1", preterm: "0", abortion: "0", living: "1",
    tpal: "1-0-0-1", previous_fp_method_used: "Pills", previous_fp_method_other: "",
    previous_pregnancy_history: [{ pregnancyNo: "1", year: "2024", notes: "Recorded history" }],
    tetanus_toxoid_status: { tt1: "2024-02-01" },
  } });
  maternalData.fht = "145";
  const original = structuredClone(maternalData);
  const request = clinicalDraftRequest({ patientId: 1, payload: { maternalData } });
  const draft = request.payload.maternalData;
  for (const field of ["tpal", "previous_fp_method_used", "previous_fp_method_other", "previous_pregnancy_history", "tetanus_toxoid_status"]) {
    assert.equal(Object.hasOwn(draft, field), false, field + " is not part of the draft schema");
  }
  assert.equal(draft.fht, "145");
  assert.equal(draft.term, "1");
  assert.equal(draft.previousFpMethodUsed, "Pills");
  assert.equal(draft.previousPregnancyHistory[0].notes, "Recorded history");
  assert.equal(draft.tetanusToxoidStatus.tt1, "2024-02-01");
  assert.deepEqual(maternalData, original);
});

test("RHU draft updates preserve the actual visit identity and optimistic version", () => {
  assert.deepEqual(clinicalDraftRequest({ patientId: "4", classification: "General Consultation", consultationUuid: "uuid", rhuVisitId: "19", payload: { chiefComplaint: "Partial" }, version: 3 }), {
    patient_id: "4", classification: "General Consultation", consultation_uuid: "uuid", rhu_visit_id: 19, payload: { chiefComplaint: "Partial" }, version: 3,
  });
  assert.equal(Object.hasOwn(clinicalDraftRequest({ patientId: 4, payload: {} }), "rhu_visit_id"), false);
});

test("legacy TPAL-only scores retain all four values without overwriting recorded components", () => {
  const { payload } = clinicalDraftRequest({ payload: { maternalData: { tpal: "2-0-1-2", term: "3" } } });
  assert.deepEqual(
    [payload.maternalData.term, payload.maternalData.preterm, payload.maternalData.abortion, payload.maternalData.living],
    ["3", "0", "1", "2"],
  );
});

test("unrecognized maternal fields still reach strict server validation instead of silently disappearing", () => {
  const { payload } = clinicalDraftRequest({ payload: { maternalData: { unexpectedField: "check schema" } } });
  assert.equal(payload.maternalData.unexpectedField, "check schema");
});
