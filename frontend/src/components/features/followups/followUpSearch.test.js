import assert from "node:assert/strict";
import { test } from "node:test";
import { followUpSearchHaystack, matchesFollowUpSearch } from "./followUpSearch.js";

const task = {
  id: 44,
  patientName: "Ana Cruz",
  patientId: 12,
  healthRecordId: 99,
  contact: "09171234567",
  healthRecord: { chiefComplaint: "Cough follow-up" },
  programLabel: "Maternal / Prenatal",
};

test("search haystack includes patient name and record references", () => {
  const haystack = followUpSearchHaystack(task);
  assert.match(haystack, /ana cruz/);
  assert.match(haystack, /fu-44/);
  assert.match(haystack, /record #99/);
  assert.match(haystack, /cough follow-up/);
});

test("matchesFollowUpSearch finds patient and record refs", () => {
  assert.equal(matchesFollowUpSearch(task, "Ana"), true);
  assert.equal(matchesFollowUpSearch(task, "FU-44"), true);
  assert.equal(matchesFollowUpSearch(task, "Record #99"), true);
  assert.equal(matchesFollowUpSearch(task, "nobody"), false);
  assert.equal(matchesFollowUpSearch(task, ""), true);
});
