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

test("RHU ITR treats a linked referral id as a referred visit", () => {
  assert.match(workspace, /isReferredRhuVisit/);
  assert.doesNotMatch(workspace, /visit\?\.source === "referral"/);
});

test("referred interview has separate RHU fields, optional concern, and draft restore", () => {
  for (const text of ["RhuBhcReferralReference", "Today's RHU chief complaint", "Today's clinical history / update", "Add Another Concern", "additionalConcernPayload", "setShowAdditionalConcern(Boolean(payload.showAdditionalConcern))", "payload.additionalChiefComplaint", "payload.additionalHistoryOfPresentIllness"]) assert.ok(workspace.includes(text), text);
  assert.match(workspace, /monitoringData:\s*\{\s*additionalConcern:/);
  assert.doesNotMatch(workspace, /setChiefComplaint\([^\n]*(?:referral|slip)/i);
});

test("full referral overlay stays inside the mounted ITR", () => {
  for (const text of ["ModalShell", "BhcReferralSlip", "referralSlipOpen", "setReferralSlipOpen(false)"]) assert.ok(workspace.includes(text), text);
  assert.doesNotMatch(workspace, /reviewReferralSlipPath|navigate\(.*referrals/);
});

test("assessment keeps previous BHC vitals distinct from editable RHU vitals", () => {
  assert.match(workspace, /RhuPreviousVitalsReference/);
  assert.match(workspace, /Previous Findings Reassessment/);
  assert.doesNotMatch(workspace, /set(?:SystolicBp|DiastolicBp|Temp|Pulse|Weight|Height)\([^\n]*(?:slip|referralRecord)/);
  assert.ok(workspace.includes("Previous recorded findings are listed below."));
  assert.equal(workspace.includes("Previous BHC findings are listed below."), false);
});

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
