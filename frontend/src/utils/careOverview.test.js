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
    {
      monitoringId: 3,
      conditionName: "Tuberculosis",
      conditionKey: "tuberculosis",
      startedAt: "2026-07-01",
      conditionStatus: null,
      legacy: false,
    },
  ]);
  assert.deepEqual(mapCareOverview(null), {
    pendingFollowUps: [],
    monitoringWithoutFollowUp: [],
    monitoringRecommendations: [],
  });
});

test("continued care uses a follow-up condition's key and start date when present", () => {
  const [monitoring] = activeMonitoringsFromOverview(mapCareOverview(payload));
  assert.equal(monitoring.conditionKey, "tuberculosis");
  assert.equal(monitoring.startedAt, "2026-07-01");
  // The key alone identifies TB - no clinical registry needed (cold start).
  assert.equal(tbPrefillRecordId([monitoring], {}), 50);
});

test("recommendations, condition status and the legacy flag are mapped", () => {
  const overview = mapCareOverview({
    pending_follow_ups: [
      {
        id: 7,
        conditions: [
          { monitoring_id: 3, condition_name: "Hypertension", condition_status: "active", legacy: false },
          { monitoring_id: 4, condition_name: "Asthma", condition_status: null, legacy: true },
        ],
      },
    ],
    monitoring_without_follow_up: [
      { id: 5, condition_name: "Gout", condition_key: null, condition_status: "controlled", legacy: false },
      { id: 6, condition_name: "Cough", condition_key: null, condition_status: null, legacy: true },
    ],
    monitoring_recommendations: [
      { condition_id: 12, condition_name: "Diabetes Mellitus", condition_key: "diabetes", status: "active", confirmed_at: "2026-10-01", recommended_at: "2026-10-02" },
    ],
  });
  assert.deepEqual(
    overview.pendingFollowUps[0].conditions.map((c) => [c.conditionStatus, c.legacy]),
    [["active", false], [null, true]],
  );
  assert.deepEqual(
    overview.monitoringWithoutFollowUp.map((m) => [m.conditionStatus, m.legacy]),
    [["controlled", false], [null, true]],
  );
  assert.deepEqual(overview.monitoringRecommendations, [
    { conditionId: 12, conditionName: "Diabetes Mellitus", conditionKey: "diabetes", status: "active", confirmedAt: "2026-10-01", recommendedAt: "2026-10-02" },
  ]);
});

test("a payload without the new fields still maps (older server)", () => {
  const overview = mapCareOverview({ monitoring_without_follow_up: [{ id: 5, condition_name: "Gout" }] });
  assert.deepEqual(overview.monitoringRecommendations, []);
  assert.equal(overview.monitoringWithoutFollowUp[0].conditionStatus, null);
  assert.equal(overview.monitoringWithoutFollowUp[0].legacy, false);
});
