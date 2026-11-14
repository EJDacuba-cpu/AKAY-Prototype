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
  applyServiceHandoff,
  applyServiceNextAction,
  applyServiceReferral,
  carePlanServiceLabel,
  defaultServicePurpose,
  pruneServiceHandoffs,
  pruneServiceReferrals,
  pruneServiceSchedules,
  restoreSelectedServiceSchedules,
  restoreServiceHandoffs,
  restoreServiceReferrals,
  restoreServiceSupportingLabs,
  applyServiceSupportingLabs,
  pruneServiceSupportingLabs,
  serviceSupportingLabsFor,
  serviceSupportingLabsForSave,
  isScheduledServiceFollowUp,
  selectedCarePlanServices,
  serviceHandoff,
  serviceHandoffErrors,
  serviceHandoffsForSave,
  serviceNextAction,
  servicePurposeKey,
  serviceSchedule,
  updateServiceHandoff,
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
  assert.equal(CARE_PLAN_SERVICE_LABELS.Maternal, "Maternal Care");
  assert.equal(defaultServicePurpose("Maternal"), "Prenatal follow-up");
  assert.equal(CARE_PLAN_SERVICE_LABELS.Nutrition, "Nutrition");
  assert.equal(defaultServicePurpose("Nutrition"), "Nutrition follow-up");
  assert.equal(carePlanServiceLabel("Nutrition"), "Nutrition");
  assert.deepEqual(selectedCarePlanServices(["Nutrition", "Maternal"]), ["Nutrition", "Maternal"]);
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

test("Manage to BHC label is exact and independent per selected service", () => {
  assert.equal(SERVICE_NEXT_ACTIONS.manage_to_bhc, "Manage to BHC");
  const programs = ["Maternal", "EPI", "Family Planning", "Nutrition"];
  let handoffs = [];
  let schedules = [];
  for (const program of programs) {
    schedules = applyServiceNextAction(program, "manage_to_bhc", schedules);
    handoffs = applyServiceHandoff(program, "manage_to_bhc", handoffs);
    assert.equal(serviceNextAction(program, { schedules, serviceHandoffs: handoffs }), "manage_to_bhc");
    assert.equal(serviceSchedule(program, schedules), null);
  }
  assert.equal(handoffs.length, 4);
  assert.equal(serviceHandoff("Nutrition", handoffs).program, "Nutrition");
});

test("switching away from Manage to BHC clears that service handoff only", () => {
  let handoffs = applyServiceHandoff("Maternal", "manage_to_bhc", []);
  handoffs = updateServiceHandoff("Maternal", {
    receivingBhcId: "9",
    monitoringRecommendation: "Weekly prenatal BP",
  }, handoffs);
  handoffs = applyServiceHandoff("EPI", "manage_to_bhc", handoffs);
  handoffs = applyServiceHandoff("Maternal", "schedule", handoffs);
  assert.equal(serviceHandoff("Maternal", handoffs), null);
  assert.equal(serviceHandoff("EPI", handoffs).program, "EPI");
  const schedules = applyServiceNextAction("Maternal", "schedule", []);
  assert.equal(serviceNextAction("Maternal", { schedules, serviceHandoffs: handoffs }), "schedule");
});

test("deselecting a service drops only that service Manage to BHC handoff", () => {
  const handoffs = [
    { program: "Maternal", receivingBhcId: "1", monitoringRecommendation: "A" },
    { program: "EPI", receivingBhcId: "2", monitoringRecommendation: "B" },
  ];
  assert.deepEqual(pruneServiceHandoffs(handoffs, ["EPI"]).map((row) => row.program), ["EPI"]);
});

test("legacy drafts without serviceHandoffs restore as no handoffs", () => {
  assert.deepEqual(restoreServiceHandoffs({}, ["Maternal", "EPI"]), []);
  assert.deepEqual(restoreServiceHandoffs(null, ["Maternal"]), []);
  const restored = restoreServiceHandoffs({
    serviceHandoffs: [
      { program: "Maternal", receivingBhcId: "3", monitoringRecommendation: "BP" },
      { program: "EPI", receiving_bhc_id: "4", monitoring_recommendation: "Dose" },
    ],
  }, ["Maternal"]);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].program, "Maternal");
  assert.equal(restored[0].receivingBhcId, "3");
});

test("service supporting labs are independent per program and prune on deselect", () => {
  let rows = applyServiceSupportingLabs("Maternal", [{ reference: "current:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }], []);
  rows = applyServiceSupportingLabs("EPI", [{ reference: "record:9" }], rows);
  assert.deepEqual(serviceSupportingLabsFor("Maternal", rows), [
    { reference: "current:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
  ]);
  assert.deepEqual(pruneServiceSupportingLabs(rows, ["EPI"]).map((row) => row.program), ["EPI"]);
  assert.deepEqual(restoreServiceSupportingLabs({}, ["Maternal"]), []);
  assert.deepEqual(serviceSupportingLabsForSave(rows, ["Maternal", "EPI"]), [
    {
      program: "Maternal",
      supporting_laboratory_tests: [{ reference: "current:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }],
    },
    {
      program: "EPI",
      supporting_laboratory_tests: [{ reference: "record:9" }],
    },
  ]);
  rows = applyServiceSupportingLabs("Maternal", [], rows);
  assert.equal(serviceSupportingLabsFor("Maternal", rows).length, 0);
});

test("Manage to BHC requires receiving BHC and recommendation before save", () => {
  const incomplete = [{ program: "Maternal", receivingBhcId: "", monitoringRecommendation: "" }];
  const errors = serviceHandoffErrors(incomplete, { selectedPrograms: ["Maternal"] });
  assert.equal(errors["serviceHandoffs.Maternal.receivingBhcId"], "Choose a receiving Barangay Health Center.");
  assert.equal(errors["serviceHandoffs.Maternal.monitoringRecommendation"], "Enter a monitoring recommendation.");
  const complete = updateServiceHandoff("Maternal", {
    receivingBhcId: "7",
    monitoringRecommendation: "Continue prenatal visits at BHC",
  }, incomplete);
  assert.deepEqual(serviceHandoffErrors(complete, { selectedPrograms: ["Maternal"] }), {});
  assert.deepEqual(serviceHandoffsForSave(complete, ["Maternal"]), [{
    program: "Maternal",
    receiving_bhc_id: 7,
    monitoring_recommendation: "Continue prenatal visits at BHC",
    laboratoryEvidence: [],
    laboratoryEvidenceConfirmed: false,
  }]);
});

test("service Manage to BHC laboratory evidence requires confirm and saves with handoff", () => {
  let handoffs = applyServiceHandoff("EPI", "manage_to_bhc", []);
  handoffs = updateServiceHandoff("EPI", {
    receivingBhcId: "5",
    monitoringRecommendation: "Continue EPI follow-up at BHC",
    laboratoryEvidence: [{ reference: "current:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", version: 0 }],
    laboratoryEvidenceConfirmed: false,
  }, handoffs);
  const errors = serviceHandoffErrors(handoffs, { selectedPrograms: ["EPI"] });
  assert.equal(
    errors["serviceHandoffs.EPI.laboratoryEvidenceConfirmed"],
    "Confirm the selected laboratory evidence before sharing.",
  );
  handoffs = updateServiceHandoff("EPI", { laboratoryEvidenceConfirmed: true }, handoffs);
  assert.deepEqual(serviceHandoffErrors(handoffs, { selectedPrograms: ["EPI"] }), {});
  assert.deepEqual(serviceHandoffsForSave(handoffs, ["EPI"]), [{
    program: "EPI",
    receiving_bhc_id: 5,
    monitoring_recommendation: "Continue EPI follow-up at BHC",
    laboratoryEvidence: [{ reference: "current:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", version: 0 }],
    laboratoryEvidenceConfirmed: true,
  }]);
  handoffs = updateServiceHandoff("EPI", { receivingBhcId: "6" }, handoffs);
  assert.equal(handoffs[0].laboratoryEvidenceConfirmed, false);
});

test("scheduled service follow-ups are identified from saved metadata, not purpose text", () => {
  assert.equal(isScheduledServiceFollowUp({ purposeKey: prenatalKey, purpose: "Return visit" }), true);
  assert.equal(isScheduledServiceFollowUp({ purposeKey: epiKey }), true);
  assert.equal(isScheduledServiceFollowUp({ purposeKey: fpKey }), true);
  assert.equal(isScheduledServiceFollowUp({
    purposeKey: "visit",
    sourceSelectedPrograms: ["Maternal"],
  }), true);
  assert.equal(isScheduledServiceFollowUp({
    purposeKey: "visit",
    sourceCategory: "Maternal",
  }), true);
  assert.equal(isScheduledServiceFollowUp({
    purposeKey: "entry:wound",
    purpose: "Prenatal follow-up",
    sourceSelectedPrograms: ["Maternal"],
  }), false);
  assert.equal(isScheduledServiceFollowUp({
    purposeKey: "visit",
    purpose: "Prenatal follow-up",
  }), false);
  assert.equal(isScheduledServiceFollowUp({
    purposeKey: "continued:26",
    purpose: "Prenatal follow-up",
  }), false);
});
