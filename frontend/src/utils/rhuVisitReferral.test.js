import assert from "node:assert/strict";
import test from "node:test";
import { additionalConcernPayload, isReferredRhuVisit } from "./rhuVisitReferral.js";
import { getErrorOwnerStepKey, INTERVIEW_STEP, remapServerErrorKeys } from "./consultationSteps.js";

test("additional concern validation errors belong to their inline Interview fields", () => {
  const errors = remapServerErrorKeys({
    "monitoring_data.additionalConcern.chiefComplaint": "Too long",
    "monitoring_data.additionalConcern.historyOfPresentIllness": "Too long",
  });
  assert.equal(errors.additionalChiefComplaint, "Too long");
  assert.equal(errors.additionalHistoryOfPresentIllness, "Too long");
  assert.equal(getErrorOwnerStepKey("additionalChiefComplaint"), INTERVIEW_STEP);
  assert.equal(getErrorOwnerStepKey("additionalHistoryOfPresentIllness"), INTERVIEW_STEP);
});

test("referred visit is identified by referral id even when source is walk_in", () => {
  assert.equal(isReferredRhuVisit({ source: "walk_in", referral: { id: 9 } }), true);
  assert.equal(isReferredRhuVisit({ source: "referral", referral: { id: 9 } }), true);
  assert.equal(isReferredRhuVisit({ source: "walk_in" }), false);
  assert.equal(isReferredRhuVisit(null), false);
});

test("additional concern is omitted when hidden or blank", () => {
  assert.equal(additionalConcernPayload({ show: false, chiefComplaint: "x", historyOfPresentIllness: "y" }), undefined);
  assert.equal(additionalConcernPayload({ show: true, chiefComplaint: " ", historyOfPresentIllness: "" }), undefined);
  assert.deepEqual(
    additionalConcernPayload({ show: true, chiefComplaint: "Fever", historyOfPresentIllness: "Since dawn" }),
    { chiefComplaint: "Fever", historyOfPresentIllness: "Since dawn" },
  );
});
