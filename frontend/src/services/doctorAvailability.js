const STORAGE_KEY = "akay_doctor_availability";
const UPDATE_EVENT = "akay_doctor_availability_updated";

export const DEFAULT_DOCTOR_AVAILABILITY = {
  status: "Available",
  doctorType: "General Practitioner",
  totalDoctorCount: 2,
  availableDoctorCount: 2,
  note: "2 General Practitioners are available for RHU referral assessment.",
  updatedAt: null,
  updatedBy: "RHU Staff",
  doctors: [
    {
      id: "DOC-001",
      name: "Doctor 1",
      role: "General Practitioner",
      status: "Available",
      note: "",
      updatedAt: null,
    },
    {
      id: "DOC-002",
      name: "Doctor 2",
      role: "General Practitioner",
      status: "Available",
      note: "",
      updatedAt: null,
    },
  ],
};

function normalizeStatus(status) {
  if (status === "Not Available") return "Not Available";
  if (status === "No Update Today") return "Available";
  if (status === "May Waiting") return "Available";
  if (status === "Regular Clinic Operations") return "Available";
  return "Available";
}

function normalizeDoctors(doctors) {
  const source = Array.isArray(doctors) ? doctors : [];

  return DEFAULT_DOCTOR_AVAILABILITY.doctors.map((defaultDoctor, index) => {
    const doctor = source[index] || {};

    return {
      ...defaultDoctor,
      ...doctor,
      role: "General Practitioner",
      status: normalizeStatus(doctor.status),
      note: doctor.note || "",
    };
  });
}

export function getDefaultDoctorAvailability() {
  return DEFAULT_DOCTOR_AVAILABILITY;
}

export function normalizeDoctorAvailability(value) {
  const doctors = normalizeDoctors(value?.doctors);
  const availableDoctorCount =
    typeof value?.availableDoctorCount === "number"
      ? value.availableDoctorCount
      : doctors.filter((doctor) => doctor.status === "Available").length;
  const totalDoctorCount = 2;
  const status =
    value?.status === "Not Available" || availableDoctorCount === 0
      ? "Not Available"
      : "Available";

  return {
    ...DEFAULT_DOCTOR_AVAILABILITY,
    ...(value || {}),
    status,
    doctorType: "General Practitioner",
    totalDoctorCount,
    availableDoctorCount,
    note:
      value?.note ||
      `${availableDoctorCount} of ${totalDoctorCount} General Practitioners are available for RHU referral assessment.`,
    updatedBy: value?.updatedBy || "RHU Staff",
    doctors,
  };
}

export function getDoctorAvailability() {
  if (typeof window === "undefined") return getDefaultDoctorAvailability();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultDoctorAvailability();
    return normalizeDoctorAvailability(JSON.parse(raw));
  } catch {
    return getDefaultDoctorAvailability();
  }
}

export function saveDoctorAvailability(availability) {
  const next = normalizeDoctorAvailability(availability);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(UPDATE_EVENT));
  }
  return next;
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
  listenDoctorAvailabilityUpdates,
  normalizeDoctorAvailability,
  formatDoctorAvailabilitySummary,
  createDoctorAvailabilitySnapshot,
  formatDoctorAvailabilityDate,
};
