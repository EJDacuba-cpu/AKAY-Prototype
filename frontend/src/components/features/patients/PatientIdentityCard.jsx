import { MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";

import {
  formatDisplayValue,
  formatLongDate,
  formatPatientName,
} from "../../../utils/formatters";

/**
 * Persistent identity summary beside the chart. The profile header menu
 * opens the existing Patient Information edit form.
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
      <dt className="text-sm text-slate-500">
        {label}
      </dt>
      <dd className="m-0 mt-1 flex items-start gap-1.5 break-words text-sm font-semibold text-slate-900">
        {icon}
        <span className="min-w-0">{value}</span>
      </dd>
    </div>
  );
}

export default function PatientIdentityCard({
  patient = {},
  patientId,
  followUpBadge = null,
}) {
  const address = formatPatientAddress(patient);
  const age = readValue(patient, ["age"]);

  return (
    <Card className="bg-white rounded-2xl border border-slate-100 shadow-sm">
      <CardHeader>
        <p className="break-all text-sm font-normal text-slate-500">
          Patient ID · {patient.patientId || patientId}
        </p>
        <CardTitle className="break-words text-xl leading-snug">
          {formatPatientName(patient, "Unnamed Patient")}
        </CardTitle>
        {followUpBadge && <div className="pt-1">{followUpBadge}</div>}
      </CardHeader>

      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5 border-t border-slate-200 pt-5">
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
            className="col-span-2"
            icon={
              address ? (
                <MapPin size={12} className="mt-0.5 shrink-0 text-[#94A3B8]" />
              ) : null
            }
            value={formatDisplayValue(address, "Not recorded")}
          />
        </dl>
      </CardContent>
    </Card>
  );
}
