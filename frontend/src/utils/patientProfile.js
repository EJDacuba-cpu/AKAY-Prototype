// Extensions are explicit so this module can be exercised directly by
// `node --test`, which does not resolve extensionless specifiers.
import { calculateAge, calculateAgeInMonths } from "./patientUtils.js";

/**
 * Pure helpers behind the BHC patient profile: the editable registration form,
 * its validation, and which form fields each inline-editable section owns.
 */

export const BULAKAN_BARANGAYS = [
  "Bagumbayan",
  "Balubad",
  "Bambang",
  "Matungao",
  "Maysantol",
  "Perez",
  "Pitpitan",
  "San Francisco",
  "San Jose",
  "San Nicolas",
  "Santa Ana",
  "Santa Ines",
  "Taliptip",
  "Tibig",
];

export function hasDisplayValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

/** First non-empty value among the alias keys a patient row may carry. */
export function getPatientValue(patient = {}, keys = [], fallback = "Not recorded") {
  for (const key of keys) {
    const value = patient?.[key];
    if (hasDisplayValue(value)) return value;
  }
  return fallback;
}

export function getTodayIsoDate(now = new Date()) {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

/** "Sep 26, 2026" - compact enough for a narrow date column. */
export function formatShortDate(value, fallback = "Not recorded") {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  });
}

/** Stored age when the row has one, otherwise computed from the birth date. */
export function getPatientAge(patient = {}) {
  const stored = getPatientValue(patient, ["age"], "");
  if (stored !== "") return stored;
  return calculateAge(
    getPatientValue(patient, ["birthDate", "birthdate", "dateOfBirth", "date_of_birth"], ""),
  );
}

export function createPatientForm(patient = {}) {
  const read = (keys, fallback = "") => getPatientValue(patient, keys, fallback);

  return {
    firstName: read(["firstName", "first_name"]),
    middleName: read(["middleName", "middle_name"]),
    lastName: read(["lastName", "last_name"]),
    birthDate: read(["birthDate", "birthdate", "dateOfBirth", "date_of_birth"]),
    age: getPatientAge(patient),
    sex: read(["sex"]),
    civilStatus: read(["civilStatus", "civil_status"]),
    occupation: read(["occupation"]),
    nhtsStatus: read(["nhtsStatus", "nhts_status"]),
    familySerialNumber: read(["familySerialNumber", "family_serial_number"]),
    spouseName: read(["spouseName", "spouse_name"]),
    spouseOccupation: read(["spouseOccupation", "spouse_occupation"]),
    contactNumber: read(["contact", "contactNumber", "contact_number"]),
    philHealthStatus: read(["philHealthStatus", "philhealth_status", "philHealthMembership"]),
    philHealthNumber: read(["philHealthNumber", "philhealthNumber", "philhealth_number"]),
    streetAddress: read(["address", "streetAddress", "street_address"]),
    purokArea: read(["purok", "purokArea", "purok_area"]),
    barangay: read(["barangay"]),
    municipality: read(["municipality", "city"], "Bulakan"),
    motherName: read(["motherName", "mother_name"]),
    motherPatientId: read(["motherPatientId", "mother_patient_id"]),
    fatherName: read(["fatherName", "father_name"]),
    guardianName: read(["guardianName", "guardian_name"]),
    guardianRelationship: read(["guardianRelationship", "guardian_relationship"]),
    guardianContactNumber: read(["guardianContactNumber", "guardian_contact_number"]),
    birthPlace: read(["birthPlace", "birth_place"]),
    birthTime: read(["birthTime", "birth_time"]),
    birthWeight: read(["birthWeight", "birth_weight"]),
    birthHeight: read(["birthHeight", "birth_height"]),
    registrationType: read(["registrationType", "registration_type", "patientType"]),
    patientClassification: read(["patientClassification", "patientCategory", "category"]),
  };
}

/**
 * Which form fields belong to each inline-editable section. Every section
 * saves the whole form (the API takes the full registration row), but only
 * its own fields are validated and reported - so a legacy row that is missing
 * a field in another section never blocks saving this one.
 */
export const REGISTRATION_SECTION_FIELDS = Object.freeze({
  demographics: [
    "firstName", "middleName", "lastName", "birthDate", "age", "sex",
    "civilStatus", "occupation", "nhtsStatus", "familySerialNumber",
    "spouseName", "spouseOccupation",
  ],
  contact: [
    "contactNumber", "philHealthStatus", "philHealthNumber",
    "streetAddress", "purokArea", "barangay", "municipality",
  ],
  family: [
    "motherName", "motherPatientId", "familySerialNumber", "fatherName",
    "guardianName", "guardianRelationship", "guardianContactNumber",
    "birthPlace", "birthTime", "birthWeight", "birthHeight",
  ],
});

/** All registration validation errors for a form, keyed by field name. */
export function validatePatientForm(form = {}, today = getTodayIsoDate()) {
  const errors = {};
  const hasBirthDate = Boolean(form.birthDate);
  const ageYears = calculateAge(form.birthDate);
  const ageInMonths = calculateAgeInMonths(form.birthDate);
  const isChildRegistration =
    hasBirthDate && ageYears !== "" && Number(ageYears) < 18;
  const isEpiTargetAge =
    hasBirthDate && ageInMonths !== "" && Number(ageInMonths) <= 12;

  if (!String(form.firstName || "").trim()) errors.firstName = "First name is required.";
  if (!String(form.lastName || "").trim()) errors.lastName = "Last name is required.";
  if (!form.birthDate) {
    errors.birthDate = "Date of Birth is required.";
  } else if (form.birthDate > today) {
    errors.birthDate = "Date of Birth cannot be in the future.";
  }
  if (!form.sex) errors.sex = "Sex is required.";
  if (hasBirthDate && !isEpiTargetAge && !form.civilStatus) {
    errors.civilStatus = "Civil status is required.";
  }
  if (
    form.philHealthStatus === "With PhilHealth" &&
    !String(form.philHealthNumber || "").trim()
  ) {
    errors.philHealthNumber = "PhilHealth number is required if marked with PhilHealth.";
  }
  if (!String(form.streetAddress || "").trim()) errors.streetAddress = "Street address is required.";
  if (!form.barangay) errors.barangay = "Barangay is required.";
  if (!String(form.municipality || "").trim()) errors.municipality = "Municipality is required.";
  if (isChildRegistration && !String(form.motherName || "").trim()) {
    errors.motherName = "Mother name is required.";
  }

  return errors;
}

/** Only the errors that belong to the section being saved. */
export function getSectionErrors(errors = {}, section) {
  const fields = REGISTRATION_SECTION_FIELDS[section] || [];
  return Object.fromEntries(
    Object.entries(errors).filter(([field]) => fields.includes(field)),
  );
}

/** A follow-up task's state as of today, folding overdue pending tasks into no_show. */
export function getEffectiveFollowUpState(task = {}, today = new Date().toISOString().slice(0, 10)) {
  if (task.state === "fulfilled") return "fulfilled";
  if (task.state === "no_show") return "no_show";
  if (["cancelled", "canceled"].includes(task.state)) return "cancelled";

  const dueDate = String(task.dueDate || "").slice(0, 10);
  if (!dueDate) return "upcoming";
  if (dueDate === today) return "due_today";
  if (dueDate < today) return "no_show";
  if (task.state === "rescheduled") return "rescheduled";
  return "upcoming";
}

export function isActiveFollowUpState(state) {
  return ["upcoming", "due_today", "no_show", "rescheduled"].includes(state);
}

export function getDateTimeValue(item = {}) {
  const raw =
    item.dueDate ||
    item.due_date ||
    item.dateOfVisit ||
    item.date_of_visit ||
    item.dateRecorded ||
    item.date_recorded ||
    item.visitDate ||
    item.dateOfReferral ||
    item.date_of_referral ||
    item.referralDate ||
    item.referral_datetime ||
    item.dateSubmitted ||
    item.createdAt ||
    item.created_at ||
    item.date;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function sortByDateDesc(a, b) {
  return getDateTimeValue(b) - getDateTimeValue(a);
}

/**
 * Follow-ups in the order a health worker needs them: what is still open
 * first, soonest due at the top, then everything already resolved, newest
 * first. Each task gains its `effectiveState`.
 */
export function orderFollowUps(tasks = [], today) {
  const withState = tasks.map((task) => ({
    ...task,
    effectiveState: getEffectiveFollowUpState(task, today),
  }));
  const open = withState
    .filter((task) => isActiveFollowUpState(task.effectiveState))
    .sort((a, b) => getDateTimeValue(a) - getDateTimeValue(b));
  const resolved = withState
    .filter((task) => !isActiveFollowUpState(task.effectiveState))
    .sort(sortByDateDesc);
  return { ordered: [...open, ...resolved], open };
}

const FOLLOW_UP_STATUS_GROUPS = [
  { key: "overdue", label: "Overdue", states: ["no_show"], empty: "No overdue follow-ups." },
  { key: "pending", label: "Pending", states: ["due_today", "upcoming", "rescheduled"], empty: "No pending follow-ups." },
  { key: "completed", label: "Completed", states: ["fulfilled"], empty: "No completed follow-ups yet." },
  { key: "cancelled", label: "Cancelled", states: ["cancelled"], empty: "No cancelled follow-ups." },
];

/**
 * Splits tasks (already carrying `effectiveState`, as `orderFollowUps`
 * produces) into the Follow-ups tab's groups, keeping their incoming order.
 * Past-due pending tasks count as overdue because `getEffectiveFollowUpState`
 * folds them into `no_show`.
 */
export function groupFollowUpsByStatus(tasks = []) {
  return FOLLOW_UP_STATUS_GROUPS.map((group) => ({
    ...group,
    items: tasks.filter((task) => group.states.includes(task.effectiveState)),
  }));
}
