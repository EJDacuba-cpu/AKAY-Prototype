import test from "node:test";
import assert from "node:assert/strict";

import { mapCareOverview } from "./careOverview.js";
import { activeMonitoringsFromOverview, tbPrefillRecordId } from "./continuedCare.js";

const payload = {
  pending_follow_ups: [
    {
      id: 7,
      due_date: "2026-10-01",
      due_time: null,
      state: "pending",
      is_overdue: true,
      reason: "DOTS check",
      source_health_record_id: 50,
      source_date: "2026-09-17",
      conditions: [
        { monitoring_id: 3, condition_name: "Tuberculosis", condition_key: "tuberculosis", started_at: "2026-07-01" },
      ],
    },
  ],
  monitoring_without_follow_up: [],
};

test("a follow-up's conditions carry condition_key and started_at", () => {
  const overview = mapCareOverview(payload);
  assert.deepEqual(overview.pendingFollowUps[0].conditions, [
    { monitoringId: 3, conditionName: "Tuberculosis", conditionKey: "tuberculosis", startedAt: "2026-07-01" },
  ]);
  assert.deepEqual(mapCareOverview(null), { pendingFollowUps: [], monitoringWithoutFollowUp: [] });
});

test("continued care uses a follow-up condition's key and start date when present", () => {
  const [monitoring] = activeMonitoringsFromOverview(mapCareOverview(payload));
  assert.equal(monitoring.conditionKey, "tuberculosis");
  assert.equal(monitoring.startedAt, "2026-07-01");
  // The key alone identifies TB - no clinical registry needed (cold start).
  assert.equal(tbPrefillRecordId([monitoring], {}), 50);
});
