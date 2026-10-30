import test from "node:test";
import assert from "node:assert/strict";

import { diagnosisCarePlanHeading, diagnosisCarePlanItems, formatFbs } from "./recordCarePlan.js";

test("FBS reads back with its unit, only when recorded", () => {
  assert.equal(formatFbs(126), "126 mg/dL");
  assert.equal(formatFbs("98.5"), "98.5 mg/dL");
  assert.equal(formatFbs(0), "0 mg/dL");
  assert.equal(formatFbs(null), "");
  assert.equal(formatFbs(undefined), "");
  assert.equal(formatFbs("  "), "");
});

test("a saved record's care plan lists each concern's stored action, flagged referrals included", () => {
  const items = diagnosisCarePlanItems([
    { id: "d0", name: "Elevated BP", carePlan: "recheck" },
    { id: "d8", name: "Wound", carePlan: "follow_up" },
    { id: "d1", name: "Hypertension", carePlan: "monitor" },
    { id: "d2", name: "Pneumonia", carePlan: "refer", includeInSurveillance: true },
    { id: "d3", name: "Diabetes Mellitus", carePlan: "monitor_refer" },
    { id: "d4", name: "Cough", carePlan: "none" },
    { id: "d5", name: "Dengue", carePlan: "none", includeInSurveillance: true },
    { id: "d6", name: "Headache" },
    { id: "d7", name: "  ", carePlan: "monitor" },
  ]);
  assert.deepEqual(items, [
    { key: "d0", name: "Elevated BP", plan: "Recheck", inSurveillance: false },
    { key: "d8", name: "Wound", plan: "Schedule BHC Follow-up", inSurveillance: false },
    { key: "d1", name: "Hypertension", plan: "Monitor at BHC", inSurveillance: false },
    { key: "d2", name: "Pneumonia", plan: "Refer to RHU", inSurveillance: true },
    { key: "d3", name: "Diabetes Mellitus", plan: "Monitor at BHC + Refer to RHU", inSurveillance: false },
    { key: "d4", name: "Cough", plan: "No Further BHC Action", inSurveillance: false },
    { key: "d5", name: "Dengue", plan: "No Further BHC Action", inSurveillance: true },
  ]);
  assert.deepEqual(diagnosisCarePlanItems(null), []);
  assert.deepEqual(diagnosisCarePlanItems([{ name: "Asthma", carePlan: "watch" }]), []);
});

test("the care plan heading is Health Concerns unless the record holds Monitor or Monitor + Refer", () => {
  assert.equal(diagnosisCarePlanHeading([{ name: "Wound", carePlan: "follow_up" }]), "Health Concerns");
  assert.equal(diagnosisCarePlanHeading([{ name: "Cough", carePlan: "refer" }, { name: "Rash" }]), "Health Concerns");
  assert.equal(diagnosisCarePlanHeading([{ name: "Hypertension", carePlan: "monitor" }]), "Care Plan");
  // none is a current action (No Further BHC Action), not a sign of an old record.
  assert.equal(diagnosisCarePlanHeading([{ name: "Cough", carePlan: "none" }]), "Health Concerns");
  assert.equal(diagnosisCarePlanHeading([{ name: "Cough", carePlan: "none" }, { name: "Wound", carePlan: "recheck" }]), "Health Concerns");
  assert.equal(diagnosisCarePlanHeading([{ name: "Cough", carePlan: "none" }, { name: "HTN", carePlan: "monitor_refer" }]), "Care Plan");
  assert.equal(diagnosisCarePlanHeading(undefined), "Health Concerns");
});

test("a historical recheck and a stored none read back with their own labels", () => {
  assert.deepEqual(diagnosisCarePlanItems([{ id: "r", name: "Fever", carePlan: "recheck" }]), [
    { key: "r", name: "Fever", plan: "Recheck", inSurveillance: false },
  ]);
  assert.deepEqual(diagnosisCarePlanItems([{ id: "n", name: "Cough", carePlan: "none" }]), [
    { key: "n", name: "Cough", plan: "No Further BHC Action", inSurveillance: false },
  ]);
  // The flag only counts on a referral.
  assert.equal(
    diagnosisCarePlanItems([{ id: "f", name: "Wound", carePlan: "follow_up", bhcFollowUp: true }])[0].plan,
    "Schedule BHC Follow-up",
  );
});
