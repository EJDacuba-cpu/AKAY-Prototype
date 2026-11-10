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

test("Back to Queue flushes pending drafts and keeps the form when save fails", () => {
  const leave = workspace.match(/if \(previous === EXIT_STEP\) \{[\s\S]*?navigate\("\/rhu\/patients"\)/);
  assert.ok(leave, "expected Back to Queue leave path");
  assert.match(leave[0], /flushBeforeLeave/);
  assert.match(leave[0], /toast\.error/);
  assert.match(leave[0], /have not synced|not synced/i);
});

test("RHU autosave status shows error and conflict even when shared form drafts are disabled", () => {
  assert.match(workspace, /<FormDraftStatus[\s\S]*?autosave\.status/);
  assert.match(workspace, /autosave\.error\?\.message \|\| autosave\.conflict\?\.message/);
  assert.doesNotMatch(workspace, /autosave\.status === "saving" \? \(/);
});

test("Resume gates editing and autosave until the visit draft is hydrated", () => {
  assert.match(workspace, /recoveryReady = recovery.ready/);
  assert.match(workspace, /enabled:\s*RHU_DRAFTS_ENABLED && recoveryReady/);
  assert.match(workspace, /assessmentLocked = encodeLocked \|\| !recoveryReady/);
  assert.doesNotMatch(workspace, /useState\(!FORM_DRAFTS_ENABLED \|\| !RHU_DRAFTS_ENABLED\)/);
});

test("workspace reuses shared recovery and gates the form before rendering interview", () => {
  assert.match(workspace, /useRhuConsultationRecovery/);
  assert.match(workspace, /handoff: entryHandoff/);
  assert.ok(workspace.indexOf('if (RHU_DRAFTS_ENABLED && !recoveryReady)') < workspace.indexOf('<ConsultationWorkspaceBody>'));
  assert.doesNotMatch(workspace, /lookupHealthRecordDraft|hydrateRhuConsultationDraft/);
});

test("sticky draft status lives in the header and is not duplicated in the action bar", () => {
  assert.match(workspace, /ehr-consult__draft-status/);
  assert.match(workspace, /hasPendingChanges\s*\?\s*"pending"/);
  assert.doesNotMatch(workspace, /secondaryAction=\{[\s\S]*FormDraftStatus/);
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

test("RHU ITR loads the started visit by id with retryable load recovery", () => {
  assert.match(workspace, /getRhuVisit/);
  assert.match(workspace, /loadVisit\(\{ retry: true \}\)/);
  assert.match(workspace, /visitLoadGeneration/);
  assert.match(workspace, /visitLoadInFlight/);
  assert.match(workspace, /Unable to load consultation|rhuVisitLoadError/);
  assert.match(workspace, /Consultation not available|visitUnavailableError/);
  assert.match(workspace, /min-h-\[calc\(100dvh-9rem\)\]/);
  assert.match(workspace, /Back to Today's Queue/);
  assert.match(workspace, /patientQuery\.isError/);
  assert.match(workspace, /Retry/);
  assert.doesNotMatch(workspace, /Consultation not open/);
});

test("Nutrition service sets panel copy and nutritionIntent without a form step", () => {
  const bhc = readFileSync(join(here, "../bhc/ConsultationWorkspace.jsx"), "utf8");
  for (const source of [workspace, bhc]) {
    assert.match(source, /getNutritionEnrollment/);
    assert.match(source, /nutritionProgramCopy/);
    assert.match(source, /payload\.nutritionIntent/);
    assert.match(source, /nutritionIntent \? \{ nutritionIntent \}/);
    assert.doesNotMatch(source, /NutritionAssessment/);
  }
  assert.match(workspace, /heading="Health Services"/);
});
