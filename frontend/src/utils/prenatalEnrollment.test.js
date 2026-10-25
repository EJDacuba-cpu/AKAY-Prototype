import test from "node:test";
import assert from "node:assert/strict";

import {
  PRENATAL_INTENT_CONTINUE,
  PRENATAL_INTENT_ENROLL,
  getPrenatalEnrollment,
  prenatalProgramCopy,
} from "./prenatalEnrollment.js";

function woman() {
  return { sex: "Female", birthdate: "1995-01-01" };
}

test("no maternal records is not enrolled and offers Enroll in Prenatal Care", () => {
  const enrollment = getPrenatalEnrollment(woman(), []);
  assert.equal(enrollment.enrolled, false);
  assert.equal(enrollment.intent, PRENATAL_INTENT_ENROLL);
  assert.equal(enrollment.status, "Not started");
  assert.equal(enrollment.prefill, null);
  const copy = prenatalProgramCopy({ enrolled: false, included: false });
  assert.equal(copy.enrollLabel, "Enroll in Prenatal Care");
  assert.equal(copy.statusLabel, "Not enrolled");
});

test("clicking enroll only marks the visit as included, not Active", () => {
  const copy = prenatalProgramCopy({ enrolled: false, included: true });
  assert.equal(copy.enrollLabel, "Enroll in Prenatal Care");
  assert.equal(copy.statusLabel, "Included this visit");
  assert.notEqual(copy.statusLabel, "Active");
  assert.equal(copy.statusTone, "included");
});

test("a finalized prenatal record is Active and offers Continue Prenatal Care", () => {
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
  assert.equal(copy.enrollLabel, "Continue Prenatal Care");
  assert.equal(copy.statusLabel, "Active");
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
