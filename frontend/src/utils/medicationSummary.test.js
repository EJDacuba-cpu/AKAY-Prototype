import test from "node:test";
import assert from "node:assert/strict";
import { summarizeMedicines } from "./medicationSummary.js";

const visit = (id, date, dispensedMedicines) => ({ id, dateOfVisit: date, dispensedMedicines });

test("groups dispensed medicines by visit, newest visit first", () => {
  const summary = summarizeMedicines([
    visit("1", "2026-09-19", [{ id: "a", medicineName: "Amoxicillin", quantity: 21, unit: "cap", remarks: "7 days" }]),
    visit("2", "2026-10-03", [
      { id: "b", medicineName: "Paracetamol", quantity: 10, unit: "tab" },
      { id: "c", medicineName: "ORS", quantity: 5, unit: "sachet" },
    ]),
  ]);

  assert.equal(summary.count, 3);
  assert.deepEqual(
    summary.visits.map((v) => [v.recordId, v.date]),
    [["2", "2026-10-03"], ["1", "2026-09-19"]],
  );
  assert.deepEqual(summary.visits[0].items, [
    { id: "b", name: "Paracetamol", amount: "10 tab", remarks: "" },
    { id: "c", name: "ORS", amount: "5 sachet", remarks: "" },
  ]);
  assert.deepEqual(summary.visits[1].items, [
    { id: "a", name: "Amoxicillin", amount: "21 cap", remarks: "7 days" },
  ]);
});

test("skips visits without medicines and rows without a name", () => {
  const summary = summarizeMedicines([
    visit("1", "2026-10-03", []),
    visit("2", "2026-10-02", undefined),
    visit("3", "2026-10-01", [{ id: "x", medicineName: "  ", quantity: 1, unit: "tab" }, { id: "y", medicineName: "ORS", quantity: 2, unit: "" }]),
  ]);

  assert.equal(summary.count, 1);
  assert.deepEqual(summary.visits.map((v) => v.recordId), ["3"]);
  assert.deepEqual(summary.visits[0].items, [{ id: "y", name: "ORS", amount: "2", remarks: "" }]);
});

test("accepts snake_case rows and shows no amount when none was recorded", () => {
  const summary = summarizeMedicines([
    { id: "9", date_of_visit: "2026-08-01", dispensed_medicines: [{ id: "z", medicine_name_snapshot: "Vitamin A" }] },
  ]);

  assert.deepEqual(summary.visits[0].items, [{ id: "z", name: "Vitamin A", amount: "", remarks: "" }]);
});

test("missing or empty records give an empty summary", () => {
  for (const records of [undefined, null, [], [null], [{}]]) {
    assert.deepEqual(summarizeMedicines(records), { count: 0, visits: [] });
  }
});
