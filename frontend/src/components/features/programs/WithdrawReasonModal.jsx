import { useState } from "react";

import ModalShell, { ModalButton } from "../../common/modals/ModalShell";
import ButtonSpinner from "../../common/loading/ButtonSpinner";
import FormTextarea from "../../common/forms/FormTextarea";

/** Shared by the patient profile's Community Programs section and the BHC Programs page's Participants tab. */
export default function WithdrawReasonModal({ open, submitting = false, onConfirm, onCancel }) {
  const [reason, setReason] = useState("");

  return (
    <ModalShell
      open={open}
      title="Withdraw from Program"
      size="sm"
      onClose={submitting ? undefined : onCancel}
      closeDisabled={submitting}
      dismissOnBackdrop={!submitting}
      dismissOnEscape={!submitting}
      footer={
        <>
          <ModalButton onClick={onCancel} disabled={submitting}>
            Cancel
          </ModalButton>
          <ModalButton
            variant="destructive"
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            disabled={submitting || !reason.trim()}
          >
            {submitting && <ButtonSpinner />}
            {submitting ? "Withdrawing..." : "Withdraw"}
          </ModalButton>
        </>
      }
    >
      <FormTextarea
        label="Reason"
        name="reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Why is the patient being withdrawn from this program?"
      />
    </ModalShell>
  );
}
