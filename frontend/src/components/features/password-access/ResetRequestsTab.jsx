import { useMemo, useState } from "react";
import { ConfirmationModal } from "../../common";
import useNotification from "../../../hooks/useNotification";
import {
  approvePasswordResetRequest,
  copyResetLink,
  getPasswordResetRequests,
  rejectPasswordResetRequest,
  resendResetLink,
} from "../../../services/passwordResetService";
import { resetRequestStatus } from "../../../utils/accessRequestStatus";
import { ACTION_CONFIRM } from "../../../utils/accountAccess";
import { copyText } from "../../../utils/clipboard";
import AccessRequestTable, { accessColumns, accountName, menuEntries } from "./AccessRequestTable";
import { ManualCopyDialog } from "./TemporaryPasswordDialog";
import useAccessRows from "./useAccessRows";

/**
 * Reset requests tab: rows from the reset request API, statuses from `resetRequestStatus` (spec F2). Each row's ⋯
 * menu lists the controls its status allows; choosing one opens a confirmation modal.
 */
export default function ResetRequestsTab({ rolesData, toolbarLead = null }) {
  const notify = useNotification();
  const list = useAccessRows(getPasswordResetRequests, notify.error);
  const [pending, setPending] = useState(null); // { action, row } awaiting confirmation
  const [manualCopy, setManualCopy] = useState(null);
  const columns = useMemo(
    () => accessColumns({ rolesData, dateOf: (row) => row.requested_at, dateLabel: "Requested" }),
    [rolesData],
  );

  function menuFor(row) {
    return menuEntries("reset", resetRequestStatus(row).actions, (action) => {
      if (!list.busyId) setPending({ action, row });
    });
  }

  async function confirmAction() {
    const { action, row } = pending;
    if (action === "approve" || action === "decline") await decide(action, row);
    if (action === "resend") await resend(row);
    if (action === "copy") await copy(row);
  }

  async function decide(action, row) {
    const updated = await list.runAction(row, () =>
      action === "approve" ? approvePasswordResetRequest(row.id) : rejectPasswordResetRequest(row.id),
    );
    setPending(null);
    if (action === "approve" && updated) announceDelivery(updated);
    if (action === "decline" && updated) notify.success("Reset request declined.");
  }

  async function resend(row) {
    const updated = await list.runAction(row, () => resendResetLink(row.id));
    setPending(null);
    if (updated) announceDelivery(updated);
  }

  function announceDelivery(updated) {
    if (updated.delivery === "failed") notify.error("The email could not be sent. Use Copy link to share it another way.");
    else notify.success(`Reset link sent to ${updated.email}.`);
  }

  async function copy(row) {
    const url = await list.runAction(row, () => copyResetLink(row.id));
    setPending(null);
    if (url === undefined) return;
    if (!url) {
      notify.error("Could not create a link. Try again.");
      return;
    }
    if (await copyText(url)) notify.success("Link copied. The emailed link no longer works.");
    else setManualCopy({ name: accountName(row), url });
  }

  const confirm = pending ? ACTION_CONFIRM.reset[pending.action] : null;

  return (
    <>
      <AccessRequestTable
        rows={list.rows}
        columns={columns}
        statusOf={(row) => resetRequestStatus(row)}
        menuFor={menuFor}
        emptyMessage="No reset requests yet"
        emptyHint="When staff ask to reset their password, the request appears here for you to approve or decline."
        loading={list.loading}
        error={list.error}
        onRetry={list.refresh}
        filters={list.filters}
        onFiltersChange={list.updateFilters}
        searchPlaceholder="Search by account or email"
        toolbarLead={toolbarLead}
        panelLabelledBy="access-tab-resets"
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

      <ManualCopyDialog
        name={manualCopy?.name}
        url={manualCopy?.url}
        onClose={() => setManualCopy(null)}
      />
    </>
  );
}
