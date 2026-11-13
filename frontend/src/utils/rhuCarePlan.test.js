import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRhuNextAction,
  diagnosesForRhuSave,
  diagnosisActivateConfirmed,
  diagnosisNextAction,
  emptyRhuDiagnosis,
  matchingMonitorableCondition,
  restoreRhuDiagnoses,
  restoreRhuFollowUpSchedules,
  rhuCarePlanErrors,
  RHU_NEXT_ACTIONS,
} from "./rhuCarePlan.js";
import { normalizeDiagnoses } from "./diagnoses.js";

test("a new diagnosis starts with Active off and no next action", () => {
  const entry = emptyRhuDiagnosis("Hypertension", "dx-1");
  assert.equal(entry.activate, false);
  assert.equal(entry.nextAction, "");
  assert.equal(diagnosisNextAction(entry), "");
});

test("next actions are exclusive and Manage does not imply Active", () => {
  const managed = applyRhuNextAction({ id: "a", name: "Asthma", activate: false }, "manage_to_bhc");
  assert.equal(managed.nextAction, "manage_to_bhc");
  assert.equal(managed.activate, false);
  const none = applyRhuNextAction(managed, "none");
  assert.equal(none.nextAction, "none");
  assert.equal(none.receivingBhcId, "");
  assert.equal(Object.keys(RHU_NEXT_ACTIONS).length, 4);
});

test("Manage to BHC is invalid unless Active is explicit or already confirmed", () => {
  const entry = {
    id: "a",
    name: "Hypertension",
    activate: false,
    nextAction: "manage_to_bhc",
    receivingBhcId: "9",
    monitoringRecommendation: "BP weekly",
  };
  const errors = rhuCarePlanErrors([entry], { catchmentBhcIds: [9] });
  assert.equal(errors["diagnoses.a.activate"], "Mark this as an Active patient condition, or choose a different next action.");
  const confirmed = rhuCarePlanErrors([{ ...entry, activate: true }], { catchmentBhcIds: [9] });
  assert.equal(confirmed["diagnoses.a.activate"], undefined);
  const already = rhuCarePlanErrors([entry], {
    catchmentBhcIds: [9],
    conditions: [{ conditionName: "Hypertension", status: "controlled" }],
  });
  assert.equal(already["diagnoses.a.activate"], undefined);
});

test("Presumptive TB activate does not satisfy Manage to BHC without an Active or Controlled condition", () => {
  const entry = {
    id: "tb",
    name: "Tuberculosis",
    activate: true,
    nextAction: "manage_to_bhc",
    receivingBhcId: "9",
    monitoringRecommendation: "Weekly follow-up",
    tbManagement: { diagnosisType: "presumptive_tb", drugResistance: "" },
  };
  assert.equal(diagnosisActivateConfirmed(entry, []), false);
  const errors = rhuCarePlanErrors([entry], { catchmentBhcIds: [9] });
  assert.match(
    errors["diagnoses.tb.nextAction"],
    /Presumptive TB is Under Evaluation\. Manage to BHC is available only for Active or Controlled conditions\./,
  );
  assert.equal(errors["diagnoses.tb.activate"], undefined);

  const disease = rhuCarePlanErrors(
    [{ ...entry, tbManagement: { diagnosisType: "tb_disease", drugResistance: "drug_susceptible" } }],
    { catchmentBhcIds: [9] },
  );
  assert.equal(disease["diagnoses.tb.nextAction"], undefined);

  const alreadyActive = rhuCarePlanErrors(
    [{ ...entry, activate: false }],
    {
      catchmentBhcIds: [9],
      conditions: [{ conditionName: "Tuberculosis", status: "active" }],
    },
  );
  assert.equal(alreadyActive["diagnoses.tb.nextAction"], undefined);
  assert.equal(diagnosisActivateConfirmed(entry, [{ conditionName: "Tuberculosis", status: "active" }]), true);
});

test("No Further Follow-up does not require Active and does not resolve", () => {
  const errors = rhuCarePlanErrors([{ id: "a", name: "URI", activate: false, nextAction: "none" }]);
  assert.deepEqual(errors, {});
});

test("Schedule RHU Follow-up requires date and reason on the entry schedule", () => {
  const entry = { id: "a", name: "Asthma", nextAction: "rhu_follow_up" };
  const errors = rhuCarePlanErrors([entry], { schedules: [] });
  assert.equal(errors["followUpSchedule.entry:a.date"], "Set the RHU follow-up date.");
  assert.equal(errors["followUpSchedule.entry:a.purpose"], "Describe the reason for return.");
  const ok = rhuCarePlanErrors([entry], {
    schedules: [{ purposeKey: "entry:a", date: "2026-11-04", purpose: "Peak flow" }],
  });
  assert.deepEqual(ok, {});
});

test("referral visits cannot schedule RHU follow-up or Manage to BHC", () => {
  const errors = rhuCarePlanErrors(
    [{ id: "a", name: "TB", nextAction: "rhu_follow_up" }],
    { isReferralVisit: true },
  );
  assert.match(errors["diagnoses.a.nextAction"], /Return Slip/);
  const manage = rhuCarePlanErrors(
    [{ id: "a", name: "TB", nextAction: "manage_to_bhc", activate: true, receivingBhcId: "9", monitoringRecommendation: "DOT" }],
    { isReferralVisit: true, catchmentBhcIds: [9] },
  );
  assert.match(manage["diagnoses.a.nextAction"], /Return Slip/);
});

test("referral visits do not require a hidden empty Next Action", () => {
  const empty = rhuCarePlanErrors(
    [{ id: "tb", name: "Tuberculosis", activate: true, nextAction: "" }],
    { isReferralVisit: true },
  );
  assert.equal(empty["diagnoses.tb.nextAction"], undefined);
  assert.deepEqual(empty, {});
  const none = rhuCarePlanErrors(
    [{ id: "tb", name: "Tuberculosis", activate: true, nextAction: "none" }],
    { isReferralVisit: true },
  );
  assert.deepEqual(none, {});
  const saved = diagnosesForRhuSave([{ id: "tb", name: "Tuberculosis", activate: true, nextAction: "" }]);
  assert.equal(saved[0].nextAction, "");
});

test("walk-in visits still require an explicit Next Action", () => {
  const errors = rhuCarePlanErrors(
    [{ id: "a", name: "URI", activate: false, nextAction: "" }],
    { isReferralVisit: false },
  );
  assert.equal(errors["diagnoses.a.nextAction"], "Choose a next action.");
});

test("old visit-level Manage maps onto one diagnosis, not every diagnosis", () => {
  const restored = restoreRhuDiagnoses({
    diagnoses: [
      { id: "a", name: "Hypertension", activate: true },
      { id: "b", name: "Asthma", activate: true },
    ],
    manageToBhc: true,
  });
  assert.equal(diagnosisNextAction(restored[0]), "manage_to_bhc");
  assert.equal(diagnosisNextAction(restored[1]), "");
});

test("a diagnosis that already has Manage keeps it; visit-level Manage does not fan out", () => {
  const restored = restoreRhuDiagnoses({
    diagnoses: [
      { id: "a", name: "Hypertension", nextAction: "none" },
      { id: "b", name: "Asthma", manageToBhc: true },
    ],
    manageToBhc: true,
  });
  assert.equal(diagnosisNextAction(restored[0]), "none");
  assert.equal(diagnosisNextAction(restored[1]), "manage_to_bhc");
});

test("old visit-level RHU follow-up restores as a visit schedule, not every diagnosis", () => {
  const diagnoses = restoreRhuDiagnoses({
    diagnoses: [{ id: "a", name: "URI" }, { id: "b", name: "Asthma" }],
    rhuFollowUp: true,
    followUpDate: "2026-11-10",
    followUpReason: "Recheck",
  });
  assert.equal(diagnosisNextAction(diagnoses[0]), "");
  assert.equal(diagnosisNextAction(diagnoses[1]), "");
  const schedules = restoreRhuFollowUpSchedules({
    rhuFollowUp: true,
    followUpDate: "2026-11-10",
    followUpReason: "Recheck",
  }, diagnoses);
  assert.equal(schedules.length, 1);
  assert.equal(schedules[0].purposeKey, "visit");
  assert.equal(schedules[0].date, "2026-11-10");
});

test("an already Active/Controlled identity is confirmed without silent activate", () => {
  const match = matchingMonitorableCondition("Hypertension", [
    { conditionName: "Hypertension", status: "active" },
  ]);
  assert.ok(match);
  assert.equal(diagnosisActivateConfirmed({ name: "Hypertension", activate: false }, [
    { conditionName: "Hypertension", status: "active" },
  ]), true);
  assert.equal(diagnosisActivateConfirmed({ name: "Asthma", activate: false }, [
    { conditionName: "Hypertension", status: "active" },
  ]), false);
});

test("diagnosesForRhuSave persists independent reportIn destinations", () => {
  const saved = diagnosesForRhuSave([
    {
      id: "d1",
      name: "Dengue",
      reportIn: ["morbidity", "notifiable", "surveillance"],
      nextAction: "none",
    },
    {
      id: "d2",
      name: "Cough",
      reportIn: [],
      nextAction: "none",
    },
  ]);
  assert.deepEqual(saved[0].reportIn, ["morbidity", "notifiable", "surveillance"]);
  assert.deepEqual(saved[1].reportIn, []);
});

test("diagnosesForRhuSave keeps activate and nextAction without fanning Manage", () => {
  const saved = diagnosesForRhuSave([
    { id: "a", name: "Hypertension", activate: true, nextAction: "manage_to_bhc", receivingBhcId: "3", monitoringRecommendation: "Weekly BP" },
    { id: "b", name: "URI", activate: false, nextAction: "none" },
  ]);
  assert.equal(saved[0].manageToBhc, true);
  assert.equal(saved[1].manageToBhc, false);
  assert.equal(saved[1].activate, false);
  assert.equal(saved[1].nextAction, "none");
});

test("higher-level referral validates only its visible required plan details", () => {
  const entry = applyRhuNextAction(emptyRhuDiagnosis("Asthma", "a"), "refer_higher_level");
  const errors = rhuCarePlanErrors([entry]);
  assert.ok(errors["diagnoses.a.higherLevelReferralPlan.reason"]);
  assert.ok(errors["diagnoses.a.higherLevelReferralPlan.clinicalPlan"]);
  assert.equal(errors["diagnoses.a.nextAction"], undefined);
  assert.equal(errors["diagnoses.a.higherLevelReferralPlan.intendedFacility"], undefined);
  assert.deepEqual(rhuCarePlanErrors([{ ...entry, higherLevelReferralPlan: {
    reason: "Specialist assessment", intendedFacility: "", clinicalPlan: "Continue prescribed care pending review",
  } }]), {});
});

test("higher-level referral survives save normalization and draft restore without TB initiation or Manage", () => {
  const plan = { reason: "Specialist assessment", intendedFacility: "Provincial hospital", clinicalPlan: "Review available investigations" };
  const entries = [{ id: "tb", name: "TB", nextAction: "refer_higher_level", higherLevelReferralPlan: plan,
    tbManagement: { diagnosisType: "tb_disease", drugResistance: "drug_susceptible" } },
  { id: "other", name: "URI", nextAction: "none" }];
  const saved = normalizeDiagnoses(diagnosesForRhuSave(entries));
  const restored = restoreRhuDiagnoses({ diagnoses: saved });
  assert.equal(saved[0].nextAction, "refer_higher_level");
  assert.deepEqual(saved[0].higherLevelReferralPlan, plan);
  assert.deepEqual(restored[0].higherLevelReferralPlan, plan);
  assert.equal(saved[0].manageToBhc, false);
  assert.equal(saved[0].tbManagement.openTreatmentCard, false);
  assert.equal(saved[0].tbManagement.treatmentDecision, "");
  assert.equal(saved[1].nextAction, "none");
});

test("leaving higher-level referral clears its plan and does not require hidden details", () => {
  for (const action of ["none", "rhu_follow_up", "manage_to_bhc"]) {
    const switched = applyRhuNextAction({ id: "a", name: "Asthma", nextAction: "refer_higher_level",
      higherLevelReferralPlan: { reason: "Old reason", intendedFacility: "Old facility", clinicalPlan: "Old plan" } }, action);
    assert.equal(switched.higherLevelReferralPlan, null);
    assert.equal(Object.keys(rhuCarePlanErrors([switched])).some(key => key.includes("higherLevelReferralPlan")), false);
    const returned = applyRhuNextAction(switched, "refer_higher_level");
    assert.deepEqual(returned.higherLevelReferralPlan, { reason: "", intendedFacility: "", clinicalPlan: "" });
  }
});
