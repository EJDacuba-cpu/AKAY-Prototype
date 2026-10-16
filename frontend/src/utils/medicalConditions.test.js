import test from "node:test";
import assert from "node:assert/strict";

import {
  alertConditionNames,
  conditionEventSourceLabel,
  conditionStatusLabel,
  groupMedicalConditions,
  mapPatientConditions,
  monitoringRecommendationOptions,
} from "./medicalConditions.js";

const condition = (overrides = {}) => ({
  id: 1,
  conditionName: "Hypertension",
  conditionIdentity: "hypertension",
  status: "active",
  ...overrides,
});

test("only Patient-reported background entries are listed, with their array position", () => {
  const g = groupMedicalConditions({
    currentDiseases: [
      { name: "Gout" },
      { name: "Asthma", source: "Consultation", status: "Active" },
      { name: "Migraine", source: "Patient-reported", note: "since 2020" },
    ],
  });
  assert.deepEqual(g.patientReported.map((d) => [d.name, d.note, d.index]), [["Migraine", "since 2020", 2]]);
  assert.equal(g.confirmed.length, 0);
  assert.equal("unverified" in g, false);
});

test("legacy monitoring is listed apart from confirmed/monitored and never alerts", () => {
  const g = groupMedicalConditions({ legacyMonitorings: [{ id: 1, conditionName: "Hypertension" }] });
  assert.deepEqual(g.confirmed, []);
  assert.equal(g.legacyPending[0].kind, "legacy-monitoring");
  assert.equal(g.legacyPending[0].conditionName, "Hypertension");
  assert.deepEqual(alertConditionNames(g), []);
});

test("active and controlled conditions are confirmed (rhu); legacy monitoring is separate", () => {
  const g = groupMedicalConditions({
    conditions: [
      condition({ id: 1, status: "controlled" }),
      condition({ id: 2, conditionName: "Asthma", conditionIdentity: "name:asthma" }),
    ],
    legacyMonitorings: [{ id: 9, conditionName: "Tuberculosis" }],
  });
  assert.deepEqual(g.confirmed.map((c) => [c.kind, c.id]), [["rhu", 1], ["rhu", 2]]);
  assert.deepEqual(g.legacyPending.map((c) => [c.kind, c.id]), [["legacy-monitoring", 9]]);
});

test("under evaluation and past are separate and never alert", () => {
  const g = groupMedicalConditions({
    conditions: [
      condition({ id: 1, status: "active" }),
      condition({ id: 2, conditionName: "Gout", conditionIdentity: "name:gout", status: "under_evaluation" }),
      condition({ id: 3, conditionName: "Pneumonia", conditionIdentity: "name:pneumonia", status: "resolved" }),
      condition({ id: 4, conditionName: "Dengue", conditionIdentity: "name:dengue", status: "ruled_out" }),
    ],
    legacyMonitorings: [{ id: 8, conditionName: "Tuberculosis" }],
    currentDiseases: [{ name: "Asthma", source: "Consultation" }, { name: "Migraine", source: "Patient-reported" }],
  });
  assert.deepEqual(g.underEvaluation.map((c) => c.id), [2]);
  assert.deepEqual(g.past.map((c) => c.id), [3, 4]);
  assert.deepEqual(g.legacyPending.map((c) => c.id), [8]);
  assert.deepEqual(alertConditionNames(g), ["Hypertension"]);
});

test("grouping tolerates missing input", () => {
  assert.deepEqual(groupMedicalConditions(), {
    confirmed: [],
    legacyPending: [],
    underEvaluation: [],
    patientReported: [],
    past: [],
  });
  assert.deepEqual(alertConditionNames(), []);
});

test("recommendation options are alphabetical and ignore a missing overview", () => {
  const overview = {
    monitoringRecommendations: [
      { conditionId: 2, conditionName: "Hypertension", conditionKey: "hypertension", status: "active", confirmedAt: "2026-10-01", recommendedAt: "2026-10-02" },
      { conditionId: 1, conditionName: "Asthma", conditionKey: null, status: "controlled", confirmedAt: "2026-09-01", recommendedAt: "2026-09-02" },
    ],
  };
  assert.deepEqual(monitoringRecommendationOptions(overview), [
    { conditionId: 1, conditionName: "Asthma", status: "controlled", confirmedAt: "2026-09-01", recommendedAt: "2026-09-02" },
    { conditionId: 2, conditionName: "Hypertension", status: "active", confirmedAt: "2026-10-01", recommendedAt: "2026-10-02" },
  ]);
  assert.deepEqual(monitoringRecommendationOptions(null), []);
});

test("RHU condition statuses read as their labels", () => {
  assert.equal(conditionStatusLabel("under_evaluation"), "Under Evaluation");
  assert.equal(conditionStatusLabel("active"), "Active");
  assert.equal(conditionStatusLabel("controlled"), "Controlled");
  assert.equal(conditionStatusLabel("resolved"), "Resolved");
  assert.equal(conditionStatusLabel("ruled_out"), "Ruled Out");
  assert.equal(conditionStatusLabel(null), "");
  assert.equal(conditionStatusLabel("something_else"), "something_else");
});

test("the conditions payload is mapped to camelCase", () => {
  const mapped = mapPatientConditions({
    conditions: [
      {
        id: 4,
        condition_name: "Hypertension",
        condition_identity: "hypertension",
        status: "active",
        confirmed_at: "2026-10-01",
        confirmed_by_name: "Dr. Cruz",
        source_type: "referral",
        source_id: 12,
        bhc_monitoring_recommended_at: "2026-10-02",
        monitoring: { id: 6, started_at: "2026-10-03" },
        events: [
          {
            from_status: "under_evaluation",
            to_status: "active",
            note: "BP confirmed",
            source_type: "referral",
            source_id: 12,
            changed_by_name: "Dr. Cruz",
            changed_at: "2026-10-01",
          },
        ],
      },
    ],
    legacy_monitorings: [
      { id: 9, condition_name: "Asthma", condition_key: null, condition_identity: "name:asthma", started_at: "2026-01-01" },
    ],
  });
  assert.deepEqual(mapped, {
    conditions: [
      {
        id: 4,
        conditionName: "Hypertension",
        conditionIdentity: "hypertension",
        status: "active",
        confirmedAt: "2026-10-01",
        confirmedByName: "Dr. Cruz",
        sourceType: "referral",
        sourceId: 12,
        bhcMonitoringRecommendedAt: "2026-10-02",
        monitoring: { id: 6, startedAt: "2026-10-03" },
        events: [
          {
            fromStatus: "under_evaluation",
            toStatus: "active",
            note: "BP confirmed",
            sourceType: "referral",
            sourceId: 12,
            changedByName: "Dr. Cruz",
            changedAt: "2026-10-01",
          },
        ],
      },
    ],
    legacyMonitorings: [
      { id: 9, conditionName: "Asthma", conditionKey: null, conditionIdentity: "name:asthma", startedAt: "2026-01-01" },
    ],
  });
  assert.deepEqual(mapPatientConditions(null), { conditions: [], legacyMonitorings: [] });
});

test("status change events name their source as RHU feedback or RHU record", () => {
  assert.equal(conditionEventSourceLabel("rhu_feedback"), "RHU feedback");
  assert.equal(conditionEventSourceLabel("rhu_record"), "RHU record");
  assert.equal(conditionEventSourceLabel("anything_else"), "");
});
