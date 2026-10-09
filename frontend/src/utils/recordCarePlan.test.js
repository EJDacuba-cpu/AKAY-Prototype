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

test("a saved record's care plan lists only concerns with a next action or surveillance", () => {
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
    { key: "d8", name: "Wound", plan: "Follow-up", inSurveillance: false },
    { key: "d1", name: "Hypertension", plan: "Monitor at BHC", inSurveillance: false },
    { key: "d2", name: "Pneumonia", plan: "Refer to RHU", inSurveillance: true },
    { key: "d3", name: "Diabetes Mellitus", plan: "Monitor at BHC + Refer to RHU", inSurveillance: false },
    { key: "d5", name: "Dengue", plan: "", inSurveillance: true },
  ]);
  assert.deepEqual(diagnosisCarePlanItems(null), []);
  assert.deepEqual(diagnosisCarePlanItems([{ name: "Asthma", carePlan: "watch" }]), []);
});

test("the care plan heading is Health Concerns unless the record holds a retired value", () => {
  assert.equal(diagnosisCarePlanHeading([{ name: "Wound", carePlan: "follow_up" }]), "Health Concerns");
  assert.equal(diagnosisCarePlanHeading([{ name: "Cough", carePlan: "refer" }, { name: "Rash" }]), "Health Concerns");
  assert.equal(diagnosisCarePlanHeading([{ name: "Hypertension", carePlan: "monitor" }]), "Care Plan");
  assert.equal(diagnosisCarePlanHeading([{ name: "Cough", carePlan: "none" }, { name: "Wound", carePlan: "recheck" }]), "Care Plan");
  assert.equal(diagnosisCarePlanHeading(undefined), "Health Concerns");
});
