/**
 * One vocabulary for Password & Invites (spec F1/F2): Pending, In progress, Complete, Cancelled.
 * The status, reason and row actions are computed from the stored fields of a row; nothing here
 * calls the API. The backend computes the same four statuses as `display_status`.
 */

export const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "complete", label: "Complete" },
  { value: "cancelled", label: "Cancelled" },
];

const LABELS = Object.fromEntries(STATUS_OPTIONS.map((option) => [option.value, option.label]));

function result(status, reason, actions = []) {
  return { status, label: LABELS[status], reason, actions };
}

/** "41 h" from an hour up, "25 min" below it; a time already past reads "0 min", never negative. */
function timeLeft(expiresAt, now) {
  if (!expiresAt) return null;
  const minutes = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 60000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h` : `${minutes} min`;
}

function withExpiry(text, expiresAt, now) {
  const left = timeLeft(expiresAt, now);
  return left ? `${text} · expires in ${left}` : text;
}

/** A missing user counts as inactive, as it does on the backend. */
const isInactive = (row) => row.user?.status !== "active";

const RESET_COMPLETED_REASONS = {
  invite: "Completed through the account invite",
  temporary_password: "Completed through a temporary password",
};

/** Reset requests, spec F2 (first table). */
export function resetRequestStatus(row, now = new Date()) {
  if (row.status === "completed") {
    return result("complete", RESET_COMPLETED_REASONS[row.completed_via] ?? "Password set");
  }
  if (isInactive(row)) return result("cancelled", "Account deactivated");

  switch (row.status) {
    case "pending":
      return result("pending", "Awaiting approval", ["approve", "decline"]);
    case "rejected":
      return result("cancelled", "Declined");
    case "expired":
      return result("pending", "Link expired", ["resend"]);
    case "approved":
      if (row.delivery === "failed") return result("pending", "Email not sent", ["resend", "copy"]);
      // Approved before delivery was recorded (delivery null) counts as sent.
      return result(
        "in_progress",
        withExpiry(row.delivery === "copied" ? "Link shared by the MHO" : "Link sent", row.expires_at, now),
        ["resend", "copy"],
      );
    default:
      return result("pending", "Awaiting approval", ["approve", "decline"]);
  }
}

const INVITE_COMPLETED_REASONS = {
  temporary_password: "Temporary password changed",
  reset: "Completed through a password reset",
};

/** Invites, spec F2 (second table). */
export function inviteStatus(row, now = new Date()) {
  if (row.status === "completed") {
    return result("complete", INVITE_COMPLETED_REASONS[row.completed_via] ?? "Password set");
  }
  if (isInactive(row)) return result("cancelled", "Account deactivated");

  switch (row.status) {
    case "expired":
      return result("pending", "Link expired", ["resend", "editEmail", "temporaryPassword"]);
    case "temporary": {
      const expiresAt = row.temp_password_expires_at;
      if (expiresAt && new Date(expiresAt).getTime() <= now.getTime()) {
        return result("pending", "Temporary password expired", ["resend", "temporaryPassword"]);
      }
      return result("in_progress", "Temporary password issued", ["temporaryPassword"]);
    }
    default: {
      const actions = ["resend", "copy", "editEmail", "temporaryPassword"];
      if (row.delivery === "failed") return result("pending", "Email not sent", actions);
      return result(
        "in_progress",
        withExpiry(row.delivery === "copied" ? "Link shared by the MHO" : "Link sent", row.expires_at, now),
        actions,
      );
    }
  }
}
