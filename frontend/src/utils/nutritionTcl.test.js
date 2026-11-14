import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NUTRITION_TCL_NA,
  NUTRITION_TCL_NOT_ASSESSED,
  buildNutritionTclRows,
  filterNutritionTclRows,
} from "./nutritionTcl.js";

const period = {
  start: "2026-11-01",
  end: "2026-11-30",
  label: "November 2026",
  preset: "monthly",
};

function patient(id, birthdate, extras = {}) {
  return {
    id,
    birthdate,
    firstName: extras.firstName || "Pat",
    lastName: extras.lastName || String(id),
    sex: extras.sex || "Female",
    familySerialNumber: extras.fsn || "",
    ...extras,
  };
}

function record({
  id,
  patientId,
  date,
  weight = null,
  height = null,
  nutrition = true,
  draft = false,
}) {
  return {
    id,
    patient_id: patientId,
    date_recorded: date,
    vital_signs: { weight, height },
    category: nutrition ? "Nutrition" : "General Consultation",
    monitoring_data: nutrition
      ? { selectedPrograms: ["Nutrition"] }
      : { selectedPrograms: [] },
    finalized_at: draft ? null : `${date}T10:00:00Z`,
    status: draft ? "draft" : "finalized",
    is_draft: draft,
  };
}

test("buildNutritionTclRows keeps one enrolled patient with the latest in-period assessment", () => {
  const patients = [patient(1, "1990-05-01", { firstName: "Ana", lastName: "Cruz", fsn: "FSN-1" })];
  const records = [
    record({ id: 1, patientId: 1, date: "2026-11-05", weight: 50, height: 170 }),
    record({ id: 2, patientId: 1, date: "2026-11-20", weight: 80, height: 170 }),
  ];
  const rows = buildNutritionTclRows({ patients, records, period });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].patientName, "Ana Cruz");
  assert.equal(rows[0].assessmentDate, "2026-11-20");
  assert.equal(rows[0].weightDisplay, "80");
  assert.equal(rows[0].heightDisplay, "170");
  assert.equal(rows[0].classification, "Overweight");
  assert.equal(rows[0].canViewPatient, true);
  assert.equal(Object.prototype.hasOwnProperty.call(rows[0], "lastVisit"), false);
});

test("non-enrolled measured patients are excluded from Nutrition TCL", () => {
  const patients = [patient(1, "1990-01-01")];
  const records = [
    record({
      id: 1,
      patientId: 1,
      date: "2026-11-10",
      weight: 70,
      height: 170,
      nutrition: false,
    }),
  ];
  assert.equal(buildNutritionTclRows({ patients, records, period }).length, 0);
});

test("children never receive adult BMI classification", () => {
  const patients = [patient(1, "2020-01-01", { firstName: "Child" })];
  const records = [
    record({ id: 1, patientId: 1, date: "2026-11-10", weight: 20, height: 110 }),
  ];
  const rows = buildNutritionTclRows({ patients, records, period });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].bmiDisplay, NUTRITION_TCL_NA);
  assert.equal(rows[0].classification, NUTRITION_TCL_NA);
});

test("incomplete adult measurements are Not assessed", () => {
  const patients = [patient(1, "1990-01-01")];
  const records = [
    record({ id: 1, patientId: 1, date: "2026-11-10", weight: 70, height: null }),
  ];
  const rows = buildNutritionTclRows({ patients, records, period });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].classification, NUTRITION_TCL_NOT_ASSESSED);
  assert.equal(rows[0].bmiDisplay, "—");
});

test("age group filter uses age at assessment", () => {
  const patients = [
    patient(1, "2023-06-01", { firstName: "Kid" }),
    patient(2, "1990-01-01", { firstName: "Adult" }),
  ];
  const records = [
    record({ id: 1, patientId: 1, date: "2026-11-10", weight: 14, height: 95 }),
    record({ id: 2, patientId: 2, date: "2026-11-10", weight: 70, height: 170 }),
  ];
  const kids = buildNutritionTclRows({ patients, records, period, ageGroup: "0-4" });
  const adults = buildNutritionTclRows({ patients, records, period, ageGroup: "20+" });
  assert.equal(kids.length, 1);
  assert.equal(kids[0].patientName.includes("Kid"), true);
  assert.equal(adults.length, 1);
  assert.equal(adults[0].patientName.includes("Adult"), true);
});

test("draft assessments are ignored", () => {
  const patients = [patient(1, "1990-01-01")];
  const records = [
    record({
      id: 1,
      patientId: 1,
      date: "2026-11-10",
      weight: 70,
      height: 170,
      draft: true,
    }),
  ];
  assert.equal(buildNutritionTclRows({ patients, records, period }).length, 0);
});

test("filterNutritionTclRows searches name and identifier", () => {
  const rows = [
    {
      patientName: "Ana Cruz",
      patientIdentifier: "FSN-1",
      patientId: "1",
      classification: "Normal",
      sex: "Female",
    },
    {
      patientName: "Ben Santos",
      patientIdentifier: "FSN-2",
      patientId: "2",
      classification: "Obese",
      sex: "Male",
    },
  ];
  assert.equal(filterNutritionTclRows(rows, { search: "ana" }).length, 1);
  assert.equal(filterNutritionTclRows(rows, { search: "FSN-2" }).length, 1);
  assert.equal(filterNutritionTclRows(rows, { search: "" }).length, 2);
});

test("Nutrition TCL section source has no Last Visit or Care column labels", async () => {
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(
    join(here, "../components/features/reports/NutritionTclSection.jsx"),
    "utf8",
  );
  assert.match(source, /<th className="px-3 text-right">View<\/th>/);
  assert.doesNotMatch(source, /<th[^>]*>Last Assessment<\/th>/);
  assert.doesNotMatch(source, /<th[^>]*>Last Visit<\/th>/);
  assert.doesNotMatch(source, /<th[^>]*>Care<\/th>/);
});

test("BHC and RHU reports wire NutritionTclSection for nutrition category", async () => {
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = dirname(fileURLToPath(import.meta.url));
  for (const relative of ["../pages/bhc/BHCReports.jsx", "../pages/rhu/RHUReports.jsx"]) {
    const source = readFileSync(join(here, relative), "utf8");
    assert.match(source, /import NutritionTclSection/);
    assert.match(source, /category === "nutrition"/);
    assert.match(source, /<NutritionTclSection/);
    assert.match(source, /ageGroup=\{ageGroup\}/);
  }
});
