import { createRoleNotification } from "./notificationService";

const STORAGE_KEY = "akay_doctor_availability";
const ADMIN_ACCOUNTS_KEY = "akay_admin_accounts";
const UPDATE_EVENT = "akay_doctor_availability_updated";

const DEFAULT_DOCTOR_TYPE = "General Practitioner";

export const DEFAULT_DOCTOR_AVAILABILITY = {
  status: "Available",
  doctorType: DEFAULT_DOCTOR_TYPE,
  totalDoctorCount: 0,
  availableDoctorCount: 0,
  note: "No RHU doctors have been encoded yet.",
  updatedAt: null,
  updatedBy: "RHU Staff",
  doctors: [],
};

function normalizeStatus(status) {
  return status === "Not Available" ? "Not Available" : "Available";
}

function getDoctorKey(doctor = {}, index = 0) {
  return doctor.doctorId || doctor.id || `DOC-${String(index + 1).padStart(3, "0")}`;
}

function getDoctorName(doctor = {}, index = 0) {
  return (
    doctor.doctorName ||
    doctor.name ||
    doctor.fullName ||
    `Doctor ${index + 1}`
  );
}

function normalizeDoctor(doctor = {}, index = 0) {
  const now = new Date().toISOString();
  const doctorId = getDoctorKey(doctor, index);
  const doctorName = getDoctorName(doctor, index);
  const doctorType = doctor.doctorType || doctor.role || DEFAULT_DOCTOR_TYPE;
  const availabilityStatus = normalizeStatus(
    doctor.availabilityStatus || doctor.status,
  );
  const availabilityNote = doctor.availabilityNote || doctor.note || "";

  return {
    doctorId,
    id: doctorId,
    doctorName,
    name: doctorName,
    doctorType,
    role: doctorType,
    availabilityStatus,
    status: availabilityStatus,
    availabilityNote,
    note: availabilityNote,
    updatedBy: doctor.updatedBy || "RHU Staff",
    updatedAt: doctor.updatedAt || null,
    createdAt: doctor.createdAt || now,
  };
}

function normalizeDoctors(doctors) {
  return (Array.isArray(doctors) ? doctors : [])
    .map(normalizeDoctor)
    .filter((doctor) => doctor.doctorName.trim());
}

function buildAvailability(doctors, value = {}) {
  const normalizedDoctors = normalizeDoctors(doctors);
  const availableDoctorCount = normalizedDoctors.filter(
    (doctor) => doctor.availabilityStatus === "Available",
  ).length;
  const totalDoctorCount = normalizedDoctors.length;
  const status =
    totalDoctorCount > 0 && availableDoctorCount === 0
      ? "Not Available"
      : "Available";

  return {
    ...DEFAULT_DOCTOR_AVAILABILITY,
    ...(value || {}),
    status,
    doctorType: DEFAULT_DOCTOR_TYPE,
    totalDoctorCount,
    availableDoctorCount,
    note:
      value?.note ||
      (totalDoctorCount
        ? `${availableDoctorCount} of ${totalDoctorCount} General Practitioners available`
        : DEFAULT_DOCTOR_AVAILABILITY.note),
    updatedBy: value?.updatedBy || "RHU Staff",
    doctors: normalizedDoctors,
  };
}

function getLegacyDoctorAccounts() {
  if (typeof window === "undefined") return [];

  try {
    const accounts = JSON.parse(
      window.localStorage.getItem(ADMIN_ACCOUNTS_KEY) || "[]",
    );
    if (!Array.isArray(accounts)) return [];

    return accounts
      .filter((account) => account.role === "RHU" && account.position === "Doctor")
      .map((account, index) => ({
        doctorId:
          account.doctorProfile?.doctorId ||
          `DOC-${String(index + 1).padStart(3, "0")}`,
        doctorName: account.fullName || account.name,
        doctorType: account.doctorProfile?.doctorType || DEFAULT_DOCTOR_TYPE,
        availabilityStatus:
          account.status === "Inactive" ? "Not Available" : "Available",
        availabilityNote:
          account.status === "Inactive" ? "Legacy doctor account inactive" : "",
        updatedBy: "RHU Staff",
        updatedAt: account.updatedAt || null,
        createdAt: account.createdAt || null,
      }));
  } catch {
    return [];
  }
}

export function getDefaultDoctorAvailability() {
  return DEFAULT_DOCTOR_AVAILABILITY;
}

export function normalizeDoctorAvailability(value) {
  return buildAvailability(value?.doctors, value);
}

export function getDoctorAvailability() {
  if (typeof window === "undefined") return getDefaultDoctorAvailability();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeDoctorAvailability(JSON.parse(raw));

    const migrated = getLegacyDoctorAccounts();
    if (migrated.length > 0) {
      const next = buildAvailability(migrated, {
        updatedAt: new Date().toISOString(),
        updatedBy: "RHU Staff",
      });
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    }

    return getDefaultDoctorAvailability();
  } catch {
    return getDefaultDoctorAvailability();
  }
}

export function saveDoctorAvailability(availability) {
  const next = normalizeDoctorAvailability({
    ...availability,
    updatedAt: availability?.updatedAt || new Date().toISOString(),
    updatedBy: availability?.updatedBy || "RHU Staff",
  });

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(UPDATE_EVENT));
    window.dispatchEvent(new Event("akay-doctor-availability-updated"));
  }

  createRoleNotification("bhc", {
    title: "RHU doctor availability updated",
    message: `${next.availableDoctorCount} of ${next.totalDoctorCount} RHU doctors available.`,
    type: "doctor",
    referenceId: `doctor-availability-${next.updatedAt}`,
    link: "/bhc/dashboard",
    sender: "RHU Staff",
  });

  return next;
}

export function createDoctorRecord(doctorData) {
  const current = getDoctorAvailability();
  const nextNumber = current.doctors.length + 1;
  const now = new Date().toISOString();
  const doctor = normalizeDoctor(
    {
      doctorId:
        doctorData.doctorId || `DOC-${String(nextNumber).padStart(3, "0")}`,
      doctorName: doctorData.doctorName,
      doctorType: doctorData.doctorType || DEFAULT_DOCTOR_TYPE,
      availabilityStatus: doctorData.availabilityStatus || "Available",
      availabilityNote: doctorData.availabilityNote || "",
      updatedBy: doctorData.updatedBy || "RHU Staff",
      updatedAt: now,
      createdAt: now,
    },
    nextNumber - 1,
  );

  return saveDoctorAvailability({
    ...current,
    doctors: [...current.doctors, doctor],
    updatedAt: now,
    updatedBy: doctor.updatedBy,
  });
}

export function listenDoctorAvailabilityUpdates(callback) {
  if (typeof window === "undefined") return () => {};

  const handler = () => callback(getDoctorAvailability());
  window.addEventListener("storage", handler);
  window.addEventListener(UPDATE_EVENT, handler);
  window.addEventListener("akay-doctor-availability-updated", handler);

  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(UPDATE_EVENT, handler);
    window.removeEventListener("akay-doctor-availability-updated", handler);
  };
}

export function formatDoctorAvailabilitySummary(availability) {
  const normalized = normalizeDoctorAvailability(availability);
  return `${normalized.availableDoctorCount} of ${normalized.totalDoctorCount} General Practitioners available`;
}

export function createDoctorAvailabilitySnapshot(availability) {
  const current = normalizeDoctorAvailability(availability);

  return {
    doctorAvailabilityStatus: current.status,
    doctorType: current.doctorType,
    totalDoctorCount: current.totalDoctorCount,
    availableDoctorCount: current.availableDoctorCount,
    doctorAvailabilityNote: current.note,
    doctorAvailabilityUpdatedAt: current.updatedAt,
    doctorAvailabilityUpdatedBy: current.updatedBy,
    doctorAvailabilitySnapshot: current,
  };
}

export function formatDoctorAvailabilityDate(value) {
  if (!value) return "No update posted";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No update posted";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default {
  getDefaultDoctorAvailability,
  getDoctorAvailability,
  saveDoctorAvailability,
  createDoctorRecord,
  listenDoctorAvailabilityUpdates,
  normalizeDoctorAvailability,
  formatDoctorAvailabilitySummary,
  createDoctorAvailabilitySnapshot,
  formatDoctorAvailabilityDate,
};
