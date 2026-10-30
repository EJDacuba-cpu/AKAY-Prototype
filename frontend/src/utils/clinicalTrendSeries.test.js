import test from "node:test";
import assert from "node:assert/strict";

import {
  bloodPressureTrendPoints,
  fbsTrendPoints,
  tbAdherenceTrendPoints,
} from "./clinicalTrendSeries.js";

test("BP trends keep dated systolic and diastolic pairs and skip blanks", () => {
  const points = bloodPressureTrendPoints([
    { id: 1, dateOfVisit: "2026-01-01", systolicBp: "140", diastolicBp: "90" },
    { id: 2, dateOfVisit: "2026-01-08", systolicBp: "", diastolicBp: "" },
    { id: 3, dateOfVisit: "2026-01-15", systolicBp: "132", diastolicBp: "84" },
    { id: 4, dateOfVisit: "2026-01-22", systolicBp: "128" },
  ]);
  assert.equal(points.length, 3);
  assert.deepEqual(points.map((point) => point.systolic), [140, 132, 128]);
  assert.deepEqual(points.map((point) => point.diastolic), [90, 84, null]);
  assert.equal(points.some((point) => point.systolic === 0 && point.recordId === 2), false);
});

test("FBS trends keep the recorded unit and never interpolate missing visits", () => {
  const points = fbsTrendPoints([
    { id: 1, dateOfVisit: "2026-02-01", fbs: "110", fbsUnit: "mg/dL" },
    { id: 2, dateOfVisit: "2026-02-08" },
    { id: 3, dateOfVisit: "2026-02-15", fbs: "6.2", fbsUnit: "mmol/L" },
  ]);
  assert.equal(points.length, 2);
  assert.equal(points[0].value, 110);
  assert.equal(points[0].unit, "mg/dL");
  assert.equal(points[1].value, 6.2);
  assert.equal(points[1].unit, "mmol/L");
});

test("TB adherence points omit undocumented percents instead of treating them as zero", () => {
  const points = tbAdherenceTrendPoints([
    { id: 1, dateOfVisit: "2026-03-01", tbData: { diagnosis: { tbCaseNumber: "TB-1" }, doseCalendar: {} } },
    { id: 2, dateOfVisit: "2026-04-01", tbData: { doseCalendar: { adherencePercent: 92 } } },
    { id: 3, dateOfVisit: "2026-05-01", tbData: { doseCalendar: { adherencePercent: "88" } } },
  ]);
  assert.equal(points.length, 2);
  assert.deepEqual(points.map((point) => point.adherencePercent), [92, 88]);
});

test("empty measurement history stays empty", () => {
  assert.deepEqual(bloodPressureTrendPoints([]), []);
  assert.deepEqual(fbsTrendPoints([{ id: 1, dateOfVisit: "2026-01-01" }]), []);
  assert.deepEqual(tbAdherenceTrendPoints([]), []);
});
