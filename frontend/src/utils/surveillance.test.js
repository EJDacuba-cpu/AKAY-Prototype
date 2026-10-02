import test from "node:test";
import assert from "node:assert/strict";
import {
  getSurveillanceDiagnoses,
  getSurveillanceReportEntries,
  getSurveillanceTags,
  hasSurveillanceTag,
} from "./surveillance.js";

test("surveillanceTags is used directly when present", () => {
  assert.deepEqual(getSurveillanceTags({ monitoring_data: { surveillanceTags: ["hfmd"] } }), ["hfmd"]);
  assert.deepEqual(getSurveillanceTags({}, { surveillanceTags: [] }), []);
});

test("a legacy hfmdSurveillance-only record reads as [hfmd]", () => {
  assert.deepEqual(getSurveillanceTags({ monitoring_data: { hfmdSurveillance: true } }), ["hfmd"]);
  assert.deepEqual(getSurveillanceTags({ hfmdSurveillance: true }), ["hfmd"]);
});

test("a legacy surveillanceCategory-only record reads as [hfmd]", () => {
  assert.deepEqual(getSurveillanceTags({ monitoring_data: { surveillanceCategory: "hfmd" } }), ["hfmd"]);
});

test("no legacy signal and no tags reads as an empty list", () => {
  assert.deepEqual(getSurveillanceTags({}), []);
  assert.deepEqual(getSurveillanceTags({ monitoring_data: { hfmdSurveillance: false } }), []);
});

test("hasSurveillanceTag checks membership safely", () => {
  assert.equal(hasSurveillanceTag(["hfmd"], "hfmd"), true);
  assert.equal(hasSurveillanceTag(["hfmd"], "dengue"), false);
  assert.equal(hasSurveillanceTag(undefined, "hfmd"), false);
  assert.equal(hasSurveillanceTag(null, "hfmd"), false);
});

test("surveillance diagnoses come from the per-diagnosis flag, with legacy HFMD kept", () => {
  assert.deepEqual(
    getSurveillanceDiagnoses({ diagnoses: [{ name: "HFMD", includeInSurveillance: true }, { name: "Cough" }] }),
    [{ name: "HFMD" }],
  );
  assert.deepEqual(
    getSurveillanceDiagnoses({ monitoring_data: { hfmdSurveillance: true } }),
    [{ name: "Hand, Foot and Mouth Disease" }],
  );
  assert.deepEqual(getSurveillanceDiagnoses({ diagnoses: [{ name: "Cough" }] }), []);
});

test("surveillance diagnoses: every flagged diagnosis is listed, blank names and non-true flags are skipped", () => {
  assert.deepEqual(
    getSurveillanceDiagnoses({
      diagnoses: [
        { name: " Dengue ", includeInSurveillance: true },
        { name: "Measles", includeInSurveillance: true },
        { name: "  ", includeInSurveillance: true },
        { name: "Cough", includeInSurveillance: "true" },
      ],
    }),
    [{ name: "Dengue" }, { name: "Measles" }],
  );
  assert.deepEqual(getSurveillanceDiagnoses(), []);
  assert.deepEqual(getSurveillanceDiagnoses({ diagnoses: null }), []);
});

test("a legacy surveillanceTags record still reads as one HFMD row", () => {
  assert.deepEqual(
    getSurveillanceDiagnoses({ monitoring_data: { surveillanceTags: ["hfmd"] } }),
    [{ name: "Hand, Foot and Mouth Disease" }],
  );
});

test("the Surveillance Report has one entry per included diagnosis, grouped by name and filtered by diagnosis text", () => {
  const flagged = { id: 1, diagnoses: [{ name: "Measles", includeInSurveillance: true }, { name: "Dengue", includeInSurveillance: true }, { name: "Cough" }] };
  const legacy = { id: 2, monitoring_data: { hfmdSurveillance: true } };
  const none = { id: 3, diagnoses: [{ name: "Cough" }] };
  const second = { id: 4, diagnoses: [{ name: "measles", includeInSurveillance: true }] };

  assert.deepEqual(
    getSurveillanceReportEntries([flagged, legacy, none, second]).map(({ record, diagnosis }) => [record.id, diagnosis]),
    [[1, "Dengue"], [2, "Hand, Foot and Mouth Disease"], [1, "Measles"], [4, "measles"]],
  );
  assert.deepEqual(
    getSurveillanceReportEntries([flagged, legacy, none], "  mouth ").map(({ record, diagnosis }) => [record.id, diagnosis]),
    [[2, "Hand, Foot and Mouth Disease"]],
  );
  assert.deepEqual(getSurveillanceReportEntries([flagged], "DENG").map(({ diagnosis }) => diagnosis), ["Dengue"]);
  assert.deepEqual(getSurveillanceReportEntries(null), []);
});
