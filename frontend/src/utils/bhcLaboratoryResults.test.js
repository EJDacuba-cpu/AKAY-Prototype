import assert from "node:assert/strict";
import test from "node:test";

import {
  bhcLaboratoryErrors,
  bhcResultFromLegacyEntry,
  legacyMaternalLaboratoryEntries,
  newBhcLaboratoryResult,
  restoreBhcLaboratoryTests,
} from "./bhcLaboratoryResults.js";

const complete = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  testName: "CBC",
  examinationDate: "2026-11-01",
  resultSource: "Barangay midwife, brought by patient",
  result: "Within normal limits",
  remarks: "",
  resultStatus: "Result Available",
};

test("an empty BHC laboratory list is valid and a finished row keeps a free-text source", () => {
  assert.deepEqual(bhcLaboratoryErrors([]), {});
  assert.deepEqual(bhcLaboratoryErrors([complete], { today: "2026-11-13" }), {});
  const fresh = newBhcLaboratoryResult("2026-11-13");
  assert.equal(fresh.resultStatus, "Result Available");
  assert.equal(fresh.resultSource, "");
  assert.match(fresh.id, /^[0-9a-f-]{36}$/i);
});

test("repeated test names are allowed and incomplete rows are reported, not dropped", () => {
  const errors = bhcLaboratoryErrors([
    complete,
    { ...complete, id: "660e8400-e29b-41d4-a716-446655440001", testName: "CBC", resultSource: "  ", result: "" },
  ], { today: "2026-11-13" });
  assert.equal(errors["laboratoryTests.0.testName"], undefined);
  assert.equal(errors["laboratoryTests.1.resultSource"], "Enter where this result came from.");
  assert.equal(errors["laboratoryTests.1.result"], "Enter the laboratory result.");
});

test("future and impossible dates are rejected", () => {
  const errors = bhcLaboratoryErrors([
    { ...complete, examinationDate: "2026-12-01" },
    { ...complete, id: "770e8400-e29b-41d4-a716-446655440002", examinationDate: "2026-02-31" },
  ], { today: "2026-11-13" });
  assert.equal(errors["laboratoryTests.0.examinationDate"], "Use a real date that is not in the future.");
  assert.equal(errors["laboratoryTests.1.examinationDate"], "Use a real date that is not in the future.");
});

test("draft restore keeps source and remarks and forces Result Available", () => {
  const [row] = restoreBhcLaboratoryTests({
    laboratoryTests: [{ ...complete, resultStatus: "Requested", remarks: "Fasting" }],
  });
  assert.equal(row.resultStatus, "Result Available");
  assert.equal(row.resultSource, complete.resultSource);
  assert.equal(row.remarks, "Fasting");
  assert.deepEqual(restoreBhcLaboratoryTests({}), []);
});

test("old maternal draft rows stay listed until a source is supplied", () => {
  const pending = legacyMaternalLaboratoryEntries({
    laboratoryEntries: [
      { test: "cbc", result: "Normal", datePerformed: "2026-10-02" },
      { test: "", result: "", datePerformed: "" },
    ],
  });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].testName, "CBC");
  const moved = bhcResultFromLegacyEntry(pending[0], { resultSource: "Patient brought the slip" });
  assert.equal(moved.testName, "CBC");
  assert.equal(moved.result, "Normal");
  assert.equal(moved.examinationDate, "2026-10-02");
  assert.equal(moved.resultSource, "Patient brought the slip");
  assert.equal(moved.resultStatus, "Result Available");
});
