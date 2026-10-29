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
  applyPregnancyDating,
  applyRiskFactorChange,
  collectPrenatalHistory,
  computeAogFromDating,
  computeAogFromLmp,
  computeEddFromLmp,
  parseCivilDate,
  continueBhcPrenatalPrefill,
  continuePrenatalPrefill,
  hasPregnancyBaseline,
  maternalReviewFields,
  mergeMaternalData,
  readLaboratoryEntries,
  sanitizeLaboratoryEntries,
  sanitizeRiskAssessment,
  thisVisitDoseEntry,
  withLaboratoryEntries,
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

test("EDC is LMP plus 280 calendar days, without timezone shift", () => {
  assert.deepEqual(parseCivilDate("2026-07-09"), { y: 2026, m: 7, d: 9 });
  assert.equal(parseCivilDate("2026-02-31"), null);
  assert.equal(computeEddFromLmp("2026-03-01"), "2026-12-06");
  assert.equal(computeEddFromLmp("2026-07-09"), "2027-04-15");
  assert.equal(computeEddFromLmp("2026-01-31"), "2026-11-07");
  assert.equal(computeEddFromLmp(""), "");
  assert.equal(computeEddFromLmp("2026-02-31"), "Invalid Date");
});

test("AOG is counted from established dating to the visit date", () => {
  assert.equal(computeAogFromLmp("2026-03-01", "2026-06-07"), "14 weeks");
  assert.equal(computeAogFromDating({
    lmp: "2026-03-01",
    edc: "2026-12-06",
    visitDate: "2026-06-07",
  }), "14 weeks");
});

test("a documented EDC is kept when it is not the auto value", () => {
  const kept = applyPregnancyDating({
    lmp: "2026-07-09",
    edc: "2027-04-16",
    aog: "16 weeks",
    visitDate: "2026-10-29",
    previousAutoEdd: "2027-04-15",
    previousAutoAog: "15 weeks",
  });
  assert.equal(kept.edc, "2027-04-16");
  assert.equal(kept.aog, "16 weeks");

  const auto = applyPregnancyDating({
    lmp: "2026-07-09",
    edc: "",
    visitDate: "2026-10-29",
    previousAutoEdd: "",
    previousAutoAog: "",
  });
  assert.equal(auto.edc, "2027-04-15");

  const lmpChange = applyPregnancyDating({
    lmp: "2026-07-10",
    edc: "2027-04-15",
    visitDate: "2026-10-29",
    previousAutoEdd: "2027-04-15",
    previousAutoAog: "",
  });
  assert.equal(lmpChange.edc, "2027-04-16");

  const visitChange = applyPregnancyDating({
    lmp: "2026-07-09",
    edc: "2027-04-16",
    aog: "16 weeks",
    visitDate: "2026-11-01",
    previousAutoEdd: "2027-04-15",
    previousAutoAog: "16 weeks",
  });
  assert.equal(visitChange.edc, "2027-04-16");
});

test("hasPregnancyBaseline follows this visit's LMP, EDC, or G/P", () => {
  assert.equal(hasPregnancyBaseline({}), false);
  assert.equal(hasPregnancyBaseline({ lmp: "2026-07-09" }), true);
  assert.equal(hasPregnancyBaseline({}, "2027-04-15"), true);
  assert.equal(hasPregnancyBaseline({ gravida: "2" }), true);
});

test("continue prefill keeps pregnancy facts and clears this-visit findings", () => {
  const next = continuePrenatalPrefill({
    maternalData: {
      lmp: "2026-03-01",
      gravida: "2",
      fht: "140 bpm",
      immunizationThisVisit: { type: "tt1", dateGiven: "2026-04-01" },
      tetanusToxoidStatus: { tt1: "2026-04-01" },
      laboratoryResults: { hemoglobin: "11.5 g/dL" },
      laboratoryResultDates: { hemoglobin: "2026-04-01" },
      laboratoryEntries: [{ test: "hemoglobin", result: "11.5 g/dL", datePerformed: "2026-04-01" }],
      ultrasound: { result: "Single live intrauterine pregnancy", dateDone: "2026-04-10" },
    },
    expectedDeliveryDate: "2026-12-08",
  });
  assert.equal(next.lmp, "2026-03-01");
  assert.equal(next.gravida, "2");
  assert.equal(next.expectedDeliveryDate, "2026-12-08");
  assert.equal(next.aog, "");
  assert.equal(next.fht, "");
  assert.equal(next.immunizationThisVisit.type, "");
  assert.equal(next.tetanusToxoidStatus.tt1, "2026-04-01");
  assert.equal(next.laboratoryResults.hemoglobin, "");
  assert.equal(next.laboratoryResultDates.hemoglobin, "");
  assert.deepEqual(next.laboratoryEntries, []);
  assert.equal(next.ultrasound.result, "");
  assert.equal(next.ultrasound.dateDone, "");
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
  const obstetric = readFileSync(join(here, "../components/features/patients/history/ObstetricSection.jsx"), "utf8");
  const panel = readFileSync(join(here, "../components/features/patients/history/PatientHistoryPanel.jsx"), "utf8");
  const workspace = readFileSync(join(here, "../pages/bhc/ConsultationWorkspace.jsx"), "utf8");
  const rhuWorkspace = readFileSync(join(here, "../pages/rhu/RhuConsultationWorkspace.jsx"), "utf8");
  assert.match(form, /title="Pregnancy \/ Obstetric Information"/);
  assert.match(form, /includeObstetricHistory/);
  assert.match(form, /sections=\{\["obstetric"\]\}/);
  assert.match(form, /summaryWhenRecorded/);
  assert.match(form, /Add Lab Result/);
  assert.match(form, /Correct/);
  assert.match(form, /hasPregnancyBaseline/);
  assert.doesNotMatch(form, /title="Previous FP Method"/);
  assert.match(form, /New Results This Visit/);
  assert.match(form, /Previous Laboratory Results/);
  assert.match(form, /Add Ultrasound/);
  assert.match(panel, /summaryWhenRecorded/);
  assert.match(workspace, /shouldPrefillPrenatalBaseline/);
  assert.match(workspace, /prenatalHistory=\{prenatalHistory\}/);
  assert.match(workspace, /From Patient History. This visit records Method Used \/ Accepted/);
  assert.doesNotMatch(workspace, /handleFamilyPlanningChange\("previousMethod"/);
  assert.match(rhuWorkspace, /prenatalHistory=\{prenatalHistory\}/);
  assert.match(rhuWorkspace, /From Patient History. This visit records Method used/);
  assert.match(obstetric, /Usual menstrual cycle/);
  assert.match(obstetric, /Has menstrual periods/);
  assert.match(obstetric, /Pregnancy is not menopause/);
  assert.match(obstetric, /Previous FP method/);
  assert.doesNotMatch(form, /PrenatalHistorySummary/);
  assert.doesNotMatch(form, /Previous pregnancies are in Patient History/);
});

test("collectPrenatalHistory reads prior labs, ultrasound, risks, and TT/Td without mixing visits", () => {
  const history = collectPrenatalHistory([
    {
      id: 1,
      dateOfVisit: "2026-04-01",
      selectedPrograms: ["Maternal"],
      maternalData: {
        laboratoryResults: { hemoglobin: "11.2 g/dL" },
        laboratoryResultDates: { hemoglobin: "2026-04-01" },
        ultrasound: { result: "Viable pregnancy", dateDone: "2026-04-02" },
        riskAssessment: { previousCs: true },
        tetanusToxoidStatus: { tt1: "2026-04-01" },
      },
    },
    {
      id: 2,
      dateOfVisit: "2026-06-01",
      selectedPrograms: ["Maternal"],
      maternalData: {
        laboratoryResults: { urinalysis: "Normal" },
        laboratoryResultDates: { urinalysis: "2026-06-01" },
        tetanusToxoidStatus: { tt2: "2026-06-01" },
      },
    },
    { id: 3, selectedPrograms: ["EPI"], immunizationData: { vaccineEntries: [] } },
  ]);
  assert.deepEqual(history.labs.map((item) => item.label), ["Hemoglobin", "Urinalysis"]);
  assert.equal(history.labs[0].result, "11.2 g/dL");
  assert.equal(history.ultrasounds.length, 1);
  assert.equal(history.ultrasounds[0].result, "Viable pregnancy");
  assert.deepEqual(history.risks, ["Previous C/S"]);
  assert.deepEqual(
    history.immunizations.map((item) => item.type),
    ["tt1", "tt2"],
  );
});

test("collectPrenatalHistory is empty when there are no maternal records", () => {
  assert.deepEqual(collectPrenatalHistory([]), {
    labs: [],
    ultrasounds: [],
    risks: [],
    immunizations: [],
  });
});

test("laboratory entries keep repeated tests and convert older keyed maps", () => {
  assert.deepEqual(
    sanitizeLaboratoryEntries([
      { test: "hemoglobin", result: "11.2 g/dL", datePerformed: "2026-04-01" },
      { test: "unknown", result: "x" },
      { test: "cbc", result: "   " },
      { test: "hemoglobin", result: "11.8 g/dL", date: "2026-06-01" },
    ]),
    [
      { test: "hemoglobin", result: "11.2 g/dL", datePerformed: "2026-04-01" },
      { test: "hemoglobin", result: "11.8 g/dL", datePerformed: "2026-06-01" },
    ],
  );

  assert.deepEqual(
    readLaboratoryEntries({
      laboratoryResults: { hemoglobin: "11.2 g/dL", urinalysis: "Normal" },
      laboratoryResultDates: { hemoglobin: "2026-04-01" },
    }),
    [
      { test: "hemoglobin", result: "11.2 g/dL", datePerformed: "2026-04-01" },
      { test: "urinalysis", result: "Normal", datePerformed: "" },
    ],
  );

  assert.deepEqual(
    readLaboratoryEntries({
      laboratoryEntries: [],
      laboratoryResults: { hemoglobin: "11.2 g/dL" },
    }),
    [],
  );

  const saved = withLaboratoryEntries([
    { test: "hemoglobin", result: "11.2 g/dL", datePerformed: "2026-04-01" },
    { test: "hemoglobin", result: "11.8 g/dL", datePerformed: "2026-06-01" },
    { test: "urinalysis", result: "Normal", datePerformed: "2026-06-01" },
  ]);
  assert.equal(saved.laboratoryEntries.length, 3);
  assert.equal(saved.laboratoryResults.hemoglobin, "11.8 g/dL");
  assert.equal(saved.laboratoryResultDates.hemoglobin, "2026-06-01");
  assert.equal(saved.laboratoryResults.urinalysis, "Normal");
});

test("mergeMaternalData restores this-visit lab entries, including repeats", () => {
  const merged = mergeMaternalData({
    laboratoryEntries: [
      { test: "hemoglobin", result: "11.2 g/dL", datePerformed: "2026-04-01" },
      { test: "hemoglobin", result: "11.8 g/dL", datePerformed: "2026-06-01" },
    ],
  });
  assert.deepEqual(merged.laboratoryEntries, [
    { test: "hemoglobin", result: "11.2 g/dL", datePerformed: "2026-04-01" },
    { test: "hemoglobin", result: "11.8 g/dL", datePerformed: "2026-06-01" },
  ]);
});

test("review lists each this-visit lab and omits the last-result snapshot", () => {
  const rows = maternalReviewFields({
    lmp: "2026-03-01",
    laboratoryEntries: [
      { test: "hemoglobin", result: "11.2 g/dL", datePerformed: "2026-04-01" },
      { test: "hemoglobin", result: "11.8 g/dL", datePerformed: "2026-06-01" },
    ],
    laboratoryResults: { hemoglobin: "11.8 g/dL" },
    laboratoryResultDates: { hemoglobin: "2026-06-01" },
  });
  assert.equal(rows.lmp, "2026-03-01");
  assert.equal("laboratoryEntries" in rows, false);
  assert.equal("laboratoryResultDates" in rows, false);
  assert.deepEqual(rows.laboratoryResults, [
    { test: "Hemoglobin", result: "11.2 g/dL", datePerformed: "2026-04-01" },
    { test: "Hemoglobin", result: "11.8 g/dL", datePerformed: "2026-06-01" },
  ]);
  assert.deepEqual(maternalReviewFields({ lmp: "2026-03-01", laboratoryEntries: [] }).laboratoryResults, undefined);
});

test("collectPrenatalHistory keeps every dated lab from the same visit", () => {
  const history = collectPrenatalHistory([
    {
      id: 4,
      dateOfVisit: "2026-06-01",
      selectedPrograms: ["Maternal"],
      maternalData: {
        laboratoryEntries: [
          { test: "hemoglobin", result: "11.2 g/dL", datePerformed: "2026-04-01" },
          { test: "hemoglobin", result: "11.8 g/dL", datePerformed: "2026-06-01" },
        ],
      },
    },
  ]);
  assert.deepEqual(
    history.labs.map((item) => item.result),
    ["11.2 g/dL", "11.8 g/dL"],
  );
  assert.equal(history.labs[0].visitDate, "2026-06-01");
  assert.equal(history.labs[1].date, "2026-06-01");
});
