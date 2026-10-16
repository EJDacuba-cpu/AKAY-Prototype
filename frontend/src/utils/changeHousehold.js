import { householdPayload } from "./householdData.js";

// The whole body of a Change Household request: the household command (and the head replacement when the
// patient leaves a household as its head). Demographics and clinical fields are never part of it.
export function changeHouseholdPayload(connection, registry, replacement) {
  return {
    household: householdPayload(connection, registry),
    ...(replacement ? {
      head_replacement: {
        household_id: replacement.householdId,
        head_patient_id: replacement.headPatientId,
        relationships: replacement.relationships,
        version: registry.households.find((item) => item.id === replacement.householdId)?.version,
      },
    } : {}),
  };
}

// Same household and same relationship as already saved: nothing to change.
export function isUnchangedHousehold(connection, saved) {
  return Boolean(connection && saved && connection.kind === "existing" && saved.kind === "existing"
    && connection.householdId === saved.householdId && connection.relationship === saved.relationship && !connection.relationshipLink);
}
