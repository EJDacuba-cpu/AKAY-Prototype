import test from "node:test";
import assert from "node:assert/strict";
import {
  CARE_PLAN, CARE_PLAN_OPTIONS, conditionIdentity, defaultCarePlan, carePlanFor, continuingRows,
  stopsRequired, referredDiagnoses, buildReferralReason, deriveDisposition, validateCarePlan,
  buildCarePlanPayload, monitoredConditionKeys,
} from "./carePlan.js";

const registry = {
  monitored_conditions: {
    hypertension: { name: "Hypertension", aliases: ["HTN"] },
    diabetes_mellitus: { name: "Diabetes Mellitus", aliases: ["DM"] },
    tuberculosis: { name: "Tuberculosis", aliases: ["PTB"], monitoring_details: "tb_dots" },
  },
};
const htnMonitoring = { id: 3, conditionName: "Hypertension", conditionKey: "hypertension" };
const asthmaMonitoring = { id: 4, conditionName: "Asthma", conditionKey: null };

test("labels are explicit and in order", () => {
  assert.deepEqual(CARE_PLAN_OPTIONS.map((o) => o.label), [
    "No Ongoing Tracking", "Monitor at BHC", "Refer to RHU", "Monitor at BHC + Refer to RHU",
  ]);
});

test("identity uses the registry key, else the normalized name", () => {
  assert.equal(conditionIdentity("HTN", registry), "hypertension");
  assert.equal(conditionIdentity("  Post-op  Wound Care ", registry), "name:post-op wound care");
});

test("a new diagnosis defaults to no tracking; a continued one defaults to monitor", () => {
  assert.equal(defaultCarePlan({ name: "Cough" }, [htnMonitoring], registry), CARE_PLAN.NONE);
  assert.equal(defaultCarePlan({ name: "HTN" }, [htnMonitoring], registry), CARE_PLAN.MONITOR);
  assert.equal(carePlanFor({ name: "HTN", carePlan: "refer" }, [htnMonitoring], registry), "refer");
});

test("continuing rows are the continued conditions not diagnosed this visit", () => {
  const rows = continuingRows([{ id: "d1", name: "Hypertension" }], [htnMonitoring, asthmaMonitoring], registry);
  assert.deepEqual(rows.map((m) => m.id), [4]);
});

test("a re-diagnosed continued condition set to no tracking or refer needs a stop reason", () => {
  const diagnoses = [{ id: "d1", name: "HTN", carePlan: "refer" }];
  assert.deepEqual(stopsRequired(diagnoses, [htnMonitoring, asthmaMonitoring], {}, registry), { 3: true });
  const errors = validateCarePlan({ diagnoses, continuedMonitorings: [htnMonitoring], stops: { 3: "  " }, registry });
  assert.ok(errors["carePlanStop.3"]);
  assert.deepEqual(validateCarePlan({ diagnoses, continuedMonitorings: [htnMonitoring], stops: { 3: "Referred for insulin" }, registry }), {});
});

test("an explicit stop on a continuing row also needs a reason", () => {
  const errors = validateCarePlan({ diagnoses: [], continuedMonitorings: [asthmaMonitoring], stops: { 4: "" }, registry });
  assert.ok(errors["carePlanStop.4"]);
});

test("referral set and pre-filled reason follow the current diagnoses only", () => {
  const diagnoses = [
    { id: "d1", name: "Diabetes Mellitus", carePlan: "monitor_refer" },
    { id: "d2", name: "Hypertension", carePlan: "refer" },
    { id: "d3", name: "Cough", carePlan: "none" },
  ];
  assert.deepEqual(referredDiagnoses(diagnoses, [], registry).map((d) => d.id), ["d1", "d2"]);
  assert.equal(buildReferralReason(diagnoses, [], registry), "Referred for: Diabetes Mellitus; Hypertension");
  // d2 removed after being set to Refer: gone from the set and the reason.
  assert.equal(buildReferralReason(diagnoses.filter((d) => d.id !== "d2"), [], registry), "Referred for: Diabetes Mellitus");
});

test("disposition: referral, follow-up visibility, monitoring", () => {
  assert.deepEqual(
    deriveDisposition({ diagnoses: [{ name: "HTN", carePlan: "monitor_refer" }], continuedMonitorings: [], stops: {}, registry, serviceNeedsNextVisit: false }),
    { needsReferral: true, showsFollowUp: true, monitorsAny: true },
  );
  assert.deepEqual(
    deriveDisposition({ diagnoses: [{ name: "Cough", carePlan: "none" }], continuedMonitorings: [], stops: {}, registry, serviceNeedsNextVisit: false }),
    { needsReferral: false, showsFollowUp: false, monitorsAny: false },
  );
  assert.equal(
    deriveDisposition({ diagnoses: [], continuedMonitorings: [], stops: {}, registry, serviceNeedsNextVisit: true }).showsFollowUp,
    true,
  );
  assert.equal(
    deriveDisposition({ diagnoses: [], continuedMonitorings: [asthmaMonitoring], stops: { 4: "Resolved" }, registry, serviceNeedsNextVisit: false }).monitorsAny,
    false,
  );
});

test("monitored condition keys include continued ones that are not stopped", () => {
  const keys = monitoredConditionKeys([{ name: "PTB", carePlan: "monitor" }], [htnMonitoring, asthmaMonitoring], { 3: "Resolved" }, registry);
  assert.deepEqual(keys.sort(), [null, "tuberculosis"].sort());
});

test("payload lists continued ids and only real stops", () => {
  const payload = buildCarePlanPayload({
    continuedFollowUpTaskIds: [9],
    continuedMonitorings: [htnMonitoring, asthmaMonitoring],
    stops: { 4: " Moved away ", 3: "" },
    diagnoses: [],
    registry,
  });
  assert.deepEqual(payload, {
    continued_follow_up_task_ids: [9],
    continued_monitoring_ids: [3, 4],
    monitoring_stops: [{ monitoring_id: 4, reason: "Moved away" }],
  });
});
