import test from "node:test";
import assert from "node:assert/strict";
import { summarizeBackground } from "./backgroundSummary.js";

test("summarizes each background section as one labelled line", () => {
  const rows = summarizeBackground({
    allergies: { noneKnown: false, items: [{ allergen: "Penicillin" }] },
    hospitalizations: {
      items: [
        { type: "Hospitalization", year: 2021, reason: "Dengue" },
        { type: "Surgery", year: 2018, reason: "Appendectomy" },
      ],
    },
    familyHistory: { items: [{ condition: "Hypertension", kind: "Chronic", relation: "Mother" }] },
    personalSocial: {
      smoking: { status: "current", sticksPerDay: 10, years: 20 },
      alcohol: { status: "current", frequency: "occasional" },
      diet: { highSalt: true, notes: "Mixed" },
    },
  });

  assert.deepEqual(rows, [
    {
      key: "medical",
      label: "Past medical",
      text: "Hospitalizations & surgeries: Hospitalization 2021: Dengue; Surgery 2018: Appendectomy",
    },
    { key: "family", label: "Family", text: "Conditions: Hypertension (Chronic, Mother)" },
    {
      key: "social",
      label: "Social",
      text: "Smoking: Current smoker · 10 sticks/day · 20 yrs · 10 pack-yrs · Alcohol: Current drinker · occasional · Diet: High salt · Mixed",
    },
  ]);
});

test("a recorded answer of none reads as one", () => {
  const rows = summarizeBackground({
    hospitalizations: { none: true },
    familyHistory: { noneKnown: true },
  });
  assert.equal(rows[0].text, "Hospitalizations & surgeries: None");
  assert.equal(rows[1].text, "Conditions: None known");
});

test("allergies are not repeated in the summary", () => {
  const [medical] = summarizeBackground({ allergies: { items: [{ allergen: "Penicillin" }] } });
  assert.equal(medical.text, "");
});

test("old string-shaped values read as nothing recorded instead of throwing", () => {
  const rows = summarizeBackground({
    hospitalizations: "Dengue (2021)",
    familyHistory: { similarIllness: "x" },
    personalSocial: { smoking: "Never", diet: "Mixed" },
  });
  assert.ok(rows.every((row) => row.text === ""));
});

test("missing or empty background gives empty lines for all three sections", () => {
  for (const background of [undefined, null, {}, { familyHistory: null, personalSocial: null }]) {
    const rows = summarizeBackground(background);
    assert.deepEqual(rows.map((row) => row.key), ["medical", "family", "social"]);
    assert.ok(rows.every((row) => row.text === ""));
  }
});
