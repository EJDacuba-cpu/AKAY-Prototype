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
  assert.equal(Object.keys(RHU_NEXT_ACTIONS).length, 3);
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
