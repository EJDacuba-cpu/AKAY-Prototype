import test from "node:test";
import assert from "node:assert/strict";

import { backgroundConditionGroups } from "./backgroundConditions.js";

const registry = {
  monitored_conditions: {
    hypertension: { name: "Hypertension", aliases: ["HTN"] },
    diabetes_mellitus: { name: "Diabetes Mellitus", aliases: ["DM"] },
  },
};
const diseases = [
  { name: "HTN", status: "Active", conditionKey: "hypertension" },
  { name: "Diabetes Mellitus", status: "Controlled", conditionKey: "diabetes_mellitus" },
  { name: "Gastritis", status: "Resolved", conditionKey: null },
];
const htn = { id: 4, conditionName: "Hypertension", conditionKey: "hypertension", startedAt: "2026-10-03" };

test("registry-monitored conditions are Currently Monitored; the rest are Other Conditions", () => {
  const { monitored, other } = backgroundConditionGroups({ diseases, registry });
  assert.deepEqual(monitored.map((c) => [c.name, c.status, c.addressed]), [
    ["HTN", "Active", false],
    ["Diabetes Mellitus", "Controlled", false],
  ]);
  assert.deepEqual(other.map((c) => [c.name, c.status]), [["Gastritis", "Resolved"]]);
});

test("a condition addressed in this visit is flagged, not listed twice", () => {
  const { monitored } = backgroundConditionGroups({ diseases, followed: [htn], registry });
  assert.deepEqual(monitored.map((c) => [c.name, c.addressed]), [["HTN", true], ["Diabetes Mellitus", false]]);
});

test("a followed condition with no documented entry still shows as Currently Monitored", () => {
  const asthma = { id: 7, conditionName: "Asthma", conditionKey: null };
  const { monitored, other } = backgroundConditionGroups({ diseases: [], followed: [asthma], registry });
  assert.deepEqual(monitored.map((c) => [c.name, c.status, c.addressed]), [["Asthma", "", true]]);
  assert.deepEqual(other, []);
});

test("an active free-text monitoring moves its documented entry out of Other Conditions", () => {
  const gastritis = { id: 9, conditionName: "Gastritis", conditionKey: null };
  const { monitored, other } = backgroundConditionGroups({ diseases, monitorings: [gastritis], registry });
  assert.deepEqual(monitored.map((c) => [c.name, c.addressed]), [["HTN", false], ["Diabetes Mellitus", false], ["Gastritis", false]]);
  assert.deepEqual(other, []);
});

test("nothing monitored and nothing followed leaves Currently Monitored empty", () => {
  assert.deepEqual(backgroundConditionGroups({ diseases: [diseases[2]], registry }).monitored, []);
  assert.deepEqual(backgroundConditionGroups({ registry }), { monitored: [], other: [] });
});

test("a followed condition is also an active monitoring: listed once", () => {
  const { monitored } = backgroundConditionGroups({ diseases, monitorings: [htn], followed: [htn], registry });
  assert.equal(monitored.filter((c) => c.name === "HTN").length, 1);
  assert.equal(monitored.length, 2);
});
