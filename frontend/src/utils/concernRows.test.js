import test from "node:test";
import assert from "node:assert/strict";
import { DIAGNOSIS_LIMITS } from "./diagnoses.js";
import {
  addConcernRow,
  concernsFromRows,
  duplicateConcernIds,
  editConcernRow,
  hasCarePlanChoice,
  hasDuplicateConcerns,
  initialConcernRows,
  removeConcernRow,
  syncConcernRows,
} from "./concernRows.js";

test("a consultation with no concerns starts with one blank row", () => {
  const rows = initialConcernRows([]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "");
  assert.deepEqual(concernsFromRows(rows), []);
});

test("saved concerns open as rows, with no extra blank row", () => {
  const saved = [{ id: "a", name: "Cough", carePlan: "recheck", reportAs: null }];
  assert.deepEqual(initialConcernRows(saved), saved);
});

test("blank rows are never emitted and names are emitted trimmed", () => {
  const rows = [
    { id: "a", name: "  Cough  ", reportAs: null },
    { id: "b", name: "   ", reportAs: null },
    { id: "c", name: "", isNew: true },
  ];
  assert.deepEqual(concernsFromRows(rows), [{ id: "a", name: "Cough", reportAs: null }]);
});

test("typing into a new row starts it with the visit's report default, like Add did", () => {
  const [row] = initialConcernRows([]);
  const typed = editConcernRow([row], row.id, "F", "morbidity");
  assert.deepEqual(typed, [{ id: row.id, name: "F", reportAs: "morbidity" }]);
  // Later edits keep the choice already made.
  const renamed = editConcernRow(typed, row.id, "Fever", "notifiable");
  assert.equal(renamed[0].reportAs, "morbidity");
});

test("renaming keeps the id and every Care Plan choice", () => {
  const rows = [{ id: "a", name: "Cough", carePlan: "refer", reportAs: "morbidity", includeInSurveillance: true }];
  const [renamed] = editConcernRow(rows, "a", "Persistent cough");
  assert.deepEqual(renamed, { ...rows[0], name: "Persistent cough" });
});

test("edits are capped at the stored name length", () => {
  const rows = [{ id: "a", name: "", reportAs: null }];
  const [row] = editConcernRow(rows, "a", "x".repeat(DIAGNOSIS_LIMITS.name + 10));
  assert.equal(row.name.length, DIAGNOSIS_LIMITS.name);
});

test("a cleared row keeps its choices while it stays on screen", () => {
  const rows = [{ id: "a", name: "Cough", carePlan: "recheck" }];
  const cleared = editConcernRow(rows, "a", "");
  assert.deepEqual(concernsFromRows(cleared), []);
  const retyped = editConcernRow(cleared, "a", "Cough");
  assert.equal(concernsFromRows(retyped)[0].carePlan, "recheck");
});

test("Add appends a blank row and focuses it", () => {
  const rows = [{ id: "a", name: "Cough" }];
  const { rows: next, focusId } = addConcernRow(rows);
  assert.equal(next.length, 2);
  assert.equal(focusId, next[1].id);
  assert.equal(next[1].name, "");
});

test("Add never makes a second blank row - it focuses the one already there", () => {
  const rows = [{ id: "a", name: "Cough" }, { id: "b", name: "  " }];
  const result = addConcernRow(rows);
  assert.equal(result.rows, rows);
  assert.equal(result.focusId, "b");
});

test("Add does nothing at the concern limit", () => {
  const full = Array.from({ length: DIAGNOSIS_LIMITS.count }, (_, i) => ({ id: `d${i}`, name: `Dx ${i}` }));
  const result = addConcernRow(full);
  assert.equal(result.rows, full);
  assert.equal(result.focusId, null);
});

test("removing a row drops it; numbering follows the remaining order", () => {
  const rows = [{ id: "a", name: "Cough" }, { id: "b", name: "Fever" }, { id: "c", name: "Rash" }];
  assert.deepEqual(removeConcernRow(rows, "b").map((row) => row.id), ["a", "c"]);
});

test("removing the only row clears it instead, dropping its choices", () => {
  const rows = [{ id: "a", name: "Cough", carePlan: "refer", reportAs: "morbidity" }];
  const next = removeConcernRow(rows, "a");
  assert.equal(next.length, 1);
  assert.equal(next[0].id, "a");
  assert.equal(next[0].name, "");
  assert.equal(next[0].carePlan, undefined);
  assert.equal(next[0].reportAs, undefined);
  assert.deepEqual(concernsFromRows(next), []);
});

test("a Care Plan choice is a next action, surveillance, or a changed report type", () => {
  assert.equal(hasCarePlanChoice({ name: "Cough", reportAs: null }, null), false);
  assert.equal(hasCarePlanChoice({ name: "Cough", carePlan: "follow_up" }, null), true);
  // No Further BHC Action is a deliberate choice too.
  assert.equal(hasCarePlanChoice({ name: "Cough", carePlan: "none" }, null), true);
  // A historical value from an old draft is not a choice (carePlanFor).
  assert.equal(hasCarePlanChoice({ name: "Cough", carePlan: "recheck" }, null), false);
  assert.equal(hasCarePlanChoice({ name: "Cough", carePlan: "monitor" }, null), false);
  assert.equal(hasCarePlanChoice({ name: "Cough", includeInSurveillance: true }, null), true);
  assert.equal(hasCarePlanChoice({ name: "Cough", reportAs: "morbidity" }, "morbidity"), false);
  assert.equal(hasCarePlanChoice({ name: "Cough", reportAs: "notifiable" }, "morbidity"), true);
  // A legacy entry without a report choice has nothing to lose.
  assert.equal(hasCarePlanChoice({ name: "Cough" }, "morbidity"), false);
  assert.equal(hasCarePlanChoice({ name: "", isNew: true }, "morbidity"), false);
});

test("a repeated name flags the later rows only, ignoring case and spaces", () => {
  const rows = [
    { id: "a", name: "Cough" },
    { id: "b", name: "Fever" },
    { id: "c", name: "  cough " },
    { id: "d", name: "" },
    { id: "e", name: " " },
  ];
  assert.deepEqual([...duplicateConcernIds(rows)], ["c"]);
  assert.equal(hasDuplicateConcerns(rows), true);
  assert.equal(hasDuplicateConcerns(rows.slice(0, 2)), false);
});

test("an outside change (e.g. a restored draft) replaces unrelated rows", () => {
  const rows = initialConcernRows([]);
  const restored = [{ id: "x", name: "Asthma" }];
  assert.deepEqual(syncConcernRows(rows, restored), restored);
  const emptied = syncConcernRows([{ id: "a", name: "Cough" }], []);
  assert.equal(emptied.length, 1);
  assert.equal(emptied[0].name, "");
});

test("an outside change to known rows keeps blank rows and the text as typed", () => {
  const rows = [
    { id: "a", name: "Cough  ", reportAs: null },
    { id: "b", name: "", isNew: true },
  ];
  const incoming = [{ id: "a", name: "Cough", reportAs: null, carePlan: "recheck" }];
  assert.deepEqual(syncConcernRows(rows, incoming), [
    { id: "a", name: "Cough  ", reportAs: null, carePlan: "recheck" },
    { id: "b", name: "", isNew: true },
  ]);
  // A name changed elsewhere wins over the local text.
  assert.equal(syncConcernRows(rows, [{ id: "a", name: "Dry cough" }])[0].name, "Dry cough");
});
