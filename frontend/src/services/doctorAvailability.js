import { getRhuDoctorAccounts } from "./adminAccountsService";

export const DEFAULT_DOCTOR_AVAILABILITY = {
  status: "Unavailable",
  availableDoctorCount: 0,
  totalDoctorCount: 0,
  doctors: [],
  updatedAt: "",
};

function normalizeStatus(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("available")) return "Available";
  if (value.includes("limited")) return "Limited";
  return "Unavailable";
}

function normalizeDoctor(doctor = {}, index = 0) {
  return {
    id: doctor.id || `doctor-${index + 1}`,
    name: doctor.fullName || doctor.name || "Doctor",
    doctorType: doctor.doctorType || doctor.position || "General Practitioner",
    availabilityStatus: normalizeStatus(doctor.availabilityStatus || doctor.status),
    availabilityNote: doctor.availabilityNote || "",
  };
}

export function getDefaultDoctorAvailability() {
  const doctors = getRhuDoctorAccounts().map(normalizeDoctor);
  const availableDoctorCount = doctors.filter(
    (doctor) => doctor.availabilityStatus === "Available",
  ).length;

  return {
    ...DEFAULT_DOCTOR_AVAILABILITY,
    doctors,
    availableDoctorCount,
    totalDoctorCount: doctors.length,
    status:
      doctors.length === 0
        ? "Unavailable"
        : availableDoctorCount > 0
          ? "Available"
          : "Unavailable",
  };
}

export function normalizeDoctorAvailability(value) {
  return {
    ...getDefaultDoctorAvailability(),
    ...(value || {}),
  };
}

export function getDoctorAvailability() {
  return getDefaultDoctorAvailability();
}

export function saveDoctorAvailability(availability) {
  return normalizeDoctorAvailability(availability);
}

export function createDoctorRecord(doctorData) {
  return normalizeDoctor(doctorData);
}

export function listenDoctorAvailabilityUpdates() {
  return () => {};
}

export function formatDoctorAvailabilitySummary(availability) {
  const normalized = normalizeDoctorAvailability(availability);
  return `${normalized.availableDoctorCount} of ${normalized.totalDoctorCount} available`;
}

export function createDoctorAvailabilitySnapshot(availability) {
  return normalizeDoctorAvailability(availability);
}

export function formatDoctorAvailabilityDate(value) {
  if (!value) return "Not updated yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

export default {
  getDoctorAvailability,
  saveDoctorAvailability,
  normalizeDoctorAvailability,
  createDoctorRecord,
  listenDoctorAvailabilityUpdates,
};
