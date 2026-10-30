import test from "node:test";
import assert from "node:assert/strict";
import { TREND_LENGTH, buildVitalRows } from "./vitalTrends.js";
import * as vitalTrends from "./vitalTrends.js";
import { calculateBmi } from "./bmi.js";

const day = (n) => `2026-09-${String(n).padStart(2, "0")}T09:00:00+08:00`;
const rowOf = (result, key) => result.rows.find((row) => row.key === key);

test("returns the last 6 readings oldest to newest", () => {
  assert.equal(TREND_LENGTH, 6);
  // Shuffled input order: the series must follow record dates, not array order.
  const records = [3, 1, 8, 5, 2, 7, 4, 6].map((n) => ({ id: n, dateRecorded: day(n), pulse: String(59 + n) }));
  const result = buildVitalRows(records);
  const history = rowOf(result, "pulse").history;
  assert.deepEqual(history.map((point) => point.values[0]), [62, 63, 64, 65, 66, 67]);
  assert.deepEqual(history.map((point) => point.date.toISOString()), [
    "2026-09-03T01:00:00.000Z", "2026-09-04T01:00:00.000Z", "2026-09-05T01:00:00.000Z",
    "2026-09-06T01:00:00.000Z", "2026-09-07T01:00:00.000Z", "2026-09-08T01:00:00.000Z",
  ]);
  assert.deepEqual(history.map((point) => point.isLatest), [false, false, false, false, false, true]);
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
  assert.deepEqual(row.history.map((point) => point.values), [[36.5], [36.9]]);
  assert.ok(row.history.every((point) => !point.isLatest));
});

test("bp pairs systolic and diastolic", () => {
  const records = [
    { dateRecorded: day(1), systolicBp: "130", diastolicBp: "85" },
    { dateRecorded: day(2), systolicBp: "120", diastolicBp: "80" },
  ];
  const row = rowOf(buildVitalRows(records), "bp");
  assert.equal(row.display, "120/80");
  assert.equal(row.unit, "mmHg");
  assert.deepEqual(row.history.map((point) => point.values), [[130, 85], [120, 80]]);
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
  assert.deepEqual(row.history.map((point) => point.values[0]), [calculateBmi("70", "170"), calculateBmi("72", "168")]);
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

test("a single reading retains its date and value without fabricating a trend", () => {
  const row = rowOf(buildVitalRows([{ dateRecorded: day(1), pulse: "70" }]), "pulse");
  assert.equal(row.history.length, 1);
  assert.equal(row.history[0].date.toISOString(), "2026-09-01T01:00:00.000Z");
  assert.deepEqual(row.history[0].values, [70]);
  assert.equal(rowOf(buildVitalRows([{ dateRecorded: day(1), pulse: "70" }]), "spo2").display, "—");
});

test("BP history keeps missing sides attached to the correct visit", () => {
  const row = rowOf(buildVitalRows([
    { id: 1, dateRecorded: day(1), systolicBp: "130", diastolicBp: "85" },
    { id: 2, dateRecorded: day(2), systolicBp: "125" },
    { id: 3, dateRecorded: day(3), diastolicBp: "78", pulse: "70" },
    { id: 4, dateRecorded: day(4), systolicBp: "120", diastolicBp: "80" },
  ]), "bp");
  assert.deepEqual(row.history.map((point) => point.values), [[130, 85], [125, null], [null, 78], [120, 80]]);
  assert.deepEqual(row.history.map((point) => point.recordId), [1, 2, 3, 4]);
});

test("chart history rejects invalid numeric suffixes while preserving recorded precision", () => {
  const row = rowOf(buildVitalRows([
    { dateRecorded: day(1), temperature: "36.50" },
    { dateRecorded: day(2), temperature: "37abc" },
    { dateRecorded: day(3), temperature: "37.0" },
  ]), "temperature");
  assert.deepEqual(row.history.map((point) => point.values), [[36.5], [37]]);
  assert.deepEqual(row.history.map((point) => point.display), ["36.50", "37.0"]);
});

test("flat and single-point charts stay centred without creating peaks", () => {
  assert.equal(typeof vitalTrends.buildVitalTrendPlot, "function");
  const plot = vitalTrends.buildVitalTrendPlot([
    { values: [70] }, { values: [70] }, { values: [70] },
  ]);
  assert.deepEqual(plot.points.map(({ x, ys }) => [x, ys[0]]), [[6, 50], [50, 50], [94, 50]]);
  const single = vitalTrends.buildVitalTrendPlot([{ values: [70] }]);
  assert.deepEqual(single.points.map(({ x, ys }) => [x, ys[0]]), [[50, 50]]);
  assert.deepEqual(single.lines, []);
});

test("plotting breaks a BP line at a missing reading instead of joining different visits", () => {
  assert.equal(typeof vitalTrends.buildVitalTrendPlot, "function");
  const plot = vitalTrends.buildVitalTrendPlot([
    { values: [120, 80] }, { values: [null, 75] }, { values: [130, 85] },
  ]);
  assert.equal(plot.points[1].ys[0], null);
  assert.deepEqual(plot.lines.map((line) => line.seriesIndex), [1]);
  assert.equal(plot.lines[0].points.length, 3);
});

test("no vitals", () => {
  assert.deepEqual(buildVitalRows([{ dateRecorded: day(1) }]), { record: null, recordedAt: null, rows: [] });
  assert.deepEqual(buildVitalRows(undefined), { record: null, recordedAt: null, rows: [] });
});
