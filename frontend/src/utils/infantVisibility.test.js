import assert from "node:assert/strict";
import test from "node:test";

import {
  INFANT_HIDDEN_PROGRAMS,
  INFANT_HIDDEN_SOCIAL_KEYS,
  infantHiddenSocialKeys,
  isInfantAt,
  omitHiddenSocialKeys,
  shouldShowBmiDisplay,
  shouldShowLifestyleControls,
  visibleConsultationPrograms,
  visibleOverviewVitalKeys,
} from "./infantVisibility.js";

const DOB = "2025-10-04";
function daysAfterMonths(months, days = 0) {
  const dob = new Date(DOB);
  return new Date(dob.getFullYear(), dob.getMonth() + months, dob.getDate() + days, 12);
}

test("isInfantAt reads birthdate aliases and uses the as-of date, not today", () => {
  const atFourMonths = daysAfterMonths(4);
  assert.equal(isInfantAt({ birthdate: DOB }, atFourMonths), true);
  assert.equal(isInfantAt({ birthDate: DOB }, atFourMonths), true);
  assert.equal(isInfantAt({ dateOfBirth: DOB }, atFourMonths), true);
  assert.equal(isInfantAt({ date_of_birth: DOB }, atFourMonths), true);
  assert.equal(isInfantAt({ birthdate: DOB }, daysAfterMonths(0)), true);
  assert.equal(isInfantAt({ birthdate: DOB }, daysAfterMonths(12)), true);
  assert.equal(isInfantAt({ birthdate: DOB }, daysAfterMonths(13)), false);
  assert.equal(isInfantAt({ birthdate: DOB }, daysAfterMonths(60)), false);
  assert.equal(isInfantAt({ birthdate: DOB }, daysAfterMonths(240)), false);
  assert.equal(isInfantAt({}, atFourMonths), false);
});

test("infant social hide list keeps household environment and never includes feeding fields", () => {
  assert.deepEqual(INFANT_HIDDEN_SOCIAL_KEYS, ["smoking", "alcohol", "diet", "sexual"]);
  assert.equal(INFANT_HIDDEN_SOCIAL_KEYS.includes("environment"), false);
  assert.equal(INFANT_HIDDEN_SOCIAL_KEYS.includes("feeding"), false);
});

test("infantHiddenSocialKeys omits smoking, alcohol, diet, and sexual for infants, plus BHC education fields", () => {
  const infant = { birthdate: DOB };
  const keys = infantHiddenSocialKeys(infant, daysAfterMonths(4));
  assert.deepEqual(keys, ["education", "pastOccupations", "smoking", "alcohol", "diet", "sexual"]);
});

test("infantHiddenSocialKeys keeps only BHC education fields for older patients", () => {
  assert.deepEqual(infantHiddenSocialKeys({ birthdate: DOB }, daysAfterMonths(13)), [
    "education",
    "pastOccupations",
  ]);
});

test("RHU history still hides infant lifestyle and education, but keeps adult education", () => {
  const infant = { birthdate: DOB };
  assert.deepEqual(infantHiddenSocialKeys(infant, daysAfterMonths(4), { includeBhcProfileFields: false }), [
    "smoking",
    "alcohol",
    "diet",
    "sexual",
    "education",
    "pastOccupations",
  ]);
  assert.deepEqual(
    infantHiddenSocialKeys({ birthdate: DOB }, daysAfterMonths(60), { includeBhcProfileFields: false }),
    [],
  );
});

test("omitHiddenSocialKeys leaves stored values in the source object", () => {
  const social = {
    smoking: { status: "never" },
    alcohol: { status: "never" },
    diet: { highSalt: true },
    sexual: { active: "no" },
    environment: { waterSource: "Level III" },
    education: { level: "None" },
  };
  const omitted = omitHiddenSocialKeys(social, ["smoking", "alcohol", "diet", "sexual", "education"]);
  assert.equal(Object.hasOwn(omitted, "smoking"), false);
  assert.equal(Object.hasOwn(omitted, "environment"), true);
  assert.equal(social.smoking.status, "never");
  assert.equal(social.education.level, "None");
});

test("lifestyle controls and BMI display are hidden for infants and shown after the cutoff", () => {
  const infant = { birthdate: DOB };
  assert.equal(shouldShowLifestyleControls(infant, daysAfterMonths(12)), false);
  assert.equal(shouldShowBmiDisplay(infant, daysAfterMonths(12)), false);
  assert.equal(shouldShowLifestyleControls(infant, daysAfterMonths(13)), true);
  assert.equal(shouldShowBmiDisplay(infant, daysAfterMonths(13)), true);
});

test("infant overview keeps pulse and temperature, hides empty BP and SpO2, and keeps recorded readings", () => {
  const keys = ["bp", "pulse", "temperature", "spo2"];
  assert.deepEqual(
    visibleOverviewVitalKeys(keys, { pulse: { display: "120" }, temperature: { display: "36.8" } }, { infant: true }),
    ["pulse", "temperature"],
  );
  assert.deepEqual(
    visibleOverviewVitalKeys(
      keys,
      { bp: { display: "90/60" }, pulse: { display: "120" }, temperature: { display: "36.8" }, spo2: { display: "98" } },
      { infant: true },
    ),
    ["bp", "pulse", "temperature", "spo2"],
  );
  assert.deepEqual(
    visibleOverviewVitalKeys(keys, {}, { infant: false }),
    keys,
  );
});

test("infant consultation programs hide Maternal and Family Planning and keep EPI", () => {
  assert.deepEqual(INFANT_HIDDEN_PROGRAMS, ["Maternal", "Family Planning"]);
  const programs = ["Maternal", "Family Planning", "EPI"];
  assert.deepEqual(visibleConsultationPrograms(programs, { birthdate: DOB }, daysAfterMonths(4)), ["EPI"]);
  assert.deepEqual(visibleConsultationPrograms(programs, { birthdate: DOB }, daysAfterMonths(13)), programs);
});

test("a historical infant visit still hides BMI after the patient is older", () => {
  const patient = { birthdate: DOB };
  assert.equal(shouldShowBmiDisplay(patient, daysAfterMonths(4)), false);
  assert.equal(shouldShowBmiDisplay(patient, daysAfterMonths(60)), true);
});
