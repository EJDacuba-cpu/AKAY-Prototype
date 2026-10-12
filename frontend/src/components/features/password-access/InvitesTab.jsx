import { useMemo, useState } from "react";
import { ConfirmationModal } from "../../common";
import useNotification from "../../../hooks/useNotification";
import {
  copyInviteLink,
  getAccountInvites,
  issueTemporaryPassword,
  resendInvite,
} from "../../../services/accountInviteService";
import { inviteStatus } from "../../../utils/accessRequestStatus";
import { ACTION_CONFIRM } from "../../../utils/accountAccess";
import { copyText } from "../../../utils/clipboard";
import AccessRequestTable, { accessColumns, accountName, menuEntries } from "./AccessRequestTable";
import TemporaryPasswordDialog, { ManualCopyDialog } from "./TemporaryPasswordDialog";
import useAccessRows from "./useAccessRows";

/**
 * Invites tab: rows from the account invite API, statuses from `inviteStatus` (spec F2). Each row's ⋯ menu lists
 * the controls its status allows; choosing one opens a confirmation modal. The email is changed in Users.
 */
export default function InvitesTab({ rolesData, toolbarHeading }) {
  const notify = useNotification();
  const list = useAccessRows(getAccountInvites, notify.error);
  const [pending, setPending] = useState(null); // { action, row } awaiting confirmation
  const [tempPassword, setTempPassword] = useState(null);
  const [manualCopy, setManualCopy] = useState(null);
  const columns = useMemo(
    () => accessColumns({ rolesData, dateOf: (row) => row.sent_at }),
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
    if (action === "copy") await copy(row);
    if (action === "temporaryPassword") await issueTemp(row);
  }

  async function resend(row) {
    const updated = await list.runAction(row, () => resendInvite(row.id));
    setPending(null);
    if (!updated) return;
    if (updated.delivery === "failed") notify.error("The email could not be sent. Use Copy link to share it another way.");
    else notify.success(`Invite sent to ${updated.email}.`);
  }

  async function copy(row) {
    const url = await list.runAction(row, () => copyInviteLink(row.id));
    setPending(null);
    if (url === undefined) return;
    if (!url) {
      notify.error("Could not create a link. Try again.");
      return;
    }
    if (await copyText(url)) notify.success("Link copied. The emailed link no longer works.");
    else setManualCopy({ name: accountName(row), url });
  }

  async function issueTemp(row) {
    const result = await list.runAction(row, () => issueTemporaryPassword(row.id));
    setPending(null);
    if (result?.password) setTempPassword({ name: accountName(row), password: result.password });
  }

  const confirm = pending ? ACTION_CONFIRM.invite[pending.action] : null;

  return (
    <>
      <AccessRequestTable
        rows={list.rows}
        columns={columns}
        statusOf={(row) => inviteStatus(row)}
        menuFor={menuFor}
        emptyMessage="No account invites found."
        loading={list.loading}
        error={list.error}
        filters={list.filters}
        onFiltersChange={list.updateFilters}
        searchPlaceholder="Search by account or email..."
        toolbarHeading={toolbarHeading}
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

      <TemporaryPasswordDialog
        name={tempPassword?.name}
        password={tempPassword?.password}
        onClose={() => setTempPassword(null)}
      />

      <ManualCopyDialog
        name={manualCopy?.name}
        url={manualCopy?.url}
        onClose={() => setManualCopy(null)}
      />
    </>
  );
}
