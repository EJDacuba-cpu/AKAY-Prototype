import test from "node:test";
import assert from "node:assert/strict";

import {
  filterPatientLaboratoryTests,
  sortPatientLaboratoryTests,
} from "./laboratoryTests.js";

test("patient laboratory tests sort newest clinical date first with deterministic ties", () => {
  const ordered = sortPatientLaboratoryTests([
    { recordId: 1, testName: "Old", examinationDate: "2026-09-01", resultStatus: "Result Available" },
    { recordId: 3, testName: "Newest", examinationDate: "2026-11-10", resultStatus: "Awaiting Result" },
    { recordId: 2, testName: "Same day lower id", examinationDate: "2026-11-05", visitDate: "2026-11-05", resultStatus: "Requested" },
    { recordId: 4, testName: "Same day higher id", examinationDate: "2026-11-05", visitDate: "2026-11-05", resultStatus: "Requested" },
    { recordId: 5, testName: "No date", resultStatus: "Requested" },
  ]);
  assert.deepEqual(ordered.map((entry) => entry.testName), [
    "Newest",
    "Same day higher id",
    "Same day lower id",
    "Old",
    "No date",
  ]);
});

test("patient laboratory filters by status and test name without inventing data", () => {
  const rows = [
    { recordId: 1, testName: "GeneXpert", resultStatus: "Result Available", result: "MTB detected" },
    { recordId: 2, testName: "Sputum smear", resultStatus: "Requested" },
    { recordId: 3, testName: "CBC", resultStatus: "Awaiting Result" },
  ];
  assert.equal(filterPatientLaboratoryTests(rows, { status: "Requested" }).length, 1);
  assert.equal(filterPatientLaboratoryTests(rows, { search: "xpert" })[0].testName, "GeneXpert");
  assert.equal(filterPatientLaboratoryTests(rows, { status: "All", search: "missing" }).length, 0);
});
