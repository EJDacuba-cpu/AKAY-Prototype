import assert from "node:assert/strict";
import test from "node:test";

import {
  followUpLinkedEntryId,
  getFollowUpConditionLabel,
  getFollowUpReasonDisplay,
  getFollowUpReasonText,
} from "./followUpListDisplay.js";

test("linked entry id comes from purpose_key entry: or source_entry_id", () => {
  assert.equal(followUpLinkedEntryId({ purpose_key: "entry:d1" }), "d1");
  assert.equal(followUpLinkedEntryId({ source_entry_id: "d2" }), "d2");
  assert.equal(followUpLinkedEntryId({ purpose_key: "visit" }), "");
});

test("condition label uses the linked diagnosis and never invents one from purpose text", () => {
  const task = {
    purpose: "Hypertension review",
    purpose_key: "entry:d1",
    healthRecord: {
      diagnoses: [
        { id: "d1", name: "Hypertension" },
        { id: "d2", name: "Diabetes Mellitus" },
      ],
    },
  };
  assert.equal(getFollowUpConditionLabel(task), "Hypertension");
  assert.equal(getFollowUpConditionLabel({ purpose: "Hypertension review", purpose_key: "visit" }), "");
  assert.equal(getFollowUpConditionLabel({ purpose_key: "entry:missing", healthRecord: { diagnoses: [] } }), "");
});

test("reason display keeps saved purpose and avoids duplicating the condition name", () => {
  assert.equal(getFollowUpReasonText({ purpose: "Continue BP check" }), "Continue BP check");
  assert.deepEqual(
    getFollowUpReasonDisplay({
      purpose: "Continue BP check",
      purpose_key: "entry:d1",
      healthRecord: { diagnoses: [{ id: "d1", name: "Hypertension" }] },
    }),
    { condition: "Hypertension", purpose: "Continue BP check" },
  );
  assert.deepEqual(
    getFollowUpReasonDisplay({
      purpose: "Hypertension",
      purpose_key: "entry:d1",
      healthRecord: { diagnoses: [{ id: "d1", name: "Hypertension" }] },
    }),
    { condition: "Hypertension", purpose: "" },
  );
  assert.deepEqual(
    getFollowUpReasonDisplay({ purpose: "General return", purpose_key: "visit" }),
    { condition: "", purpose: "General return" },
  );
});
