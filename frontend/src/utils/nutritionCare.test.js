import test from "node:test";
import assert from "node:assert/strict";

import { nutritionMeasurementHistory } from "./nutritionCare.js";

test("measurement history keeps one row per record and stays inside the episode window", () => {
  const history = nutritionMeasurementHistory([
    { id: 1, dateOfVisit: "2026-09-30", weight: "80", height: "170" },
    { id: 2, dateOfVisit: "2026-10-01", selectedPrograms: ["Nutrition"], vital_signs: { weight: "70 kg", height: "170 cm" } },
    { id: 3, dateOfVisit: "2026-10-05", category: "General Consultation", weight: "71", height: "170" },
    { id: 3, dateOfVisit: "2026-10-05", weight: "99", height: "170" },
    { id: 4, dateOfVisit: "2026-10-10", weight: "72", height: "" },
    { id: 5, dateOfVisit: "2026-10-11", weight: "73", height: "170" },
    { id: 6, dateOfVisit: "2026-10-06", weight: "", height: "" },
  ], { startedOn: "2026-10-01", closedOn: "2026-10-10", today: new Date("2026-11-05"), age: 40 });

  assert.deepEqual(history.map((row) => row.healthRecordId), [2, 3, 4]);
  assert.equal(history[0].dateRecorded, "2026-10-01");
  assert.equal(history[0].weightKg, 70);
  assert.equal(history[0].heightCm, 170);
  assert.ok(Math.abs(history[0].bmi - (70 / (1.7 ** 2))) < 0.0001);
  assert.equal(history[0].bmiCategory, "Normal");
  assert.equal(history[1].weightKg, 71);
  assert.equal(history[2].weightKg, 72);
  assert.equal(history[2].bmi, null);
  assert.equal(history[2].bmiCategory, "");
});

test("BMI category is withheld under 18 and shown from age 18", () => {
  const records = [{ id: 1, dateOfVisit: "2026-10-01", weight: "80", height: "170.9" }];
  const window = { startedOn: "2026-10-01", today: new Date("2026-11-05") };
  assert.equal(nutritionMeasurementHistory(records, { ...window, age: 17 })[0].bmiCategory, "");
  assert.equal(nutritionMeasurementHistory(records, { ...window, age: "12 yrs" })[0].bmiCategory, "");
  assert.equal(nutritionMeasurementHistory(records, { ...window, age: 18 })[0].bmiCategory, "Overweight");
  assert.equal(nutritionMeasurementHistory(records, { ...window, age: 40 })[0].bmiCategory, "Overweight");
  assert.equal(nutritionMeasurementHistory(records, window)[0].bmiCategory, "Overweight");
  const child = nutritionMeasurementHistory(
    [{ id: 1, dateOfVisit: "2026-10-01", weight: 40, height: 150 }],
    { ...window, age: 12 },
  );
  assert.equal(child[0].bmiCategory, "");
  assert.ok(child[0].bmi > 0);
});

test("an open episode does not stop history at today", () => {
  const history = nutritionMeasurementHistory([
    { id: 1, dateRecorded: "2026-10-01", weight: 60, height: 160 },
    { id: 2, dateRecorded: "2026-12-01", weight: 61, height: 160 },
  ], { startedOn: "2026-10-01", today: new Date("2026-11-05"), age: 30 });
  assert.deepEqual(history.map((row) => row.healthRecordId), [1, 2]);
});
