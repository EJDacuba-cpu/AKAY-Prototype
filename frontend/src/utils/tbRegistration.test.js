import assert from "node:assert/strict";
import test from "node:test";
import {
  tbRegistrationAttempt,
  withTbRegimenRows,
  adultFdcDailyTablets,
  canShowAdultFdcReference,
  resolveRegimenCode,
  regimenDescriptionForCode,
  isInvalidRegimenDescription,
  formatExtrapulmonarySite,
  parseExtrapulmonarySite,
  TB_REGIMEN_CODES,
} from "./tbRegistration.js";

test("editing regimen rows retains the manual regimen and baseline weight", () => {
  const regimen = withTbRegimenRows(
    { description: "Physician-entered regimen", weightKg: "55", rows: [{ dateStart: "2026-11-10", drug4fdc: "4" }] },
    [{ dateStart: "2026-11-10", drug4fdc: "3" }],
  );
  assert.equal(regimen.weightKg, "55");
  assert.equal(regimen.description, "Physician-entered regimen");
  assert.equal(regimen.rows[0].drug4fdc, "3");
});

test("idempotent attempts retain their key and frozen payload while edits start another attempt", () => {
  const data = { card_data: { regimen: { description: "Physician-entered regimen" } } };
  const first = tbRegistrationAttempt(null, 12, data, () => "first-key");
  assert.equal(tbRegistrationAttempt(first, 12, { ...data }, () => "unused"), first);
  data.card_data.regimen.description = "Changed";
  assert.equal(first.payload.card_data.regimen.description, "Physician-entered regimen");
  const next = tbRegistrationAttempt(first, 12, data, () => "next-key");
  assert.equal(next.key, "next-key");
  assert.equal(next.payload.card_data.regimen.description, "Changed");
  assert.equal(tbRegistrationAttempt(first, 13, { ok: true }, () => "other-source").key, "other-source");
});

test("pulmonary does not require EPTB site; extrapulmonary Other needs description", () => {
  assert.equal(parseExtrapulmonarySite("").code, "");
  assert.equal(formatExtrapulmonarySite("other", "Pericardial"), "Other: Pericardial");
  assert.equal(parseExtrapulmonarySite("Other: Pericardial").code, "other");
  assert.equal(parseExtrapulmonarySite("Lymph node").code, "lymph_node");
  assert.equal(parseExtrapulmonarySite("Legacy free text").code, "legacy");
});

test("structured regimen code persists; none and blank descriptions are rejected", () => {
  assert.equal(isInvalidRegimenDescription("none"), true);
  assert.equal(isInvalidRegimenDescription("None"), true);
  assert.equal(isInvalidRegimenDescription(""), true);
  assert.equal(isInvalidRegimenDescription("2HRZE/4HR"), false);
  assert.equal(regimenDescriptionForCode(TB_REGIMEN_CODES.standard_2hrze_4hr), "2HRZE/4HR");
  assert.equal(resolveRegimenCode({ code: "", description: "2HRZE/4HR" }), TB_REGIMEN_CODES.standard_2hrze_4hr);
  assert.equal(resolveRegimenCode({ code: "", description: "Custom legacy text" }), TB_REGIMEN_CODES.other);
  assert.equal(resolveRegimenCode({
    code: TB_REGIMEN_CODES.standard_2hrze_10hr,
    description: "2HRZE/10HR",
  }), TB_REGIMEN_CODES.standard_2hrze_10hr);
});

test("adult FDC reference uses exact NTP bands and pediatric safeguards", () => {
  assert.equal(adultFdcDailyTablets(25), 2);
  assert.equal(adultFdcDailyTablets(37), 2);
  assert.equal(adultFdcDailyTablets(37.5), null);
  assert.equal(adultFdcDailyTablets(38), 3);
  assert.equal(adultFdcDailyTablets(54), 3);
  assert.equal(adultFdcDailyTablets(55), 4);
  assert.equal(adultFdcDailyTablets(70), 4);
  assert.equal(adultFdcDailyTablets(70.1), 5);
  assert.equal(adultFdcDailyTablets(24.9), null);
  assert.equal(canShowAdultFdcReference({ ageYears: 18, weightKg: 55, regimenCode: TB_REGIMEN_CODES.standard_2hrze_4hr }), true);
  assert.equal(canShowAdultFdcReference({ ageYears: 17, weightKg: 55, regimenCode: TB_REGIMEN_CODES.standard_2hrze_4hr }), false);
  assert.equal(canShowAdultFdcReference({ ageYears: null, weightKg: 55, regimenCode: TB_REGIMEN_CODES.standard_2hrze_4hr }), false);
  assert.equal(canShowAdultFdcReference({ ageYears: 30, weightKg: 55, regimenCode: TB_REGIMEN_CODES.other }), false);
});
