import { useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { ArrowLeft, Plus } from "lucide-react";

import { ConfirmationModal, RefreshingIndicator } from "../../../common";
import usePatientConsultation from "../../../../hooks/usePatientConsultation";
import { FollowUpStateBadge } from "./FollowUpsAndReferrals";
import { SECTION_LABEL_CLASS, TextAction } from "./ProfileSection";
import PatientAlertChips, { Chip } from "../PatientAlertChips";
import { formatPatientAddress } from "../PatientIdentityCard";
import { calculateBmi, formatBmi } from "../../../../utils/bmi";
import {
  getLatestVitalRecord,
  getVitalRecordDate,
  hasVitalValue,
  isVitalRecordToday,
} from "../../../../utils/currentPatientVitals";
import { formatDate, formatPatientName } from "../../../../utils/formatters";
import { getPatientAge } from "../../../../utils/patientProfile";

/** One labelled block of the panel, separated from the previous by a hairline. */
function PanelSection({ id, label, meta, children }) {
  return (
    <section aria-labelledby={`${id}-title`} className="border-t border-gray-200 px-4 py-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id={`${id}-title`} className={SECTION_LABEL_CLASS}>{label}</h2>
        {meta ? <span className="text-xs tabular-nums text-gray-500">{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

function ConsultationButton({ consultation }) {
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
      <p role="status" className="flex items-center gap-3 border-t border-gray-200 px-4 py-2 text-sm text-gray-600">
        Unable to check for an unfinished consultation.
        <TextAction onClick={retry}>Retry</TextAction>
      </p>
    );
  }

  if (!draft) return null;

  return (
    <>
      <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        <p>
          <span className="font-semibold">Unfinished consultation</span>
          {draft.lastSavedAt ? (
            <span className="text-amber-800"> · saved {formatDate(draft.lastSavedAt, "")}</span>
          ) : null}
        </p>
        <div className="mt-1 flex items-center gap-4">
          <Link
            to={startPath}
            className="text-sm font-semibold text-red-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600/40"
          >
            Resume
          </Link>
          <button
            type="button"
            disabled={discarding}
            onClick={() => setConfirmingDiscard(true)}
            className="text-sm text-gray-600 transition-colors hover:text-red-700 hover:underline disabled:opacity-50"
          >
            {discarding ? "Discarding..." : "Discard"}
          </button>
        </div>
      </div>
      {/* Portaled: the profile aside is `sticky`, which would trap the modal's z-index below the sidebar/topbar. */}
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

function VitalsGrid({ records, isLoading }) {
  const record = getLatestVitalRecord(records);
  const bmi = record ? calculateBmi(record.weight, record.height) : null;
  const recordedAt = record ? getVitalRecordDate(record) : null;
  const value = (raw) => (hasVitalValue(raw) ? raw : "—");
  const cells = record
    ? [
        ["BP", hasVitalValue(record.systolicBp) || hasVitalValue(record.diastolicBp) ? `${value(record.systolicBp)}/${value(record.diastolicBp)}` : "—", "mmHg"],
        ["Pulse", value(record.pulse), "bpm"],
        ["Temp", value(record.temperature), "°C"],
        ["Resp", value(record.respiratoryRate), "/min"],
        ["SpO₂", value(record.spo2), "%"],
        ["Weight", value(record.weight), "kg"],
        ["Height", value(record.height), "cm"],
        ["BMI", bmi !== null && Number.isFinite(bmi) ? formatBmi(bmi) : "—", "kg/m²"],
      ]
    : [];
  const when = recordedAt
    ? `${isVitalRecordToday(record) ? "Today, " : ""}${recordedAt.toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        ...(isVitalRecordToday(record) ? {} : { month: "short", day: "numeric", year: "numeric" }),
        hour: "numeric",
        minute: "2-digit",
      })}`
    : "";

  return (
    <PanelSection id="latest-vitals" label="Latest Vitals & BMI" meta={when}>
      <div aria-busy={isLoading}>
        {isLoading ? (
          <p role="status" className="text-sm text-gray-600">Loading vital signs...</p>
        ) : !record ? (
          <p className="text-sm text-gray-600">No vital signs recorded yet.</p>
        ) : (
          <dl className="grid grid-cols-2 border border-gray-200">
            {cells.map(([label, reading, unit], index) => (
              <div
                key={label}
                className={`min-w-0 px-2 py-1.5 ${index % 2 === 0 ? "border-r border-gray-200" : ""} ${index >= 2 ? "border-t border-gray-200" : ""}`}
              >
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">{label}</dt>
                <dd className="m-0 truncate text-base font-bold tabular-nums text-gray-900">
                  {reading}
                  <span className="ml-1 text-[11px] font-normal text-gray-500">{unit}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </PanelSection>
  );
}

/**
 * Left identity panel of the patient profile: identity, the Start / Resume
 * Consultation controls, then alerts, programs, care status and latest vitals.
 * A flat bordered column (no shadow, square corners), like the reference's
 * profile panel. Sections that need clinical history stay gated by
 * `canViewHistory`, exactly as before.
 */
export default function PatientProfileHeader({
  patient,
  patientId,
  backPath,
  updating = false,
  canViewHistory = false,
  records = [],
  recordsLoading = false,
  programLabels = [],
  followUps = [],
  activeFollowUps = [],
  openReferralCount = 0,
}) {
  const consultation = usePatientConsultation(patient.id || patientId);
  const age = getPatientAge(patient);
  const ageText = age !== "" ? `${age} yrs` : "";
  const address = patient.barangay || formatPatientAddress(patient);
  const nextFollowUp = activeFollowUps[0] || null;
  const ageSex = [ageText, patient.sex].filter(Boolean).join(" / ");

  return (
    <header className="border border-gray-200 bg-white">
      <div className="flex items-start gap-3 px-4 py-3">
        <Link
          to={backPath}
          aria-label="Back"
          className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-none text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <h1 className="break-words text-lg font-bold leading-tight text-gray-900 font-sans!">
            {formatPatientName(patient, "Unnamed Patient")}
          </h1>
          <p className="mt-1 break-all font-mono text-xs text-gray-600">
            Patient ID {patient.patientId || patientId}
          </p>
          {ageSex && <p className="mt-0.5 text-xs tabular-nums text-gray-600">{ageSex}</p>}
          {address && <p className="mt-0.5 break-words text-xs text-gray-600">{address}</p>}
        </div>
      </div>

      <div className="space-y-2 px-4 pb-3">
        {updating && <RefreshingIndicator label="Updating patient details..." />}
        <ConsultationButton consultation={consultation} />
      </div>

      <ConsultationNotice consultation={consultation} />

      {canViewHistory && (
        <>
          <PanelSection id="profile-alerts" label="Alerts">
            <PatientAlertChips background={patient.medicalBackground} />
          </PanelSection>
          {programLabels.length > 0 && (
            <PanelSection id="profile-programs" label="Programs">
              <div className="flex flex-wrap items-center gap-1.5">
                {programLabels.map((label) => (
                  <Chip key={label} tone="program">{label}</Chip>
                ))}
              </div>
            </PanelSection>
          )}
          <PanelSection id="profile-care" label="Care">
            <div className="flex flex-wrap items-center gap-1.5">
              {nextFollowUp && (
                <FollowUpStateBadge state={nextFollowUp.effectiveState} date={nextFollowUp.dueDate} />
              )}
              {activeFollowUps.length > 1 && <Chip tone="muted">+{activeFollowUps.length - 1} more follow-ups</Chip>}
              {openReferralCount > 0 && (
                <Chip tone="neutral">
                  {openReferralCount} open referral{openReferralCount === 1 ? "" : "s"}
                </Chip>
              )}
              {!nextFollowUp && openReferralCount === 0 && (
                <Chip tone="muted">{followUps.length ? "Nothing pending" : "No follow-ups"}</Chip>
              )}
            </div>
          </PanelSection>
          <VitalsGrid records={records} isLoading={recordsLoading} />
        </>
      )}
    </header>
  );
}
