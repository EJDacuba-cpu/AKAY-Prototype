import FormDraftRecoveryDialog from "../../common/drafts/FormDraftRecoveryDialog";
import ClinicalConsultationTakeoverDialog from "../health-records/ClinicalConsultationTakeoverDialog";
import { Button } from "../../ui/button";

export default function RhuConsultationRecoveryDialog({ recovery, patientName, onClose }) {
  const { decision, checking, busy, operation, error, ownership, resume, discard, retry, takeover } = recovery;
  const restoring = busy && operation === "resume";
  const draft = decision?.server;

  if (decision && ownership?.occupied) {
    return (
      <ClinicalConsultationTakeoverDialog
        open
        patientName={draft?.patient?.label || patientName || "Selected patient"}
        editorName={ownership.editorName}
        canTakeover={ownership.canTakeover !== false}
        busy={busy}
        takingOver={busy && operation === "takeover"}
        error={error}
        onClose={onClose}
        onTakeover={takeover}
      />
    );
  }

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
    title="You have unfinished work."
    description="Continue where you left off?"
    contextLabel={draft?.patient?.label || patientName || "Selected patient"}
    classification={draft?.classification || ""}
    draftStatus={draft ? (draft.reviewState === "review" ? "Draft needs review" : "Saved draft") : ""}
    lastSavedAt={draft?.lastSavedAt || ""}
    busy={busy}
    resuming={restoring}
    error={error}
    resumeLabel="Resume Consultation"
    cancelLabel={error ? "Cancel" : ""}
    onClose={onClose}
    onResume={decision && !error ? () => resume() : undefined}
    onDiscard={decision && !error ? discard : undefined}
    onRetry={recovery.failedOperation === "resume" ? () => resume() : retry}
  />;
}
