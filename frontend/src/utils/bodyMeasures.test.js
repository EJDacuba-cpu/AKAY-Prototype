import test from "node:test";
import assert from "node:assert/strict";
import { buildBodyMeasures, WEIGHT_HISTORY_LENGTH } from "./bodyMeasures.js";

const visit = (date, extra = {}) => ({ dateRecorded: `${date}T09:00:00+08:00`, ...extra });

test("no records means nothing measured", () => {
  const result = buildBodyMeasures([], "28 yrs");
  assert.equal(result.height, null);
  assert.equal(result.weight, null);
  assert.equal(result.bmi, null);
});

test("height is the latest recorded height, even from an older visit", () => {
  const result = buildBodyMeasures(
    [visit("2026-10-13", { weight: "58" }), visit("2026-09-01", { height: "158", weight: "56.8" })],
    "28 yrs",
  );
  assert.equal(result.height.value, 158);
  assert.equal(result.height.display, "158");
  assert.equal(result.height.date.toISOString(), new Date("2026-09-01T09:00:00+08:00").toISOString());
});

test("weight history is oldest first, capped, with the latest and the change since the previous reading", () => {
  const records = [
    visit("2026-10-13", { weight: "58" }),
    visit("2026-06-01", { weight: "54" }),
    visit("2026-09-01", { weight: "56.8" }),
    visit("2026-08-01", { weight: "abc" }),
    visit("2026-05-01", { weight: "53" }),
    visit("2026-04-01", { weight: "52.5" }),
    visit("2026-03-01", { weight: "52" }),
  ];
  const { weight } = buildBodyMeasures(records, "28 yrs");
  assert.equal(weight.history.length, WEIGHT_HISTORY_LENGTH);
  assert.deepEqual(
    weight.history.map((point) => point.value),
    [52.5, 53, 54, 56.8, 58],
  );
  assert.equal(weight.latest.value, 58);
  assert.equal(weight.change.value, 1.2);
  assert.equal(weight.change.display, "+1.2");
  assert.equal(weight.change.since.toISOString(), new Date("2026-09-01T09:00:00+08:00").toISOString());
});

test("a single weight has no change and a loss reads with a minus sign", () => {
  assert.equal(buildBodyMeasures([visit("2026-10-13", { weight: "58" })], "28 yrs").weight.change, null);
  const loss = buildBodyMeasures([visit("2026-10-13", { weight: "57" }), visit("2026-09-01", { weight: "58.5" })], "28 yrs");
  assert.equal(loss.weight.change.display, "−1.5");
  const same = buildBodyMeasures([visit("2026-10-13", { weight: "58" }), visit("2026-09-01", { weight: "58" })], "28 yrs");
  assert.equal(same.weight.change.display, "0");
});

test("BMI comes from one visit that has both measurements", () => {
  const { bmi } = buildBodyMeasures([visit("2026-10-13", { weight: "58", height: "158" })], "28 yrs");
  assert.equal(bmi.value, "23.2");
  assert.equal(bmi.category, "Normal");
});
