import { useEffect, useMemo, useState } from "react";
import { Clock, RefreshCcw, Save, Stethoscope, UserRound } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";

const STORAGE_KEY = "akay_doctor_availability";

const DEFAULT_DOCTORS = [
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
];

const STATUS_OPTIONS = ["Available", "Not Available"];

function getDoctorDefaults(index) {
  return DEFAULT_DOCTORS[index] || DEFAULT_DOCTORS[0];
}

function getAvailabilityNote(availableDoctorCount, totalDoctorCount, doctors) {
  const unavailableNotes = doctors
    .filter(
      (doctor) => doctor.status === "Not Available" && doctor.note?.trim(),
    )
    .map((doctor) => `${doctor.name}: ${doctor.note.trim()}`);

  if (availableDoctorCount === totalDoctorCount) {
    return "2 of 2 doctors are available for RHU referral assessment.";
  }

  if (availableDoctorCount > 0) {
    return unavailableNotes.length
      ? `${availableDoctorCount} of ${totalDoctorCount} doctors available. ${unavailableNotes[0]}`
      : `${availableDoctorCount} of ${totalDoctorCount} doctors available for RHU referral assessment.`;
  }

  return unavailableNotes.length
    ? `No doctor is marked available. ${unavailableNotes[0]}`
    : "No RHU doctor is currently marked available for assessment.";
}

function buildAvailability(doctors, updatedBy = "RHU Staff") {
  const normalizedDoctors = doctors.map((doctor, index) => ({
    ...getDoctorDefaults(index),
    ...doctor,
    role: "General Practitioner",
    status: doctor.status === "Not Available" ? "Not Available" : "Available",
    note: doctor.note || "",
  }));

  const availableDoctorCount = normalizedDoctors.filter(
    (doctor) => doctor.status === "Available",
  ).length;

  const status = availableDoctorCount > 0 ? "Available" : "Not Available";

  return {
    status,
    doctorType: "General Practitioner",
    totalDoctorCount: normalizedDoctors.length,
    availableDoctorCount,
    note: getAvailabilityNote(
      availableDoctorCount,
      normalizedDoctors.length,
      normalizedDoctors,
    ),
    updatedAt: new Date().toISOString(),
    updatedBy,
    doctors: normalizedDoctors,
  };
}

const DEFAULT_AVAILABILITY = buildAvailability(DEFAULT_DOCTORS);

function getStoredAvailability() {
  if (typeof window === "undefined") return DEFAULT_AVAILABILITY;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AVAILABILITY;

    const parsed = JSON.parse(raw);
    const storedDoctors = Array.isArray(parsed.doctors)
      ? DEFAULT_DOCTORS.map((defaultDoctor, index) => ({
          ...defaultDoctor,
          ...parsed.doctors[index],
          role: "General Practitioner",
          status:
            parsed.doctors[index]?.status === "Not Available"
              ? "Not Available"
              : "Available",
          note: parsed.doctors[index]?.note || "",
        }))
      : DEFAULT_DOCTORS;

    const current = buildAvailability(
      storedDoctors,
      parsed.updatedBy || "RHU Staff",
    );

    return {
      ...current,
      updatedAt: parsed.updatedAt || current.updatedAt,
    };
  } catch (error) {
    console.error("Failed to load RHU doctor availability:", error);
    return DEFAULT_AVAILABILITY;
  }
}

function formatDateTime(value) {
  if (!value) return "Not updated yet";

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function doctorsChanged(a = [], b = []) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export default function DoctorSchedule() {
  const [availability, setAvailability] = useState(getStoredAvailability);
  const [draftDoctors, setDraftDoctors] = useState(
    availability.doctors || DEFAULT_DOCTORS,
  );
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setDraftDoctors(availability.doctors || DEFAULT_DOCTORS);
  }, [availability]);

  const draftAvailability = useMemo(
    () =>
      buildAvailability(draftDoctors, availability.updatedBy || "RHU Staff"),
    [draftDoctors, availability.updatedBy],
  );

  const hasChanges = doctorsChanged(draftDoctors, availability.doctors);

  function updateDoctorField(id, key, value) {
    setDraftDoctors((prev) =>
      prev.map((doctor) =>
        doctor.id === id
          ? {
              ...doctor,
              [key]: value,
              updatedAt:
                key === "status" ? new Date().toISOString() : doctor.updatedAt,
            }
          : doctor,
      ),
    );
  }

  function saveAvailabilityUpdate() {
    const nextDoctors = draftDoctors.map((doctor) => ({
      ...doctor,
      note: (doctor.note || "").trim(),
      updatedAt: doctor.updatedAt || new Date().toISOString(),
    }));

    const nextAvailability = buildAvailability(nextDoctors, "RHU Staff");
    setAvailability(nextAvailability);

    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAvailability));
      window.dispatchEvent(new Event("akay_doctor_availability_updated"));
    }

    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2200);
  }

  function resetAllDoctors() {
    const updatedAt = new Date().toISOString();
    const nextDoctors = DEFAULT_DOCTORS.map((doctor) => ({
      ...doctor,
      status: "Available",
      note: "",
      updatedAt,
    }));

    const nextAvailability = buildAvailability(nextDoctors, "RHU Staff");
    setDraftDoctors(nextDoctors);
    setAvailability(nextAvailability);

    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAvailability));
      window.dispatchEvent(new Event("akay_doctor_availability_updated"));
    }

    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2200);
  }

  return (
    <DashboardLayout role="rhu" title="Doctor Availability">
      <div className="space-y-4">
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <main className="min-w-0">
            <div className="grid gap-4 md:grid-cols-2">
              {draftDoctors.map((doctor, index) => (
                <DoctorCard
                  key={doctor.id}
                  doctor={doctor}
                  number={index + 1}
                  onStatusChange={(status) =>
                    updateDoctorField(doctor.id, "status", status)
                  }
                  onNoteChange={(note) =>
                    updateDoctorField(doctor.id, "note", note)
                  }
                />
              ))}
            </div>
          </main>

          <aside className="space-y-4 xl:sticky xl:top-5">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="rounded-xl border border-red-100 bg-red-50/45 p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  RHU Doctor Availability
                </p>
                <div className="mt-2">
                  <StatusBadge status={draftAvailability.status} />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-600">
                  {draftAvailability.note}
                </p>
              </div>

              <div className="mt-4 space-y-2 text-[11px] text-slate-500">
                <div className="flex items-center justify-between gap-3">
                  <span>Doctor Type</span>
                  <span className="font-semibold text-slate-700">
                    General Practitioner
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Available</span>
                  <span className="font-semibold text-slate-700">
                    {draftAvailability.availableDoctorCount} of 2
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Referral</span>
                  <span className="font-semibold text-slate-700">
                    Still allowed
                  </span>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={saveAvailabilityUpdate}
                  disabled={!hasChanges}
                  className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all ${
                    hasChanges
                      ? "bg-[#B91C1C] text-white shadow-sm hover:bg-[#991B1B]"
                      : "cursor-not-allowed bg-slate-100 text-slate-400"
                  }`}
                >
                  <Save size={14} />
                  Save Update
                </button>
                <button
                  type="button"
                  onClick={resetAllDoctors}
                  className="flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                  title="Reset all doctors to Available"
                >
                  <RefreshCcw size={14} />
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}

function DoctorCard({ doctor, number, onStatusChange, onNoteChange }) {
  const isAvailable = doctor.status === "Available";

  return (
    <section
      className={`rounded-xl border bg-white p-4 shadow-sm transition-all hover:shadow-md ${
        isAvailable
          ? "border-slate-200 hover:border-emerald-100"
          : "border-red-100"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
              isAvailable
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-[#B91C1C]"
            }`}
          >
            <UserRound size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-red-100 bg-red-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#B91C1C]">
                {doctor.id}
              </span>
              <StatusBadge status={doctor.status} compact />
            </div>
            <h3 className="mt-2 text-base font-bold text-slate-900">
              Doctor {number}
            </h3>
            <p className="text-xs font-medium text-slate-500">{doctor.role}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {STATUS_OPTIONS.map((status) => {
          const active = doctor.status === status;

          return (
            <button
              key={status}
              type="button"
              onClick={() => onStatusChange(status)}
              className={`h-9 rounded-xl border text-xs font-semibold transition-all ${
                active && status === "Available"
                  ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                  : active
                    ? "border-[#B91C1C] bg-[#B91C1C] text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-[#B91C1C]"
              }`}
            >
              {status}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Note
          </label>
          {doctor.note && (
            <button
              type="button"
              onClick={() => onNoteChange("")}
              className="text-[10px] font-semibold text-slate-400 hover:text-[#B91C1C]"
            >
              Clear
            </button>
          )}
        </div>
        <textarea
          value={doctor.note || ""}
          onChange={(event) => onNoteChange(event.target.value)}
          rows={3}
          placeholder="Add short note if needed."
          className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-slate-700 outline-none transition-all placeholder:text-slate-300 focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
        />
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
        <Clock size={11} />
        Updated {formatDateTime(doctor.updatedAt)}
      </div>
    </section>
  );
}

function StatusBadge({ status, compact = false }) {
  const map = {
    Available: "border-emerald-200 bg-emerald-50 text-emerald-700",
    "Not Available": "border-red-200 bg-red-50 text-red-700",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold ${
        compact ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-xs"
      } ${map[status] || "border-slate-200 bg-slate-100 text-slate-600"}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
