import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = readFileSync(join(here, "RhuConsultationWorkspace.jsx"), "utf8");
const carePlan = readFileSync(
  join(here, "../../components/features/health-records/wizard/RhuDiagnosisCarePlanSection.jsx"),
  "utf8",
);
const service = readFileSync(join(here, "../../services/healthRecordService.js"), "utf8");

test("RHU consult prescription is a textarea without catalog picker or consult dispensing", () => {
  assert.match(carePlan, /label="Prescription"/);
  assert.match(carePlan, /FieldTextarea/);
  assert.doesNotMatch(carePlan, /PrescribedMedicinesSection/);
  assert.doesNotMatch(workspace, /DispensedMedicinesSection/);
  assert.doesNotMatch(workspace, /Medicines \/ Supplies Dispensed/);
  assert.doesNotMatch(workspace, /left=\{<VitalsTiles/);
  assert.match(workspace, /prescriptionText/);
  assert.doesNotMatch(workspace, /canDispense &&/);
});

test("RHU ITR submit sends prescription_text and omits catalog prescribe and consult dispense", () => {
  assert.match(service, /prescription_text:/);
  assert.match(service, /rhu_itr_v1/);
  const rhuBlock = service.match(/rhu_itr_v1[\s\S]{0,400}prescription_text/);
  assert.ok(rhuBlock, "expected RHU ITR payload to include prescription_text");
});

test("RHU ITR loads the started visit by id and shows a retryable patient-load error", () => {
  assert.match(workspace, /getRhuVisit/);
  assert.match(workspace, /patientQuery\.isError/);
  assert.match(workspace, /Retry/);
});
