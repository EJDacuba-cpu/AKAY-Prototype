import { MapPin, Pencil } from "lucide-react";

import {
  formatDisplayValue,
  formatLongDate,
  formatPatientName,
} from "../../../utils/formatters";

/**
 * The patient identity summary at the head of the chart.
 *
 * Overview only. The other tabs open straight onto their own full-detail
 * content, so this card is not repeated above every section - a chart that
 * restates who the patient is on all seven tabs pushes the clinical content
 * below the fold for no gain.
 */

function readValue(patient = {}, keys = [], fallback = "") {
  const key = keys.find((candidate) => {
    const value = patient?.[candidate];
    return value !== null && value !== undefined && String(value).trim() !== "";
  });
  return key ? String(patient[key]).trim() : fallback;
}

/** Purok, barangay and municipality, dropping the parts that are not recorded. */
export function formatPatientAddress(patient = {}) {
  const parts = [
    readValue(patient, ["purok", "purokArea", "purok_area"]),
    readValue(patient, ["barangay"]),
    readValue(patient, ["municipality", "city"]),
  ].filter(Boolean);

  if (parts.length) return parts.join(", ");
  return readValue(patient, ["address", "streetAddress", "street_address"], "");
}

function IdentityField({ label, value, icon = null, className = "" }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 flex items-start gap-1 break-words text-[12.5px] font-semibold text-[#0F172A]">
        {icon}
        <span className="min-w-0">{value}</span>
      </p>
    </div>
  );
}

export default function PatientIdentityCard({
  patient = {},
  patientId,
  followUpBadge = null,
  onEdit,
}) {
  const address = formatPatientAddress(patient);
  const age = readValue(patient, ["age"]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="break-words text-[15px] font-bold text-[#0F172A]">
            {formatPatientName(patient, "Unnamed Patient")}
          </h2>
          <span className="inline-flex shrink-0 rounded-md border border-red-100 bg-red-50 px-2 py-0.5 font-mono text-[10px] font-bold text-[#B91C1C]">
            ID #{patient.patientId || patientId}
          </span>
          {followUpBadge}
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C]"
          >
            <Pencil size={12} />
            Edit Details
          </button>
        )}
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-4 border-t border-slate-100 pt-4 sm:grid-cols-3 lg:grid-cols-6">
        <IdentityField
          label="Sex"
          value={formatDisplayValue(readValue(patient, ["sex"]), "Not recorded")}
        />
        <IdentityField
          label="Age"
          value={age ? `${age} yrs` : "Not recorded"}
        />
        <IdentityField
          label="Birthday"
          value={formatLongDate(
            readValue(patient, [
              "birthDate",
              "birthdate",
              "dateOfBirth",
              "date_of_birth",
            ]),
            "Not recorded",
          )}
        />
        <IdentityField
          label="Occupation"
          value={formatDisplayValue(
            readValue(patient, ["occupation"]),
            "Not recorded",
          )}
        />
        <IdentityField
          label="Civil Status"
          value={formatDisplayValue(
            readValue(patient, ["civilStatus", "civil_status"]),
            "Not recorded",
          )}
        />
        <IdentityField
          label="Address"
          className="sm:col-span-3 lg:col-span-1"
          icon={
            address ? (
              <MapPin size={12} className="mt-0.5 shrink-0 text-[#94A3B8]" />
            ) : null
          }
          value={formatDisplayValue(address, "Not recorded")}
        />
      </dl>
    </section>
  );
}
