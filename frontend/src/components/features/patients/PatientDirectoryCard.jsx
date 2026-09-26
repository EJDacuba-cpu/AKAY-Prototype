import { Link } from "react-router";
import { MapPin } from "lucide-react";

import { formatDisplayValue, formatPatientName } from "../../../utils/formatters";

function normalizeDate(value) {
  if (!value) return "";

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toISOString().slice(0, 10);
}

function formatDate(value) {
  const normalized = normalizeDate(value);

  if (!normalized) return "Not recorded";

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return "Not recorded";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getPatientSex(patient) {
  if (patient.sex) return formatDisplayValue(patient.sex, "");

  const ageSex = (patient.ageSex || "").toLowerCase();

  if (ageSex.endsWith("/f") || ageSex.includes("female")) return "Female";
  if (ageSex.endsWith("/m") || ageSex.includes("male")) return "Male";

  return "";
}

function getPatientAge(patient) {
  if (patient.age) {
    const value = String(patient.age).trim();
    if (!value) return "";
    return /\b(yr|year|mo|month|day|week)s?\b/i.test(value)
      ? value
      : `${value} yr${value === "1" ? "" : "s"}`;
  }

  const ageSex = String(patient.ageSex || "").trim();
  if (!ageSex) return "";

  const [agePart] = ageSex.split(/[/|]/).map((part) => part.trim());
  if (!agePart || /male|female/i.test(agePart)) return "";

  return agePart;
}

function getPatientAgeSex(patient) {
  return formatDisplayValue(
    patient.ageSex ||
      [patient.age, getPatientSex(patient)].filter(Boolean).join(" / "),
    "Not recorded",
  );
}

function getPatientContact(patient) {
  return formatDisplayValue(
    patient.contact ||
      patient.contactNumber ||
      patient.phone ||
      patient.mobileNumber,
    "No contact recorded",
  );
}

function getPatientLocation(patient) {
  return formatDisplayValue(
    patient.barangay ||
      patient.patientBarangay ||
      patient.assignedRhu ||
      patient.assignedRHU ||
      patient.assignedBhc ||
      patient.assignedBHC ||
      patient.facility ||
      patient.facilityName,
    "",
  );
}

function getBirthDate(patient) {
  return normalizeDate(
    patient.birthDate ||
      patient.birthdate ||
      patient.dateOfBirth ||
      patient.date_of_birth ||
      patient.dob,
  );
}

function getRegisteredDate(patient) {
  return normalizeDate(
    patient.dateRegistered ||
      patient.date_registered ||
      patient.created_at ||
      patient.createdAt ||
      patient.registeredAt,
  );
}

function getPatientDisplayId(patient) {
  return formatDisplayValue(patient.patientId || patient.id, "Not recorded");
}

function DetailField({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#94A3B8]">
        {label}
      </p>
      <p className="truncate text-[11.5px] font-medium text-[#475569]">{value}</p>
    </div>
  );
}

export default function PatientDirectoryCard({ patient, basePath, variant }) {
  const routePatientId = formatDisplayValue(patient.id || patient.patientId, "");
  const patientName = formatPatientName(patient, "Unnamed Patient");
  const displayId = getPatientDisplayId(patient);
  const age = getPatientAge(patient);
  const sex = getPatientSex(patient);
  const ageSex = getPatientAgeSex(patient);
  const contact = getPatientContact(patient);
  const location = getPatientLocation(patient);
  const occupation = formatDisplayValue(patient.occupation, "Not recorded");
  const birthDate = formatDate(getBirthDate(patient));
  const registeredDate = formatDate(getRegisteredDate(patient));
  // Sex and age head the card on their own now; the barangay moved down to the
  // pinned line, so it is no longer part of this joined string.
  const sexAge =
    [sex, age].filter(Boolean).join(` ${String.fromCharCode(183)} `) || ageSex;

  if (variant === "clinical") {
    return (
      <article className="clinical-patient">
        <header className="clinical-patient__identity">
          <h3 className="clinical-patient__name">{patientName}</h3>
          <p className="clinical-patient__id">Patient ID #{displayId}</p>
        </header>
        <dl className="clinical-patient__fields">
          {[
            ["Age", formatDisplayValue(age, "Not recorded")],
            ["Barangay", formatDisplayValue(location, "Not recorded")],
            ["Sex", formatDisplayValue(sex, "Not recorded")],
            ["Occupation", occupation],
            ["Date of birth", birthDate],
            ["Contact", contact],
            ["Registered", registeredDate],
          ].map(([label, value]) => (
            <div
              key={label}
              className={label === "Registered" ? "clinical-patient__registered" : undefined}
            >
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <footer className="clinical-patient__footer">
          <Link
            to={`${basePath}/patients/${routePatientId}`}
            className="clinical-patient__open"
            aria-label={`Open Profile: ${patientName}, ID ${displayId}`}
          >
            Open Profile
          </Link>
        </footer>
      </article>
    );
  }

  return (
    <article className="group flex flex-col rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-sm shadow-black/[0.015] transition-all duration-200 hover:-translate-y-0.5 hover:border-red-100 hover:shadow-md">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <h3 className="min-w-0 truncate text-[13px] font-bold leading-5 text-[#0F172A]">
          {patientName}
        </h3>
        <span className="shrink-0 rounded-md border border-red-100 bg-white px-2 py-0.5 font-mono text-[10px] font-semibold text-[#B91C1C]">
          ID #{displayId}
        </span>
      </div>

      <div className="mt-2.5 grid min-w-0 grid-cols-2 gap-x-3 gap-y-2">
        <div className="min-w-0 space-y-1.5">
          <p className="truncate text-[11.5px] font-semibold text-[#0F172A]">
            {sexAge}
          </p>
          {location && (
            <p className="flex min-w-0 items-start gap-1 text-[11px] font-medium text-[#64748B]">
              <MapPin size={12} className="mt-px shrink-0 text-[#94A3B8]" />
              <span className="min-w-0">{location}</span>
            </p>
          )}
        </div>

        <div className="min-w-0 space-y-2">
          <DetailField label="Date of Birth" value={birthDate} />
          <DetailField label="Contact" value={contact} />
          <DetailField label="Registered" value={registeredDate} />
        </div>
      </div>

      <Link
        to={`${basePath}/patients/${routePatientId}`}
        className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg bg-[#B91C1C] px-3 text-[11.5px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B]"
      >
        Open Profile
      </Link>
    </article>
  );
}
