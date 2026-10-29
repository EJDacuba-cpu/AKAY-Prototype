import test from "node:test";
import assert from "node:assert/strict";

import {
  MATERNAL_CARE_PROGRAM_TITLE,
  MATERNAL_SERVICE_LOADING_LABEL,
  MATERNAL_SERVICE_RETRY_LABEL,
  PRENATAL_INTENT_CONTINUE,
  PRENATAL_INTENT_ENROLL,
  canCompleteMaternalFollowUpResolution,
  continuedCareBlocksProgress,
  getPrenatalEnrollment,
  isMaternalLinkedToPrenatalFollowUp,
  isMaternalServiceLoadFailed,
  isMaternalServiceResolving,
  isPrenatalAssociatedFollowUp,
  maternalProgramControl,
  prenatalEnrollmentModalCopy,
  prenatalProgramCopy,
  shouldSeedMaternalFromPrenatalFollowUp,
} from "./prenatalEnrollment.js";
import { removeContinuedFollowUp } from "./continuedCare.js";
import { servicePurposeKey } from "./followUpSchedules.js";

function woman() {
  return { sex: "Female", birthdate: "1995-01-01" };
}

test("no maternal records is not enrolled and offers Include Maternal Care", () => {
  const enrollment = getPrenatalEnrollment(woman(), []);
  assert.equal(enrollment.enrolled, false);
  assert.equal(enrollment.intent, PRENATAL_INTENT_ENROLL);
  assert.equal(enrollment.status, "Not started");
  assert.equal(enrollment.prefill, null);
  const copy = prenatalProgramCopy({ enrolled: false, included: false });
  assert.equal(copy.title, MATERNAL_CARE_PROGRAM_TITLE);
  assert.equal(copy.enrollLabel, "Include Maternal Care");
  assert.equal(copy.statusLabel, "Not included");
  assert.match(copy.description, /becomes Active only after this consultation is finalized/i);
});

test("selecting Maternal Care only marks the visit as included, not Active", () => {
  const copy = prenatalProgramCopy({ enrolled: false, included: true });
  assert.equal(copy.enrollLabel, "Include Maternal Care");
  assert.equal(copy.statusLabel, "Included this visit");
  assert.notEqual(copy.statusLabel, "Active");
  assert.equal(copy.statusTone, "included");
  assert.match(copy.description, /becomes Active only after this consultation is finalized/i);
});

test("a finalized prenatal record is Active and offers Continue Maternal Care", () => {
  const records = [
    {
      id: 11,
      dateOfVisit: "2026-06-01",
      selectedPrograms: ["Maternal"],
      maternalData: { lmp: "2026-03-01", gravida: "2", fht: "140 bpm" },
      expectedDeliveryDate: "2026-12-06",
    },
  ];
  const enrollment = getPrenatalEnrollment(woman(), records, new Date("2026-09-01"));
  assert.equal(enrollment.enrolled, true);
  assert.equal(enrollment.intent, PRENATAL_INTENT_CONTINUE);
  assert.equal(enrollment.status, "Prenatal");
  assert.equal(enrollment.prefill.lmp, "2026-03-01");
  assert.equal(enrollment.prefill.gravida, "2");
  assert.equal(enrollment.prefill.fht, "");
  assert.equal(enrollment.prefill.immunizationThisVisit.type, "");
  const copy = prenatalProgramCopy({ enrolled: true, included: false });
  assert.equal(copy.enrollLabel, "Continue Maternal Care");
  assert.equal(copy.statusLabel, "Active");
  assert.match(copy.description, /without starting a second enrollment/i);
});

test("including an already enrolled episode continues the visit without a second enrollment", () => {
  const records = [
    {
      id: 12,
      dateOfVisit: "2026-06-01",
      selectedPrograms: ["Maternal"],
      maternalData: { lmp: "2026-03-01" },
    },
  ];
  const enrollment = getPrenatalEnrollment(woman(), records, new Date("2026-09-01"));
  assert.equal(enrollment.intent, PRENATAL_INTENT_CONTINUE);
  const copy = prenatalProgramCopy({ enrolled: true, included: true });
  assert.equal(copy.enrollLabel, "Continue Maternal Care");
  assert.equal(copy.statusLabel, "Continuing this visit");
  assert.notEqual(copy.statusLabel, "Active");
});

test("a mixed ITR with general findings and prenatal data still enrolls once", () => {
  const records = [
    {
      id: 21,
      dateOfVisit: "2026-06-01",
      chiefComplaint: "Cough and first prenatal visit",
      summaryOfPresentIllness: "Cough for 3 days. Also due for prenatal booking.",
      physicalExam: "Clear chest. Fundus not yet palpable.",
      selectedPrograms: ["Maternal"],
      maternalData: { lmp: "2026-03-01" },
    },
  ];
  const enrollment = getPrenatalEnrollment(woman(), records, new Date("2026-09-01"));
  assert.equal(enrollment.enrolled, true);
  assert.equal(enrollment.intent, PRENATAL_INTENT_CONTINUE);
  assert.equal(enrollment.visitCount, 1);
});

test("enrollment modal copy is confirm-only and differs for include vs continue", () => {
  const enroll = prenatalEnrollmentModalCopy({ enrolled: false });
  assert.equal(enroll.title, "Include Maternal Care");
  assert.equal(enroll.confirmText, "Include in This Visit");
  assert.match(enroll.description, /becomes Active only after this consultation is finalized/i);
  assert.match(enroll.description, /prenatal assessment/i);
  const cont = prenatalEnrollmentModalCopy({ enrolled: true });
  assert.equal(cont.title, "Continue Maternal Care");
  assert.equal(cont.confirmText, "Continue This Visit");
  assert.match(cont.description, /does not start a second enrollment/i);
  assert.match(cont.description, /prenatal assessment/i);
});

test("a service:maternal follow-up is prenatal-associated without reading purpose text", () => {
  assert.equal(isPrenatalAssociatedFollowUp({ purposeKey: servicePurposeKey("Maternal"), purpose: "Return visit" }), true);
  assert.equal(isPrenatalAssociatedFollowUp({
    purposeKey: "visit",
    sourceSelectedPrograms: ["Maternal"],
  }), true);
  assert.equal(isPrenatalAssociatedFollowUp({
    purposeKey: "visit",
    sourceCategory: "Maternal",
  }), true);
  assert.equal(isPrenatalAssociatedFollowUp({
    purposeKey: "visit",
    purpose: "Prenatal follow-up",
    reason: "Prenatal follow-up",
  }), false);
  assert.equal(isPrenatalAssociatedFollowUp({
    purposeKey: servicePurposeKey("Family Planning"),
    sourceSelectedPrograms: ["Family Planning"],
  }), false);
  assert.equal(isPrenatalAssociatedFollowUp({
    purposeKey: "visit",
    purpose: "Wound check",
    sourceSelectedPrograms: [],
    sourceCategory: "General Consultation",
  }), false);
});

test("prenatal follow-up continuation seeds Maternal Care only for an existing enrollment", () => {
  const prenatalFollowUp = { purposeKey: servicePurposeKey("Maternal") };
  const woundFollowUp = { purposeKey: "visit", purpose: "Wound check" };
  assert.equal(shouldSeedMaternalFromPrenatalFollowUp({
    followUps: [prenatalFollowUp],
    enrolled: true,
  }), true);
  assert.equal(shouldSeedMaternalFromPrenatalFollowUp({
    followUps: [woundFollowUp],
    enrolled: true,
  }), false);
  assert.equal(shouldSeedMaternalFromPrenatalFollowUp({
    followUps: [prenatalFollowUp],
    enrolled: false,
  }), false);
  assert.equal(shouldSeedMaternalFromPrenatalFollowUp({
    followUps: [prenatalFollowUp],
    enrolled: true,
    alreadyIncluded: true,
  }), false);
  assert.equal(shouldSeedMaternalFromPrenatalFollowUp({
    followUps: [prenatalFollowUp],
    enrolled: true,
    restored: true,
  }), false);
  assert.equal(getPrenatalEnrollment(woman(), [{
    id: 12,
    dateOfVisit: "2026-06-01",
    selectedPrograms: ["Maternal"],
    maternalData: { lmp: "2026-03-01" },
  }], new Date("2026-09-01")).intent, PRENATAL_INTENT_CONTINUE);
});

test("a completed maternal episode can be enrolled again", () => {
  const records = [
    {
      id: 3,
      dateOfVisit: "2026-06-01",
      selectedPrograms: ["Maternal"],
      monitoringData: { visitPurpose: { services: ["Postpartum"] } },
      maternalData: { deliveryDate: "2026-06-01" },
    },
  ];
  const enrollment = getPrenatalEnrollment(woman(), records, new Date("2026-07-14"));
  assert.equal(enrollment.status, "Completed");
  assert.equal(enrollment.enrolled, false);
  assert.equal(enrollment.intent, PRENATAL_INTENT_ENROLL);
});

test("delayed prenatal follow-up loading stays on a neutral Loading state", () => {
  assert.equal(isMaternalServiceResolving({
    continueRoute: true,
    hasFollowUpSelection: true,
    recordsLoading: true,
  }), true);
  assert.equal(isMaternalServiceResolving({
    continueRoute: true,
    hasFollowUpSelection: true,
    followUpsLoading: true,
  }), true);
  assert.equal(isMaternalServiceResolving({
    continueRoute: true,
    hasFollowUpSelection: true,
    patientLoading: true,
  }), true);
  const copy = prenatalProgramCopy({ enrolled: false, included: false, resolving: true });
  assert.equal(copy.statusLabel, MATERNAL_SERVICE_LOADING_LABEL);
  assert.equal(copy.enrollLabel, MATERNAL_SERVICE_LOADING_LABEL);
  assert.notEqual(copy.statusLabel, "Not included");
  assert.notEqual(copy.enrollLabel, "Include Maternal Care");
  const control = maternalProgramControl({ resolving: true });
  assert.equal(control.disabled, true);
  assert.equal(control.busy, true);
  assert.equal(control.hideAction, false);
  assert.equal(control.actionLabel, MATERNAL_SERVICE_LOADING_LABEL);
  assert.equal(canCompleteMaternalFollowUpResolution({ resolving: true }), false);
});

test("a failed prenatal follow-up load offers Retry instead of Not included", () => {
  assert.equal(isMaternalServiceLoadFailed({
    continueRoute: true,
    hasFollowUpSelection: true,
    followUpsError: true,
  }), true);
  assert.equal(isMaternalServiceLoadFailed({
    continueRoute: true,
    hasFollowUpSelection: true,
    recordsError: true,
  }), true);
  assert.equal(isMaternalServiceLoadFailed({
    continueRoute: true,
    hasFollowUpSelection: true,
    resolving: true,
    recordsError: true,
    followUpsError: true,
  }), false);
  const copy = prenatalProgramCopy({ enrolled: false, included: false, loadFailed: true });
  assert.equal(copy.statusLabel, "Unavailable");
  assert.equal(copy.enrollLabel, MATERNAL_SERVICE_RETRY_LABEL);
  assert.notEqual(copy.statusLabel, "Not included");
  assert.notEqual(copy.enrollLabel, "Include Maternal Care");
  const control = maternalProgramControl({ loadFailed: true });
  assert.equal(control.disabled, false);
  assert.equal(control.hideAction, false);
  assert.equal(control.actionLabel, MATERNAL_SERVICE_RETRY_LABEL);
  assert.equal(canCompleteMaternalFollowUpResolution({ loadFailed: true }), false);
});

test("Active Maternal Care is read-only on a New Consultation", () => {
  const copy = prenatalProgramCopy({ enrolled: true, included: false, hideAction: true });
  assert.equal(copy.title, `${MATERNAL_CARE_PROGRAM_TITLE} — Active`);
  assert.equal(copy.statusLabel, "Active");
  assert.equal(copy.hideAction, true);
  assert.notEqual(copy.enrollLabel, "Include Maternal Care");
  assert.notEqual(copy.enrollLabel, "Continue Maternal Care");
  assert.match(copy.description, /prenatal assessment is added only when continuing/i);
  const control = maternalProgramControl({ hideAction: true });
  assert.equal(control.hideAction, true);
  assert.equal(control.actionLabel, "");
  assert.equal(shouldSeedMaternalFromPrenatalFollowUp({
    followUps: [],
    enrolled: true,
  }), false);
});

test("a selected prenatal follow-up includes Active Maternal Care without Remove", () => {
  const prenatalFollowUp = { purposeKey: servicePurposeKey("Maternal") };
  const woundFollowUp = { purposeKey: "visit", purpose: "Wound check" };
  assert.equal(shouldSeedMaternalFromPrenatalFollowUp({
    followUps: [prenatalFollowUp],
    enrolled: true,
  }), true);
  assert.equal(shouldSeedMaternalFromPrenatalFollowUp({
    followUps: [woundFollowUp],
    enrolled: true,
  }), false);
  const copy = prenatalProgramCopy({ enrolled: true, included: true, hideAction: true });
  assert.equal(copy.statusLabel, "Active");
  assert.equal(copy.hideAction, true);
  assert.notEqual(copy.statusLabel, "Continuing this visit");
  assert.equal(maternalProgramControl({ hideAction: true }).hideAction, true);
});

test("unlinking a prenatal follow-up does not change enrollment or selected programs", () => {
  const prenatalFollowUp = { id: 25, purposeKey: servicePurposeKey("Maternal") };
  const selectedPrograms = ["Maternal"];
  assert.equal(isMaternalLinkedToPrenatalFollowUp([prenatalFollowUp], selectedPrograms), true);
  const next = removeContinuedFollowUp({
    continuedFollowUpTaskIds: [25],
    continuedFollowUps: [prenatalFollowUp],
  }, 25);
  assert.equal(isMaternalLinkedToPrenatalFollowUp(next.continuedFollowUps, selectedPrograms), false);
  assert.deepEqual(selectedPrograms, ["Maternal"]);
});

test("draft resume and a late response cannot re-seed Maternal Care", () => {
  const prenatalFollowUp = { purposeKey: servicePurposeKey("Maternal") };
  assert.equal(shouldSeedMaternalFromPrenatalFollowUp({
    followUps: [prenatalFollowUp],
    enrolled: true,
    restored: true,
  }), false);
  assert.equal(canCompleteMaternalFollowUpResolution({ restoring: true }), false);
  assert.equal(canCompleteMaternalFollowUpResolution({ resolved: true }), false);
  assert.equal(isMaternalServiceResolving({
    continueRoute: true,
    hasFollowUpSelection: true,
    resolved: true,
    recordsLoading: true,
    followUpsLoading: true,
  }), false);
  assert.equal(isMaternalServiceLoadFailed({
    continueRoute: true,
    hasFollowUpSelection: true,
    resolved: true,
    recordsError: true,
    followUpsError: true,
  }), false);
  assert.equal(shouldSeedMaternalFromPrenatalFollowUp({
    followUps: [prenatalFollowUp],
    enrolled: true,
    alreadyIncluded: true,
  }), false);
});

test("manual service selection is unchanged for consultations that are not continuing a prenatal follow-up", () => {
  assert.equal(isMaternalServiceResolving({
    continueRoute: false,
    hasFollowUpSelection: false,
    recordsLoading: true,
    followUpsLoading: true,
    patientLoading: true,
  }), false);
  assert.equal(isMaternalServiceLoadFailed({
    continueRoute: false,
    hasFollowUpSelection: false,
    recordsError: true,
    followUpsError: true,
  }), false);
  assert.equal(isMaternalLinkedToPrenatalFollowUp([{ purposeKey: "visit" }], ["Maternal"]), false);
  const copy = prenatalProgramCopy({ enrolled: false, included: false });
  assert.equal(copy.enrollLabel, "Include Maternal Care");
  assert.equal(copy.statusLabel, "Not included");
  assert.equal(maternalProgramControl({}).disabled, false);
  assert.equal(maternalProgramControl({}).hideAction, false);
  assert.equal(canCompleteMaternalFollowUpResolution({}), true);
  assert.equal(continuedCareBlocksProgress({}), false);
  assert.equal(continuedCareBlocksProgress({ followUpsLoading: true }), true);
  assert.equal(continuedCareBlocksProgress({ resolving: true }), true);
  assert.equal(continuedCareBlocksProgress({ loadFailed: true }), true);
});
