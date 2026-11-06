/**
 * Normalizes GET /password-invites/summary payload for Admin Reports.
 * Legitimate zeros are kept; missing/null/non-integer values are rejected.
 */

const UNAVAILABLE = "Access summary unavailable";

function isNonnegativeInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function readResetCount(data) {
  if (Object.hasOwn(data, "reset_requests")) return data.reset_requests;
  if (Object.hasOwn(data, "resetRequests")) return data.resetRequests;
  return undefined;
}

export function normalizePasswordInviteSummary(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(UNAVAILABLE);
  }

  const invites = data.invites;
  const resetRequests = readResetCount(data);

  if (!isNonnegativeInteger(invites) || !isNonnegativeInteger(resetRequests)) {
    throw new Error(UNAVAILABLE);
  }

  return { invites, resetRequests };
}
