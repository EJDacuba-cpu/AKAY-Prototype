const OTHER_WAYS = "Other ways to sign in";

// The first group is the everyday decisions and link actions, in menu order; temporary password is its own group.
const MAIN_ACTIONS = ["approve", "decline", "resend", "copy"];
const OTHER_ACTIONS = ["temporaryPassword"];

/**
 * The ⋯ menu of a Password & Invites row: which controls the row's status allows, in groups. `statusActions` is
 * the `actions` list from `inviteStatus` / `resetRequestStatus`; Edit email is not offered here (it lives in Users).
 * No groups means the row has no menu.
 */
export function menuSections(statusActions) {
  const allowed = statusActions || [];
  const main = MAIN_ACTIONS.filter((action) => allowed.includes(action));
  const other = OTHER_ACTIONS.filter((action) => allowed.includes(action));

  const sections = [];
  if (main.length) sections.push({ label: null, actions: main });
  if (other.length) sections.push({ label: OTHER_WAYS, actions: other });
  return sections;
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
