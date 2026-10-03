import test from "node:test";
import assert from "node:assert/strict";

import {
  documentedConditionFor,
  followUpSummaryRows,
  isFollowedThisVisit,
} from "./followUpThisVisit.js";

const registry = { monitored_conditions: { hypertension: { name: "Hypertension", aliases: ["HTN"] } } };
const htn = { id: 4, conditionName: "Hypertension", conditionKey: "hypertension", startedAt: "2026-10-03" };
const diseases = [
  { name: "HTN", status: "Active", conditionKey: "hypertension" },
  { name: "Asthma", status: "Controlled", conditionKey: null },
];

test("a followed monitoring finds its documented condition by key, then by name or alias", () => {
  assert.equal(documentedConditionFor(htn, diseases, registry).status, "Active");
  // A follow-up's condition arrives without a key: identity falls back to the name/alias.
  assert.equal(documentedConditionFor({ id: 4, conditionName: "Hypertension", conditionKey: null }, diseases, registry).name, "HTN");
  assert.equal(documentedConditionFor({ id: 9, conditionName: "Tuberculosis", conditionKey: null }, diseases, registry), null);
  assert.equal(documentedConditionFor(htn, [], registry), null);
});

test("only the followed condition is reference-only in Patient Background", () => {
  assert.equal(isFollowedThisVisit(diseases[0], [htn], registry), true);
  assert.equal(isFollowedThisVisit(diseases[1], [htn], registry), false);
  assert.equal(isFollowedThisVisit(diseases[0], [], registry), false);
});

test("the summary lists each followed condition with its monitoring start", () => {
  assert.deepEqual(followUpSummaryRows([htn, { id: 5, conditionName: "Asthma", conditionKey: null, startedAt: "" }]), [
    { id: 4, name: "Hypertension", startedAt: "2026-10-03" },
    { id: 5, name: "Asthma", startedAt: "" },
  ]);
  assert.deepEqual(followUpSummaryRows([]), []);
});
