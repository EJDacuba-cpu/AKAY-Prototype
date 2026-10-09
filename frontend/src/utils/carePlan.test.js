import test from "node:test";
import assert from "node:assert/strict";
import {
  CARE_PLAN, CARE_PLAN_OPTIONS, CARE_PLAN_LABELS, conditionIdentity, matchConditionKey, carePlanFor,
  schedulesBhcFollowUp, withCarePlan, withBhcFollowUp, validateConcernActions, migrateLegacyConcernPlans,
  refers, stopsRequired, referredConcerns, referredContinuingRows,
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

test("the offered care plan actions are No Further BHC Action, Schedule BHC Follow-up and Refer to RHU, in order", () => {
  assert.deepEqual(
    CARE_PLAN_OPTIONS.map((o) => o.label),
    ["No Further BHC Action", "Schedule BHC Follow-up", "Refer to RHU"],
  );
  assert.deepEqual(CARE_PLAN_OPTIONS.map((o) => o.value), ["none", "follow_up", "refer"]);
});

test("no emergency option is offered", () => {
  assert.ok(!CARE_PLAN_OPTIONS.some((o) => /emergency/i.test(o.value) || /emergency/i.test(o.label)));
});

test("labels cover the new values and the historical ones kept for stored records", () => {
  assert.equal(CARE_PLAN_LABELS.none, "No Further BHC Action");
  assert.equal(CARE_PLAN_LABELS.follow_up, "Schedule BHC Follow-up");
  assert.equal(CARE_PLAN_LABELS.refer, "Refer to RHU");
  assert.equal(CARE_PLAN_LABELS.recheck, "Recheck");
  assert.equal(CARE_PLAN_LABELS.monitor, "Monitor at BHC");
  assert.equal(CARE_PLAN_LABELS.monitor_refer, "Monitor at BHC + Refer to RHU");
});

test("a concern has a care plan action only when a selectable one is chosen", () => {
  assert.equal(carePlanFor({ name: "Cough" }), null);
  assert.equal(carePlanFor({ name: "Cough", carePlan: "none" }), "none");
  assert.equal(carePlanFor({ name: "Cough", carePlan: "follow_up" }), "follow_up");
  assert.equal(carePlanFor({ name: "Cough", carePlan: "refer" }), "refer");
  assert.equal(carePlanFor(null), null);
});

test("a historical value from an old draft needs a new choice", () => {
  assert.equal(carePlanFor({ name: "Cough", carePlan: "recheck" }), null);
  assert.equal(carePlanFor({ name: "HTN", carePlan: "monitor" }), null);
  assert.equal(carePlanFor({ name: "HTN", carePlan: "monitor_refer" }), null);
  assert.equal(carePlanFor({ name: "HTN", carePlan: "bogus" }), null);
});

test("schedulesBhcFollowUp: follow-up, or a referral with the BHC follow-up flag", () => {
  assert.equal(schedulesBhcFollowUp({ carePlan: "follow_up" }), true);
  assert.equal(schedulesBhcFollowUp({ carePlan: "refer", bhcFollowUp: true }), true);
  assert.equal(schedulesBhcFollowUp({ carePlan: "refer" }), false);
  assert.equal(schedulesBhcFollowUp({ carePlan: "refer", bhcFollowUp: false }), false);
  assert.equal(schedulesBhcFollowUp({ carePlan: "none" }), false);
  // The flag means nothing without a referral.
  assert.equal(schedulesBhcFollowUp({ carePlan: "none", bhcFollowUp: true }), false);
  // recheck is migrated to follow_up first (migrateLegacyConcernPlans).
  assert.equal(schedulesBhcFollowUp({ carePlan: "recheck" }), false);
  assert.equal(schedulesBhcFollowUp(null), false);
  assert.equal(schedulesBhcFollowUp({}), false);
});

test("refers covers Refer to RHU and the historical Monitor + Refer", () => {
  assert.equal(refers(CARE_PLAN.REFER), true);
  assert.equal(refers(CARE_PLAN.MONITOR_REFER), true);
  assert.equal(refers(CARE_PLAN.FOLLOW_UP), false);
  assert.equal(refers(CARE_PLAN.RECHECK), false);
});

test("withCarePlan drops bhcFollowUp unless refer", () => {
  const flagged = { id: "a", name: "Pneumonia", carePlan: "refer", bhcFollowUp: true };
  assert.equal(Object.hasOwn(withCarePlan(flagged, "none"), "bhcFollowUp"), false);
  assert.equal(Object.hasOwn(withCarePlan(flagged, "follow_up"), "bhcFollowUp"), false);
  // Switching back to refer does not restore it.
  const back = withCarePlan(withCarePlan(flagged, "none"), "refer");
  assert.equal(back.carePlan, "refer");
  assert.equal(Object.hasOwn(back, "bhcFollowUp"), false);
  // Re-choosing refer keeps an existing flag.
  assert.equal(withCarePlan(flagged, "refer").bhcFollowUp, true);
  assert.equal(withCarePlan({ id: "a", name: "Cough" }, "follow_up").carePlan, "follow_up");
  // The input is not mutated.
  assert.equal(flagged.carePlan, "refer");
  assert.equal(flagged.bhcFollowUp, true);
});

test("withBhcFollowUp sets the flag on a referral only", () => {
  const referred = { id: "a", name: "Pneumonia", carePlan: "refer" };
  assert.equal(withBhcFollowUp(referred, true).bhcFollowUp, true);
  assert.equal(Object.hasOwn(withBhcFollowUp(withBhcFollowUp(referred, true), false), "bhcFollowUp"), false);
  const followUp = { id: "b", name: "Wound", carePlan: "follow_up" };
  assert.deepEqual(withBhcFollowUp(followUp, true), followUp);
  const none = { id: "c", name: "Cough", carePlan: "none" };
  assert.deepEqual(withBhcFollowUp(none, true), none);
  assert.deepEqual(withBhcFollowUp({ id: "d", name: "Rash" }, true), { id: "d", name: "Rash" });
});

test("validateConcernActions flags a concern with no choice and with a historical recheck", () => {
  const message = "Choose a care plan action for this health concern.";
  assert.deepEqual(
    validateConcernActions([
      { id: "a", name: "Cough" },
      { id: "b", name: "Fever", carePlan: "recheck" },
      { id: "c", name: "Wound", carePlan: "follow_up" },
      { id: "d", name: "Rash", carePlan: "none" },
      { id: "e", name: "TB", carePlan: "refer" },
    ]),
    { "carePlanAction.a": message, "carePlanAction.b": message },
  );
  assert.deepEqual(validateConcernActions([]), {});
  assert.deepEqual(validateConcernActions(), {});
});

test("migrateLegacyConcernPlans maps recheck and prefills the reason", () => {
  const migrated = migrateLegacyConcernPlans([{ name: "Elevated BP", carePlan: "recheck" }], "");
  assert.deepEqual(migrated, {
    diagnoses: [{ name: "Elevated BP", carePlan: "follow_up" }],
    followUpReason: "Recheck: Elevated BP",
  });
  // A typed reason is kept unchanged.
  assert.equal(
    migrateLegacyConcernPlans([{ name: "Elevated BP", carePlan: "recheck" }], "BP in 1 week").followUpReason,
    "BP in 1 week",
  );
  // Several rechecked concerns; other concerns are left alone.
  const several = migrateLegacyConcernPlans(
    [
      { name: " Elevated BP ", carePlan: "recheck" },
      { name: "Fever", carePlan: "recheck" },
      { name: "Cough", carePlan: "follow_up" },
      { name: "TB", carePlan: "refer", bhcFollowUp: true },
    ],
    "  ",
  );
  assert.equal(several.followUpReason, "Recheck: Elevated BP; Fever");
  assert.deepEqual(several.diagnoses.map((d) => d.carePlan), ["follow_up", "follow_up", "follow_up", "refer"]);
  assert.equal(several.diagnoses[3].bhcFollowUp, true);
  // Nothing to migrate: the reason is untouched.
  assert.deepEqual(
    migrateLegacyConcernPlans([{ name: "Cough", carePlan: "none" }], ""),
    { diagnoses: [{ name: "Cough", carePlan: "none" }], followUpReason: "" },
  );
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
    { id: "d2", name: "Fever", carePlan: "follow_up" },
    { id: "d3", name: "Cough" },
  ];
  assert.deepEqual(referredConcerns(concerns).map((c) => c.id), ["d1"]);
  assert.equal(buildReferralReason(concerns, [], []), "Referred for: Pneumonia");
  assert.equal(buildReferralReason(concerns, [htnMonitoring], [3]), "Referred for: Pneumonia; Hypertension");
  assert.equal(buildReferralReason([], [htnMonitoring], [3]), "Referred for: Hypertension");
  assert.equal(buildReferralReason([{ name: "Fever", carePlan: "follow_up" }], [htnMonitoring], []), "");
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
  // Schedule BHC Follow-up keeps the BHC follow-up even through a referral.
  assert.deepEqual(
    deriveDisposition({ concerns: [{ name: "BP", carePlan: "follow_up" }, { name: "Pneumonia", carePlan: "refer" }], registry }),
    { needsReferral: true, showsFollowUp: true, monitorsAny: false, keepsFollowUpWithReferral: true },
  );
  // A referral flagged for BHC follow-up keeps it too.
  assert.deepEqual(
    deriveDisposition({ concerns: [{ name: "Pneumonia", carePlan: "refer", bhcFollowUp: true }], registry }),
    { needsReferral: true, showsFollowUp: true, monitorsAny: false, keepsFollowUpWithReferral: true },
  );
  // No Further BHC Action carries nothing.
  assert.deepEqual(
    deriveDisposition({ concerns: [{ name: "Cough", carePlan: "none" }], registry }),
    { needsReferral: false, showsFollowUp: false, monitorsAny: false, keepsFollowUpWithReferral: false },
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
    shared_referral_acknowledged: false,
  });
});

test("the payload carries shared_referral_acknowledged", () => {
  assert.equal(buildCarePlanPayload({ sharedReferralAcknowledged: true }).shared_referral_acknowledged, true);
  assert.equal(buildCarePlanPayload({ sharedReferralAcknowledged: false }).shared_referral_acknowledged, false);
  assert.equal(buildCarePlanPayload().shared_referral_acknowledged, false);
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
    shared_referral_acknowledged: false,
  });
  assert.deepEqual(
    deriveDisposition(),
    { needsReferral: false, showsFollowUp: false, monitorsAny: false, keepsFollowUpWithReferral: false },
  );
});
