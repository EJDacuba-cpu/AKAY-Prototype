import ModalShell, { ModalButton } from "../../common/modals/ModalShell";

/**
 * Shown only when the user actually tries to start a New Consultation that
 * would duplicate an unfinished draft - never merely on opening the page.
 */
export default function UnfinishedConsultationModal({
  draft,
  selectedPatientName,
  busy = false,
  error = "",
  onCancel,
  onDiscardAndStart,
  onContinue,
}) {
  const patientLabel = draft?.patient?.label || selectedPatientName || "this patient";
  const patientId = draft?.patient?.id;

  return (
    <ModalShell
      open={Boolean(draft)}
      title="Unfinished Consultation"
      size="sm"
      onClose={onCancel}
      closeDisabled={busy}
      footer={
        <>
          <ModalButton disabled={busy} onClick={onCancel}>
            Cancel
          </ModalButton>
          <ModalButton disabled={busy} onClick={onDiscardAndStart}>
            Discard &amp; Start New
          </ModalButton>
          <ModalButton variant="primary" primary disabled={busy} onClick={onContinue}>
            Continue Draft
          </ModalButton>
        </>
      }
    >
      <div className="space-y-2 text-[13px] text-slate-600">
        <p>You already have an unfinished consultation for</p>
        <p className="font-semibold text-slate-900">
          {patientLabel}
          {patientId ? ` · #${patientId}` : ""}
        </p>
        <p className="text-xs text-slate-400">
          Last edited:{" "}
          {draft?.lastSavedAt
            ? new Date(draft.lastSavedAt).toLocaleString("en-PH")
            : "Not recorded"}
        </p>
        <p>
          Continue that draft, or discard it and start a new consultation for
          this patient?
        </p>
        {error && (
          <p role="alert" className="text-[#DC2626]">
            {error}
          </p>
        )}
      </div>
    </ModalShell>
  );
}
