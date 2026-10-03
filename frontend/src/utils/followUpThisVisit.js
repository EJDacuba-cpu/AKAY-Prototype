import { conditionIdentity } from "./carePlan.js";

/**
 * The existing monitoring a consultation follows today (picked in Start
 * Consultation). It is the explicit follow-up context for the visit: Patient
 * Background keeps it as reference only, Assessment shows it read-only, and
 * Care Plan & Next Steps is where its decision for this visit is recorded.
 */

function identityOfMonitoring(monitoring, registry) {
  return monitoring?.conditionKey || conditionIdentity(monitoring?.conditionName, registry);
}

function identityOfDisease(disease, registry) {
  return conditionIdentity(disease?.name, registry);
}

/** The Current Conditions entry documenting a followed monitoring, or null. */
export function documentedConditionFor(monitoring, diseases = [], registry = {}) {
  const wanted = identityOfMonitoring(monitoring, registry);
  const list = Array.isArray(diseases) ? diseases : [];
  return (
    list.find((disease) => disease?.conditionKey && disease.conditionKey === wanted) ||
    list.find((disease) => identityOfDisease(disease, registry) === wanted) ||
    null
  );
}

/** Whether a Current Conditions entry is one of the conditions followed this visit. */
export function isFollowedThisVisit(disease, continuedMonitorings = [], registry = {}) {
  const identity = identityOfDisease(disease, registry);
  return continuedMonitorings.some(
    (monitoring) => identityOfMonitoring(monitoring, registry) === identity || (disease?.conditionKey && disease.conditionKey === monitoring?.conditionKey),
  );
}
