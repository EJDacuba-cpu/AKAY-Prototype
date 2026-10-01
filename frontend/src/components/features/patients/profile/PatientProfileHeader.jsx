import { useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Plus } from "lucide-react";

import { ConfirmationModal, RefreshingIndicator } from "../../../common";
import usePatientConsultation from "../../../../hooks/usePatientConsultation";
import { FollowUpStateBadge } from "./FollowUpsAndReferrals";
import StartConsultationModal from "./StartConsultationModal";
import { TextAction } from "./ProfileSection";
import { Chip } from "../PatientAlertChips";
import { formatPatientAddress } from "../PatientIdentityCard";
import { formatDate, formatPatientName } from "../../../../utils/formatters";
import { getPatientAge } from "../../../../utils/patientProfile";
import { buildPatientConsultationPath } from "../../../../utils/consultationRoute";
import { selectionToRoute } from "../../../../utils/startConsultation";

/** `onStart` replaces the link (Start Consultation opens the modal instead). */
function ConsultationButton({ consultation, onStart }) {
  const { isPending, isError, discarding, primaryLabel, startPath } = consultation;
  const disabled = isPending || isError || discarding;
  const className =
    "inline-flex h-9 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-none bg-red-600 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 active:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600/40 focus-visible:ring-offset-2 disabled:bg-gray-300 disabled:text-gray-500";

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        title={isError ? "Unable to check unfinished consultations. Retry from the notice below." : undefined}
        className={className}
      >
        {isPending ? "Checking consultation..." : primaryLabel}
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
    <Link to={startPath} className={className}>
      <Plus size={15} aria-hidden="true" />
      {primaryLabel}
    </Link>
  );
}

/** Status block under the button: an unfinished draft, or a failed draft check. */
function ConsultationNotice({ consultation }) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const { draft, isError, discarding, retry, discard, startPath } = consultation;

  if (isError) {
    return (
      <p role="status" className="flex items-center gap-3 border-t border-gray-200 px-4 py-1.5 text-xs text-gray-600">
        Unable to check for an unfinished consultation.
        <TextAction onClick={retry}>Retry</TextAction>
      </p>
    );
  }

  if (!draft) return null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
        <span className="min-w-0 truncate">
          <span className="font-semibold">Unfinished consultation</span>
          {draft.lastSavedAt ? (
            <span className="text-amber-800"> · saved {formatDate(draft.lastSavedAt, "")}</span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <Link
            to={startPath}
            className="text-xs font-semibold text-red-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600/40"
          >
            Resume
          </Link>
          <button
            type="button"
            disabled={discarding}
            onClick={() => setConfirmingDiscard(true)}
            className="text-xs text-gray-600 transition-colors hover:text-red-700 hover:underline disabled:opacity-50"
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
 * Full-width identity header for the patient profile: name, Patient ID, age,
 * sex, address and one glanceable status badge on the left; the Start /
 * Resume Consultation action on the right. Everything else that used to live
 * in the old identity column (alerts, programs, care, vitals) now lives in
 * the Overview tab's dashboard instead.
 */
export default function PatientProfileHeader({
  patient,
  patientId,
  backPath,
  updating = false,
  canViewHistory = false,
  activeFollowUps = [],
}) {
  const consultationPatientId = patient.id || patientId;
  const consultation = usePatientConsultation(consultationPatientId);
  const navigate = useNavigate();
  const [startModalOpen, setStartModalOpen] = useState(false);
  const age = getPatientAge(patient);
  const ageText = age !== "" ? `${age} yrs` : "";
  const address = patient.barangay || formatPatientAddress(patient);
  const ageSex = [ageText, patient.sex].filter(Boolean).join(" / ");
  const nextFollowUp = activeFollowUps[0] || null;

  return (
    <header className="border border-gray-200 bg-white">
      <div className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            to={backPath}
            aria-label="Back"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-none text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </Link>
          <div className="min-w-0">
            <h1 className="break-words text-base font-bold leading-tight text-gray-900 font-sans!">
              {formatPatientName(patient, "Unnamed Patient")}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-gray-600">
              <span className="font-mono">Patient ID {patient.patientId || patientId}</span>
              {ageSex && <span className="tabular-nums">{ageSex}</span>}
              {address && <span className="break-words">{address}</span>}
              {canViewHistory &&
                (nextFollowUp ? (
                  <FollowUpStateBadge state={nextFollowUp.effectiveState} date={nextFollowUp.dueDate} />
                ) : (
                  <Chip tone="muted">No pending follow-ups</Chip>
                ))}
            </div>
          </div>
        </div>

        <div className="w-full shrink-0 sm:w-auto sm:min-w-[200px]">
          {updating && <RefreshingIndicator label="Updating patient details..." />}
          <ConsultationButton
            consultation={consultation}
            onStart={consultation.needsStartModal ? () => setStartModalOpen(true) : undefined}
          />
        </div>
      </div>

      <ConsultationNotice consultation={consultation} />
      {/* Portaled for the same z-index reason as the discard confirmation. */}
      {startModalOpen &&
        consultation.needsStartModal &&
        createPortal(
          <StartConsultationModal
            overview={consultation.careOverview}
            onCancel={() => setStartModalOpen(false)}
            onStartNew={() => navigate(buildPatientConsultationPath(consultationPatientId))}
            onContinue={({ followUpIds, monitoringIds }) =>
              navigate(selectionToRoute({ patientId: consultationPatientId, followUpIds, monitoringIds }))
            }
          />,
          document.body,
        )}
    </header>
  );
}
