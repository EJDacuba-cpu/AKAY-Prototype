import { useMemo, useState } from "react";
import { Clock, Plus, RefreshCcw, Save, Trash, UserRound } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { ConfirmationModal } from "../../components/common";
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

function getDoctorId(doctor) {
  return doctor?.doctorId || doctor?.id || "";
}

function getDoctorName(doctor) {
  return doctor?.doctorName || doctor?.name || "";
}

function getDoctorStatus(doctor) {
  return doctor?.availabilityStatus || doctor?.status || "Available";
}

function getDoctorNote(doctor) {
  return doctor?.availabilityNote || doctor?.note || "";
}

export default function DoctorSchedule() {
  const [availability, setAvailability] = useState(getDoctorAvailability);
  const [draftDoctors, setDraftDoctors] = useState(availability.doctors || []);
  const [selectedDoctorId, setSelectedDoctorId] = useState(
    () => getDoctorId((availability.doctors || [])[0]) || "",
  );
  const [newDoctorName, setNewDoctorName] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
  const [deleteModal, setDeleteModal] = useState({
    open: false,
    doctorId: "",
    doctorName: "",
  });

  const selectedDoctor =
    draftDoctors.find((doctor) => getDoctorId(doctor) === selectedDoctorId) ||
    draftDoctors[0] ||
    null;

  const selectedId = getDoctorId(selectedDoctor);

  const metrics = useMemo(() => {
    const total = draftDoctors.length;
    const available = draftDoctors.filter(
      (doctor) => getDoctorStatus(doctor) === "Available",
    ).length;

    return {
      total,
      available,
      notAvailable: total - available,
    };
  }, [draftDoctors]);

  const hasChanges = doctorsChanged(draftDoctors, availability.doctors || []);

  function showSavedNotice(message = "Doctor availability updated.") {
    setSavedNotice(message);
    window.setTimeout(() => setSavedNotice(""), 2200);
  }

  function updateDoctorField(doctorId, key, value) {
    setDraftDoctors((prev) =>
      prev.map((doctor) => {
        if (getDoctorId(doctor) !== doctorId) return doctor;

        return {
          ...doctor,
          [key]: value,
          doctorName:
            key === "doctorName" ? value : doctor.doctorName || doctor.name,
          name: key === "doctorName" ? value : doctor.name || doctor.doctorName,
          availabilityStatus:
            key === "availabilityStatus"
              ? value
              : doctor.availabilityStatus || doctor.status,
          status:
            key === "availabilityStatus"
              ? value
              : doctor.status || doctor.availabilityStatus,
          availabilityNote:
            key === "availabilityNote"
              ? value
              : doctor.availabilityNote || doctor.note || "",
          note:
            key === "availabilityNote"
              ? value
              : doctor.note || doctor.availabilityNote || "",
          updatedAt: new Date().toISOString(),
          updatedBy: "RHU Staff",
        };
      }),
    );
  }

  async function saveAllChanges() {
    const nextAvailability = saveDoctorAvailability({
      ...availability,
      doctors: draftDoctors.map((doctor) => ({
        ...doctor,
        doctorName: getDoctorName(doctor).trim(),
        name: getDoctorName(doctor).trim(),
        availabilityStatus: getDoctorStatus(doctor),
        status: getDoctorStatus(doctor),
        availabilityNote: getDoctorNote(doctor).trim(),
        note: getDoctorNote(doctor).trim(),
        updatedAt: doctor.updatedAt || new Date().toISOString(),
        updatedBy: doctor.updatedBy || "RHU Staff",
      })),
      updatedAt: new Date().toISOString(),
      updatedBy: "RHU Staff",
    });

    setAvailability(nextAvailability);
    setDraftDoctors(nextAvailability.doctors || []);
    setSelectedDoctorId(
      selectedId || getDoctorId((nextAvailability.doctors || [])[0]) || "",
    );
    showSavedNotice("Doctor availability changes saved.");
  }

  function addDoctor(event) {
    if (event) event.preventDefault();

    const doctorName = newDoctorName.trim();
    if (!doctorName) return;

    const nextAvailability = createDoctorRecord({
      doctorName,
      doctorType: "General Practitioner",
      availabilityStatus: "Available",
      status: "Available",
      updatedBy: "RHU Staff",
    });

    setAvailability(nextAvailability);
    setDraftDoctors(nextAvailability.doctors || []);

    const createdDoctor =
      [...(nextAvailability.doctors || [])]
        .reverse()
        .find(
          (doctor) =>
            getDoctorName(doctor).toLowerCase() === doctorName.toLowerCase(),
        ) || (nextAvailability.doctors || [])[0];

    setSelectedDoctorId(getDoctorId(createdDoctor));
    setNewDoctorName("");
    showSavedNotice(`Dr. ${doctorName} was added.`);
  }

  function resetDraft() {
    setDraftDoctors(availability.doctors || []);
    setSelectedDoctorId(getDoctorId((availability.doctors || [])[0]) || "");
  }

  function openDeleteModal() {
    if (!selectedDoctor) return;

    setDeleteModal({
      open: true,
      doctorId: selectedId,
      doctorName: getDoctorName(selectedDoctor),
    });
  }

  async function handleDeleteConfirm() {
    if (!deleteModal.doctorId) return;

    const nextDoctors = draftDoctors.filter(
      (doctor) => getDoctorId(doctor) !== deleteModal.doctorId,
    );

    const nextAvailability = saveDoctorAvailability({
      ...availability,
      doctors: nextDoctors,
      updatedAt: new Date().toISOString(),
      updatedBy: "RHU Staff",
    });

    setAvailability(nextAvailability);
    setDraftDoctors(nextAvailability.doctors || []);
    setSelectedDoctorId(getDoctorId((nextAvailability.doctors || [])[0]) || "");
    setDeleteModal({ open: false, doctorId: "", doctorName: "" });
    showSavedNotice("Doctor record removed.");
  }

  return (
    <DashboardLayout role="rhu" title="Doctor Availability">
      <div className="space-y-5">
        {savedNotice && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
            {savedNotice}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <MetricCard label="Doctors Encoded" value={metrics.total} />
          <MetricCard
            label="Available Today"
            value={metrics.available}
            tone="green"
          />
          <MetricCard
            label="Not Available"
            value={metrics.notAvailable}
            tone="red"
          />
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="min-w-0 space-y-4">
            <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
              <div className="border-b border-[#E2E8F0] px-5 py-4">
                <h2 className="text-sm font-semibold text-[#0F172A]">
                  RHU Doctor List
                </h2>
                <p className="mt-1 text-xs text-[#64748B]">
                  Select a doctor to update availability using the control
                  panel.
                </p>
              </div>

              {draftDoctors.length === 0 ? (
                <div className="px-6 py-20 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9]">
                    <UserRound size={20} className="text-[#94A3B8]" />
                  </div>
                  <p className="text-[13px] font-semibold text-[#334155]">
                    No doctors encoded yet
                  </p>
                  <p className="mt-1 text-[11.5px] text-[#94A3B8]">
                    Add a doctor from the control panel to start tracking RHU
                    availability.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 p-4 md:grid-cols-2">
                  {draftDoctors.map((doctor) => {
                    const doctorId = getDoctorId(doctor);

                    return (
                      <DoctorSummaryCard
                        key={doctorId}
                        doctor={doctor}
                        isSelected={doctorId === selectedId}
                        onSelect={() => setSelectedDoctorId(doctorId)}
                        onStatusChange={(status) =>
                          updateDoctorField(
                            doctorId,
                            "availabilityStatus",
                            status,
                          )
                        }
                      />
                    );
                  })}
                </div>
              )}
            </section>
          </main>

          <aside className="space-y-4 xl:sticky xl:top-5">
            <section className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
              <div className="border-b border-[#F1F5F9] pb-3">
                <h3 className="text-sm font-semibold text-[#0F172A]">
                  Doctor Controls
                </h3>
                <p className="mt-1 text-xs text-[#64748B]">
                  Add doctors and update the selected doctor's availability.
                </p>
              </div>

              <form onSubmit={addDoctor} className="mt-4 space-y-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  Add Doctor
                </label>
                <div className="flex gap-2">
                  <input
                    value={newDoctorName}
                    onChange={(event) => setNewDoctorName(event.target.value)}
                    placeholder="Example: Dr. Maria Santos"
                    className="h-10 min-w-0 flex-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm text-[#0F172A] outline-none transition focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
                  />
                  <button
                    type="submit"
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#B91C1C] px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#991B1B]"
                  >
                    <Plus size={13} />
                    Add
                  </button>
                </div>
              </form>

              <div className="my-4 border-t border-[#F1F5F9]" />

              {selectedDoctor ? (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                      Selected Doctor
                    </label>
                    <input
                      value={getDoctorName(selectedDoctor)}
                      onChange={(event) =>
                        updateDoctorField(
                          selectedId,
                          "doctorName",
                          event.target.value,
                        )
                      }
                      className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm font-semibold text-[#0F172A] outline-none transition focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
                    />
                    <p className="mt-1 font-mono text-[10px] font-semibold text-[#94A3B8]">
                      {selectedId}
                    </p>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                        Availability Note
                      </label>
                      {getDoctorNote(selectedDoctor) && (
                        <button
                          type="button"
                          onClick={() =>
                            updateDoctorField(
                              selectedId,
                              "availabilityNote",
                              "",
                            )
                          }
                          className="text-[10px] font-semibold text-[#94A3B8] hover:text-[#B91C1C]"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <textarea
                      value={getDoctorNote(selectedDoctor)}
                      onChange={(event) =>
                        updateDoctorField(
                          selectedId,
                          "availabilityNote",
                          event.target.value,
                        )
                      }
                      rows={3}
                      placeholder="Example: On leave today"
                      className="w-full resize-none rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5 text-sm leading-relaxed text-[#0F172A] outline-none transition placeholder:text-[#94A3B8] focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={openDeleteModal}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-red-100 bg-red-50 text-xs font-semibold text-[#B91C1C] transition hover:bg-red-100"
                  >
                    <Trash size={13} />
                    Delete Doctor
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-4 py-8 text-center">
                  <p className="text-xs font-semibold text-[#64748B]">
                    No selected doctor
                  </p>
                  <p className="mt-1 text-[11px] text-[#94A3B8]">
                    Add or select a doctor to manage availability.
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#0F172A]">
                    Save Changes
                  </h3>
                  <p className="mt-1 text-xs text-[#64748B]">
                    Apply updates after editing availability details.
                  </p>
                </div>
                <StatusDot active={hasChanges} />
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={saveAllChanges}
                  disabled={!hasChanges}
                  className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-xs font-semibold transition ${
                    hasChanges
                      ? "bg-[#B91C1C] text-white shadow-sm hover:bg-[#991B1B]"
                      : "cursor-not-allowed bg-[#F1F5F9] text-[#94A3B8]"
                  }`}
                >
                  <Save size={13} />
                  Save Update
                </button>
                <button
                  type="button"
                  onClick={resetDraft}
                  disabled={!hasChanges}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white px-3 text-[#64748B] transition hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-40"
                  title="Discard unsaved changes"
                >
                  <RefreshCcw size={13} />
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>

      <ConfirmationModal
        open={deleteModal.open}
        title="Delete Doctor?"
        description={`Are you sure you want to remove ${
          deleteModal.doctorName || "this doctor"
        } from the RHU doctor availability list?`}
        confirmText="Delete Doctor"
        cancelText="Cancel"
        onConfirm={handleDeleteConfirm}
        onCancel={() =>
          setDeleteModal({ open: false, doctorId: "", doctorName: "" })
        }
        loading={false}
      />
    </DashboardLayout>
  );
}

function MetricCard({ label, value, tone = "slate" }) {
  const toneMap = {
    slate: {
      border: "border-t-slate-300",
      dot: "bg-slate-400",
    },
    green: {
      border: "border-t-emerald-400",
      dot: "bg-emerald-500",
    },
    red: {
      border: "border-t-red-400",
      dot: "bg-[#B91C1C]",
    },
  };

  const selected = toneMap[tone] || toneMap.slate;

  return (
    <div
      className={`rounded-xl border border-[#E2E8F0] border-t-2 bg-white p-4 shadow-sm ${selected.border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#94A3B8]">
          {label}
        </p>
        <span className={`h-2.5 w-2.5 rounded-full ${selected.dot}`} />
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-[#0F172A]">
        {value}
      </p>
    </div>
  );
}

function DoctorSummaryCard({ doctor, isSelected, onSelect, onStatusChange }) {
  const currentStatus = getDoctorStatus(doctor);
  const currentName = getDoctorName(doctor);
  const isAvailable = currentStatus === "Available";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`min-h-[156px] cursor-pointer rounded-xl border bg-white p-4 text-left shadow-sm outline-none transition-all hover:-translate-y-0.5 hover:shadow-md focus:ring-2 focus:ring-[#B91C1C]/10 ${
        isSelected
          ? "border-[#B91C1C] ring-2 ring-[#B91C1C]/10"
          : "border-[#E2E8F0] hover:border-red-100"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#64748B]">
            {getDoctorId(doctor)}
          </span>
          <p className="mt-2 truncate text-sm font-bold text-[#0F172A]">
            {currentName || "Unnamed Doctor"}
          </p>
          <p className="mt-0.5 text-xs text-[#64748B]">
            {doctor.doctorType || "General Practitioner"}
          </p>
        </div>

        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            isAvailable
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-[#B91C1C]"
          }`}
        >
          <UserRound size={18} />
        </div>
      </div>

      <div
        className="mt-4 grid grid-cols-2 gap-2"
        onClick={(event) => event.stopPropagation()}
      >
        {STATUS_OPTIONS.map((status) => {
          const active = currentStatus === status;
          const optionAvailable = status === "Available";

          return (
            <button
              key={status}
              type="button"
              onClick={() => onStatusChange(status)}
              className={`h-9 rounded-lg border text-[11px] font-semibold transition ${
                active && optionAvailable
                  ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                  : active
                    ? "border-[#B91C1C] bg-[#B91C1C] text-white shadow-sm"
                    : "border-[#E2E8F0] bg-white text-[#64748B] hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C]"
              }`}
            >
              {status}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#F1F5F9] pt-3">
        <StatusBadge status={currentStatus} />
        <span className="flex items-center gap-1 text-[10px] text-[#94A3B8]">
          <Clock size={10} />
          {formatDateTime(doctor.updatedAt)}
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    Available: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
    "Not Available": "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
        map[status] || "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]"
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function StatusDot({ active }) {
  return (
    <span
      className={`h-2.5 w-2.5 rounded-full ${
        active ? "bg-[#B91C1C]" : "bg-[#CBD5E1]"
      }`}
    />
  );
}
