import { apiRequest, unwrapData } from "./apiClient";
import { normalizePasswordResetRequest } from "./passwordResetService";

/** One account's latest invite and open reset request (rows shaped like the Password & Invites lists). */
export async function getAccountAccess(userId) {
  const data = unwrapData(await apiRequest(`/users/${userId}/access`)) || {};
  return {
    invite: data.invite || null,
    resetRequest: data.reset_request ? normalizePasswordResetRequest(data.reset_request) : null,
  };
}
