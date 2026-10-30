import { Link } from "react-router";
import { MapPin } from "lucide-react";

import ButtonSpinner from "../../common/loading/ButtonSpinner";
import useOpenPatientProfile from "../../../hooks/useOpenPatientProfile";
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

/** Registration is either "child" or "general"; the backend defaults to general. */
function getRegistrationType(patient) {
  const value = String(
    patient.registrationType || patient.registration_type || patient.patientType || "",
  )
    .trim()
    .toLowerCase();
  return value === "child" ? "Child" : "General";
}

function getPatientDisplayId(patient) {
  return formatDisplayValue(patient.patientId || patient.id, "Not recorded");
}

/**
 * Open Profile link that loads the profile's data first. It stays a real link
 * (new-tab and copy-link still work); only a plain left click is intercepted.
 */
function OpenProfileLink({ to, patientId, role, className, onClick, children, ...linkProps }) {
  const { openProfile, opening, error } = useOpenPatientProfile(role);

  function handleClick(event) {
    onClick?.(event);
    const plainClick =
      event.button === 0 && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
    if (event.defaultPrevented || !plainClick) return;
    event.preventDefault();
    openProfile(patientId, to);
  }

  return (
    <>
      <Link
        to={to}
        className={`${className}${opening ? " pointer-events-none gap-2 opacity-90" : ""}`}
        onClick={handleClick}
        aria-busy={opening}
        aria-disabled={opening || undefined}
        {...linkProps}
      >
        {opening ? (
          <>
            <ButtonSpinner />
            <span>Opening...</span>
          </>
        ) : (
          children
        )}
      </Link>
      {error && (
        <p role="alert" className="mt-1.5 text-[11px] font-medium text-red-600">
          Could not load this profile. Please try again.
        </p>
      )}
    </>
  );
}

export default function PatientDirectoryCard({
  patient,
  basePath,
  role = basePath === "/rhu" ? "rhu" : "bhc",
  onSelect,
  selected = false,
}) {
  const routePatientId = formatDisplayValue(patient.id || patient.patientId, "");
  const patientName = formatPatientName(patient, "Unnamed Patient");
  const displayId = getPatientDisplayId(patient);
  const age = getPatientAge(patient);
  const sex = getPatientSex(patient);
  const contact = getPatientContact(patient);
  const location = getPatientLocation(patient);
  const occupation = formatDisplayValue(patient.occupation, "Not recorded");
  const registrationType = getRegistrationType(patient);
  const birthDate = formatDate(getBirthDate(patient));
  const registeredDate = formatDate(getRegisteredDate(patient));

  // With onSelect the whole card opens the directory's summary panel; the
  // Open Profile link below still navigates straight to the full profile.
  const selectProps = onSelect
    ? {
        role: "button",
        tabIndex: 0,
        "aria-pressed": selected,
        "aria-label": `View summary: ${patientName}, ID ${displayId}`,
        "data-selected": selected,
        onClick: () => onSelect(routePatientId),
        onKeyDown: (event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(routePatientId);
          }
        },
      }
    : {};

  return (
    <article className="clinical-patient" {...selectProps}>
      <div className="clinical-patient__top">
        <span className="clinical-patient__barangay">
          <MapPin size={12} aria-hidden="true" />
          <span>
            <span className="sr-only">Barangay: </span>
            {formatDisplayValue(location, "Barangay not recorded")}
          </span>
        </span>
        <span
          className="clinical-patient__badge"
          data-type={registrationType.toLowerCase()}
        >
          {registrationType}
        </span>
      </div>
      <header className="clinical-patient__identity">
        <h3 className="clinical-patient__name">{patientName}</h3>
        <p className="clinical-patient__id">Patient ID #{displayId}</p>
      </header>
      <dl className="clinical-patient__fields">
        {[
          ["Age", formatDisplayValue(age, "Not recorded")],
          ["Sex", formatDisplayValue(sex, "Not recorded")],
          ["Occupation", occupation],
          ["Date of birth", birthDate],
          ["Contact", contact],
          ["Registered", registeredDate],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <footer className="clinical-patient__footer">
        <OpenProfileLink
          to={`${basePath}/patients/${routePatientId}`}
          patientId={routePatientId}
          role={role}
          className="clinical-patient__open"
          onClick={(event) => event.stopPropagation()}
          aria-label={`Open Profile: ${patientName}, ID ${displayId}`}
        >
          Open Profile
        </OpenProfileLink>
      </footer>
    </article>
  );
}
