import test from "node:test";
import assert from "node:assert/strict";
import { MONITORING_DETAILS, monitoringDetailKeys } from "./monitoringDetails.js";

const registry = {
  monitored_conditions: {
    tuberculosis: { name: "Tuberculosis", monitoring_details: "tb_dots" },
    hypertension: { name: "Hypertension" },
    future_condition: { name: "Future", monitoring_details: "future_form" },
  },
};

test("only conditions declaring a known key need Monitoring Details, once each", () => {
  assert.deepEqual(monitoringDetailKeys(["tuberculosis", "tuberculosis", "hypertension", null], registry), ["tb_dots"]);
  assert.deepEqual(monitoringDetailKeys(["hypertension", null], registry), []);
});

test("a second declared key renders through the same map once it is registered", () => {
  assert.deepEqual(monitoringDetailKeys(["future_condition"], registry), []);
  MONITORING_DETAILS.future_form = { label: "Future", description: "x" };
  try {
    assert.deepEqual(monitoringDetailKeys(["future_condition", "tuberculosis"], registry), ["future_form", "tb_dots"]);
  } finally {
    delete MONITORING_DETAILS.future_form;
  }
});
