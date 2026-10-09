import test from "node:test";
import assert from "node:assert/strict";

import {
  alertConditionNames,
  groupMedicalConditions,
  mapPatientConditions,
  monitoringRecommendationOptions,
} from "./medicalConditions.js";

const registry = {
  monitored_conditions: {
    hypertension: { name: "Hypertension", aliases: ["HTN"] },
  },
};

const condition = (overrides = {}) => ({
  id: 1,
  conditionName: "Hypertension",
  conditionIdentity: "hypertension",
  status: "active",
  ...overrides,
});

test("legacy consultation entries are unverified, never patient-reported", () => {
  const g = groupMedicalConditions({ currentDiseases: [{ name: "Asthma", source: "Consultation", status: "Active" }] });
  assert.equal(g.unverified.length, 1);
  assert.equal(g.patientReported.length, 0);
  assert.equal(g.confirmed.length, 0);
});

test("an entry with no source is unverified; Patient-reported entries are their own group", () => {
  const g = groupMedicalConditions({
    currentDiseases: [
      { name: "Gout" },
      { name: "Migraine", source: "Patient-reported", note: "since 2020" },
    ],
  });
  assert.deepEqual(g.unverified.map((d) => [d.name, d.index]), [["Gout", 0]]);
  assert.deepEqual(g.patientReported.map((d) => [d.name, d.note, d.index]), [["Migraine", "since 2020", 1]]);
});

test("legacy monitoring is confirmed/monitored but labelled legacy", () => {
  const g = groupMedicalConditions({ legacyMonitorings: [{ id: 1, conditionName: "Hypertension" }] });
  assert.equal(g.confirmed[0].kind, "legacy-monitoring");
  assert.equal(g.confirmed[0].conditionName, "Hypertension");
});

test("active and controlled conditions are confirmed (rhu), ahead of legacy monitoring", () => {
  const g = groupMedicalConditions({
    conditions: [
      condition({ id: 1, status: "controlled" }),
      condition({ id: 2, conditionName: "Asthma", conditionIdentity: "name:asthma" }),
    ],
    legacyMonitorings: [{ id: 9, conditionName: "Tuberculosis" }],
  });
  assert.deepEqual(g.confirmed.map((c) => [c.kind, c.id]), [["rhu", 1], ["rhu", 2], ["legacy-monitoring", 9]]);
});

test("an unverified entry matching a confirmed condition is not listed twice", () => {
  const g = groupMedicalConditions({
    conditions: [condition()],
    currentDiseases: [{ name: "HTN", source: "Consultation" }, { name: "Asthma", source: "Consultation" }],
    registry,
  });
  assert.deepEqual(g.unverified.map((d) => d.name), ["Asthma"]);
});

test("an unverified entry matching a legacy monitoring or a non-confirmed condition is not listed twice", () => {
  const g = groupMedicalConditions({
    conditions: [condition({ id: 3, conditionName: "Gout", conditionIdentity: "name:gout", status: "under_evaluation" })],
    legacyMonitorings: [{ id: 1, conditionName: "Hypertension", conditionIdentity: "hypertension" }],
    currentDiseases: [{ name: "Hypertension", source: "Consultation" }, { name: "gout", source: "Consultation" }],
    registry,
  });
  assert.deepEqual(g.unverified, []);
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
  assert.deepEqual(alertConditionNames(g), ["Hypertension", "Tuberculosis"]);
});

test("grouping tolerates missing input", () => {
  assert.deepEqual(groupMedicalConditions(), {
    confirmed: [],
    underEvaluation: [],
    unverified: [],
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
