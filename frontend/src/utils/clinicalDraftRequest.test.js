import test from "node:test";
import assert from "node:assert/strict";
import { clinicalDraftRequest } from "./clinicalDraftRequest.js";

test("RHU draft updates preserve the actual visit identity and optimistic version", () => {
  assert.deepEqual(clinicalDraftRequest({ patientId: "4", classification: "General Consultation", consultationUuid: "uuid", rhuVisitId: "19", payload: { chiefComplaint: "Partial" }, version: 3 }), {
    patient_id: "4", classification: "General Consultation", consultation_uuid: "uuid", rhu_visit_id: 19, payload: { chiefComplaint: "Partial" }, version: 3,
  });
  assert.equal(Object.hasOwn(clinicalDraftRequest({ patientId: 4, payload: {} }), "rhu_visit_id"), false);
});
