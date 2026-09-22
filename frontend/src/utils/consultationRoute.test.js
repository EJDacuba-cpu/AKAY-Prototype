import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPatientConsultationPath,
  resolveBhcConsultationRoute,
} from "./consultationRoute.js";

test("patient-scoped routes open a new consultation directly", () => {
  assert.deepEqual(resolveBhcConsultationRoute("?patientId=17&mode=new"), {
    kind: "new",
    patientId: "17",
  });
  assert.equal(
    buildPatientConsultationPath(17),
    "/bhc/health-records/add?patientId=17&mode=new",
  );
});

test("follow-up routes retain the exact task being fulfilled", () => {
  assert.deepEqual(
    resolveBhcConsultationRoute("?mode=follow-up&patientId=17&followUpId=91&recordId=4"),
    { kind: "followup", patientId: "17", followUpId: "91" },
  );
  assert.deepEqual(
    resolveBhcConsultationRoute("?mode=followup&patientId=17&followUpId=92"),
    { kind: "followup", patientId: "17", followUpId: "92" },
  );
});

test("draft resume restores consultation context directly", () => {
  assert.deepEqual(resolveBhcConsultationRoute("?draftId=draft-1"), {
    kind: "draft",
    draftId: "draft-1",
    patientId: "",
  });
});

test("generic and malformed follow-up routes redirect to Patient Center", () => {
  assert.equal(resolveBhcConsultationRoute("").kind, "redirect");
  assert.equal(resolveBhcConsultationRoute("?mode=followup&patientId=17").kind, "redirect");
});
