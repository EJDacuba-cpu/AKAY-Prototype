import assert from "node:assert/strict";
import test from "node:test";
import { getCurrentVitalRecord, getVitalRecordDate } from "./currentPatientVitals.js";
import { calculateBmi } from "./bmi.js";

const now = new Date("2026-09-24T04:00:00Z");

test("empty, missing vitals, yesterday and tomorrow produce the empty state", () => {
  assert.equal(getCurrentVitalRecord([], now), null);
  assert.equal(getCurrentVitalRecord([
    { dateRecorded: "2026-09-24T01:00:00Z", pulse: " ", weight: null },
    { dateRecorded: "2026-09-23T01:00:00Z", pulse: 80 },
    { dateRecorded: "2026-09-25T01:00:00Z", pulse: 80 },
  ], now), null);
});

test("uses Philippine midnight and the full timestamp, not the sliced UTC date", () => {
  const record = { dateRecorded: "2026-09-23T16:00:00Z", dateOfVisit: "2026-09-23", pulse: 80 };
  const yesterday = { dateRecorded: "2026-09-23T15:59:59Z", pulse: 81 };
  assert.equal(getCurrentVitalRecord([yesterday, record], now), record);
  assert.equal(getCurrentVitalRecord([yesterday], now), null);
});

test("selects the latest same-day record with measurements without mutating the list", () => {
  const morning = { dateRecorded: "2026-09-24T08:00:00+08:00", pulse: 80 };
  const latest = { dateRecorded: "2026-09-24T10:00:00+08:00", temperature: 36.5 };
  const empty = { dateRecorded: "2026-09-24T11:00:00+08:00" };
  const records = Object.freeze([morning, empty, latest]);
  assert.equal(getCurrentVitalRecord(records, now), latest);
  assert.deepEqual(records, [morning, empty, latest]);
});

test("calendar-only and offset-free visit times are interpreted in Philippine time", () => {
  assert.equal(getVitalRecordDate({ dateRecorded: "2026-09-24" }).toISOString(), "2026-09-23T16:00:00.000Z");
  assert.equal(getVitalRecordDate({ dateRecorded: "2026-09-24 09:30:00" }).toISOString(), "2026-09-24T01:30:00.000Z");
  assert.equal(getVitalRecordDate({ dateOfVisit: "2026-09-24", timeOfVisit: "08:00" }).toISOString(), "2026-09-24T00:00:00.000Z");
});

test("missing or invalid measurement dates never fall back to today's creation/update date", () => {
  for (const dateRecorded of [undefined, "bad-date", "2026-09-23T01:00:00Z"]) {
    assert.equal(getCurrentVitalRecord([{ dateRecorded, createdAt: now.toISOString(), updatedAt: now.toISOString(), pulse: 80 }], now), null);
  }
});

test("partial current vitals never borrow old height or weight for BMI", () => {
  const current = { dateRecorded: "2026-09-24T10:00:00+08:00", weight: 60 };
  const old = { dateRecorded: "2026-09-23T10:00:00+08:00", weight: 60, height: 160 };
  const selected = getCurrentVitalRecord([old, current], now);
  assert.equal(selected, current);
  assert.equal(calculateBmi(selected.weight, selected.height), null);
  assert.equal(calculateBmi(60, 160).toFixed(1), "23.4");
});
