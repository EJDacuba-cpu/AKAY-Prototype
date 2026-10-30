import { useMemo, useState } from "react";
import { ConfirmationModal } from "../../common";
import useNotification from "../../../hooks/useNotification";
import {
  getAccountInvites,
  resendInvite,
} from "../../../services/accountInviteService";
import { inviteStatus } from "../../../utils/accessRequestStatus";
import { ACTION_CONFIRM } from "../../../utils/accountAccess";
import AccessRequestTable, { accessColumns, menuEntries } from "./AccessRequestTable";
import useAccessRows from "./useAccessRows";

/**
 * Invites tab: rows from the account invite API, statuses from `inviteStatus` (spec F2).
 * Pending setup can only be completed from the emailed invitation.
 */
export default function InvitesTab({ rolesData, toolbarLead = null }) {
  const notify = useNotification();
  const list = useAccessRows(getAccountInvites, notify.error);
  const [pending, setPending] = useState(null);
  const columns = useMemo(
    () => accessColumns({ rolesData, dateOf: (row) => row.sent_at, dateLabel: "Sent" }),
    [rolesData],
  );

  function menuFor(row) {
    return menuEntries("invite", inviteStatus(row).actions, (action) => {
      if (!list.busyId) setPending({ action, row });
    });
  }

  async function confirmAction() {
    const { action, row } = pending;
    if (action === "resend") await resend(row);
  }

  async function resend(row) {
    const updated = await list.runAction(row, () => resendInvite(row.id));
    setPending(null);
    if (!updated) return;
    if (updated.delivery === "failed") {
      notify.error("The email could not be sent. Correct the address in Users if needed, then resend.");
    } else {
      notify.success(`Invite sent to ${updated.email}.`);
    }
  }

  const confirm = pending ? ACTION_CONFIRM.invite[pending.action] : null;

  return (
    <>
      <AccessRequestTable
        rows={list.rows}
        columns={columns}
        statusOf={(row) => inviteStatus(row)}
        menuFor={menuFor}
        emptyMessage="No invites yet"
        emptyHint="Adding a user in Users emails them an invitation. They cannot sign in until they set a password from that message."
        loading={list.loading}
        error={list.error}
        onRetry={list.refresh}
        filters={list.filters}
        onFiltersChange={list.updateFilters}
        searchPlaceholder="Search by account or email"
        toolbarLead={toolbarLead}
        panelLabelledBy="access-tab-invites"
      />

      <ConfirmationModal
        open={Boolean(pending)}
        title={confirm?.title}
        description={confirm?.description.replace("{email}", pending?.row.email || pending?.row.user?.email || "the account")}
        confirmText={confirm?.confirmText}
        cancelText="Cancel"
        loading={Boolean(list.busyId)}
        loadingText="Working..."
        onCancel={() => !list.busyId && setPending(null)}
        onConfirm={confirmAction}
      />
    </>
  );
}
