// Rules for moving one member to another household from Family Details.

export const HEAD_TRANSFER_MESSAGE = "Assign a new household head in Edit Family before transferring the head.";

// The household head is never transferred through the ordinary action.
export const transferBlockedReason = (household, member) =>
  household && member && household.headPatientId === member.id ? HEAD_TRANSFER_MESSAGE : "";

// Only other, active households that have a head can be chosen. Typed text never selects one.
export const destinationCandidates = (results = [], currentHouseholdId) =>
  results.filter((item) => item.id !== currentHouseholdId && item.headPatientId && !item.archivedAt);
