import test from "node:test";
import assert from "node:assert/strict";
import { TREND_LENGTH, buildVitalRows } from "./vitalTrends.js";
import { calculateBmi } from "./bmi.js";

const day = (n) => `2026-09-${String(n).padStart(2, "0")}T09:00:00+08:00`;
const rowOf = (result, key) => result.rows.find((row) => row.key === key);

test("returns the last 6 readings oldest to newest", () => {
  assert.equal(TREND_LENGTH, 6);
  // Shuffled input order: the series must follow record dates, not array order.
  const records = [3, 1, 8, 5, 2, 7, 4, 6].map((n) => ({ id: n, dateRecorded: day(n), pulse: String(59 + n) }));
  const result = buildVitalRows(records);
  assert.deepEqual(rowOf(result, "pulse").series, [[62, 63, 64, 65, 66, 67]]);
  assert.equal(rowOf(result, "pulse").display, "67");
  assert.equal(result.record.id, 8);
});

test("skips blank and non-numeric readings but keeps latest display", () => {
  const records = [
    { dateRecorded: day(1), temperature: "36.5" },
    { dateRecorded: day(2), temperature: " " },
    { dateRecorded: day(3), temperature: "36.9" },
    { dateRecorded: day(4), temperature: "abc" },
  ];
  const row = rowOf(buildVitalRows(records), "temperature");
  assert.equal(row.display, "abc");
  assert.deepEqual(row.series, [[36.5, 36.9]]);
});

test("bp pairs systolic and diastolic", () => {
  const records = [
    { dateRecorded: day(1), systolicBp: "130", diastolicBp: "85" },
    { dateRecorded: day(2), systolicBp: "120", diastolicBp: "80" },
  ];
  const row = rowOf(buildVitalRows(records), "bp");
  assert.equal(row.display, "120/80");
  assert.equal(row.unit, "mmHg");
  assert.deepEqual(row.series, [[130, 120], [85, 80]]);
});

test("bp shows a dash for a missing side", () => {
  const row = rowOf(buildVitalRows([{ dateRecorded: day(1), systolicBp: "120", pulse: "70" }]), "bp");
  assert.equal(row.display, "120/—");
  const none = rowOf(buildVitalRows([{ dateRecorded: day(1), pulse: "70" }]), "bp");
  assert.equal(none.display, "—");
});

test("bmi uses each record's own weight and height", () => {
  const records = [
    { dateRecorded: day(1), weight: "70", height: "170" },
    { dateRecorded: day(2), weight: "72", height: "168" },
  ];
  const row = rowOf(buildVitalRows(records), "bmi");
  assert.deepEqual(row.series, [[calculateBmi("70", "170"), calculateBmi("72", "168")]]);
  assert.equal(row.display, calculateBmi("72", "168").toFixed(1));
});

test("fbs row only when latest record has fbs", () => {
  const without = buildVitalRows([{ dateRecorded: day(1), pulse: "70" }]);
  assert.equal(rowOf(without, "fbs"), undefined);
  const withFbs = buildVitalRows([{ dateRecorded: day(1), pulse: "70", fbs: "110" }]);
  assert.equal(rowOf(withFbs, "fbs").display, "110");
  assert.deepEqual(
    withFbs.rows.map((row) => row.key),
    ["bp", "pulse", "temperature", "spo2", "weight", "height", "bmi", "fbs"],
  );
});

test("single reading has no trend", () => {
  const row = rowOf(buildVitalRows([{ dateRecorded: day(1), pulse: "70" }]), "pulse");
  assert.deepEqual(row.series, []);
  assert.equal(rowOf(buildVitalRows([{ dateRecorded: day(1), pulse: "70" }]), "spo2").display, "—");
});

test("no vitals", () => {
  assert.deepEqual(buildVitalRows([{ dateRecorded: day(1) }]), { record: null, recordedAt: null, rows: [] });
  assert.deepEqual(buildVitalRows(undefined), { record: null, recordedAt: null, rows: [] });
});
