import test from "node:test";
import assert from "node:assert/strict";
import { groupCurrentDiseases } from "./currentConditions.js";

const registry = {
  monitored_conditions: {
    hypertension: { name: "Hypertension", aliases: ["HTN"], pathway: "ncd" },
    tuberculosis: { name: "Tuberculosis", aliases: ["TB", "PTB"], pathway: "tb_dots" },
  },
  care_pathways: {
    ncd: { label: "NCD Monitoring" },
    tb_dots: { label: "TB-DOTS" },
  },
};

test("a keyed disease matching the registry is filed under Monitored Conditions", () => {
  const { monitored, other } = groupCurrentDiseases(
    [{ name: "Hypertension", conditionKey: "hypertension", status: "Active" }],
    registry,
  );
  assert.equal(monitored.length, 1);
  assert.equal(other.length, 0);
  assert.equal(monitored[0].pathwayKey, "ncd");
  assert.equal(monitored[0].pathwayLabel, "NCD Monitoring");
});

test("a free-text disease with no conditionKey is filed under Other Conditions", () => {
  const { monitored, other } = groupCurrentDiseases(
    [{ name: "Asthma", status: "Controlled" }],
    registry,
  );
  assert.equal(monitored.length, 0);
  assert.equal(other.length, 1);
  assert.equal(other[0].name, "Asthma");
});

test("a legacy entry with an unrecognized conditionKey falls back to Other Conditions", () => {
  const { monitored, other } = groupCurrentDiseases(
    [{ name: "Something Removed", conditionKey: "retired_key" }],
    registry,
  );
  assert.equal(monitored.length, 0);
  assert.equal(other.length, 1);
});

test("enrollment status defaults to Not started when no resolver is given", () => {
  const { monitored } = groupCurrentDiseases(
    [{ name: "Tuberculosis", conditionKey: "tuberculosis" }],
    registry,
  );
  assert.equal(monitored[0].enrollmentStatus, "Not started");
});

test("a supplied enrollment resolver is used instead of the default", () => {
  const { monitored } = groupCurrentDiseases(
    [{ name: "Tuberculosis", conditionKey: "tuberculosis" }],
    registry,
    (pathwayKey) => (pathwayKey === "tb_dots" ? "Active" : "Not started"),
  );
  assert.equal(monitored[0].enrollmentStatus, "Active");
});

test("original array position is preserved for update/remove callers", () => {
  const { monitored, other } = groupCurrentDiseases(
    [
      { name: "Asthma" },
      { name: "Hypertension", conditionKey: "hypertension" },
      { name: "Eczema" },
    ],
    registry,
  );
  assert.equal(monitored[0].index, 1);
  assert.deepEqual(other.map((d) => d.index), [0, 2]);
});

test("a non-array input produces two empty groups", () => {
  const { monitored, other } = groupCurrentDiseases(undefined, registry);
  assert.deepEqual(monitored, []);
  assert.deepEqual(other, []);
});
