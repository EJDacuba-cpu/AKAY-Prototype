import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { Plus } from "lucide-react";

import { ButtonSpinner, ConfirmationModal } from "../../../common";
import usePatientConsultation from "../../../../hooks/usePatientConsultation";
import StartConsultationModal from "./StartConsultationModal";
import { TextAction } from "./ProfileSection";
import { formatDate } from "../../../../utils/formatters";
import FormDraftRecoveryDialog from "../../../common/drafts/FormDraftRecoveryDialog";
import ClinicalConsultationTakeoverDialog from "../../health-records/ClinicalConsultationTakeoverDialog";
import {
  ownershipFromDraft,
  ownershipFromProblem,
  isEditorLeaseConflict,
} from "../../../../utils/clinicalConsultationLease";

/**
 * `onStart` replaces the link (Start Consultation opens the confirmation
 * modal). Resume of an unfinished draft stays a real link for new-tab and
 * copy-link; a plain click still loads the patient first.
 */
export function ConsultationButton({ consultation, onStart }) {
  const { isPending, isError, discarding, opening, primaryLabel, startPath, open } = consultation;
  const disabled = isPending || discarding || opening;
  const className =
    "inline-flex h-10 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-brand-600 px-4 text-[13px] font-medium text-white shadow-xs transition-colors hover:bg-brand-700 active:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50 focus-visible:ring-offset-2 disabled:bg-neutral-100 disabled:text-neutral-400 disabled:shadow-none";

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        title={isError ? "Unable to check unfinished consultations. Retry from the notice below." : undefined}
        className={className}
      >
        {opening ? (
          <>
            <ButtonSpinner />
            Opening consultation...
          </>
        ) : isPending ? (
          <><ButtonSpinner />Checking...</>
        ) : (
          primaryLabel
        )}
      </button>
    );
  }

  if (onStart) {
    return (
      <button type="button" onClick={onStart} className={className}>
        <Plus size={15} aria-hidden="true" />
        {primaryLabel}
      </button>
    );
  }

  return (
    <Link
      to={startPath}
      className={className}
      onClick={(event) => {
        const plainClick =
          event.button === 0 && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
        if (!plainClick) return;
        event.preventDefault();
        open();
      }}
    >
      <Plus size={15} aria-hidden="true" />
      {primaryLabel}
    </Link>
  );
}

/** Status block under the button: an unfinished draft, or a failed draft check. */
export function ConsultationNotice({ consultation }) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const { draft, isError, discarding, retry, discard, startPath } = consultation;
  if (consultation.recoveryEnabled) return null;

  if (isError) {
    return (
      <p role="status" className="mt-3 flex items-center gap-3 text-xs text-neutral-600">
        Unable to check for an unfinished consultation.
        <TextAction onClick={retry}>Retry</TextAction>
      </p>
    );
  }

  if (!draft) return null;

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-700">
        <span className="min-w-0 truncate">
          <span className="font-semibold">Unfinished consultation</span>
          {draft.lastSavedAt ? (
            <span className="text-brand-700/80"> · saved {formatDate(draft.lastSavedAt, "")}</span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <Link
            to={startPath}
            className="rounded-md text-xs font-semibold text-ink-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50"
          >
            Resume
          </Link>
          <button
            type="button"
            disabled={discarding}
            onClick={() => setConfirmingDiscard(true)}
            className="text-xs text-neutral-600 transition-colors hover:text-alert-700 hover:underline disabled:opacity-50"
          >
            {discarding ? "Discarding..." : "Discard"}
          </button>
        </span>
      </div>
      {/* Portaled: the profile header sits above content that scrolls under it in places, which would trap the modal's z-index. */}
      {createPortal(
        <ConfirmationModal
          open={confirmingDiscard}
          title="Discard unfinished consultation?"
          description="The saved draft for this patient will be deleted. This cannot be undone."
          confirmText="Discard Draft"
          loading={discarding}
          loadingText="Discarding..."
          onCancel={() => setConfirmingDiscard(false)}
          onConfirm={async () => {
            try {
              await discard();
            } catch {
              // The mutation's onError already toasted; keep the draft visible.
            } finally {
              setConfirmingDiscard(false);
            }
          }}
        />,
        document.body,
      )}
    </>
  );
}

/**
 * Start / Resume Consultation state for the profile header: the consultation
 * query, the start-modal open state and the portaled modal. The caller places
 * the button, notice and modal where its layout needs them.
 */
export function useConsultationActions(patient, patientId) {
  const consultationPatientId = patient.id || patientId;
  const consultation = usePatientConsultation(consultationPatientId);
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [recovery, setRecovery] = useState(null);
  const [ownership, setOwnership] = useState(null);
  const [checkingRecovery, setCheckingRecovery] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryOperation, setRecoveryOperation] = useState("");
  const [failedOperation, setFailedOperation] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const operationGate = useRef(false);
  const patientLabel = patient.fullName || patient.name || "Selected patient";

  function clearRecoveryDecision() {
    setRecovery(null);
    setOwnership(null);
    setRecoveryError("");
    setFailedOperation("");
  }

  async function checkBeforeStarting() {
    if (operationGate.current) return;
    operationGate.current = true;
    setCheckingRecovery(true);
    setRecoveryError("");
    setFailedOperation("");
    setOwnership(null);
    setRecoveryBusy(false);
    setRecoveryOperation("");
    try {
      const entry = await consultation.checkRecovery();
      setRecovery(entry);
      setOwnership(ownershipFromDraft(entry?.server, consultation.currentUserId));
      if (!entry) setStartModalOpen(true);
    } catch (error) {
      setRecoveryError(error?.message || "Unable to check unfinished work. Retry while online.");
    } finally {
      setCheckingRecovery(false);
      operationGate.current = false;
    }
  }

  async function runRecovery(kind, note) {
    if (operationGate.current || !recovery) return;
    if (kind !== "takeover" && ownership?.occupied) return;
    operationGate.current = true;
    setRecoveryBusy(true);
    setRecoveryOperation(kind);
    setFailedOperation("");
    setRecoveryError("");
    try {
      if (kind === "discard") {
        await consultation.discardRecovery(recovery);
        clearRecoveryDecision();
        setStartModalOpen(true);
      } else if (kind === "takeover") {
        await consultation.takeoverRecovery(recovery, note);
        clearRecoveryDecision();
      } else {
        await consultation.resumeRecovery(recovery);
        clearRecoveryDecision();
      }
    } catch (error) {
      const lease = ownershipFromProblem(error) || (isEditorLeaseConflict(error)
        ? ownershipFromDraft(recovery?.server, consultation.currentUserId)
        : null);
      if (lease?.occupied) {
        setOwnership({ ...lease, canTakeover: lease.canTakeover ?? recovery?.server?.canEdit !== false });
        setFailedOperation("");
        setRecoveryError("");
      } else {
        setFailedOperation(kind);
        setRecoveryError(
          kind === "discard"
            ? (error?.message || "Unable to discard this consultation.")
            : (error?.message || "We couldn't restore your unfinished work. Please try again."),
        );
      }
    } finally {
      operationGate.current = false;
      setRecoveryBusy(false);
      setRecoveryOperation("");
    }
  }

  // Portaled for the same z-index reason as the discard confirmation.
  const recoveryModal = consultation.recoveryEnabled && recovery
    ? createPortal(ownership?.occupied
      ? <ClinicalConsultationTakeoverDialog
          open
          patientName={recovery.server?.patient?.label || patientLabel}
          editorName={ownership.editorName}
          canTakeover={ownership.canTakeover !== false}
          busy={recoveryBusy}
          takingOver={recoveryBusy && recoveryOperation === "takeover"}
          error={recoveryError}
          onClose={clearRecoveryDecision}
          onTakeover={(note) => runRecovery("takeover", note)}
        />
      : <FormDraftRecoveryDialog
        open
        title="You have unfinished work."
        contextLabel={patientLabel}
        lastSavedAt={recovery?.server?.lastSavedAt}
        busy={recoveryBusy}
        resuming={recoveryBusy && recoveryOperation === "resume"}
        error={recoveryError}
        resumeLabel="Resume Consultation"
        cancelLabel={recoveryError ? "Cancel" : ""}
        description="Continue where you left off?"
        classification={recovery.server?.classification || ""}
        draftStatus={recovery.server?.reviewState === "review" ? "Draft needs review" : "Saved draft"}
        onClose={clearRecoveryDecision}
        onResume={!recoveryError ? () => runRecovery("resume") : undefined}
        onDiscard={!recoveryError ? () => runRecovery("discard") : undefined}
        onRetry={failedOperation === "resume" ? () => runRecovery("resume") : checkBeforeStarting}
      />, document.body)
    : null;
  const lookupError = consultation.recoveryEnabled && recoveryError && !recovery
    ? <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-alert-200 bg-alert-50 p-3 text-sm text-alert-700">
        <span>{recoveryError}</span>
        <button type="button" disabled={checkingRecovery} onClick={checkBeforeStarting} className="font-semibold underline">Retry</button>
        <button type="button" disabled={checkingRecovery} onClick={() => setRecoveryError("")} className="font-semibold underline">Cancel</button>
      </div> : null;
  const startModal = recoveryModal || lookupError || (
    startModalOpen && consultation.needsStartModal
      ? createPortal(
          <StartConsultationModal
            overview={consultation.careOverview}
            onCancel={() => setStartModalOpen(false)}
            onStart={async (choices) => {
              try { await consultation.start(choices); }
              catch (error) {
                if (!error.recoveryEntry) throw error;
                setRecovery(error.recoveryEntry);
                setStartModalOpen(false);
              }
            }}
          />,
          document.body,
        )
      : null);

  return {
    consultation: { ...consultation, isPending: consultation.isPending || checkingRecovery, discarding: consultation.discarding || recoveryBusy },
    onStart: consultation.recoveryEnabled ? checkBeforeStarting : consultation.needsStartModal ? () => setStartModalOpen(true) : undefined,
    startModal,
  };
}
