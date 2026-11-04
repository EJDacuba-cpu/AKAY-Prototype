import test from "node:test";
import assert from "node:assert/strict";

import {
  NUTRITION_INTENT_CONTINUE,
  NUTRITION_INTENT_ENROLL,
  getNutritionEnrollment,
  nutritionProgramCopy,
} from "./nutritionEnrollment.js";

const today = new Date("2026-11-05T00:00:00+08:00");

function nutritionVisit(id, date, extra = {}) {
  return {
    id,
    dateOfVisit: date,
    createdAt: `${date}T09:00:00+08:00`,
    selectedPrograms: ["Nutrition"],
    ...extra,
  };
}

test("no nutrition records is Not Enrolled and offers Enroll to Nutrition", () => {
  const enrollment = getNutritionEnrollment({ birthdate: "1990-01-15" }, [], today);
  assert.equal(enrollment.enrolled, false);
  assert.equal(enrollment.status, "Not Enrolled");
  assert.equal(enrollment.intent, NUTRITION_INTENT_ENROLL);
  assert.equal(enrollment.enrolledOn, null);
  assert.equal(enrollment.latestRecord, null);
  assert.equal(enrollment.visitCount, 0);

  const copy = nutritionProgramCopy({ enrolled: false, included: false, status: "Not Enrolled" });
  assert.equal(copy.title, "Nutrition Care");
  assert.equal(copy.enrollLabel, "Enroll to Nutrition");
  assert.equal(copy.statusLabel, "Not included");
  assert.equal(copy.statusTone, "neutral");
  assert.match(copy.description, /becomes Active only after this consultation is finalized/i);
});

test("selecting Nutrition only marks the visit as included, not Active", () => {
  const copy = nutritionProgramCopy({ enrolled: false, included: true, status: "Not Enrolled" });
  assert.equal(copy.enrollLabel, "Enroll to Nutrition");
  assert.equal(copy.statusLabel, "Included this visit");
  assert.equal(copy.statusTone, "included");
  assert.notEqual(copy.statusLabel, "Active");
});

test("a finalized nutrition record is Active and offers Continue Nutrition Care", () => {
  const record = nutritionVisit(11, "2026-10-01", { weight: "70", height: "170" });
  const enrollment = getNutritionEnrollment({ birthdate: "1990-01-15" }, [record], today);
  assert.equal(enrollment.enrolled, true);
  assert.equal(enrollment.status, "Active");
  assert.equal(enrollment.intent, NUTRITION_INTENT_CONTINUE);
  assert.equal(enrollment.enrolledOn, "2026-10-01");
  assert.equal(enrollment.latestRecord, record);
  assert.equal(enrollment.visitCount, 1);

  const idle = nutritionProgramCopy({ enrolled: true, included: false, status: "Active" });
  assert.equal(idle.enrollLabel, "Continue Nutrition Care");
  assert.equal(idle.statusLabel, "Active");
  assert.equal(idle.statusTone, "active");
  assert.match(idle.description, /without starting a second enrollment/i);

  const continuing = nutritionProgramCopy({ enrolled: true, included: true, status: "Active" });
  assert.equal(continuing.enrollLabel, "Continue Nutrition Care");
  assert.equal(continuing.statusLabel, "Continuing this visit");
});

test("a category of Nutrition enrolls even when selected programs is an empty list", () => {
  const record = {
    id: 4,
    dateOfVisit: "2026-10-03",
    category: "Nutrition",
    selectedPrograms: [],
  };
  const enrollment = getNutritionEnrollment({}, [record], today);
  assert.equal(enrollment.status, "Active");
  assert.equal(enrollment.enrolled, true);
  assert.equal(enrollment.visitCount, 1);
});

test("a general visit that only mentions nutrition does not enroll", () => {
  const enrollment = getNutritionEnrollment({}, [
    {
      id: 5,
      dateOfVisit: "2026-10-01",
      category: "General Consultation",
      chiefComplaint: "nutrition counseling",
    },
  ], today);
  assert.equal(enrollment.status, "Not Enrolled");
  assert.equal(enrollment.enrolled, false);
});

test("a draft nutrition visit does not enroll", () => {
  const enrollment = getNutritionEnrollment({}, [
    nutritionVisit(6, "2026-10-01", { finalized_at: null }),
  ], today);
  assert.equal(enrollment.status, "Not Enrolled");
  assert.equal(enrollment.visitCount, 0);
});

test("a local closure ends the episode and a later nutrition visit starts a new one", () => {
  const first = nutritionVisit(1, "2026-10-01");
  const closed = getNutritionEnrollment({}, [first], today, {
    closures: [{
      startedHealthRecordId: 1,
      closedOn: "2026-10-10",
      createdAt: "2026-10-10T12:00:00+08:00",
    }],
  });
  assert.equal(closed.status, "Closed");
  assert.equal(closed.enrolled, false);
  assert.equal(closed.intent, NUTRITION_INTENT_ENROLL);
  assert.equal(closed.enrolledOn, null);
  assert.equal(closed.visitCount, 1);
  assert.equal(closed.latestRecord, first);

  const sameDay = nutritionVisit(2, "2026-10-10", { createdAt: "2026-10-10T15:00:00+08:00" });
  const reopened = getNutritionEnrollment({}, [first, sameDay], today, {
    closures: [{
      started_health_record_id: 1,
      closed_on: "2026-10-10",
      created_at: "2026-10-10T12:00:00+08:00",
    }],
  });
  assert.equal(reopened.status, "Active");
  assert.equal(reopened.enrolled, true);
  assert.equal(reopened.intent, NUTRITION_INTENT_CONTINUE);
  assert.equal(reopened.enrolledOn, "2026-10-10");
  assert.equal(reopened.visitCount, 1);
  assert.equal(reopened.latestRecord, sameDay);
});

test("Closed is not enrolled for the service button, even if enrolled is still passed", () => {
  const copy = nutritionProgramCopy({ enrolled: true, included: false, status: "Closed" });
  assert.equal(copy.enrollLabel, "Enroll to Nutrition");
  assert.equal(copy.statusLabel, "Not included");
  assert.equal(copy.statusTone, "neutral");
  const included = nutritionProgramCopy({ enrolled: false, included: true, status: "Closed" });
  assert.equal(included.enrollLabel, "Enroll to Nutrition");
  assert.equal(included.statusLabel, "Included this visit");
});

test("an API nutrition summary is the source of truth for status", () => {
  const record = nutritionVisit(11, "2026-10-01");
  const closed = getNutritionEnrollment({}, [record], today, {
    status: "Closed",
    enrolled: false,
    enrolled_on: null,
    closures: [{
      started_health_record_id: 11,
      closed_on: "2026-10-20",
      enrolled_on: "2026-10-01",
    }],
  });
  assert.equal(closed.status, "Closed");
  assert.equal(closed.enrolled, false);
  assert.equal(closed.intent, NUTRITION_INTENT_ENROLL);
  assert.equal(closed.enrolledOn, null);
  assert.equal(closed.visitCount, 1);

  const active = getNutritionEnrollment({}, [record], today, {
    status: "Active",
    enrolled: true,
    enrolledOn: "2026-09-15",
    closures: [{ startedHealthRecordId: 11, closedOn: "2026-10-20" }],
  });
  assert.equal(active.status, "Active");
  assert.equal(active.enrolled, true);
  assert.equal(active.intent, NUTRITION_INTENT_CONTINUE);
  assert.equal(active.enrolledOn, "2026-09-15");
});
