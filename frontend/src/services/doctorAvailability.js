const STORAGE_KEY = "akay_doctor_availability";
const UPDATE_EVENT = "akay:doctor-availability-updated";

export const DEFAULT_DOCTOR_AVAILABILITY = {
  status: "Unavailable",
  availableDoctorCount: 0,
  totalDoctorCount: 0,
  doctors: [],
  updatedAt: "",
  updatedBy: "",
};

function emitUpdate(snapshot) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(UPDATE_EVENT, {
      detail: snapshot || getDoctorAvailability(),
    }),
  );
}

function readStoredAvailability() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredAvailability(availability) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(availability));
}

export function normalizeStatus(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("not available") || value.includes("unavailable")) {
    return "Unavailable";
  }
  return "Available";
}

function normalizeExpectedAvailableAt(value) {
  return value ? String(value) : "";
}

function generateDoctorId() {
  return `doctor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function normalizeDoctor(doctor = {}, index = 0) {
  const status = normalizeStatus(
    doctor.availabilityStatus || doctor.status || "Available",
  );
  const expectedAvailableAt =
    status === "Unavailable"
      ? normalizeExpectedAvailableAt(
          doctor.expectedAvailableAt ||
            doctor.expected_available_at ||
            doctor.availabilityNote ||
            doctor.note,
        )
      : "";
  const name =
    doctor.doctorName ||
    doctor.fullName ||
    doctor.name ||
    `Doctor ${index + 1}`;
  const designation =
    doctor.designation ||
    doctor.doctorType ||
    doctor.role ||
    doctor.position ||
    "General Practitioner";
  const doctorId = String(doctor.doctorId || doctor.id || generateDoctorId());

  return {
    ...doctor,
    id: doctorId,
    doctorId,
    name,
    doctorName: name,
    designation,
    doctorType: designation,
    role: designation,
    availabilityStatus: status,
    status,
    expectedAvailableAt,
    expected_available_at: expectedAvailableAt,
    availabilityNote: expectedAvailableAt,
    note: expectedAvailableAt,
    active: doctor.active ?? true,
    updatedAt: doctor.updatedAt || doctor.updated_at || "",
    updatedBy: doctor.updatedBy || doctor.updated_by || "",
  };
}

export function normalizeDoctorAvailability(value) {
  const doctors = Array.isArray(value?.doctors)
    ? value.doctors.map(normalizeDoctor)
    : [];
  const activeDoctors = doctors.filter((doctor) => doctor.active !== false);
  const availableDoctorCount = activeDoctors.filter(
    (doctor) => doctor.availabilityStatus === "Available",
  ).length;
  const totalDoctorCount = activeDoctors.length;

  return {
    ...DEFAULT_DOCTOR_AVAILABILITY,
    ...(value || {}),
    doctors,
    availableDoctorCount,
    totalDoctorCount,
    status:
      totalDoctorCount === 0
        ? "Unavailable"
        : availableDoctorCount > 0
          ? "Available"
          : "Unavailable",
    updatedAt: value?.updatedAt || value?.updated_at || "",
    updatedBy: value?.updatedBy || value?.updated_by || "",
  };
}

export function getDoctorAvailability() {
  return normalizeDoctorAvailability(readStoredAvailability());
}

export function saveDoctorAvailability(availability) {
  const normalized = normalizeDoctorAvailability({
    ...availability,
    updatedAt: availability?.updatedAt || new Date().toISOString(),
    updatedBy: availability?.updatedBy || "RHU Staff",
  });

  writeStoredAvailability(normalized);
  emitUpdate(normalized);

  return normalized;
}

export function createDoctorRecord(doctorData) {
  const doctorId = doctorData?.doctorId || doctorData?.id || generateDoctorId();

  return normalizeDoctor({
    ...doctorData,
    id: doctorId,
    doctorId,
    updatedAt: doctorData?.updatedAt || new Date().toISOString(),
    updatedBy: doctorData?.updatedBy || "RHU Staff",
  });
}

export function listenDoctorAvailabilityUpdates(callback) {
  if (typeof window === "undefined") return () => {};

  function handleUpdate(event) {
    callback(event.detail || getDoctorAvailability());
  }

  window.addEventListener(UPDATE_EVENT, handleUpdate);
  window.addEventListener("storage", handleUpdate);

  return () => {
    window.removeEventListener(UPDATE_EVENT, handleUpdate);
    window.removeEventListener("storage", handleUpdate);
  };
}

export function formatDoctorAvailabilitySummary(availability) {
  const normalized = normalizeDoctorAvailability(availability);
  return `${normalized.availableDoctorCount} of ${normalized.totalDoctorCount} doctors available`;
}

export function createDoctorAvailabilitySnapshot(availability) {
  return normalizeDoctorAvailability(availability);
}

export function formatDoctorAvailabilityDate(value) {
  if (!value) return "Not updated yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

export function formatExpectedAvailableAt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default {
  getDoctorAvailability,
  saveDoctorAvailability,
  normalizeDoctorAvailability,
  createDoctorRecord,
  listenDoctorAvailabilityUpdates,
};
