import test from "node:test";
import assert from "node:assert/strict";
import {
  CARE_PLAN, CARE_PLAN_OPTIONS, CARE_PLAN_LABELS, conditionIdentity, matchConditionKey, carePlanFor,
  keepsBhcFollowUp, refers, recheckReason, stopsRequired, referredConcerns, referredContinuingRows,
  buildReferralReason, deriveDisposition, validateCarePlan, buildCarePlanPayload, monitoredConditionKeys,
  NO_CONCERN_MESSAGE,
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

test("the offered next actions are Recheck, Follow-up and Refer to RHU, in order", () => {
  assert.deepEqual(CARE_PLAN_OPTIONS.map((o) => o.label), ["Recheck", "Follow-up", "Refer to RHU"]);
});

test("no emergency option is offered", () => {
  assert.deepEqual(CARE_PLAN_OPTIONS.map((o) => o.value), ["recheck", "follow_up", "refer"]);
});

test("labels cover the new values and the legacy ones kept for stored records", () => {
  assert.equal(CARE_PLAN_LABELS.recheck, "Recheck");
  assert.equal(CARE_PLAN_LABELS.follow_up, "Follow-up");
  assert.equal(CARE_PLAN_LABELS.refer, "Refer to RHU");
  assert.equal(CARE_PLAN_LABELS.none, "No Ongoing Tracking");
  assert.equal(CARE_PLAN_LABELS.monitor, "Monitor at BHC");
  assert.equal(CARE_PLAN_LABELS.monitor_refer, "Monitor at BHC + Refer to RHU");
});

test("a concern has a next action only when one is chosen", () => {
  assert.equal(carePlanFor({ name: "Cough" }), null);
  assert.equal(carePlanFor({ name: "Cough", carePlan: "recheck" }), "recheck");
  assert.equal(carePlanFor({ name: "Cough", carePlan: "follow_up" }), "follow_up");
  assert.equal(carePlanFor({ name: "Cough", carePlan: "refer" }), "refer");
  assert.equal(carePlanFor(null), null);
});

test("a legacy monitor value from an old draft needs a new choice", () => {
  assert.equal(carePlanFor({ name: "HTN", carePlan: "monitor" }), null);
  assert.equal(carePlanFor({ name: "HTN", carePlan: "monitor_refer" }), null);
  assert.equal(carePlanFor({ name: "HTN", carePlan: "none" }), null);
  assert.equal(carePlanFor({ name: "HTN", carePlan: "bogus" }), null);
});

test("Recheck and Follow-up keep the BHC follow-up; Refer does not", () => {
  assert.equal(keepsBhcFollowUp(CARE_PLAN.RECHECK), true);
  assert.equal(keepsBhcFollowUp(CARE_PLAN.FOLLOW_UP), true);
  assert.equal(keepsBhcFollowUp(CARE_PLAN.REFER), false);
  assert.equal(keepsBhcFollowUp(null), false);
  assert.equal(refers(CARE_PLAN.REFER), true);
  assert.equal(refers(CARE_PLAN.MONITOR_REFER), true);
  assert.equal(refers(CARE_PLAN.RECHECK), false);
});

test("recheck reason lists rechecked concerns only", () => {
  assert.equal(recheckReason([{ name: "Elevated BP", carePlan: "recheck" }, { name: "Cough", carePlan: "refer" }]), "Recheck: Elevated BP");
  assert.equal(
    recheckReason([{ name: " Elevated BP ", carePlan: "recheck" }, { name: "Fever", carePlan: "recheck" }, { name: "Cough", carePlan: "follow_up" }]),
    "Recheck: Elevated BP; Fever",
  );
  assert.equal(recheckReason([{ name: "Cough", carePlan: "follow_up" }]), "");
  assert.equal(recheckReason(), "");
});

test("identity uses the registry key, else the normalized name", () => {
  assert.equal(conditionIdentity("HTN", registry), "hypertension");
  assert.equal(conditionIdentity("  Post-op  Wound Care ", registry), "name:post-op wound care");
  assert.equal(matchConditionKey("ptb", registry), "tuberculosis");
  assert.equal(matchConditionKey("Asthma", registry), null);
});

test("a continued condition without a stored key is keyed by its registry name", () => {
  // Follow-up conditions from care-overview carry no condition_key.
  const tb = { id: 9, conditionName: "Tuberculosis", conditionKey: null };
  assert.deepEqual(monitoredConditionKeys([tb, asthmaMonitoring], [], {}, registry), ["tuberculosis", null]);
});

test("only an explicit stop ends a continued condition, and it needs a reason", () => {
  assert.deepEqual(stopsRequired([htnMonitoring, asthmaMonitoring], {}), {});
  assert.deepEqual(stopsRequired([htnMonitoring, asthmaMonitoring], { 4: "" }), { 4: true });
  // A stop for a monitoring that is not continued this visit is ignored.
  assert.deepEqual(stopsRequired([htnMonitoring], { 99: "Gone" }), {});
  const errors = validateCarePlan({ continuedMonitorings: [asthmaMonitoring], stops: { 4: "  " } });
  assert.ok(errors["carePlanStop.4"]);
  assert.deepEqual(validateCarePlan({ continuedMonitorings: [asthmaMonitoring], stops: { 4: "Moved away" } }), {});
  assert.deepEqual(validateCarePlan({ continuedMonitorings: [asthmaMonitoring], stops: {} }), {});
});

test("a concern is not tied to a monitored condition: naming one never stops it", () => {
  assert.deepEqual(stopsRequired([htnMonitoring], {}), {});
  assert.deepEqual(monitoredConditionKeys([htnMonitoring], [], {}, registry), ["hypertension"]);
});

test("a followed condition can be referred without a concern; a stop wins over a stale referral", () => {
  const referred = referredContinuingRows([htnMonitoring, asthmaMonitoring], {}, [3]);
  assert.deepEqual(referred.map((m) => m.id), [3]);
  assert.deepEqual(referredContinuingRows([htnMonitoring], { 3: "Resolved" }, [3]), []);
  assert.deepEqual(referredContinuingRows([htnMonitoring], {}, ["3"]).map((m) => m.id), [3]);
});

test("referral reason follows the concerns referred now and the referred followed conditions", () => {
  const concerns = [
    { id: "d1", name: "Pneumonia", carePlan: "refer" },
    { id: "d2", name: "Fever", carePlan: "recheck" },
    { id: "d3", name: "Cough" },
  ];
  assert.deepEqual(referredConcerns(concerns).map((c) => c.id), ["d1"]);
  assert.equal(buildReferralReason(concerns, [], []), "Referred for: Pneumonia");
  assert.equal(buildReferralReason(concerns, [htnMonitoring], [3]), "Referred for: Pneumonia; Hypertension");
  assert.equal(buildReferralReason([], [htnMonitoring], [3]), "Referred for: Hypertension");
  assert.equal(buildReferralReason([{ name: "Fever", carePlan: "recheck" }], [htnMonitoring], []), "");
  // A legacy value from an old draft is not a choice, so it refers nothing.
  assert.equal(buildReferralReason([{ name: "HTN", carePlan: "monitor_refer" }], [], []), "");
});

test("monitored condition keys: continued not stopped, plus starting conditions", () => {
  const starting = [{ id: 7, conditionName: "PTB", conditionKey: null, status: "Active", confirmedAt: "2026-10-01" }];
  assert.deepEqual(
    monitoredConditionKeys([htnMonitoring, asthmaMonitoring], starting, { 3: "Resolved" }, registry).sort(),
    [null, "tuberculosis"].sort(),
  );
  const keyed = [{ id: 8, conditionName: "Diabetes Mellitus", conditionKey: "diabetes_mellitus", status: "Active", confirmedAt: "2026-10-01" }];
  assert.deepEqual(monitoredConditionKeys([], keyed, {}, registry), ["diabetes_mellitus"]);
  assert.deepEqual(monitoredConditionKeys([], [], {}, registry), []);
  assert.deepEqual(monitoredConditionKeys(), []);
});

test("disposition: referral, follow-up visibility, monitoring", () => {
  // Recheck keeps the BHC follow-up even through a referral.
  assert.deepEqual(
    deriveDisposition({ concerns: [{ name: "BP", carePlan: "recheck" }, { name: "Pneumonia", carePlan: "refer" }], registry }),
    { needsReferral: true, showsFollowUp: true, monitorsAny: false, keepsFollowUpWithReferral: true },
  );
  // A concern with no next action carries nothing.
  assert.deepEqual(
    deriveDisposition({ concerns: [{ name: "Cough" }], registry }),
    { needsReferral: false, showsFollowUp: false, monitorsAny: false, keepsFollowUpWithReferral: false },
  );
  // A referred concern alone hands the follow-up to the RHU.
  assert.deepEqual(
    deriveDisposition({ concerns: [{ name: "Pneumonia", carePlan: "refer" }], registry }),
    { needsReferral: true, showsFollowUp: false, monitorsAny: false, keepsFollowUpWithReferral: false },
  );
  // A followed condition referred stays monitored but does not keep the follow-up through the referral.
  assert.deepEqual(
    deriveDisposition({ continuedMonitorings: [htnMonitoring], referrals: [3], registry }),
    { needsReferral: true, showsFollowUp: true, monitorsAny: true, keepsFollowUpWithReferral: false },
  );
  // Starting a confirmed condition is monitoring.
  assert.equal(deriveDisposition({ startingConditions: [{ id: 7, conditionName: "Hypertension" }], registry }).monitorsAny, true);
  assert.equal(deriveDisposition({ serviceNeedsNextVisit: true, registry }).showsFollowUp, true);
  assert.equal(
    deriveDisposition({ continuedMonitorings: [asthmaMonitoring], stops: { 4: "Resolved" }, registry }).monitorsAny,
    false,
  );
});

test("a legacy value from an old draft does not keep the follow-up", () => {
  assert.equal(deriveDisposition({ concerns: [{ name: "HTN", carePlan: "monitor" }], registry }).keepsFollowUpWithReferral, false);
});

test("payload lists continued ids, starting conditions and only real stops", () => {
  const payload = buildCarePlanPayload({
    continuedFollowUpTaskIds: [9],
    continuedMonitorings: [htnMonitoring, asthmaMonitoring],
    startingConditions: [{ id: 7 }],
    stops: { 4: " Moved away ", 3: "" },
    referrals: [],
  });
  assert.deepEqual(payload, {
    continued_follow_up_task_ids: [9],
    continued_monitoring_ids: [3, 4],
    start_monitoring_condition_ids: [7],
    monitoring_stops: [{ monitoring_id: 4, reason: "Moved away" }],
    monitoring_referrals: [],
  });
});

test("payload carries starting conditions and no status updates", () => {
  const payload = buildCarePlanPayload({ startingConditions: [{ id: 7 }] });
  assert.deepEqual(payload.start_monitoring_condition_ids, [7]);
  assert.ok(!("monitoring_status_updates" in payload));
});

test("payload lists referred followed conditions; a stop wins over a referral", () => {
  const payload = buildCarePlanPayload({
    continuedMonitorings: [htnMonitoring, asthmaMonitoring],
    stops: { 4: "Resolved at RHU" },
    referrals: [3, 4],
  });
  assert.deepEqual(payload.monitoring_referrals, [3]);
});

test("a visit with no health concern has nothing to choose", () => {
  assert.deepEqual(validateCarePlan(), {});
  assert.equal(NO_CONCERN_MESSAGE, "No health concern was recorded for this visit.");
  assert.deepEqual(buildCarePlanPayload(), {
    continued_follow_up_task_ids: [],
    continued_monitoring_ids: [],
    start_monitoring_condition_ids: [],
    monitoring_stops: [],
    monitoring_referrals: [],
  });
  assert.deepEqual(
    deriveDisposition(),
    { needsReferral: false, showsFollowUp: false, monitorsAny: false, keepsFollowUpWithReferral: false },
  );
});
