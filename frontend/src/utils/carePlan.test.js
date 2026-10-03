import test from "node:test";
import assert from "node:assert/strict";
import {
  CARE_PLAN, CARE_PLAN_OPTIONS, CARE_PLAN_LABELS, conditionIdentity, defaultCarePlan, carePlanFor, continuingRows,
  stopsRequired, referredDiagnoses, buildReferralReason, deriveDisposition, validateCarePlan,
  buildCarePlanPayload, monitoredConditionKeys, NO_CONDITION_MESSAGE,
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
    "No Ongoing Tracking", "Monitor at BHC", "Refer to RHU",
  ]);
});

test("the retired monitor + refer value keeps its label for older records", () => {
  assert.equal(CARE_PLAN_LABELS.monitor_refer, "Monitor at BHC + Refer to RHU");
  assert.equal(CARE_PLAN_LABELS.refer, "Refer to RHU");
});

test("a draft still holding monitor + refer resolves to Refer to RHU", () => {
  assert.equal(carePlanFor({ name: "HTN", carePlan: "monitor_refer" }, [], registry), CARE_PLAN.REFER);
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

test("a continued condition without a stored key is keyed by its registry name", () => {
  // Follow-up conditions from care-overview carry no condition_key.
  const tb = { id: 9, conditionName: "Tuberculosis", conditionKey: null };
  assert.deepEqual(monitoredConditionKeys([], [tb, asthmaMonitoring], {}, registry), ["tuberculosis", null]);
});

test("continuing rows are the continued conditions not diagnosed this visit", () => {
  const rows = continuingRows([{ id: "d1", name: "Hypertension" }], [htnMonitoring, asthmaMonitoring], registry);
  assert.deepEqual(rows.map((m) => m.id), [4]);
});

test("a re-diagnosed continued condition set to no tracking needs a stop reason", () => {
  const diagnoses = [{ id: "d1", name: "HTN", carePlan: "none" }];
  assert.deepEqual(stopsRequired(diagnoses, [htnMonitoring, asthmaMonitoring], {}, registry), { 3: true });
  const errors = validateCarePlan({ diagnoses, continuedMonitorings: [htnMonitoring], stops: { 3: "  " }, registry });
  assert.ok(errors["carePlanStop.3"]);
  assert.deepEqual(validateCarePlan({ diagnoses, continuedMonitorings: [htnMonitoring], stops: { 3: "Controlled" }, registry }), {});
});

test("referring a continued condition keeps it monitored and needs no stop", () => {
  const diagnoses = [{ id: "d1", name: "HTN", carePlan: "refer" }];
  // A stale stop entry (typed before switching to Refer) is not sent.
  const stops = { 3: "Old reason" };
  assert.deepEqual(stopsRequired(diagnoses, [htnMonitoring], stops, registry), {});
  assert.deepEqual(validateCarePlan({ diagnoses, continuedMonitorings: [htnMonitoring], stops: {}, registry }), {});
  assert.deepEqual(monitoredConditionKeys(diagnoses, [htnMonitoring], stops, registry), ["hypertension"]);
  assert.deepEqual(buildCarePlanPayload({ continuedMonitorings: [htnMonitoring], stops, diagnoses, registry }).monitoring_stops, []);
});

test("an explicit stop on a continuing row also needs a reason", () => {
  const errors = validateCarePlan({ diagnoses: [], continuedMonitorings: [asthmaMonitoring], stops: { 4: "" }, registry });
  assert.ok(errors["carePlanStop.4"]);
});

test("referral set and pre-filled reason follow the current diagnoses only", () => {
  const diagnoses = [
    { id: "d1", name: "Diabetes Mellitus", carePlan: "refer" },
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
    deriveDisposition({ diagnoses: [{ name: "HTN", carePlan: "monitor" }, { name: "Pneumonia", carePlan: "refer" }], continuedMonitorings: [], stops: {}, registry, serviceNeedsNextVisit: false }),
    { needsReferral: true, showsFollowUp: true, monitorsAny: true, monitorsDiagnosis: true },
  );
  assert.deepEqual(
    deriveDisposition({ diagnoses: [{ name: "Cough", carePlan: "none" }], continuedMonitorings: [], stops: {}, registry, serviceNeedsNextVisit: false }),
    { needsReferral: false, showsFollowUp: false, monitorsAny: false, monitorsDiagnosis: false },
  );
  // A referred continued condition stays monitored, but no diagnosis is set
  // to Monitor - so the referral still hands the follow-up to the RHU.
  assert.deepEqual(
    deriveDisposition({ diagnoses: [{ name: "HTN", carePlan: "refer" }], continuedMonitorings: [htnMonitoring], stops: {}, registry, serviceNeedsNextVisit: false }),
    { needsReferral: true, showsFollowUp: true, monitorsAny: true, monitorsDiagnosis: false },
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

test("a new condition defaults to No Ongoing Tracking and needs no choice before the visit moves on", () => {
  const diagnoses = [
    { id: "d1", name: "Cough" },
    { id: "d2", name: "Asthma", carePlan: "refer" },
    { id: "d3", name: "HTN" },
  ];
  assert.equal(carePlanFor(diagnoses[0], [htnMonitoring], registry), CARE_PLAN.NONE);
  assert.equal(carePlanFor(diagnoses[1], [htnMonitoring], registry), CARE_PLAN.REFER);
  // A continued condition keeps its Monitor default; a new one has no stop to explain.
  assert.equal(carePlanFor(diagnoses[2], [htnMonitoring], registry), CARE_PLAN.MONITOR);
  assert.deepEqual(validateCarePlan({ diagnoses, continuedMonitorings: [htnMonitoring], stops: {}, registry }), {});
});

test("a visit with no suspected condition has nothing to choose and needs no care-plan error", () => {
  assert.deepEqual(validateCarePlan({ diagnoses: [], continuedMonitorings: [], stops: {}, registry }), {});
  assert.match(NO_CONDITION_MESSAGE, /No suspected condition was recorded for this visit\. No condition-specific care plan is required\./);
});

test("a general consultation carries no care plan, referral, monitoring or follow-up", () => {
  assert.deepEqual(
    deriveDisposition({ diagnoses: [], continuedMonitorings: [], stops: {}, registry, serviceNeedsNextVisit: false }),
    { needsReferral: false, showsFollowUp: false, monitorsAny: false, monitorsDiagnosis: false },
  );
  // Existing monitorings that were not brought into the visit are never listed or stopped.
  assert.deepEqual(continuingRows([], [], registry), []);
  assert.deepEqual(buildCarePlanPayload({ diagnoses: [], continuedMonitorings: [], stops: {}, registry }), {
    continued_follow_up_task_ids: [],
    continued_monitoring_ids: [],
    monitoring_stops: [],
  });
});
