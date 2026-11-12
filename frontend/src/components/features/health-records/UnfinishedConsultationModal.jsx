import FormDraftRecoveryDialog from "../../common/drafts/FormDraftRecoveryDialog";

/**
 * Shown only when the user actually tries to start a New Consultation that
 * would duplicate an unfinished draft - never merely on opening the page.
 */
export default function UnfinishedConsultationModal({
  draft,
  selectedPatientName,
  busy = false,
  resuming = false,
  error = "",
  onCancel,
  onDiscardAndStart,
  onContinue,
}) {
  return (
    <FormDraftRecoveryDialog
      open={Boolean(draft)}
      title="You have unfinished work."
      description="Continue where you left off?"
      contextLabel={draft?.patient?.label || selectedPatientName || "Selected patient"}
      lastSavedAt={draft?.lastSavedAt || ""}
      onClose={onCancel}
      busy={busy}
      resuming={resuming}
      error={error}
      onDiscard={onDiscardAndStart}
      onResume={onContinue}
    />
  );
}
