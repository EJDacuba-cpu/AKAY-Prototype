import test from "node:test";
import assert from "node:assert/strict";

import {
  MATERNAL_LAB_TEST_KEYS,
  MATERNAL_LAB_TESTS,
  MATERNAL_RISK_GROUPS,
  MATERNAL_RISK_PARENTS,
  PRENATAL_IMMUNIZATION_OPTIONS,
  applyRiskFactorChange,
  thisVisitDoseEntry,
} from "./prenatalForm.js";

/* ── Layout matches the prenatal record ──────────────────────────────── */

test("Medical History has the three columns, in order", () => {
  assert.deepEqual(
    MATERNAL_RISK_GROUPS.map((group) => group.eyebrow),
    ["Pregnancy / Obstetric Risk Factors", "Medical Conditions", "Other Important Information"],
  );
  assert.deepEqual(
    MATERNAL_RISK_GROUPS.map((group) => group.options.length),
    [6, 5, 3],
  );
});

test("every risk factor maps to a field the record already stores", () => {
  // The draft allowlist and the saved record both use exactly these keys.
  const stored = new Set([
    "ageRisk", "heightRisk", "grandMultipara", "previousCs",
    "recurrentMiscarriageOrStillbirth", "postpartumHemorrhage",
    "tuberculosis", "heartDisease", "diabetes", "bronchialAsthma", "goiter",
    "hypertensive", "alcoholUser", "smoker",
  ]);
  for (const option of MATERNAL_RISK_GROUPS.flatMap((group) => group.options)) {
    assert.ok(stored.has(option.key), option.key);
  }
});

test("Laboratory Results lists the seven tests in the record's order", () => {
  assert.deepEqual(
    MATERNAL_LAB_TESTS.map((entry) => entry.label),
    ["Hemoglobin", "CBC", "HBsAg", "Blood Type", "HIV", "Syphilis", "Urinalysis"],
  );
  assert.deepEqual(MATERNAL_LAB_TEST_KEYS, [
    "hemoglobin", "cbc", "hbsag", "bloodType", "hiv", "syphilis", "urinalysis",
  ]);
});

/* ── Risk Code flags stay correct ────────────────────────────────────── */

test("Risk Code D and E are each kept by their own items", () => {
  assert.deepEqual(MATERNAL_RISK_PARENTS.previousPregnancyComplications, [
    "previousCs", "recurrentMiscarriageOrStillbirth", "postpartumHemorrhage",
  ]);
  assert.deepEqual(MATERNAL_RISK_PARENTS.medicalConditions, [
    "tuberculosis", "heartDisease", "diabetes", "bronchialAsthma", "goiter",
  ]);
});

test("checking an item sets its Risk Code flag", () => {
  const next = applyRiskFactorChange({}, "previousCs", true);
  assert.equal(next.previousCs, true);
  assert.equal(next.previousPregnancyComplications, true);
  assert.equal(next.medicalConditions, undefined, "the other code is untouched");
});

test("the flag stays set while ANY of its items is still checked", () => {
  let risk = applyRiskFactorChange({}, "tuberculosis", true);
  risk = applyRiskFactorChange(risk, "goiter", true);
  risk = applyRiskFactorChange(risk, "tuberculosis", false);
  assert.equal(risk.medicalConditions, true);
  risk = applyRiskFactorChange(risk, "goiter", false);
  assert.equal(risk.medicalConditions, false, "cleared once the last item is");
});

test("an item without a Risk Code never touches a flag", () => {
  const next = applyRiskFactorChange({ medicalConditions: true }, "smoker", true);
  assert.equal(next.smoker, true);
  assert.equal(next.medicalConditions, true);
  assert.equal(next.previousPregnancyComplications, undefined);
});

test("a code an older record carried WITHOUT an item survives unrelated edits", () => {
  // The old form let Risk Code D be ticked on its own. Editing anything else
  // must not silently clear it.
  const legacy = { previousPregnancyComplications: true };
  let next = applyRiskFactorChange(legacy, "ageRisk", true);
  next = applyRiskFactorChange(next, "diabetes", true);
  assert.equal(next.previousPregnancyComplications, true);
});

test("changing a risk factor never mutates the previous state", () => {
  const before = { previousCs: false };
  applyRiskFactorChange(before, "previousCs", true);
  assert.deepEqual(before, { previousCs: false });
  assert.doesNotThrow(() => applyRiskFactorChange(undefined, "smoker", true));
});

/* ── This visit's dose is filed under its schedule ───────────────────── */

test("the dose options are TT1-5 then Td1-5, each on its own schedule", () => {
  assert.deepEqual(
    PRENATAL_IMMUNIZATION_OPTIONS.map((option) => option.value),
    ["tt1", "tt2", "tt3", "tt4", "tt5", "td1", "td2", "td3", "td4", "td5"],
  );
  for (const option of PRENATAL_IMMUNIZATION_OPTIONS) {
    assert.equal(
      option.schedule,
      option.value.startsWith("tt") ? "tetanusToxoidStatus" : "tetanusDiphtheriaStatus",
    );
  }
});

test("a TT dose with a date is filed under the TT schedule only", () => {
  const visit = { type: "tt2", doseStatus: "Given", dateGiven: "2026-09-22" };
  assert.deepEqual(thisVisitDoseEntry(visit, "tetanusToxoidStatus"), { tt2: "2026-09-22" });
  assert.deepEqual(thisVisitDoseEntry(visit, "tetanusDiphtheriaStatus"), {});
});

test("a Td dose with a date is filed under the Td schedule only", () => {
  const visit = { type: "td3", dateGiven: "2026-09-22" };
  assert.deepEqual(thisVisitDoseEntry(visit, "tetanusDiphtheriaStatus"), { td3: "2026-09-22" });
  assert.deepEqual(thisVisitDoseEntry(visit, "tetanusToxoidStatus"), {});
});

test("nothing is filed without both a known dose and a date", () => {
  for (const visit of [
    { type: "tt1", dateGiven: "" },
    { type: "", dateGiven: "2026-09-22" },
    { type: "tt9", dateGiven: "2026-09-22" },
    {},
    undefined,
  ]) {
    assert.deepEqual(thisVisitDoseEntry(visit, "tetanusToxoidStatus"), {});
    assert.deepEqual(thisVisitDoseEntry(visit, "tetanusDiphtheriaStatus"), {});
  }
});

test("filing the dose keeps earlier doses on the record", () => {
  const history = { tt1: "2026-05-01", tt2: "", tt3: "" };
  const merged = {
    ...history,
    ...thisVisitDoseEntry({ type: "tt2", dateGiven: "2026-09-22" }, "tetanusToxoidStatus"),
  };
  assert.deepEqual(merged, { tt1: "2026-05-01", tt2: "2026-09-22", tt3: "" });
});
