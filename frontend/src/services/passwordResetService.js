import { apiRequest, unwrapData, unwrapList } from "./apiClient";

export const PASSWORD_RESET_REQUESTS_UPDATED_EVENT =
  "akay:password-reset-requests-updated";

function dispatchUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(PASSWORD_RESET_REQUESTS_UPDATED_EVENT),
    );
  }
}

/**
 * Keeps the API's raw fields (`status`, `delivery`, `completed_via`, `expires_at`, `user`) so
 * `resetRequestStatus` can compute the shared status; adds camelCase aliases for display.
 */
export function normalizePasswordResetRequest(request = {}) {
  const user = request.user || {};

  return {
    ...request,
    id: request.id ? String(request.id) : "",
    email: request.email || user.email || "",
    userName: user.name || request.userName || "Unknown user",
    role: user.role || request.role || "",
    facility: user.facility || request.facility || "No facility assigned",
    requestedAt: request.requested_at || request.requestedAt || "",
    approvedAt: request.approved_at || request.approvedAt || "",
    rejectedAt: request.rejected_at || request.rejectedAt || "",
    completedAt: request.completed_at || request.completedAt || "",
    expiresAt: request.expires_at || request.expiresAt || "",
    adminNote: request.admin_note || request.adminNote || "",
    approvedBy: request.approved_by || request.approvedBy || "",
    rejectedBy: request.rejected_by || request.rejectedBy || "",
  };
}

export async function submitPasswordResetRequest(email) {
  return apiRequest("/auth/password-reset/request", {
    method: "POST",
    auth: false,
    body: { email },
  });
}

export async function verifyPasswordResetToken(token) {
  return apiRequest(
    `/auth/password-reset/verify?token=${encodeURIComponent(token)}`,
    { auth: false },
  );
}

export async function completePasswordReset({ token, password, passwordConfirmation }) {
  return apiRequest("/auth/password-reset/complete", {
    method: "POST",
    auth: false,
    body: {
      token,
      password,
      password_confirmation: passwordConfirmation,
    },
  });
}

export async function getPasswordResetRequests(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status && params.status !== "all") query.set("status", params.status);
  if (params.perPage) query.set("per_page", params.perPage);

  const response = await apiRequest(
    `/admin/password-reset-requests${query.size ? `?${query}` : ""}`,
  );

  return unwrapList(response).map(normalizePasswordResetRequest);
}

export async function approvePasswordResetRequest(id) {
  const response = await apiRequest(
    `/admin/password-reset-requests/${id}/approve`,
    { method: "POST" },
  );
  dispatchUpdate();
  return normalizePasswordResetRequest(unwrapData(response));
}

export async function rejectPasswordResetRequest(id, adminNote = "") {
  const response = await apiRequest(
    `/admin/password-reset-requests/${id}/reject`,
    { method: "POST", body: { admin_note: adminNote } },
  );
  dispatchUpdate();
  return normalizePasswordResetRequest(unwrapData(response));
}

/** Emails a fresh link (new token, a new 60-minute window). The previous link stops working. */
export async function resendResetLink(id) {
  const response = await apiRequest(
    `/admin/password-reset-requests/${id}/resend`,
    { method: "POST" },
  );
  dispatchUpdate();
  return normalizePasswordResetRequest(unwrapData(response));
}

/** A fresh one-time link for the MHO to share another way. The emailed link stops working. */
export async function copyResetLink(id) {
  const response = await apiRequest(
    `/admin/password-reset-requests/${id}/link`,
    { method: "POST" },
  );
  dispatchUpdate();
  return unwrapData(response)?.url || "";
}
