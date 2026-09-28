import test from "node:test";
import assert from "node:assert/strict";
import { buildNcdData, getActiveNcdSections, ncdReviewRows, normalizeNcdData } from "./ncdMonitoring.js";
import { getErrorOwnerStepKey, programStepKey } from "./consultationSteps.js";

const dx = (...names) => names.map((name) => ({ id: name, name }));

test("FBS is a Diabetes Mellitus field, not an NCD Monitoring one", () => {
  assert.deepEqual(getActiveNcdSections(dx("Hypertension")), []);
  assert.deepEqual(getActiveNcdSections(dx("Hypertension", "diabetes mellitus")).map((s) => s.key), ["diabetes"]);
});

test("saved ncdData takes its conditions from the diagnoses and holds no vitals", () => {
  const saved = buildNcdData({ conditions: ["stale"], diabetes: { fbs: " 95 mg/dL " } }, dx("Diabetes Mellitus", "Hypertension", "Asthma"));
  assert.deepEqual(saved, { conditions: ["Hypertension", "Diabetes Mellitus"], diabetes: { fbs: "95 mg/dL" } });
});

test("a condition no longer diagnosed does not keep its hidden field", () => {
  assert.deepEqual(buildNcdData({ diabetes: { fbs: "95" } }, dx("Hypertension")), { conditions: ["Hypertension"] });
});

test("normalizeNcdData drops unknown keys and fills the known shape", () => {
  assert.deepEqual(normalizeNcdData({ bp: "120/80", diabetes: { fbs: 95, extra: 1 } }), {
    conditions: [],
    diabetes: { fbs: "95" },
  });
  assert.deepEqual(normalizeNcdData(null), { conditions: [], diabetes: { fbs: "" } });
});

test("review rows use the form's labels", () => {
  assert.deepEqual(ncdReviewRows({ diabetes: { fbs: "95" } }, dx("Hypertension", "Diabetes Mellitus")), [
    { label: "Monitored Conditions", value: "Hypertension, Diabetes Mellitus" },
    { label: "Fasting Blood Sugar (FBS)", value: "95" },
  ]);
});

test("NCD errors belong to the NCD Monitoring step", () => {
  assert.equal(getErrorOwnerStepKey("monitoring_data.ncdData.diabetes.fbs"), programStepKey("NCD Monitoring"));
  assert.equal(getErrorOwnerStepKey("ncdData.diabetes.fbs"), programStepKey("NCD Monitoring"));
});
