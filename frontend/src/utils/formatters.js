function isObject(value) {
  return value !== null && typeof value === "object";
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function firstText(values) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }

  return "";
}

function joinName(parts) {
  return parts.map(cleanText).filter(Boolean).join(" ");
}

export function formatPatientName(patient, fallback = "Not recorded") {
  if (!patient) return fallback;

  if (!isObject(patient)) return cleanText(patient) || fallback;

  const direct = firstText([
    patient.fullName,
    patient.full_name,
    patient.patientName,
    patient.patient_name,
    patient.name,
  ]);

  if (direct) return direct;

  const composed = joinName([
    patient.firstName || patient.first_name,
    patient.middleName || patient.middle_name,
    patient.lastName || patient.last_name,
  ]);

  if (composed) return composed;

  return patient.patient ? formatPatientName(patient.patient, fallback) : fallback;
}

export function formatUserName(user, fallback = "Unassigned") {
  if (!user) return fallback;

  if (!isObject(user)) return cleanText(user) || fallback;

  const direct = firstText([
    user.fullName,
    user.full_name,
    user.displayName,
    user.display_name,
    user.name,
    user.username,
    user.email,
  ]);

  if (direct) return direct;

  const composed = joinName([
    user.firstName || user.first_name,
    user.middleName || user.middle_name,
    user.lastName || user.last_name,
  ]);

  return composed || fallback;
}

export function formatFacilityName(facility, fallback = "Unassigned") {
  if (!facility) return fallback;

  if (!isObject(facility)) return cleanText(facility) || fallback;

  const direct = firstText([
    facility.name,
    facility.facilityName,
    facility.facility_name,
    facility.centerName,
    facility.center_name,
    facility.healthCenterName,
    facility.health_center_name,
    facility.bhcName,
    facility.bhc_name,
    facility.rhuName,
    facility.rhu_name,
    facility.barangayHealthCenterName,
    facility.barangay_health_center_name,
    facility.ruralHealthUnitName,
    facility.rural_health_unit_name,
  ]);

  if (direct) return direct;

  if (facility.barangayHealthCenter || facility.barangay_health_center) {
    return formatFacilityName(
      facility.barangayHealthCenter || facility.barangay_health_center,
      fallback,
    );
  }

  if (facility.ruralHealthUnit || facility.rural_health_unit) {
    return formatFacilityName(
      facility.ruralHealthUnit || facility.rural_health_unit,
      fallback,
    );
  }

  const barangay = cleanText(facility.barangay || facility.barangayName);
  if (barangay) return `Barangay ${barangay} Health Center`;

  return fallback;
}

export function formatDate(value, fallback = "Not recorded") {
  if (!value) return fallback;

  if (isObject(value) && !(value instanceof Date)) {
    return formatDate(
      value.date ||
        value.dateOfVisit ||
        value.date_of_visit ||
        value.dateRecorded ||
        value.date_recorded ||
        value.visitDate ||
        value.visit_date ||
        value.createdAt ||
        value.created_at,
      fallback,
    );
  }

  let date;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    date = new Date(year, month - 1, day);
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) return cleanText(value) || fallback;

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatLongDate(value, fallback = "—") {
  if (!value) return fallback;

  if (isObject(value) && !(value instanceof Date)) {
    return formatLongDate(
      value.birthdate ||
        value.birthDate ||
        value.dateOfBirth ||
        value.date_of_birth ||
        value.dateOfVisit ||
        value.date_of_visit ||
        value.dateRecorded ||
        value.date_recorded ||
        value.visitDate ||
        value.visit_date ||
        value.createdAt ||
        value.created_at ||
        value.date,
      fallback,
    );
  }

  let date;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    date = new Date(year, month - 1, day);
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) return cleanText(value) || fallback;

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDisplayValue(value, fallback = "Not recorded") {
  if (!value && value !== 0) return fallback;
  if (!isObject(value)) return cleanText(value) || fallback;
  if (value instanceof Date) return formatDate(value, fallback);

  return (
    firstText([
      value.label,
      value.title,
      value.value,
      value.name,
      value.description,
      value.status,
      value.type,
      value.code,
      value.id,
    ]) || fallback
  );
}

export function normalizeHealthRecordStatus(status, fallback = "Routine Monitoring") {
  const raw = cleanText(status);
  if (!raw) return fallback;

  const compact = raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

  if (["follow up", "follow up required", "follow up after 2 days"].includes(compact)) {
    return "Follow-up Required";
  }

  if (["under observation", "observation", "for monitoring", "monitoring"].includes(compact)) {
    return "Under Observation";
  }

  if (["routine monitoring", "active", "consultation"].includes(compact)) {
    return "Routine Monitoring";
  }

  if (["completed", "complete", "recovered", "closed", "discharged"].includes(compact)) {
    return "Completed";
  }

  if (["needs referral", "for referral", "referral"].includes(compact)) {
    return "Needs Referral";
  }

  if (["referred", "pending rhu review", "received"].includes(compact)) {
    return "Referred/Pending";
  }

  if (compact === "pending") return "Pending";

  return raw;
}

export function formatReferralStatus(status, fallback = "Pending") {
  const raw = cleanText(status);
  if (!raw) return fallback;

  const compact = raw
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    compact.includes("receive") ||
    compact.includes("monitor") ||
    compact.includes("assessment")
  ) {
    return "Received";
  }
  if (compact.includes("show")) return "No-Show";
  if (compact.includes("complete") || compact === "done") return "Completed";
  if (compact.includes("pending")) return "Pending";

  return raw;
}
