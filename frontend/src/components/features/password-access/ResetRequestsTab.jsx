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
import { copyText } from "../../../utils/clipboard";
import AccessRequestTable, { accessColumns, accountName, formatDateTime, roleLabel } from "./AccessRequestTable";
import { ManualCopyDialog } from "./TemporaryPasswordDialog";
import useAccessRows from "./useAccessRows";

const CONFIRM = {
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

/** Reset requests tab: rows from the reset request API, statuses from `resetRequestStatus` (spec F2). */
export default function ResetRequestsTab({ rolesData, pendingCount, onChanged }) {
  const notify = useNotification();
  const list = useAccessRows(getPasswordResetRequests, onChanged, notify.error);
  const [confirm, setConfirm] = useState(null);
  const [manualCopy, setManualCopy] = useState(null);
  const columns = useMemo(
    () => accessColumns({ rolesData, dateOf: (row) => row.requested_at }),
    [rolesData],
  );

  function handleAction(action, row) {
    if (list.busyId) return;
    if (action === "approve" || action === "decline") setConfirm({ action, row });
    if (action === "resend") void resend(row);
    if (action === "copy") void copy(row);
  }

  async function confirmAction() {
    const { action, row } = confirm;
    const updated = await list.runAction(row, () =>
      action === "approve" ? approvePasswordResetRequest(row.id) : rejectPasswordResetRequest(row.id),
    );
    setConfirm(null);
    if (action === "approve" && updated) announceDelivery(updated);
    if (action === "decline" && updated) notify.success("Reset request declined.");
  }

  async function resend(row) {
    const updated = await list.runAction(row, () => resendResetLink(row.id));
    if (updated) announceDelivery(updated);
  }

  function announceDelivery(updated) {
    if (updated.delivery === "failed") notify.error("The email could not be sent. Use Copy link to share it another way.");
    else notify.success(`Reset link sent to ${updated.email}.`);
  }

  async function copy(row) {
    const url = await list.runAction(row, () => copyResetLink(row.id));
    if (url === undefined) return;
    if (!url) {
      notify.error("Could not create a link. Try again.");
      return;
    }
    if (await copyText(url)) notify.success("Link copied. The emailed link no longer works.");
    else setManualCopy({ name: accountName(row), url });
  }

  return (
    <>
      <AccessRequestTable
        rows={list.rows}
        columns={columns}
        statusOf={(row) => resetRequestStatus(row)}
        onAction={handleAction}
        emptyMessage="No password reset requests found."
        loading={list.loading}
        error={list.error}
        busyId={list.busyId}
        filters={list.filters}
        onFiltersChange={list.updateFilters}
        searchPlaceholder="Search by account or email..."
        needsAction={pendingCount}
        linkExpiry="60 minutes"
        heading="Reset requests"
        description="Review requests and send secure one-time reset links."
        detailTitle="Password reset request"
        detailsOf={(row) => [
          ["Account", accountName(row)],
          ["Email", row.email],
          ["Role", roleLabel(rolesData, row.user)],
          ["Facility", row.user?.facility],
          ["Requested", formatDateTime(row.requested_at)],
          ["Approved", formatDateTime(row.approved_at)],
          ["Declined", formatDateTime(row.rejected_at)],
          ["Completed", formatDateTime(row.completed_at)],
          ["Link expires", formatDateTime(row.expires_at)],
          ["Admin note", row.admin_note],
        ]}
      />

      <ConfirmationModal
        open={Boolean(confirm)}
        title={CONFIRM[confirm?.action]?.title}
        description={CONFIRM[confirm?.action]?.description}
        confirmText={CONFIRM[confirm?.action]?.confirmText}
        cancelText="Cancel"
        loading={Boolean(list.busyId)}
        loadingText="Saving..."
        onCancel={() => !list.busyId && setConfirm(null)}
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
