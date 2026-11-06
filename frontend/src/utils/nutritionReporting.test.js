import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildNutritionReportMetrics,
  matchesAgeGroup,
  normalizeNutritionAgeGroup,
  patientAgeYears,
} from "./nutritionReporting.js";

const period = { start: "2026-11-01", end: "2026-11-30", label: "November 2026", preset: "monthly" };

function patient(id, birthdate, extras = {}) {
  return { id, birthdate, ...extras };
}

function record({ id, patientId, date, weight, height, nutrition = false, draft = false }) {
  return {
    id,
    patient_id: patientId,
    date_recorded: date,
    vital_signs: { weight, height },
    category: nutrition ? "Nutrition" : "General Consultation",
    monitoring_data: nutrition ? { selectedPrograms: ["Nutrition"] } : { selectedPrograms: [] },
    finalized_at: draft ? null : `${date}T10:00:00Z`,
    status: draft ? "draft" : "finalized",
    is_draft: draft,
  };
}

test("normalizeNutritionAgeGroup falls back to all", () => {
  assert.equal(normalizeNutritionAgeGroup("5-19"), "5-19");
  assert.equal(normalizeNutritionAgeGroup("nope"), "all");
});

test("matchesAgeGroup buckets", () => {
  assert.equal(matchesAgeGroup(3, "0-4"), true);
  assert.equal(matchesAgeGroup(5, "0-4"), false);
  assert.equal(matchesAgeGroup(5, "5-19"), true);
  assert.equal(matchesAgeGroup(19, "5-19"), true);
  assert.equal(matchesAgeGroup(20, "5-19"), false);
  assert.equal(matchesAgeGroup(20, "20+"), true);
  assert.equal(matchesAgeGroup(null, "20+"), false);
  assert.equal(matchesAgeGroup(2, "all"), true);
});

test("patientAgeYears uses birthdate vs as-of", () => {
  assert.equal(patientAgeYears(patient(1, "2000-01-01"), "2026-11-05"), 26);
  assert.equal(patientAgeYears(patient(1, ""), "2026-11-05"), null);
});

test("adult BMI unique patient uses latest paired visit in period", () => {
  const patients = [patient(1, "1990-05-01")];
  const records = [
    record({ id: 1, patientId: 1, date: "2026-11-05", weight: 50, height: 170 }), // BMI ~17.3 Underweight
    record({ id: 2, patientId: 1, date: "2026-11-20", weight: 80, height: 170 }), // BMI ~27.7 Overweight
  ];
  const metrics = buildNutritionReportMetrics({ patients, records, period, ageGroup: "all" });
  assert.equal(metrics.classifiedCount, 1);
  assert.equal(metrics.categories.Overweight.count, 1);
  assert.equal(metrics.categories.Underweight.count, 0);
  assert.equal(metrics.categories.Overweight.percent, 100);
});

test("children are Not Applicable and never get adult BMI categories", () => {
  const patients = [patient(1, "2020-01-01"), patient(2, "1995-01-01")];
  const records = [
    record({ id: 1, patientId: 1, date: "2026-11-10", weight: 20, height: 110 }),
    record({ id: 2, patientId: 2, date: "2026-11-10", weight: 70, height: 170 }),
  ];
  const metrics = buildNutritionReportMetrics({ patients, records, period, ageGroup: "all" });
  assert.equal(metrics.notApplicableCount, 1);
  assert.equal(metrics.classifiedCount, 1);
  assert.equal(metrics.categories.Normal.count, 1);
  assert.equal(metrics.categories.Underweight.count, 0);
});

test("incomplete adult vitals are incomplete, not classified", () => {
  const patients = [patient(1, "1990-01-01")];
  const records = [record({ id: 1, patientId: 1, date: "2026-11-10", weight: 70, height: null })];
  const metrics = buildNutritionReportMetrics({ patients, records, period });
  assert.equal(metrics.incompleteAdultCount, 1);
  assert.equal(metrics.classifiedCount, 0);
});

test("draft nutrition records do not enroll or classify", () => {
  const patients = [patient(1, "1990-01-01")];
  const records = [
    record({ id: 1, patientId: 1, date: "2026-11-10", weight: 70, height: 170, nutrition: true, draft: true }),
  ];
  const metrics = buildNutritionReportMetrics({ patients, records, period });
  assert.equal(metrics.everEnrolled, 0);
  assert.equal(metrics.classifiedCount, 0);
});

test("ever enrolled includes closed historical nutrition visits on or before period end", () => {
  const patients = [
    patient(1, "1990-01-01"),
    patient(2, "1992-01-01"),
    patient(3, "2015-01-01"),
  ];
  const records = [
    record({ id: 1, patientId: 1, date: "2026-10-01", weight: 70, height: 170, nutrition: true }),
    record({ id: 2, patientId: 1, date: "2026-11-05", weight: 71, height: 170, nutrition: true }),
    record({ id: 3, patientId: 2, date: "2026-11-15", weight: 60, height: 160, nutrition: true }),
    record({ id: 4, patientId: 3, date: "2026-11-15", weight: 40, height: 150, nutrition: true }),
  ];
  const metrics = buildNutritionReportMetrics({ patients, records, period, ageGroup: "20+" });
  assert.equal(metrics.everEnrolled, 2);
  assert.equal(metrics.eligible, 2);
  assert.equal(metrics.coveragePercent, 100);
});

test("age filter 0-4 excludes adults from enrollment and BMI", () => {
  const patients = [patient(1, "2024-01-01"), patient(2, "1990-01-01")];
  const records = [
    record({ id: 1, patientId: 1, date: "2026-11-10", weight: 12, height: 80, nutrition: true }),
    record({ id: 2, patientId: 2, date: "2026-11-10", weight: 70, height: 170, nutrition: true }),
  ];
  const metrics = buildNutritionReportMetrics({ patients, records, period, ageGroup: "0-4" });
  assert.equal(metrics.eligible, 1);
  assert.equal(metrics.everEnrolled, 1);
  assert.equal(metrics.classifiedCount, 0);
  assert.equal(metrics.notApplicableCount, 1);
});

test("empty period yields zeros and notes", () => {
  const metrics = buildNutritionReportMetrics({
    patients: [patient(1, "1990-01-01")],
    records: [],
    period,
  });
  assert.equal(metrics.classifiedCount, 0);
  assert.equal(metrics.everEnrolled, 0);
  assert.equal(metrics.eligible, 1);
  assert.equal(metrics.coveragePercent, 0);
  assert.ok(metrics.notes.length >= 1);
});
