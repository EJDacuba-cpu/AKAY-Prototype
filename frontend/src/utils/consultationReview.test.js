import assert from "node:assert/strict";
import test from "node:test";

import { compactReviewRows, compactReviewSections } from "./consultationReview.js";

test("review rows with no value are omitted", () => {
  assert.deepEqual(
    compactReviewRows([
      { label: "Chief Complaint", value: "Cough" },
      { label: "History of Present Illness", value: "" },
      { label: "Measurements", value: "   " },
      { label: "Notes", value: undefined },
      { label: "Weight", value: null },
      { label: "Count", value: 0 },
    ]),
    [
      { label: "Chief Complaint", value: "Cough" },
      { label: "Count", value: 0 },
    ],
  );
  assert.deepEqual(compactReviewRows(), []);
});

test("a section left with no rows is dropped and the rest keep their keys and Edit step", () => {
  const sections = compactReviewSections([
    { key: "a", title: "A", stepKey: "a", rows: [{ label: "X", value: "" }] },
    { key: "b", title: "B", stepKey: "b2", rows: [{ label: "Y", value: "1" }, { label: "Z", value: "" }] },
  ]);
  assert.deepEqual(sections, [{ key: "b", title: "B", stepKey: "b2", rows: [{ label: "Y", value: "1" }] }]);
});
