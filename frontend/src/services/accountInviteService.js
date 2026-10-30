import { apiRequest, unwrapData, unwrapList } from "./apiClient";

export function verifyInvite(token) {
  return apiRequest(`/auth/invites/verify?token=${encodeURIComponent(token)}`, { auth: false });
}

export function acceptInvite({ token, password, passwordConfirmation }) {
  return apiRequest("/auth/invites/accept", {
    method: "POST",
    auth: false,
    body: { token, password, password_confirmation: passwordConfirmation },
  });
}

export async function getAccountInvites(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status && params.status !== "all") query.set("status", params.status);
  if (params.perPage) query.set("per_page", params.perPage);

  const response = await apiRequest(`/account-invites${query.size ? `?${query}` : ""}`);
  return unwrapList(response);
}

export async function resendInvite(id) {
  const response = await apiRequest(`/account-invites/${id}/resend`, { method: "POST" });
  return unwrapData(response);
}

export async function updateInviteEmail(id, email) {
  const response = await apiRequest(`/account-invites/${id}/email`, { method: "PATCH", body: { email } });
  return unwrapData(response);
}

export async function getPasswordInviteSummary() {
  const response = await apiRequest("/password-invites/summary");
  const data = unwrapData(response) || {};
  return { resetRequests: data.reset_requests ?? 0, invites: data.invites ?? 0 };
}
