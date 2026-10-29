import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

import {
  MATERNAL_LAB_TEST_KEYS,
  MATERNAL_LAB_TESTS,
  MATERNAL_RISK_GROUPS,
  MATERNAL_RISK_KEYS,
  MATERNAL_RISK_PARENTS,
  PRENATAL_IMMUNIZATION_OPTIONS,
  applyRiskFactorChange,
  computeAogFromLmp,
  computeEddFromLmp,
  continueBhcPrenatalPrefill,
  continuePrenatalPrefill,
  mergeMaternalData,
  sanitizeRiskAssessment,
  thisVisitDoseEntry,
} from "./prenatalForm.js";

/* ── Layout matches the prenatal record ──────────────────────────────── */

test("Obstetric Risk Factors is one group of four manual items", () => {
  assert.equal(MATERNAL_RISK_GROUPS.length, 1);
  assert.deepEqual(
    MATERNAL_RISK_GROUPS[0].options.map((option) => option.key),
    ["grandMultipara", "previousCs", "recurrentMiscarriageOrStillbirth", "postpartumHemorrhage"],
  );
});

test("every risk factor maps to a field the record already stores", () => {
  // The draft allowlist and the saved record both use exactly these keys.
  assert.deepEqual(MATERNAL_RISK_KEYS, [
    "ageRisk", "heightRisk", "grandMultipara", "previousPregnancyComplications",
    "previousCs", "recurrentMiscarriageOrStillbirth", "postpartumHemorrhage",
  ]);
  const stored = new Set(MATERNAL_RISK_KEYS);
  for (const option of MATERNAL_RISK_GROUPS.flatMap((group) => group.options)) {
    assert.ok(stored.has(option.key), option.key);
  }
});

test("sanitizeRiskAssessment drops the keys the form no longer records", () => {
  assert.deepEqual(
    sanitizeRiskAssessment({
      diabetes: true, smoker: true, tuberculosis: true, medicalConditions: true,
      hypertensive: true, alcoholUser: true, heartDisease: true, goiter: true, bronchialAsthma: true,
      previousCs: true, ageRisk: false,
    }),
    { previousCs: true, ageRisk: false },
  );
  assert.deepEqual(sanitizeRiskAssessment(undefined), {});
  assert.deepEqual(sanitizeRiskAssessment(null), {});
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

test("Risk Code D is kept by its own items", () => {
  assert.deepEqual(MATERNAL_RISK_PARENTS, {
    previousPregnancyComplications: ["previousCs", "recurrentMiscarriageOrStillbirth", "postpartumHemorrhage"],
  });
});

test("checking an item sets its Risk Code flag", () => {
  const next = applyRiskFactorChange({}, "previousCs", true);
  assert.equal(next.previousCs, true);
  assert.equal(next.previousPregnancyComplications, true);
});

test("the flag stays set while ANY of its items is still checked", () => {
  let risk = applyRiskFactorChange({}, "previousCs", true);
  risk = applyRiskFactorChange(risk, "postpartumHemorrhage", true);
  risk = applyRiskFactorChange(risk, "previousCs", false);
  assert.equal(risk.previousPregnancyComplications, true);
  risk = applyRiskFactorChange(risk, "postpartumHemorrhage", false);
  assert.equal(risk.previousPregnancyComplications, false, "cleared once the last item is");
});

test("an item without a Risk Code never touches a flag", () => {
  const next = applyRiskFactorChange({ previousPregnancyComplications: true }, "grandMultipara", true);
  assert.equal(next.grandMultipara, true);
  assert.equal(next.previousPregnancyComplications, true);
});

test("a code an older record carried WITHOUT an item survives unrelated edits", () => {
  // The old form let Risk Code D be ticked on its own. Editing anything else
  // must not silently clear it.
  const legacy = { previousPregnancyComplications: true };
  const next = applyRiskFactorChange(legacy, "grandMultipara", true);
  assert.equal(next.previousPregnancyComplications, true);
});

test("changing a risk factor never mutates the previous state", () => {
  const before = { previousCs: false };
  applyRiskFactorChange(before, "previousCs", true);
  assert.deepEqual(before, { previousCs: false });
  assert.doesNotThrow(() => applyRiskFactorChange(undefined, "grandMultipara", true));
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

test("Naegele's rule fills EDC from LMP", () => {
  assert.equal(computeEddFromLmp("2026-03-01"), "2026-12-08");
  assert.equal(computeEddFromLmp(""), "");
});

test("AOG is counted from LMP to the visit date", () => {
  assert.equal(computeAogFromLmp("2026-03-01", "2026-06-07"), "14 weeks");
});

test("continue prefill keeps pregnancy facts and clears this-visit findings", () => {
  const next = continuePrenatalPrefill({
    maternalData: {
      lmp: "2026-03-01",
      gravida: "2",
      fht: "140 bpm",
      immunizationThisVisit: { type: "tt1", dateGiven: "2026-04-01" },
      tetanusToxoidStatus: { tt1: "2026-04-01" },
    },
    expectedDeliveryDate: "2026-12-08",
  });
  assert.equal(next.lmp, "2026-03-01");
  assert.equal(next.gravida, "2");
  assert.equal(next.expectedDeliveryDate, "2026-12-08");
  assert.equal(next.fht, "");
  assert.equal(next.immunizationThisVisit.type, "");
  assert.equal(next.tetanusToxoidStatus.tt1, "2026-04-01");
});

test("BHC continue prefill keeps pregnancy facts and clears obstetric risk checkboxes", () => {
  const next = continueBhcPrenatalPrefill({
    maternalData: {
      lmp: "2026-03-01",
      gravida: "2",
      fht: "140 bpm",
      tetanusToxoidStatus: { tt1: "2026-04-01" },
      riskAssessment: { previousCs: true, previousPregnancyComplications: true },
    },
    expectedDeliveryDate: "2026-12-08",
  });
  assert.equal(next.lmp, "2026-03-01");
  assert.equal(next.gravida, "2");
  assert.equal(next.tetanusToxoidStatus.tt1, "2026-04-01");
  assert.equal(next.fht, "");
  assert.equal(next.riskAssessment.previousCs, false);
  assert.equal(next.riskAssessment.previousPregnancyComplications, false);
});

test("mergeMaternalData drops retired risk keys", () => {
  const merged = mergeMaternalData({ lmp: "2026-03-01", riskAssessment: { diabetes: true, previousCs: true } });
  assert.equal(merged.lmp, "2026-03-01");
  assert.equal(merged.riskAssessment.previousCs, true);
  assert.equal("diabetes" in merged.riskAssessment, false);
});

test("the Prenatal form keeps this-pregnancy fields and can mount Section V", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const form = readFileSync(join(here, "../components/features/health-records/PrenatalAssessmentForm.jsx"), "utf8");
  assert.match(form, /title="Pregnancy \/ Obstetric Information"/);
  assert.match(form, /includeObstetricHistory/);
  assert.match(form, /sections=\{\["obstetric"\]\}/);
  assert.doesNotMatch(form, /PrenatalHistorySummary/);
  assert.doesNotMatch(form, /Previous pregnancies are in Patient History/);
});
