import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import ModalShell, { ModalButton } from "../../common/modals/ModalShell";
import ButtonSpinner from "../../common/loading/ButtonSpinner";
import PermissionReviewSummary from "./PermissionReviewSummary";

/** Modal form of the pre-save review for single-form pages. Mount it only while open so the confirmation starts blank. */
export default function PermissionReviewDialog({ title = "Review permissions", review, details, confirmationLabel, confirmText = "Save", loading = false, onCancel, onConfirm }) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <ModalShell
      title={title}
      subtitle="Confirm what this account will be able to do before it is saved."
      icon={<ShieldAlert size={14} strokeWidth={2.2} />}
      size="xl"
      onClose={onCancel}
      closeDisabled={loading}
      dismissOnBackdrop={!loading}
      dismissOnEscape={!loading}
      footer={
        <>
          <ModalButton onClick={onCancel} disabled={loading}>Cancel</ModalButton>
          <ModalButton variant="primary" primary onClick={onConfirm} disabled={loading || !confirmed}>
            {loading && <ButtonSpinner />}
            {loading ? "Saving..." : confirmText}
          </ModalButton>
        </>
      }
    >
      <PermissionReviewSummary review={review} details={details} confirmed={confirmed} onConfirm={setConfirmed} confirmationLabel={confirmationLabel} />
    </ModalShell>
  );
}
