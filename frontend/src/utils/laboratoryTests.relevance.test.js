import test from "node:test";
import assert from "node:assert/strict";

import {
  laboratoryClinicalDate,
  sortLaboratoryOptionsByRelevance,
} from "./laboratoryTests.js";

test("clinical date prefers examination over collection over createdAt", () => {
  assert.equal(laboratoryClinicalDate({
    examinationDate: "2026-11-10",
    collectionDate: "2026-11-01",
    createdAt: "2026-10-01T00:00:00Z",
  }), "2026-11-10");
  assert.equal(laboratoryClinicalDate({
    collectionDate: "2026-11-01",
    createdAt: "2026-12-01T00:00:00Z",
  }), "2026-11-01");
});

test("supporting laboratory options sort newest clinical date first", () => {
  const ordered = sortLaboratoryOptionsByRelevance([
    { reference: "record:1", testName: "Old", examinationDate: "2026-09-01", resultStatus: "Result Available" },
    { reference: "current:a", testName: "Current older", collectionDate: "2026-10-01", resultStatus: "Requested" },
    { reference: "record:2", testName: "Newest", examinationDate: "2026-11-05", resultStatus: "Awaiting Result" },
    { reference: "record:3", testName: "No date", resultStatus: "Requested" },
  ]);
  assert.deepEqual(ordered.map((entry) => entry.testName), [
    "Newest",
    "Current older",
    "Old",
    "No date",
  ]);
});

test("same clinical date prefers current-visit tests over previous visits", () => {
  const ordered = sortLaboratoryOptionsByRelevance([
    { reference: "record:9", testName: "Previous", examinationDate: "2026-11-05" },
    { reference: "current:x", testName: "This visit", examinationDate: "2026-11-05" },
  ]);
  assert.equal(ordered[0].testName, "This visit");
});
