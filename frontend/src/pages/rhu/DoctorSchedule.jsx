import { useMemo, useState } from "react";
import { Clock, Plus, RefreshCcw, Save, UserRound } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  createDoctorRecord,
  getDoctorAvailability,
  saveDoctorAvailability,
} from "../../services/doctorAvailability";

const STATUS_OPTIONS = ["Available", "Not Available"];

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
  const [availability, setAvailability] = useState(getDoctorAvailability);
  const [draftDoctors, setDraftDoctors] = useState(availability.doctors || []);
  const [newDoctorName, setNewDoctorName] = useState("");
  const [savedNotice, setSavedNotice] = useState(false);

  const draftAvailability = useMemo(() => {
    const totalDoctorCount = draftDoctors.length;
    const availableDoctorCount = draftDoctors.filter(
      (doctor) => doctor.availabilityStatus === "Available",
    ).length;

    return {
      status:
        totalDoctorCount > 0 && availableDoctorCount === 0
          ? "Not Available"
          : "Available",
      totalDoctorCount,
      availableDoctorCount,
    };
  }, [draftDoctors]);

  const hasChanges = doctorsChanged(draftDoctors, availability.doctors);

  function showSavedNotice() {
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2200);
  }

  function updateDoctorField(doctorId, key, value) {
    setDraftDoctors((prev) =>
      prev.map((doctor) =>
        doctor.doctorId === doctorId
          ? {
              ...doctor,
              [key]: value,
              name: key === "doctorName" ? value : doctor.name,
              status: key === "availabilityStatus" ? value : doctor.status,
              note: key === "availabilityNote" ? value : doctor.note,
              updatedAt: new Date().toISOString(),
              updatedBy: "RHU Staff",
            }
          : doctor,
      ),
    );
  }

  function saveAvailabilityUpdate() {
    const nextAvailability = saveDoctorAvailability({
      ...availability,
      doctors: draftDoctors.map((doctor) => ({
        ...doctor,
        availabilityNote: (doctor.availabilityNote || "").trim(),
      })),
      updatedAt: new Date().toISOString(),
      updatedBy: "RHU Staff",
    });

    setAvailability(nextAvailability);
    setDraftDoctors(nextAvailability.doctors);
    showSavedNotice();
  }

  function addDoctor(event) {
    event.preventDefault();
    const doctorName = newDoctorName.trim();
    if (!doctorName) return;

    const nextAvailability = createDoctorRecord({
      doctorName,
      doctorType: "General Practitioner",
      updatedBy: "RHU Staff",
    });

    setAvailability(nextAvailability);
    setDraftDoctors(nextAvailability.doctors);
    setNewDoctorName("");
    showSavedNotice();
  }

  function resetDraft() {
    setDraftDoctors(availability.doctors || []);
  }

  return (
    <DashboardLayout role="rhu" title="Doctor Availability">
      <div className="space-y-4">
        {savedNotice && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
            Doctor availability updated by RHU Staff.
          </div>
        )}

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <main className="min-w-0 space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <form
                onSubmit={addDoctor}
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
              >
                <div className="min-w-0 flex-1">
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Doctor Name
                  </label>
                  <input
                    value={newDoctorName}
                    onChange={(event) => setNewDoctorName(event.target.value)}
                    placeholder="Example: Dr. Maria Santos"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-all placeholder:text-slate-300 focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
                  />
                </div>
                <button
                  type="submit"
                  className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#991B1B]"
                >
                  <Plus size={14} />
                  Add Doctor
                </button>
              </form>
            </section>

            {draftDoctors.length === 0 ? (
              <section className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
                No doctors encoded yet. Add a doctor to start tracking RHU
                availability.
              </section>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {draftDoctors.map((doctor) => (
                  <DoctorCard
                    key={doctor.doctorId}
                    doctor={doctor}
                    onChange={(key, value) =>
                      updateDoctorField(doctor.doctorId, key, value)
                    }
                  />
                ))}
              </div>
            )}
          </main>

          <aside className="space-y-4 xl:sticky xl:top-5">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="rounded-xl border border-red-100 bg-red-50/45 p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Doctor Availability
                </p>
                <div className="mt-2">
                  <StatusBadge status={draftAvailability.status} />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-600">
                  {draftAvailability.availableDoctorCount} of{" "}
                  {draftAvailability.totalDoctorCount} General Practitioners
                  available.
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
                  <span>Updated by</span>
                  <span className="font-semibold text-slate-700">
                    RHU Staff
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
                  onClick={resetDraft}
                  disabled={!hasChanges}
                  className="flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Discard unsaved changes"
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

function DoctorCard({ doctor, onChange }) {
  const isAvailable = doctor.availabilityStatus === "Available";

  return (
    <section
      className={`rounded-xl border bg-white p-4 shadow-sm transition-all hover:shadow-md ${
        isAvailable
          ? "border-slate-200 hover:border-emerald-100"
          : "border-red-100"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
            isAvailable
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-[#B91C1C]"
          }`}
        >
          <UserRound size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-red-100 bg-red-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#B91C1C]">
              {doctor.doctorId}
            </span>
            <StatusBadge status={doctor.availabilityStatus} compact />
          </div>

          <input
            value={doctor.doctorName}
            onChange={(event) => onChange("doctorName", event.target.value)}
            className="mt-2 h-9 w-full rounded-lg border border-transparent bg-transparent px-0 text-base font-bold text-slate-900 outline-none transition focus:border-slate-200 focus:bg-slate-50 focus:px-2"
          />
          <p className="text-xs font-medium text-slate-500">
            {doctor.doctorType}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {STATUS_OPTIONS.map((status) => {
          const active = doctor.availabilityStatus === status;

          return (
            <button
              key={status}
              type="button"
              onClick={() => onChange("availabilityStatus", status)}
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
            Availability Note
          </label>
          {doctor.availabilityNote && (
            <button
              type="button"
              onClick={() => onChange("availabilityNote", "")}
              className="text-[10px] font-semibold text-slate-400 hover:text-[#B91C1C]"
            >
              Clear
            </button>
          )}
        </div>
        <textarea
          value={doctor.availabilityNote || ""}
          onChange={(event) => onChange("availabilityNote", event.target.value)}
          rows={3}
          placeholder="Example: On leave today"
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
