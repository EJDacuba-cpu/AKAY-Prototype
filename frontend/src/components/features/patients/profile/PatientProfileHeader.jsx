import { useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Plus } from "lucide-react";

import { ConfirmationModal, RefreshingIndicator } from "../../../common";
import usePatientConsultation from "../../../../hooks/usePatientConsultation";
import { FollowUpStateBadge } from "./FollowUpsAndReferrals";
import { SECTION_LABEL_CLASS, TextAction } from "./ProfileSection";
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

const NO_ALLERGY_PATTERN = /^(none|n\/a|na|nka|nkda|no known.*|no allergies?|-+)$/i;
const MAX_DISEASE_CHIPS = 3;

const CHIP_BASE = "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium";

function Chip({ tone = "neutral", children, title }) {
  const tones = {
    alert: "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
    neutral: "border-slate-200 bg-white text-slate-700",
    program: "border-slate-200 bg-slate-50 text-slate-700",
    muted: "border-transparent px-0 font-normal text-slate-400",
  };
  return (
    <span title={title} className={`${CHIP_BASE} ${tones[tone]}`}>
      {children}
    </span>
  );
}

function ChipGroup({ label, children }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`${SECTION_LABEL_CLASS} mr-0.5`}>{label}</span>
      {children}
    </div>
  );
}

function ConsultationButton({ consultation }) {
  const { isPending, isError, discarding, primaryLabel, startPath } = consultation;
  const disabled = isPending || isError || discarding;
  const className =
    "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-[#B91C1C] px-3.5 text-sm font-semibold text-white transition hover:bg-[#991B1B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40 focus-visible:ring-offset-2";

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        title={isError ? "Unable to check unfinished consultations. Retry from the banner below." : undefined}
        className={`${className} disabled:bg-red-300`}
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

/** Slim status line under the header: an unfinished draft, or a failed draft check. */
function ConsultationNotice({ consultation }) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const { draft, isError, discarding, retry, discard, startPath } = consultation;

  if (isError) {
    return (
      <p role="status" className="mt-3 flex items-center gap-3 border-y border-slate-200 py-2 text-sm text-slate-500">
        Unable to check for an unfinished consultation.
        <TextAction onClick={retry}>Retry</TextAction>
      </p>
    );
  }

  if (!draft) return null;

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-y border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-amber-900">
        <p>
          <span className="font-semibold">Unfinished consultation</span>
          {draft.lastSavedAt ? (
            <span className="text-amber-800/80"> · saved {formatDate(draft.lastSavedAt, "")}</span>
          ) : null}
        </p>
        <div className="flex items-center gap-4">
          <Link
            to={startPath}
            className="text-sm font-semibold text-[#B91C1C] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]/40"
          >
            Resume
          </Link>
          <button
            type="button"
            disabled={discarding}
            onClick={() => setConfirmingDiscard(true)}
            className="text-sm text-slate-500 transition hover:text-red-700 hover:underline disabled:opacity-50"
          >
            {discarding ? "Discarding..." : "Discard"}
          </button>
        </div>
      </div>
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
      />
    </>
  );
}

function AlertChips({ background = {} }) {
  const allergies = String(background.allergies || "").trim();
  const activeDiseases = (Array.isArray(background.currentDiseases) ? background.currentDiseases : [])
    .filter((disease) => disease?.name && String(disease.status || "Active").toLowerCase() === "active");
  const shownDiseases = activeDiseases.slice(0, MAX_DISEASE_CHIPS);
  const hiddenCount = activeDiseases.length - shownDiseases.length;

  return (
    <ChipGroup label="Alerts">
      {!allergies ? (
        <Chip tone="muted">Allergies not recorded</Chip>
      ) : NO_ALLERGY_PATTERN.test(allergies) ? (
        <Chip tone="muted">No known allergies</Chip>
      ) : (
        <Chip tone="alert" title={allergies}>Allergy: {allergies}</Chip>
      )}
      {shownDiseases.map((disease) => (
        <Chip key={disease.name} tone="neutral">{disease.name}</Chip>
      ))}
      {hiddenCount > 0 && <Chip tone="muted">+{hiddenCount} more</Chip>}
    </ChipGroup>
  );
}

function VitalsStrip({ records, isLoading }) {
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
    <section aria-labelledby="latest-vitals-title" aria-busy={isLoading} className="mt-4 border-t border-slate-200 pt-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="latest-vitals-title" className={SECTION_LABEL_CLASS}>Latest Vitals &amp; BMI</h2>
        {when && <span className="text-xs tabular-nums text-slate-400">{when}</span>}
      </div>
      {isLoading ? (
        <p role="status" className="text-sm text-slate-500">Loading vital signs...</p>
      ) : !record ? (
        <p className="text-sm text-slate-500">No vital signs recorded yet.</p>
      ) : (
        <dl className="grid grid-cols-4 gap-x-4 gap-y-3 sm:grid-cols-8">
          {cells.map(([label, reading, unit]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className="m-0 mt-0.5 truncate text-base font-semibold tabular-nums text-slate-900">
                {reading}
                <span className="ml-1 text-[11px] font-normal text-slate-400">{unit}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/**
 * Identity, status and vitals for the patient, replacing the old sidebar
 * cards and action menu. The identity bar (name, ID, Start / Resume
 * Consultation) scrolls away with the page; the alerts, programs, care status
 * and vitals sit beneath it.
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
  const meta = [`Patient ID ${patient.patientId || patientId}`, [ageText, patient.sex].filter(Boolean).join(" / "), address]
    .filter(Boolean)
    .join(" · ");

  return (
    <header>
      <div className="-mx-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-200 px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to={backPath}
            aria-label="Back"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-tight text-slate-900 font-sans!">
              {formatPatientName(patient, "Unnamed Patient")}
            </h1>
            <p className="truncate text-xs tabular-nums text-slate-500">{meta}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {updating && <RefreshingIndicator label="Updating patient details..." />}
          <ConsultationButton consultation={consultation} />
        </div>
      </div>

      <ConsultationNotice consultation={consultation} />

      {canViewHistory && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <AlertChips background={patient.medicalBackground} />
            {programLabels.length > 0 && (
              <ChipGroup label="Programs">
                {programLabels.map((label) => (
                  <Chip key={label} tone="program">{label}</Chip>
                ))}
              </ChipGroup>
            )}
            <ChipGroup label="Care">
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
            </ChipGroup>
          </div>
          <VitalsStrip records={records} isLoading={recordsLoading} />
        </>
      )}
    </header>
  );
}
