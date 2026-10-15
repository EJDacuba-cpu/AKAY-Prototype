import assert from "node:assert/strict";
import test from "node:test";

import { compactReviewRows, compactReviewSections, patientReviewRow } from "./consultationReview.js";

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

test("the Patient identity row is always present and stays first in the Patient Interview group", () => {
  const patient = patientReviewRow({ name: "Maria Santos", id: 42 });
  assert.deepEqual(patient, { label: "Patient", value: "Maria Santos · #42" });
  const [interview] = compactReviewSections([
    {
      key: "interview",
      title: "Patient Interview",
      stepKey: "interview",
      rows: [patient, { label: "Chief Complaint", value: "Cough" }, { label: "History of Present Illness", value: "" }],
    },
  ]);
  assert.deepEqual(interview.rows.map((row) => row.label), ["Patient", "Chief Complaint"]);
  // Even with nothing else filled in, the group (and the identity) survives.
  assert.equal(compactReviewSections([{ key: "i", title: "I", rows: [patientReviewRow({ name: "A", id: 1 })] }]).length, 1);
});

test("a section with its own content survives without rows", () => {
  const [history] = compactReviewSections([
    { key: "history", title: "Patient History", stepKey: "history", rows: [{ label: "Informant", value: "" }], content: "block" },
  ]);
  assert.deepEqual(history, { key: "history", title: "Patient History", stepKey: "history", rows: [], content: "block" });
});
