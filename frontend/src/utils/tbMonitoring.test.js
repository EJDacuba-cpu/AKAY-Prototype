import assert from "node:assert/strict";
import { test } from "node:test";
import { tbMonitoringPayload, tbMonitoringErrors, tbMonitoringAttempt } from "./tbMonitoring.js";

test("monitoring payload only includes observations and the accepted endorsement context", () => {
  assert.deepEqual(tbMonitoringPayload({ observedOn: "2026-11-10", doseStatus: "taken", weightKg: "55.25", notes: " observed ", card_data: { regimen: "forged" } }, { id: 9, version: 3 }), {
    observed_on: "2026-11-10", dose_status: "taken", weight_kg: 55.25, notes: "observed", endorsement_id: 9, endorsement_version: 3,
  });
});

test("weight-only observations stay separate from doses and void corrections clear measurements", () => {
  const context = { id: 9, version: 3 };
  const weight = tbMonitoringPayload({ observedOn: "2026-11-10", weightKg: "55" }, context);
  assert.equal(weight.dose_status, null);
  assert.deepEqual(tbMonitoringErrors(weight, { start_date: "2026-11-01", today: "2026-11-10" }), {});
  const correction = tbMonitoringPayload({ doseStatus: "taken", weightKg: "55", voided: true, reason: "Wrong date" }, context, { id: 7, version: 2 });
  assert.deepEqual(correction, { dose_status: null, weight_kg: null, notes: "", endorsement_id: 9, endorsement_version: 3, version: 2, correction_reason: "Wrong date", voided: true });
  assert.equal(correction.observed_on, undefined);
});

test("invalid dates, precision, empty observations and holds without instructions require correction", () => {
  const bounds = { start_date: "2026-11-01", today: "2026-11-10" };
  const base = { observed_on: "2026-11-10", dose_status: "taken", weight_kg: null, notes: "" };
  for (const change of [{ observed_on: "2026-11-11" }, { observed_on: "2026-10-31" }, { observed_on: "2026-11-31" },
    { weight_kg: 55.255 }, { weight_kg: 0 }, { dose_status: null }, { dose_status: "on_hold" }]) {
    assert.ok(Object.keys(tbMonitoringErrors({ ...base, ...change }, bounds)).length > 0);
  }
  assert.ok(tbMonitoringErrors({ ...base, version: 1, correction_reason: "" }, bounds).correction_reason);
});

test("unchanged retries keep a frozen identity while a different date or correction gets a fresh key", () => {
  let count = 0;
  const key = () => `key-${++count}`;
  const payload = { observed_on: "2026-11-10", weight_kg: 55 };
  const first = tbMonitoringAttempt(null, 7, null, payload, key);
  payload.weight_kg = 99;
  assert.equal(first.payload.weight_kg, 55);
  assert.equal(tbMonitoringAttempt(first, 7, null, { observed_on: "2026-11-10", weight_kg: 55 }, key).key, "key-1");
  assert.equal(tbMonitoringAttempt(first, 7, 12, { version: 1, weight_kg: 55 }, key).key, "key-2");
});
