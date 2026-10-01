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

test("continue routes carry the selected follow-ups and monitoring", () => {
  assert.deepEqual(
    resolveBhcConsultationRoute("?patientId=17&mode=continue&followUpIds=1,2&monitoringIds=4"),
    { kind: "continue", patientId: "17", followUpIds: [1, 2], monitoringIds: [4] },
  );
  assert.deepEqual(
    resolveBhcConsultationRoute("?patientId=17&mode=followup&followUpId=9"),
    { kind: "continue", patientId: "17", followUpIds: [9], monitoringIds: [] },
  );
});

test("legacy follow-up routes open the step flow with that task continued", () => {
  assert.deepEqual(
    resolveBhcConsultationRoute("?mode=follow-up&patientId=17&followUpId=91&recordId=4"),
    { kind: "continue", patientId: "17", followUpIds: [91], monitoringIds: [] },
  );
  assert.deepEqual(
    resolveBhcConsultationRoute("?patientId=17&mode=continue&followUpIds=1,,x,-3,2&monitoringIds="),
    { kind: "continue", patientId: "17", followUpIds: [1, 2], monitoringIds: [] },
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
  assert.equal(resolveBhcConsultationRoute("?mode=followup&recordId=4").kind, "redirect");
});

test("a follow-up route without a task but with a patient opens a new consultation", () => {
  assert.deepEqual(resolveBhcConsultationRoute("?mode=followup&patientId=17"), {
    kind: "new",
    patientId: "17",
  });
});
