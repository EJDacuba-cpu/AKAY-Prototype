const OTHER_WAYS = "Other ways to sign in";

// Every control of each tab, in menu order. The menu always lists all of them; the row's status decides which are active.
const MENU = {
  invite: [
    { label: null, actions: ["resend", "copy"] },
    { label: OTHER_WAYS, actions: ["temporaryPassword"] },
  ],
  reset: [{ label: null, actions: ["approve", "decline", "resend", "copy"] }],
};

/**
 * The ⋯ menu of a Password & Invites row: all controls for the tab, grouped, each `enabled` only when the row's status
 * allows it. `statusActions` is the `actions` list from `inviteStatus` / `resetRequestStatus`; Edit email is never listed
 * (it lives in Users). A row with nothing allowed (Complete, Declined, Cancelled) still gets the menu, all greyed.
 */
export function menuSections(kind, statusActions) {
  const allowed = statusActions || [];
  return (MENU[kind] || []).map((group) => ({
    label: group.label,
    items: group.actions.map((action) => ({ action, enabled: allowed.includes(action) })),
  }));
}

const NEW_LINK = "A new link is emailed to {email}. The previous link stops working.";
const COPY_LINK = "This creates a new one-time link and copies it. The emailed link stops working.";

/** What each control's modal says before it runs. `{email}` is replaced by the caller. */
export const ACTION_CONFIRM = {
  invite: {
    resend: { title: "Resend invite?", description: NEW_LINK, confirmText: "Resend invite" },
    copy: { title: "Copy a new link?", description: COPY_LINK, confirmText: "Copy link" },
    temporaryPassword: {
      title: "Generate a temporary password?",
      description: "Any invite link stops working.",
      confirmText: "Generate temporary password",
    },
  },
  reset: {
    approve: {
      title: "Approve password reset?",
      description: "This will send a secure one-time reset link to the user's email.",
      confirmText: "Approve and send link",
    },
    decline: {
      title: "Decline this reset request?",
      description: "The request will be closed and no link will be sent.",
      confirmText: "Decline",
    },
    resend: { title: "Resend reset link?", description: NEW_LINK, confirmText: "Resend link" },
    copy: { title: "Copy a new link?", description: COPY_LINK, confirmText: "Copy link" },
  },
};

const LABELS = {
  approve: "Approve",
  decline: "Decline",
  copy: "Copy link",
  temporaryPassword: "Generate temporary password",
};

export function actionLabel(kind, action) {
  if (action === "resend") return kind === "invite" ? "Resend invite" : "Resend link";
  return LABELS[action] ?? action;
}
