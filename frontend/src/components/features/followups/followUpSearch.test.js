import assert from "node:assert/strict";
import { test } from "node:test";
import { followUpSearchHaystack, matchesFollowUpSearch } from "./followUpSearch.js";

const task = {
  id: 44,
  patientName: "Ana Cruz",
  patientId: 12,
  healthRecordId: 99,
  contact: "09171234567",
  purpose: "Continue BP check",
  purpose_key: "entry:d1",
  healthRecord: {
    chiefComplaint: "Cough follow-up",
    diagnoses: [{ id: "d1", name: "Hypertension" }],
  },
  programLabel: "Maternal / Prenatal",
};

test("search haystack includes patient name, reason, condition and record references", () => {
  const haystack = followUpSearchHaystack(task);
  assert.match(haystack, /ana cruz/);
  assert.match(haystack, /fu-44/);
  assert.match(haystack, /record #99/);
  assert.match(haystack, /cough follow-up/);
  assert.match(haystack, /continue bp check/);
  assert.match(haystack, /hypertension/);
});

test("matchesFollowUpSearch finds patient and record refs", () => {
  assert.equal(matchesFollowUpSearch(task, "Ana"), true);
  assert.equal(matchesFollowUpSearch(task, "FU-44"), true);
  assert.equal(matchesFollowUpSearch(task, "Record #99"), true);
  assert.equal(matchesFollowUpSearch(task, "Hypertension"), true);
  assert.equal(matchesFollowUpSearch(task, "nobody"), false);
  assert.equal(matchesFollowUpSearch(task, ""), true);
});
