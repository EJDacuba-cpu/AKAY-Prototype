import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "ClinicalTrackingPanel.jsx"),
  "utf8",
);

test("TB Care tracking uses dispense-per-visit chart instead of dose calendar adherence", () => {
  assert.match(source, /tbDispenseTrendPoints/);
  assert.match(source, /DispenseBarChart/);
  assert.match(source, /Medicines given/);
  assert.doesNotMatch(source, /tbAdherenceTrendPoints/);
  assert.doesNotMatch(source, /TbTrackingChart/);
  assert.doesNotMatch(source, /TbDoseCalendar/);
  assert.doesNotMatch(source, /Adherence %/);
  assert.doesNotMatch(source, /Monthly doses/);
});
