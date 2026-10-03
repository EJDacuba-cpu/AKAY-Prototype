import test from "node:test";
import assert from "node:assert/strict";
import { summarizeLatestBmi } from "./bmi.js";

const visit = (date, extra = {}) => ({ dateRecorded: `${date}T09:00:00+08:00`, ...extra });

test("summarizeLatestBmi reports value, category and date for an adult", () => {
  const result = summarizeLatestBmi([visit("2026-09-01", { weight: "80", height: "170.9" })], 40);
  assert.equal(result.value, "27.4");
  assert.equal(result.category, "Overweight");
  assert.equal(result.date.toISOString(), new Date("2026-09-01T09:00:00+08:00").toISOString());
});

test("summarizeLatestBmi uses the newest dated record with both measurements", () => {
  const records = [
    visit("2026-07-01", { weight: "60", height: "160" }),
    visit("2026-09-01", { weight: "90" }),
    { weight: "50", height: "150" },
    visit("2026-08-01", { weight: "80", height: "170.9" }),
  ];
  const result = summarizeLatestBmi(records, 30);
  assert.equal(result.value, "27.4");
  assert.equal(result.date.toISOString(), new Date("2026-08-01T09:00:00+08:00").toISOString());
});

test("summarizeLatestBmi withholds the adult category for under-18s", () => {
  const records = [visit("2026-09-01", { weight: "40", height: "150" })];
  assert.equal(summarizeLatestBmi(records, 12).category, "");
  assert.equal(summarizeLatestBmi(records, "12").category, "");
  assert.equal(summarizeLatestBmi(records, 12).value, "17.8");
});

test("summarizeLatestBmi applies the adult rule when age is empty or non-numeric", () => {
  const records = [visit("2026-09-01", { weight: "80", height: "170.9" })];
  for (const age of ["", null, undefined, "n/a"]) {
    assert.equal(summarizeLatestBmi(records, age).category, "Overweight");
  }
  assert.equal(summarizeLatestBmi(records, 18).category, "Overweight");
});

test("summarizeLatestBmi returns null without a complete measurement", () => {
  assert.equal(summarizeLatestBmi([], 30), null);
  assert.equal(summarizeLatestBmi(undefined, 30), null);
  assert.equal(summarizeLatestBmi([visit("2026-09-01", { weight: "70" })], 30), null);
});

test("summarizeLatestBmi reads a leading number from the age text", () => {
  const records = [visit("2026-09-01", { weight: "80", height: "170.9" })];
  assert.equal(summarizeLatestBmi(records, " ").category, "Overweight");
  assert.equal(summarizeLatestBmi(records, "12 yrs").category, "");
  assert.equal(summarizeLatestBmi(records, " 12 yrs ").category, "");
  assert.equal(summarizeLatestBmi(records, "17").category, "");
  assert.equal(summarizeLatestBmi(records, 18).category, "Overweight");
  assert.equal(summarizeLatestBmi(records, "18 yrs").category, "Overweight");
});
