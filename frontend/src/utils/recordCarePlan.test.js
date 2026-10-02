import test from "node:test";
import assert from "node:assert/strict";

import { diagnosisCarePlanItems, formatFbs } from "./recordCarePlan.js";

test("FBS reads back with its unit, only when recorded", () => {
  assert.equal(formatFbs(126), "126 mg/dL");
  assert.equal(formatFbs("98.5"), "98.5 mg/dL");
  assert.equal(formatFbs(0), "0 mg/dL");
  assert.equal(formatFbs(null), "");
  assert.equal(formatFbs(undefined), "");
  assert.equal(formatFbs("  "), "");
});

test("a saved record's care plan lists only tracked or surveillance diagnoses", () => {
  const items = diagnosisCarePlanItems([
    { id: "d1", name: "Hypertension", carePlan: "monitor" },
    { id: "d2", name: "Pneumonia", carePlan: "refer", includeInSurveillance: true },
    { id: "d3", name: "Diabetes Mellitus", carePlan: "monitor_refer" },
    { id: "d4", name: "Cough", carePlan: "none" },
    { id: "d5", name: "Dengue", carePlan: "none", includeInSurveillance: true },
    { id: "d6", name: "Headache" },
    { id: "d7", name: "  ", carePlan: "monitor" },
  ]);
  assert.deepEqual(items, [
    { key: "d1", name: "Hypertension", plan: "Monitor at BHC", inSurveillance: false },
    { key: "d2", name: "Pneumonia", plan: "Refer to RHU", inSurveillance: true },
    { key: "d3", name: "Diabetes Mellitus", plan: "Monitor at BHC + Refer to RHU", inSurveillance: false },
    { key: "d5", name: "Dengue", plan: "", inSurveillance: true },
  ]);
  assert.deepEqual(diagnosisCarePlanItems(null), []);
  assert.deepEqual(diagnosisCarePlanItems([{ name: "Asthma", carePlan: "watch" }]), []);
});
