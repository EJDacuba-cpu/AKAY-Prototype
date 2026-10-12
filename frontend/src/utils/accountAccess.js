import { inviteStatus, resetRequestStatus } from "./accessRequestStatus.js";

/** Confirmation copy for the two reset request decisions (shown inline in Account details and in the list menu). */
export const RESET_CONFIRM = {
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
};

const PRIMARY_ACTIONS = ["approve", "resend"];
const LINK_ACTIONS = ["decline", "copy", "editEmail"];

function toBlock(kind, row, status) {
  const { actions } = status;
  return {
    kind,
    row,
    status: { status: status.status, label: status.label, reason: status.reason },
    primary: PRIMARY_ACTIONS.find((action) => actions.includes(action)) ?? null,
    links: LINK_ACTIONS.filter((action) => actions.includes(action)),
    fallback: actions.includes("temporaryPassword") ? "temporaryPassword" : null,
  };
}

/**
 * What the Access section of Account details shows: one block per open invite or reset request (invite first),
 * each with its status, one primary action, quiet link actions and the temporary password fallback. Which actions
 * exist comes from `inviteStatus` / `resetRequestStatus`; nothing here adds one. `message` replaces the blocks
 * when the account is deactivated or has neither an invite nor a reset request.
 */
export function accountAccessBlocks({ account, invite, resetRequest }, now = new Date()) {
  if (account?.status === "Inactive") {
    return { message: "Account deactivated. No access actions.", blocks: [] };
  }

  const blocks = [];
  if (invite) blocks.push(toBlock("invite", invite, inviteStatus(invite, now)));
  if (resetRequest) blocks.push(toBlock("reset", resetRequest, resetRequestStatus(resetRequest, now)));

  return blocks.length
    ? { message: null, blocks }
    : { message: "Password set by the user.", blocks: [] };
}

const LABELS = {
  approve: "Approve",
  decline: "Decline",
  copy: "Copy link",
  editEmail: "Edit email",
  temporaryPassword: "Generate temporary password",
};

export function actionLabel(kind, action) {
  if (action === "resend") return kind === "invite" ? "Resend invite" : "Resend link";
  return LABELS[action] ?? action;
}
