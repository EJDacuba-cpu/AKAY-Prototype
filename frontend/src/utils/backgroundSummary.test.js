import test from "node:test";
import assert from "node:assert/strict";
import { summarizeBackground } from "./backgroundSummary.js";

test("summarizes each background section as one labelled line", () => {
  const rows = summarizeBackground({
    allergies: "Penicillin",
    hospitalizations: "Dengue (2021)",
    surgeries: " Appendectomy ",
    familyHistory: { similarIllness: "", chronicIllness: "Hypertension (mother)", hereditaryIllness: "Diabetes" },
    personalSocial: { diet: "Mixed", smoking: "Non-smoker", alcohol: "Occasional", notes: "Farmer" },
  });

  assert.deepEqual(rows, [
    { key: "medical", label: "Past medical", text: "Hospitalizations: Dengue (2021) · Surgeries: Appendectomy" },
    { key: "family", label: "Family", text: "Chronic: Hypertension (mother) · Hereditary: Diabetes" },
    { key: "social", label: "Social", text: "Smoking: Non-smoker · Alcohol: Occasional · Diet: Mixed" },
  ]);
});

test("allergies are not repeated in the summary", () => {
  const [medical] = summarizeBackground({ allergies: "Penicillin" });
  assert.equal(medical.text, "");
});

test("missing or empty background gives empty lines for all three sections", () => {
  for (const background of [undefined, null, {}, { familyHistory: null, personalSocial: null }]) {
    const rows = summarizeBackground(background);
    assert.deepEqual(rows.map((row) => row.key), ["medical", "family", "social"]);
    assert.ok(rows.every((row) => row.text === ""));
  }
});
