import test from "node:test";
import assert from "node:assert/strict";
import {
  extraScheduleRows,
  followUpSchedulesPayload,
  restoreFollowUpSchedules,
  VISIT_PURPOSE_KEY,
} from "./followUpSchedules.js";
import { restoreNextActions, nextActionsDraft, hasReferralDecision } from "./nextActions.js";
import {
  CARE_PLAN_SERVICE_LABELS,
  SERVICE_NEXT_ACTIONS,
  adoptOrphanServiceSchedules,
  applyServiceNextAction,
  applyServiceReferral,
  carePlanServiceLabel,
  defaultServicePurpose,
  pruneServiceReferrals,
  pruneServiceSchedules,
  restoreSelectedServiceSchedules,
  restoreServiceReferrals,
  selectedCarePlanServices,
  serviceNextAction,
  servicePurposeKey,
  serviceSchedule,
  suggestionsForProgram,
} from "./serviceNextActions.js";

const prenatalKey = servicePurposeKey("Maternal");
const epiKey = servicePurposeKey("EPI");
const fpKey = servicePurposeKey("Family Planning");

test("no selected service has no next-action rows", () => {
  assert.deepEqual(selectedCarePlanServices([]), []);
  assert.equal(serviceNextAction("Maternal", { schedules: [], serviceReferrals: [] }), "none");
});

test("Prenatal with no additional action schedules and refers nothing", () => {
  const schedules = applyServiceNextAction("Maternal", "none", [
    { purposeKey: prenatalKey, purpose: "Prenatal follow-up", date: "2026-11-06" },
  ]);
  const referrals = applyServiceReferral("Maternal", "none", ["Maternal"]);
  assert.deepEqual(schedules, []);
  assert.deepEqual(referrals, []);
  assert.equal(serviceNextAction("Maternal", { schedules, serviceReferrals: referrals }), "none");
  assert.deepEqual(followUpSchedulesPayload({ extraSchedules: extraScheduleRows(schedules) }), []);
  assert.equal(hasReferralDecision({ referToRhu: referrals.length > 0 }), false);
});

test("Prenatal scheduled return keeps an independent service row", () => {
  const schedules = applyServiceNextAction("Maternal", "schedule", []);
  assert.equal(schedules[0].purposeKey, prenatalKey);
  assert.equal(schedules[0].purpose, "Prenatal follow-up");
  assert.equal(schedules[0].date, "");
  const dated = schedules.map((row) => ({ ...row, date: "2026-11-06" }));
  assert.equal(serviceNextAction("Maternal", { schedules: dated, serviceReferrals: [] }), "schedule");
  assert.equal(serviceSchedule("Maternal", dated).date, "2026-11-06");
  const payload = followUpSchedulesPayload({ extraSchedules: extraScheduleRows(dated) });
  assert.equal(payload.length, 1);
  assert.equal(payload[0].purposeKey, prenatalKey);
});

test("EPI or Family Planning can be selected independently of Prenatal", () => {
  const epi = applyServiceNextAction("EPI", "schedule", []);
  const both = applyServiceNextAction("Family Planning", "none", epi);
  assert.equal(serviceNextAction("EPI", { schedules: both, serviceReferrals: [] }), "schedule");
  assert.equal(serviceNextAction("Family Planning", { schedules: both, serviceReferrals: [] }), "none");
  assert.equal(carePlanServiceLabel("EPI"), "EPI");
  assert.equal(carePlanServiceLabel("Family Planning"), "Family Planning");
  assert.equal(defaultServicePurpose("EPI"), "Immunization follow-up");
  assert.equal(SERVICE_NEXT_ACTIONS.refer_to_rhu, "Refer to RHU");
});

test("a service RHU referral does not create a follow-up and reuses the visit referral flag", () => {
  const schedules = applyServiceNextAction("Maternal", "refer_to_rhu", [
    { purposeKey: prenatalKey, purpose: "Prenatal follow-up", date: "2026-11-06" },
  ]);
  const referrals = applyServiceReferral("Maternal", "refer_to_rhu", []);
  assert.deepEqual(schedules, []);
  assert.deepEqual(referrals, ["Maternal"]);
  assert.equal(serviceNextAction("Maternal", { schedules, serviceReferrals: referrals }), "refer_to_rhu");
  assert.equal(hasReferralDecision({ referToRhu: referrals.length > 0 }), true);
});

test("mixed concern follow-up and service referral stay independent", () => {
  const concern = { purposeKey: "entry:c1", purpose: "Wound", date: "2026-10-29", sourceEntryId: "c1" };
  const scheduledPrenatal = applyServiceNextAction("Maternal", "schedule", [concern]).map((row) => (
    row.purposeKey === prenatalKey ? { ...row, date: "2026-11-06" } : row
  ));
  const referrals = applyServiceReferral("EPI", "refer_to_rhu", []);
  const afterEpi = applyServiceNextAction("EPI", "refer_to_rhu", scheduledPrenatal);
  assert.equal(afterEpi.some((row) => row.purposeKey === "entry:c1"), true);
  assert.equal(afterEpi.some((row) => row.purposeKey === prenatalKey), true);
  assert.equal(afterEpi.some((row) => row.purposeKey === epiKey), false);
  assert.deepEqual(referrals, ["EPI"]);
  const payload = followUpSchedulesPayload({
    managedReturns: [{ needed: true, ...concern }],
    extraSchedules: extraScheduleRows(afterEpi),
  });
  assert.equal(payload.length, 2);
  assert.equal(CARE_PLAN_SERVICE_LABELS.Maternal, "Prenatal");
});

test("deselecting a service drops only that service's schedule and referral", () => {
  const schedules = [
    { purposeKey: prenatalKey, purpose: "Prenatal follow-up", date: "2026-11-06" },
    { purposeKey: epiKey, purpose: "Immunization follow-up", date: "2026-11-20" },
    { purposeKey: "entry:c1", purpose: "Wound", date: "2026-10-29", sourceEntryId: "c1" },
  ];
  const pruned = pruneServiceSchedules(schedules, ["Maternal"]);
  assert.deepEqual(pruned.map((row) => row.purposeKey), [prenatalKey, "entry:c1"]);
  assert.deepEqual(pruneServiceReferrals(["Maternal", "EPI"], ["Maternal"]), ["Maternal"]);
});

test("draft restore keeps Prenatal none, scheduled return, and a stored service referral", () => {
  const none = restoreNextActions({ referToRhu: false, serviceReferrals: [] }, { selectedPrograms: ["Maternal"] });
  assert.deepEqual(none.serviceReferrals, []);
  assert.equal(none.referToRhu, false);

  const scheduled = restoreSelectedServiceSchedules(
    [{ purposeKey: prenatalKey, purpose: "Prenatal follow-up", date: "2026-11-06" }],
    ["Maternal"],
  );
  assert.equal(scheduled[0].purposeKey, prenatalKey);
  assert.equal(restoreFollowUpSchedules(scheduled)[0].date, "2026-11-06");

  const referred = restoreNextActions(
    { referToRhu: true, serviceReferrals: ["Maternal"] },
    { selectedPrograms: ["Maternal"] },
  );
  assert.deepEqual(referred.serviceReferrals, ["Maternal"]);
  assert.deepEqual(nextActionsDraft(referred).serviceReferrals, ["Maternal"]);
});

test("legacy visit-level Refer restores onto the one selected service, never onto every service", () => {
  assert.deepEqual(restoreServiceReferrals({ referToRhu: true }, ["Maternal"]), ["Maternal"]);
  assert.deepEqual(restoreServiceReferrals({ referToRhu: true }, ["Maternal", "EPI"]), []);
  assert.deepEqual(restoreServiceReferrals({ referToRhu: true, serviceReferrals: [] }, ["Maternal"]), []);
});

test("a legacy visit or extra return is adopted by one selected service without merging", () => {
  const adopted = adoptOrphanServiceSchedules(
    [{ purposeKey: VISIT_PURPOSE_KEY, purpose: "Prenatal follow-up", date: "2026-11-06" }],
    ["Maternal"],
  );
  assert.equal(adopted.length, 1);
  assert.equal(adopted[0].purposeKey, prenatalKey);
  const unassigned = adoptOrphanServiceSchedules(
    [{ purposeKey: VISIT_PURPOSE_KEY, purpose: "BHC follow-up", date: "2026-11-06" }],
    ["Maternal", "EPI"],
  );
  assert.equal(unassigned.some((row) => row.purposeKey === prenatalKey), false);
  assert.equal(unassigned.some((row) => row.purposeKey === epiKey), false);
  assert.equal(unassigned[0].purposeKey, VISIT_PURPOSE_KEY);
});

test("EPI and FP date suggestions stay on their own service", () => {
  const suggestions = [
    { source: "EPI next dose", date: "2026-11-07" },
    { source: "FP next appointment", date: "2026-12-01" },
  ];
  assert.deepEqual(suggestionsForProgram("EPI", suggestions), [{ source: "EPI next dose", date: "2026-11-07" }]);
  assert.deepEqual(suggestionsForProgram("Family Planning", suggestions), [{ source: "FP next appointment", date: "2026-12-01" }]);
  assert.deepEqual(suggestionsForProgram("Maternal", suggestions), []);
});

test("switching a service from schedule to refer drops that return only", () => {
  const mixed = [
    { purposeKey: prenatalKey, purpose: "Prenatal follow-up", date: "2026-11-06" },
    { purposeKey: fpKey, purpose: "Family planning appointment", date: "2026-12-01" },
  ];
  const next = applyServiceNextAction("Maternal", "refer_to_rhu", mixed);
  assert.equal(next.some((row) => row.purposeKey === prenatalKey), false);
  assert.equal(next.some((row) => row.purposeKey === fpKey), true);
});
