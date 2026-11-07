import FormDraftRecoveryDialog from "../../common/drafts/FormDraftRecoveryDialog";
import { Button } from "../../ui/button";

export default function RhuConsultationRecoveryDialog({ recovery, patientName, onClose }) {
  const { decision, checking, busy, operation, error, resume, discard, retry } = recovery;
  const restoring = busy && operation === "resume";
  const draft = decision?.server || decision?.local?.record?.draft;
  if (!decision) {
    if (checking || !error) return null;
    return <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-alert-200 bg-alert-50 p-3 text-sm text-alert-700">
      <span>{error}</span>
      <Button type="button" variant="secondary" onClick={retry}>Retry</Button>
      <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
    </div>;
  }
  return <FormDraftRecoveryDialog
    open
    title="Unfinished Consultation"
    description="An unfinished consultation was found for this patient. Choose how you want to continue."
    contextLabel={draft?.patient?.label || patientName || "Selected patient"}
    classification={draft?.classification || ""}
    draftStatus={draft ? (decision.local && !decision.server ? "Saved on this device" : draft.reviewState === "review" ? "Draft needs review" : "Saved draft") : ""}
    lastSavedAt={decision?.local?.savedAt || draft?.lastSavedAt || ""}
    deviceOnly={Boolean(decision?.local) && !decision?.server}
    busy={busy}
    resuming={restoring}
    error={error}
    resumeLabel="Resume Consultation"
    cancelLabel={error ? "Cancel" : ""}
    onClose={onClose}
    onResume={decision && !decision.conflict && !error ? () => resume() : undefined}
    onResumeDevice={decision?.conflict && !decision.locked ? () => resume("device") : undefined}
    onResumeServer={decision?.conflict ? () => resume("server") : undefined}
    onDiscard={decision && !error ? discard : undefined}
    onRetry={recovery.failedOperation === "resume" ? () => resume() : retry}
  />;
}
