import { Link } from "react-router";
import {
  CalendarDays,
  Eye,
  FilePlus2,
  MapPin,
  Pencil,
  Phone,
} from "lucide-react";

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

export default function PatientDirectoryCard({ patient, basePath }) {
  const routePatientId = formatDisplayValue(patient.id || patient.patientId, "");
  const patientName = formatPatientName(patient, "Unnamed Patient");
  const displayId = getPatientDisplayId(patient);
  const age = getPatientAge(patient);
  const sex = getPatientSex(patient);
  const ageSex = getPatientAgeSex(patient);
  const contact = getPatientContact(patient);
  const location = getPatientLocation(patient);
  const registeredDate = formatDate(getRegisteredDate(patient));
  const metadata = [sex, age || (!sex ? ageSex : ""), location]
    .filter((value) => value && value !== "Not recorded")
    .join(` ${String.fromCharCode(8226)} `);

  return (
    <article className="group flex min-h-[132px] flex-col rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-sm shadow-black/[0.015] transition-all duration-200 hover:-translate-y-0.5 hover:border-red-100 hover:shadow-md">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-bold leading-5 text-[#0F172A]">
            {patientName}
          </h3>
        </div>
        <span className="shrink-0 rounded-md border border-red-100 bg-white px-2 py-0.5 font-mono text-[10px] font-semibold text-[#B91C1C]">
          ID #{displayId}
        </span>
      </div>

      <div className="mt-2 min-w-0 space-y-1">
        <p className="flex min-w-0 items-center gap-1.5 text-[11.5px] font-medium text-[#64748B]">
          <MapPin size={12} className="shrink-0 text-[#94A3B8]" />
          <span className="truncate">{metadata || ageSex}</span>
        </p>
        <p className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-[#475569]">
          <Phone size={12} className="shrink-0 text-[#94A3B8]" />
          <span className="truncate">{contact}</span>
        </p>
        <p className="flex min-w-0 items-center gap-1.5 text-[10.5px] font-medium text-[#94A3B8]">
          <CalendarDays size={12} className="shrink-0" />
          <span className="truncate">Registered {registeredDate}</span>
        </p>
      </div>

      <div className="mt-auto grid grid-cols-3 gap-1.5 pt-3">
        <Link
          to={`${basePath}/patients/${routePatientId}`}
          className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-[#B91C1C] px-1.5 text-[10px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B]"
        >
          <Eye size={12} />
          <span className="truncate">View Details</span>
        </Link>
        <Link
          to={`${basePath}/patients/edit/${routePatientId}`}
          className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-1.5 text-[10px] font-semibold text-[#475569] transition-colors hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C]"
        >
          <Pencil size={12} />
          <span className="truncate">Edit</span>
        </Link>
        <Link
          to={`${basePath}/health-records/add?patientId=${routePatientId}`}
          className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-1.5 text-[10px] font-semibold text-[#475569] transition-colors hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C]"
        >
          <FilePlus2 size={12} />
          <span className="truncate">Add Record</span>
        </Link>
      </div>
    </article>
  );
}
