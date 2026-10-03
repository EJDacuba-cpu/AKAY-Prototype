import { Link } from "react-router";
import { ArrowLeft, ShieldAlert, ShieldCheck } from "lucide-react";

import { RefreshingIndicator } from "../../../common";
import { ConsultationButton, ConsultationNotice, useConsultationActions } from "./ConsultationActions";
import { OverviewSection } from "./OverviewSection";
import VitalsTrendList from "./VitalsTrendList";
import { NO_ALLERGY_PATTERN } from "../PatientAlertChips";
import { formatPatientAddress } from "../PatientIdentityCard";
import { formatPatientName } from "../../../../utils/formatters";
import { createPatientForm, formatShortDate, getPatientAge } from "../../../../utils/patientProfile";

const EMPTY = "—";

function initialsOf(form) {
  const letters = [form.firstName, form.lastName]
    .map((part) => String(part || "").trim().charAt(0))
    .filter(Boolean)
    .join("");
  return letters.toUpperCase() || "?";
}

function philHealthText(form) {
  if (!form.philHealthStatus) return EMPTY;
  return form.philHealthNumber ? `${form.philHealthStatus} · ${form.philHealthNumber}` : form.philHealthStatus;
}

function AllergyLine({ allergies }) {
  const text = String(allergies || "").trim();
  const recorded = text && !NO_ALLERGY_PATTERN.test(text);
  const Icon = recorded ? ShieldAlert : ShieldCheck;
  return (
    <p className={`flex items-start gap-2 text-sm ${recorded ? "font-semibold text-red-700" : "text-slate-500"}`}>
      <Icon size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">
        {recorded ? `Allergy: ${text}` : text ? "No known allergies" : "Allergies not recorded"}
      </span>
    </p>
  );
}

/**
 * Left column of the Overview board: who the patient is and the Start /
 * Resume Consultation action (this replaces the profile header on Overview),
 * then demographics and - for roles that may view clinical history - the
 * allergy alert and latest vital signs.
 */
export default function OverviewIdentityColumn({
  patient,
  patientId,
  backPath,
  updating = false,
  canViewHistory = false,
  records = [],
  recordsLoading = false,
}) {
  const { consultation, onStart, startModal } = useConsultationActions(patient, patientId);
  const form = createPatientForm(patient);
  const age = getPatientAge(patient);
  const ageSex = [age !== "" ? `${age} yrs` : "", patient.sex].filter(Boolean).join(" · ");
  const demographics = [
    ["Birthdate", form.birthDate ? formatShortDate(form.birthDate, EMPTY) : EMPTY],
    ["Contact", form.contactNumber || EMPTY],
    ["Address", formatPatientAddress(patient) || EMPTY],
    ["PhilHealth", philHealthText(form)],
    ["NHTS", form.nhtsStatus || EMPTY],
    ["Civil status", form.civilStatus || EMPTY],
  ];

  return (
    <div className="space-y-4">
      <div>
        <Link
          to={backPath}
          aria-label="Back"
          className="-ml-1 inline-flex items-center gap-1 px-1 py-0.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back
        </Link>

        <div className="mt-3 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-slate-800 text-base font-bold tracking-wide text-white"
          >
            {initialsOf(form)}
          </span>
          <div className="min-w-0">
            <h1 className="break-words text-xl font-bold leading-tight text-slate-900 font-sans!">
              {formatPatientName(patient, "Unnamed Patient")}
            </h1>
            <p className="mt-0.5 font-mono text-xs text-slate-500">Patient ID {patient.patientId || patientId}</p>
            {ageSex && <p className="mt-0.5 text-xs tabular-nums text-slate-600">{ageSex}</p>}
          </div>
        </div>

        <div className="mt-4">
          {updating && <RefreshingIndicator label="Updating patient details..." />}
          <ConsultationButton consultation={consultation} onStart={onStart} />
          <ConsultationNotice consultation={consultation} className="mt-2 border" />
          {startModal}
        </div>
      </div>

      <OverviewSection id="overview-demographics" title="Demographics">
        <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
          {demographics.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-slate-500">{label}</dt>
              <dd className="m-0 min-w-0 break-words tabular-nums text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </OverviewSection>

      {canViewHistory && (
        <>
          <OverviewSection id="overview-alerts" title="Alerts & Allergies">
            <AllergyLine allergies={patient.medicalBackground?.allergies} />
          </OverviewSection>
          <VitalsTrendList records={records} isLoading={recordsLoading} />
        </>
      )}
    </div>
  );
}
