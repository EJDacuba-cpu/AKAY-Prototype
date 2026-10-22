import { useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { Plus } from "lucide-react";

import { ButtonSpinner, ConfirmationModal } from "../../../common";
import usePatientConsultation from "../../../../hooks/usePatientConsultation";
import StartConsultationModal from "./StartConsultationModal";
import { TextAction } from "./ProfileSection";
import { formatDate } from "../../../../utils/formatters";

/**
 * `onStart` replaces the link (Start Consultation opens the modal instead).
 * Without it, a plain click loads the patient first (spinner) and then opens
 * the workspace; it stays a real link for new-tab and copy-link.
 */
export function ConsultationButton({ consultation, onStart }) {
  const { isPending, isError, discarding, opening, primaryLabel, startPath, open } = consultation;
  const disabled = isPending || isError || discarding || opening;
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
          "Checking consultation..."
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

  // Portaled for the same z-index reason as the discard confirmation.
  const startModal =
    startModalOpen && consultation.needsStartModal
      ? createPortal(
          <StartConsultationModal
            overview={consultation.careOverview}
            onCancel={() => setStartModalOpen(false)}
            onStart={consultation.start}
          />,
          document.body,
        )
      : null;

  return {
    consultation,
    onStart: consultation.needsStartModal ? () => setStartModalOpen(true) : undefined,
    startModal,
  };
}
