import test from "node:test";
import assert from "node:assert/strict";

import {
  isNumericReferralId,
  linkedReferralRecord,
  pickReferral,
  referralBelongsToPatient,
  referralListKey,
  referralMatches,
  referralSlipModel,
  referredServices,
} from "./referralSlipView.js";

const older = {
  id: "1",
  trackingId: "AKAY-OLD",
  healthRecordId: "10",
  referralCategory: "Maternal",
  reasonForReferral: "High blood pressure",
};
const linked = {
  id: "5",
  trackingId: "AKAY-NEW",
  healthRecordId: "22",
  referralCategory: "General Consultation",
  reasonForReferral: "Cough for two weeks",
  chiefComplaint: "Persistent cough",
  initialActionsTaken: "Given salbutamol",
  referringHci: "BHC Poblacion",
};
const record22 = {
  id: "22",
  chiefComplaint: "Should not replace the referral snapshot when empty",
  history_of_present_illness: "Cough worse at night",
  physicalExam: "Clear breath sounds",
  bodyFindings: [{ id: "f1", region: "chest", side: "front", finding: "Wheeze", location: "Upper chest" }],
  systolicBp: 120,
  diastolicBp: 80,
};
const record10 = {
  id: "10",
  history_of_present_illness: "From an older visit",
  bodyFindings: [{ id: "f0", region: "head", side: "front", finding: "Headache", location: "Forehead" }],
};

test("a list key prefers the numeric id so the queue can select the exact referral", () => {
  assert.equal(referralListKey(linked), "5");
  assert.equal(referralListKey({ trackingId: "AKAY-NEW" }), "AKAY-NEW");
});

test("selection matches either the referral id or tracking id", () => {
  assert.equal(referralMatches(linked, "5"), true);
  assert.equal(referralMatches(linked, "AKAY-NEW"), true);
  assert.equal(referralMatches(linked, "1"), false);
  assert.equal(referralMatches(linked, ""), false);
});

test("a selected key wins over the newest referral", () => {
  const referrals = [linked, older];
  assert.equal(pickReferral(referrals, "1").id, "1");
  assert.equal(pickReferral(referrals, "AKAY-OLD").id, "1");
  assert.equal(pickReferral(referrals, "").id, "5");
  assert.equal(pickReferral(referrals, "missing"), null);
});

test("the linked record is only the one saved on that referral", () => {
  assert.equal(linkedReferralRecord(linked, [record10, record22]), record22);
  assert.equal(linkedReferralRecord(older, [record10, record22]), record10);
  assert.equal(linkedReferralRecord({ id: "9" }, [record10, record22]), null);
  assert.deepEqual(
    linkedReferralRecord({ healthRecordId: "22", healthRecord: { id: "22", physical_exam: "Nested" } }, []),
    { id: "22", physical_exam: "Nested" },
  );
});

test("the slip does not borrow findings or HPI from another visit", () => {
  const slip = referralSlipModel(linked, record22);
  assert.equal(slip.available, true);
  assert.equal(slip.missingLinkedRecord, false);
  assert.equal(slip.reason, "Cough for two weeks");
  assert.equal(slip.chiefComplaint, "Persistent cough");
  assert.equal(slip.historyOfPresentIllness, "Cough worse at night");
  assert.equal(slip.physicalExam, "Clear breath sounds");
  assert.equal(slip.actions, "Given salbutamol");
  assert.equal(slip.bodyFindings.length, 1);
  assert.equal(slip.bodyFindings[0].region, "chest");
  assert.equal(slip.vitals.some((item) => item.label === "BP" && item.value.includes("120/80")), true);

  const otherVisit = referralSlipModel(linked, record10);
  assert.equal(otherVisit.historyOfPresentIllness, "From an older visit");
  assert.equal(otherVisit.bodyFindings[0].region, "head");
});

test("missing linked clinical data is reported instead of invented", () => {
  const slip = referralSlipModel(linked, null);
  assert.equal(slip.missingLinkedRecord, true);
  assert.equal(slip.reason, "Cough for two weeks");
  assert.equal(slip.historyOfPresentIllness, "");
  assert.equal(slip.physicalExam, "");
  assert.deepEqual(slip.bodyFindings, []);
  assert.deepEqual(slip.vitals, []);
  assert.equal(referralSlipModel(null, record22).missingReferral, true);
});

test("referred concerns come from the referral snapshot, not BHC-managed programs", () => {
  assert.equal(referredServices(linked), "General Consultation");
  assert.equal(referredServices(older), "Maternal / Prenatal");
  assert.notEqual(
    referredServices({ ...linked, referralCategory: "General Consultation" }),
    "Maternal · Immunization",
  );
});

test("only numeric ids are safe to fetch as /referrals/{id}", () => {
  assert.equal(isNumericReferralId("5"), true);
  assert.equal(isNumericReferralId("AKAY-NEW"), false);
  assert.equal(isNumericReferralId(""), false);
});

test("a fetched referral must belong to the open patient", () => {
  assert.equal(referralBelongsToPatient({ ...linked, patientId: "9" }, 9), true);
  assert.equal(referralBelongsToPatient({ ...linked, patientId: "9" }, "8"), false);
  assert.equal(referralBelongsToPatient(linked, "9"), false);
});
