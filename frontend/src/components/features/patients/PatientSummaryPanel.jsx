import { Link } from "react-router";
import { Lock } from "lucide-react";

import { DottedSpinner } from "../../common/loading/SoftLoadingOverlay";
import SummarySection from "./SummarySection";
import { BACKGROUND_SECTIONS } from "./PatientBackgroundTab";
import { formatPatientAddress } from "./PatientIdentityCard";
import usePatientSummary from "../../../hooks/usePatientSummary";
import { getCurrentUser } from "../../../utils/auth";
import { calculateBmi, formatBmi } from "../../../utils/bmi";
import {
  getCurrentVitalRecord,
  getVitalRecordDate,
  hasVitalValue,
} from "../../../utils/currentPatientVitals";
import {
  formatDisplayValue,
  formatLongDate,
  formatPatientName,
} from "../../../utils/formatters";
import { getRecordDateValue, getServiceTypeLabel } from "../../../utils/healthRecordPrograms";

function joinParts(parts, separator = " · ") {
  return parts.filter(Boolean).join(separator);
}

const STATUS_BADGE = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-700",
};

function StatusBadge({ status }) {
  const key = String(status || "active").toLowerCase();
  return (
    <span className={`inline-flex shrink-0 items-center rounded-sm px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_BADGE[key] || "bg-amber-100 text-amber-800"}`}>
      {key}
    </span>
  );
}

/** Compact vitals grid: today's measurements only, same source as the profile's vitals card. */
function VitalsGrid({ records }) {
  const record = getCurrentVitalRecord(records);
  const bmi = record ? calculateBmi(record.weight, record.height) : null;
  const value = (raw) => (hasVitalValue(raw) ? raw : "—");
  const cells = record ? [
    ["BP", hasVitalValue(record.systolicBp) || hasVitalValue(record.diastolicBp) ? `${value(record.systolicBp)}/${value(record.diastolicBp)}` : "—", "mmHg"],
    ["HR", value(record.pulse), "bpm"],
    ["Temp", value(record.temperature), "°C"],
    ["RR", value(record.respiratoryRate), "/min"],
    ["SpO₂", value(record.spo2), "%"],
    ["Wt", value(record.weight), "kg"],
    ["Ht", value(record.height), "cm"],
    ["BMI", bmi !== null && Number.isFinite(bmi) ? formatBmi(bmi) : "—", "kg/m²"],
  ] : [];

  return (
    <section className="mt-4 border border-gray-200 border-l-4 border-l-red-600 bg-white" aria-labelledby="summary-vitals-title">
      <h3 id="summary-vitals-title" className="border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-700">
        Current Vital Signs
      </h3>
      {record ? (
        <>
          <dl className="grid grid-cols-4">
            {cells.map(([label, reading, unit], index) => (
              <div key={label} className={`min-w-0 px-2 py-2 ${index % 4 !== 3 ? "border-r border-gray-200" : ""} ${index >= 4 ? "border-t border-gray-200" : ""}`}>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
                <dd className="m-0 mt-0.5 truncate text-sm font-bold tabular-nums text-gray-900">{reading}</dd>
                <dd className="m-0 text-[10px] text-gray-500">{unit}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-gray-200 px-3 py-1.5 text-[11px] text-gray-500">
            Recorded {getVitalRecordDate(record).toLocaleString("en-PH", {
              timeZone: "Asia/Manila", month: "short", day: "numeric",
              year: "numeric", hour: "numeric", minute: "2-digit",
            })}
          </p>
        </>
      ) : (
        <p className="px-3 py-3 text-xs text-gray-500">No current vital signs recorded</p>
      )}
    </section>
  );
}

/**
 * Read-only Patient Summary opened from the BHC patient directory. It renders
 * inside the sliding right Drawer, which supplies the title bar and close button.
 */
export default function PatientSummaryPanel({ patientId, basePath = "/bhc" }) {
  const canViewHistory = (getCurrentUser()?.permissions || []).includes("clinical.history");
  const { patient, records, latest, maternalSummary, isPending, error, refetch } = usePatientSummary(patientId);

  if (isPending) {
    return (
      <div role="status" className="flex flex-col items-center justify-center gap-2 px-4 py-16">
        <DottedSpinner label="Loading patient summary" />
        <span className="text-[11px] font-medium text-gray-400">Loading patient summary...</span>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div role="alert" className="px-4 py-12 text-center">
        <p className="text-sm text-gray-700">Unable to load patient summary.</p>
        <button type="button" onClick={() => refetch()} className="mt-2 text-sm font-semibold text-red-700 hover:text-red-800">
          Retry
        </button>
      </div>
    );
  }

  const patientName = formatPatientName(patient, "Unnamed Patient");
  const background = patient.medicalBackground;
  const ageSex = joinParts([patient.age !== "" && patient.age != null ? `${patient.age} yrs` : "", patient.sex], " / ");
  const philHealth = joinParts([patient.philHealthStatus, patient.philHealthNumber]);

  return (
    <div className="patient-summary flex min-h-full flex-col">
      <header className="flex items-start gap-3 border-b border-gray-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="break-words text-base font-bold leading-tight text-gray-900">{patientName}</p>
          <p className="mt-1 break-all text-[11px] font-semibold uppercase tracking-wide text-red-600">Patient ID #{patient.patientId || patientId}</p>
        </div>
        <StatusBadge status={patient.status} />
      </header>

      <div className="flex-1 px-4 pb-4">
        <SummarySection variant="clinical" title="Profile Details" rows={[
          ["Age / Sex", formatDisplayValue(ageSex)],
          ["Date of Birth", formatLongDate(patient.birthDate, "Not recorded")],
          ["Civil Status", formatDisplayValue(patient.civilStatus)],
          ["Occupation", formatDisplayValue(patient.occupation)],
          ["Contact", formatDisplayValue(patient.contactNumber)],
          ["Address", formatDisplayValue(formatPatientAddress(patient))],
          ["PhilHealth", formatDisplayValue(philHealth)],
        ]} />

        {canViewHistory ? (
          <>
            <VitalsGrid records={records} />
            <SummarySection variant="clinical" title={BACKGROUND_SECTIONS.medical.label} rows={[
              ["Current Diseases", background.currentDiseases.length ? <span className="flex flex-wrap gap-1">{background.currentDiseases.map((disease, index) => <span key={index} className="rounded-sm bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">{disease.name}</span>)}</span> : "Not recorded"],
              ["Allergies", background.allergies],
              ["Hospitalizations", background.hospitalizations],
              ["Surgeries", background.surgeries],
            ]} />
            <SummarySection variant="clinical" title={BACKGROUND_SECTIONS.family.label} rows={[
              ["Similar Illness", background.familyHistory.similarIllness],
              ["Chronic Illness", background.familyHistory.chronicIllness],
              ["Hereditary Illness", background.familyHistory.hereditaryIllness],
            ]} />
            <SummarySection variant="clinical" title={BACKGROUND_SECTIONS.social.label} rows={[
              ["Diet", background.personalSocial.diet],
              ["Smoking", background.personalSocial.smoking],
              ["Alcohol", background.personalSocial.alcohol],
              ["Other Notes", background.personalSocial.notes],
            ]} />
            <SummarySection variant="clinical" title="Latest Consultation" rows={latest ? [
              ["Date", formatLongDate(getRecordDateValue(latest))],
              ["Program", getServiceTypeLabel(latest)],
              ["Chief Complaint", latest.chiefComplaint],
              ["Initial Diagnosis", latest.diagnosis],
              ["Medicine / Treatment", latest.medication || latest.treatmentNotes],
              ["Outcome", latest.outcome],
            ] : [["Consultation", "No consultation recorded yet"]]} />
            {maternalSummary && (
              <SummarySection variant="clinical" title="Maternal / Prenatal" rows={[
                ["Latest Immunization", maternalSummary.latestImmunization ? `${maternalSummary.latestImmunization[0].toUpperCase()} · ${formatLongDate(maternalSummary.latestImmunization[1])}` : "No immunization record yet"],
                ["Latest Ultrasound", maternalSummary.latestUltrasoundDate ? formatLongDate(maternalSummary.latestUltrasoundDate) : "No ultrasound record yet"],
              ]} />
            )}
          </>
        ) : (
          <p className="mt-4 flex items-center gap-2 border border-gray-200 border-l-4 border-l-red-600 bg-gray-50 p-3 text-xs text-gray-700">
            <Lock size={14} className="shrink-0" aria-hidden="true" />
            Clinical history is restricted for your role.
          </p>
        )}
      </div>

      <footer className="patient-summary__footer">
        <Link
          to={`${basePath}/patients/${patientId}`}
          className="flex h-9 w-full items-center justify-center bg-[#B91C1C] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#991B1B] active:bg-red-900"
        >
          View Full Profile
        </Link>
      </footer>
    </div>
  );
}
