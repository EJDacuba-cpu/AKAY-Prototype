import { conditionIdentity } from "./carePlan.js";
import { groupMedicalConditions } from "./medicalConditions.js";

/**
 * The conditions the consultation's Patient Background summary shows: the
 * same five clinical-source groups as the profile (groupMedicalConditions).
 * A confirmed condition that this visit follows (picked in Start Consultation)
 * is flagged `addressed`.
 *
 * Reference only; nothing here is editable except the Patient-Reported
 * Previous Conditions (Review / Update is the editor).
 */

function monitoringIdentity(monitoring, registry) {
  return monitoring?.conditionKey || conditionIdentity(monitoring?.conditionName, registry);
}

export function backgroundConditionGroups({
  diseases = [],
  conditions = [],
  legacyMonitorings = [],
  followed = [],
  registry = {},
} = {}) {
  const groups = groupMedicalConditions({
    conditions,
    legacyMonitorings,
    currentDiseases: Array.isArray(diseases) ? diseases : [],
    registry,
  });
  const addressed = new Set(followed.map((monitoring) => monitoringIdentity(monitoring, registry)));

  return {
    ...groups,
    confirmed: groups.confirmed.map((condition) => ({
      ...condition,
      addressed: addressed.has(condition.conditionIdentity || conditionIdentity(condition.conditionName, registry)),
    })),
  };
}
