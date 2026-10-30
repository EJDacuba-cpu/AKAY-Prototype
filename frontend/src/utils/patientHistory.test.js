import assert from "node:assert/strict";
import test from "node:test";

import {
  DELIVERY_TYPES,
  EDUCATION_LEVELS,
  EXPOSURES,
  FAMILY_RELATIONS,
  INFORMANT_RELATIONS,
  MENSTRUAL_SYMPTOMS,
  PREGNANCY_OUTCOMES,
  TOILET_TYPES,
  WATER_SOURCES,
  defaultInformant,
  hasRecordedData,
  packYears,
  reviewGroups,
  sectionStatus,
  sectionVisibility,
  summarizeAllergies,
} from "./patientHistory.js";

const today = "2026-10-16";

// Birthdates relative to the fixed `today`.
const bornYearsAgo = (years, extraDays = 0) => {
  const date = new Date(Date.UTC(2026 - years, 9, 16 + extraDays));
  return date.toISOString().slice(0, 10);
};

test("option lists match the spec", () => {
  assert.deepEqual(INFORMANT_RELATIONS, [
    "Patient", "Mother", "Father", "Spouse", "Guardian", "Grandparent", "Sibling", "Other",
  ]);
  assert.deepEqual(FAMILY_RELATIONS, ["Mother", "Father", "Sibling", "Grandparent", "Child", "Other"]);
  assert.equal(EDUCATION_LEVELS.length, 7);
  assert.deepEqual(WATER_SOURCES, ["Level I", "Level II", "Level III", "Other"]);
  assert.deepEqual(TOILET_TYPES, [
    "Water-sealed (own)", "Water-sealed (shared)", "Pit latrine", "None", "Other",
  ]);
  assert.deepEqual(EXPOSURES.map((o) => o.value), ["secondhandSmoke", "biomassCooking", "industrialPollution"]);
  assert.deepEqual(MENSTRUAL_SYMPTOMS.map((o) => o.value), [
    "dysmenorrhea", "headache", "moodChanges", "bloating", "breastTenderness",
  ]);
  assert.deepEqual(PREGNANCY_OUTCOMES.map((o) => o.value), ["liveBirth", "miscarriage", "stillbirth"]);
  assert.deepEqual(DELIVERY_TYPES.map((o) => o.value), ["normal", "cesarean", "notApplicable"]);
});

test("packYears is sticks per day / 20 x years, one decimal", () => {
  assert.equal(packYears({ sticksPerDay: 20, years: 10 }), 10);
  assert.equal(packYears({ sticksPerDay: 5, years: 8 }), 2);
  assert.equal(packYears({ sticksPerDay: "7", years: "4" }), 1.4);
  assert.equal(packYears({ sticksPerDay: 10, years: 0 }), 0);
});

test("packYears is null when an input is missing", () => {
  assert.equal(packYears({ sticksPerDay: 20 }), null);
  assert.equal(packYears({ years: 10 }), null);
  assert.equal(packYears({ sticksPerDay: "", years: 10 }), null);
  assert.equal(packYears({ sticksPerDay: 0, years: 10 }), null);
  assert.equal(packYears(), null);
});

test("defaultInformant is the patient from age 18", () => {
  const adult = defaultInformant({ birthdate: bornYearsAgo(18), motherPatientId: "9", motherName: "Ana" }, today);
  assert.equal(adult.relation, "Patient");
  const minor = defaultInformant({ birthdate: bornYearsAgo(17), motherPatientId: "9", motherName: "Ana" }, today);
  assert.equal(minor.relation, "Mother");
  const notYet18 = defaultInformant({ birthdate: bornYearsAgo(18, 1) }, today);
  assert.equal(notYet18, null);
});

test("defaultInformant uses the mother link, then the guardian, else nothing", () => {
  const birthdate = bornYearsAgo(8);
  assert.deepEqual(
    defaultInformant({ birthdate, motherPatientId: "12", motherName: "Ana Cruz", guardianName: "Lola" }, today),
    { relation: "Mother", name: "Ana Cruz", patientId: "12" },
  );
  assert.deepEqual(
    defaultInformant({ birthdate, guardianName: "Lola Rosa" }, today),
    { relation: "Guardian", name: "Lola Rosa", patientId: null },
  );
  assert.equal(defaultInformant({ birthdate }, today), null);
  assert.equal(defaultInformant({ birthdate, guardianName: "  " }, today), null);
});

test("defaultInformant gives no default for an unknown age", () => {
  assert.equal(defaultInformant({ motherPatientId: "1" }, today), null);
  assert.equal(defaultInformant(null, today), null);
});

test("sectionVisibility opens Section V at 10 and Sexual at 15 for females", () => {
  const at = (years, sex = "Female") => sectionVisibility({ sex, birthdate: bornYearsAgo(years) }, today);
  assert.deepEqual(at(9), { obstetric: "collapsed", sexual: "collapsed" });
  assert.deepEqual(at(10), { obstetric: "open", sexual: "collapsed" });
  assert.deepEqual(at(14), { obstetric: "open", sexual: "collapsed" });
  assert.deepEqual(at(15), { obstetric: "open", sexual: "open" });
});

test("sectionVisibility hides Section V for males and counts unknown age as open", () => {
  assert.equal(sectionVisibility({ sex: "Male", birthdate: bornYearsAgo(30) }, today).obstetric, "hidden");
  assert.equal(sectionVisibility({ sex: "Male", birthdate: bornYearsAgo(5) }, today).sexual, "collapsed");
  assert.deepEqual(sectionVisibility({ sex: "Female" }, today), { obstetric: "open", sexual: "open" });
  assert.equal(sectionVisibility({ sex: "", birthdate: null }, today).obstetric, "hidden");
});

test("sectionVisibility hides obstetric and sexual history for infants", () => {
  const infant = { sex: "Female", birthdate: bornYearsAgo(0) };
  assert.deepEqual(sectionVisibility(infant, today), { obstetric: "hidden", sexual: "hidden" });
  assert.deepEqual(sectionVisibility({ sex: "Female", birthdate: bornYearsAgo(1) }, today), {
    obstetric: "hidden",
    sexual: "hidden",
  });
  assert.deepEqual(sectionVisibility({ sex: "Female", birthdate: "2025-09-16" }, today), {
    obstetric: "collapsed",
    sexual: "collapsed",
  });
});

test("hasRecordedData reads each section", () => {
  assert.equal(hasRecordedData({}, "medical"), false);
  assert.equal(hasRecordedData(null, "medical"), false);
  assert.equal(hasRecordedData({ allergies: { noneKnown: true } }, "medical"), true);
  assert.equal(hasRecordedData({ allergies: { items: [] } }, "medical"), false);
  assert.equal(hasRecordedData({ hospitalizations: { none: true } }, "medical"), true);
  assert.equal(hasRecordedData({ currentDiseases: [{ name: "Asthma" }] }, "medical"), true);
  assert.equal(hasRecordedData({ familyHistory: { noneKnown: false, items: [] } }, "family"), false);
  assert.equal(hasRecordedData({ familyHistory: { items: [{ condition: "Diabetes" }] } }, "family"), true);
  assert.equal(hasRecordedData({ personalSocial: { diet: { notes: "" } } }, "social"), false);
  assert.equal(hasRecordedData({ personalSocial: { smoking: { status: "never" } } }, "social"), true);
  assert.equal(hasRecordedData({ obstetric: { menarcheAge: 12 } }, "obstetric"), true);
  assert.equal(hasRecordedData({ obstetric: null }, "obstetric"), false);
  assert.equal(hasRecordedData({ obstetric: { menarcheAge: 12 } }, "unknown"), false);
});

test("hasRecordedData keeps old string shapes visible and never throws", () => {
  assert.equal(hasRecordedData({ allergies: "Penicillin" }, "medical"), true);
  assert.equal(hasRecordedData({ surgeries: "Appendectomy 2010" }, "medical"), true);
  assert.equal(hasRecordedData({ familyHistory: "Diabetes - mother" }, "family"), true);
  assert.equal(hasRecordedData({ personalSocial: "   " }, "social"), false);
  assert.equal(hasRecordedData("garbage", "medical"), false);
});

test("sectionStatus covers every kind", () => {
  const background = {
    allergies: { noneKnown: true },
    reviewedAt: { medical: { date: "2026-09-01", facility: "RHU Bulakan", by: "Dr. A" } },
    updatedAt: { medical: "2026-08-01", family: "2026-07-15" },
  };

  assert.deepEqual(sectionStatus({ background: {}, update: null, section: "social", today }), {
    kind: "notRecorded",
  });
  assert.deepEqual(sectionStatus({ background, update: null, section: "medical", today }), {
    kind: "lastReviewed",
    date: "2026-09-01",
    facility: "RHU Bulakan",
  });
  assert.deepEqual(sectionStatus({ background, update: null, section: "family", today }), {
    kind: "recorded",
    date: "2026-07-15",
  });
  assert.deepEqual(
    sectionStatus({ background, update: { sections: {}, reviewed: ["medical"] }, section: "medical", today }),
    { kind: "reviewedToday", date: today },
  );
  assert.deepEqual(
    sectionStatus({
      background,
      update: { sections: { medical: {} }, reviewed: ["medical"] },
      section: "medical",
      today,
    }),
    { kind: "updatedToday", date: today },
  );
});

test("sectionStatus shows data with no date as recorded, not reviewed", () => {
  const status = sectionStatus({
    background: { familyHistory: "Diabetes - mother" },
    update: null,
    section: "family",
    today,
  });
  assert.deepEqual(status, { kind: "recorded", date: undefined });
});

test("sectionStatus is last reviewed only with a review stamp that has a date", () => {
  const status = sectionStatus({
    background: {
      allergies: { noneKnown: true },
      reviewedAt: { medical: { date: "", facility: "RHU Bulakan" } },
      updatedAt: { medical: "2026-08-01" },
    },
    update: null,
    section: "medical",
    today,
  });
  assert.deepEqual(status, { kind: "recorded", date: "2026-08-01" });
});

test("summarizeAllergies", () => {
  assert.deepEqual(summarizeAllergies(null), { status: "unrecorded", text: "" });
  assert.deepEqual(summarizeAllergies(undefined), { status: "unrecorded", text: "" });
  assert.deepEqual(summarizeAllergies({}), { status: "unrecorded", text: "" });
  assert.equal(summarizeAllergies({ noneKnown: true }).status, "none");
  assert.deepEqual(
    summarizeAllergies({ items: [{ allergen: "Penicillin", reaction: "Rash" }, { allergen: "Shrimp" }] }),
    { status: "recorded", text: "Penicillin (Rash), Shrimp" },
  );
  assert.deepEqual(summarizeAllergies("Penicillin"), { status: "recorded", text: "Penicillin" });
});

test("reviewGroups sorts the visible sections", () => {
  const update = { sections: { medical: {} }, reviewed: ["family"] };
  assert.deepEqual(reviewGroups({ background: {}, update }), {
    updated: ["medical"],
    reviewed: ["family"],
    notReviewed: ["social", "obstetric"],
  });
  assert.deepEqual(reviewGroups({ background: {}, update, sections: ["medical", "family", "social"] }), {
    updated: ["medical"],
    reviewed: ["family"],
    notReviewed: ["social"],
  });
  assert.deepEqual(reviewGroups({ background: {}, update: null, sections: ["medical"] }), {
    updated: [],
    reviewed: [],
    notReviewed: ["medical"],
  });
});
