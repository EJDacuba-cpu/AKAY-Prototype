import { useEffect, useMemo, useState } from "react";
import { Clock, Plus, Save, Stethoscope } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  createDoctorRecord,
  formatExpectedAvailableAt,
  getDoctorAvailability,
  listenDoctorAvailabilityUpdates,
  normalizeStatus,
  saveDoctorAvailability,
} from "../../services/doctorAvailability";
import { getCurrentUser } from "../../utils/auth";

const STATUS_OPTIONS = ["Available", "Unavailable"];
const DEFAULT_DESIGNATION = "General Practitioner";

const EMPTY_FORM = {
  doctorName: "",
  designation: DEFAULT_DESIGNATION,
  availabilityStatus: "Available",
  expectedAvailableAt: "",
};

function getDoctorId(doctor) {
  return doctor?.doctorId || doctor?.id || "";
}

function getDoctorName(doctor) {
  return doctor?.doctorName || doctor?.name || "";
}

function getDesignation(doctor) {
  return (
    doctor?.designation ||
    doctor?.doctorType ||
    doctor?.role ||
    DEFAULT_DESIGNATION
  );
}

function getDoctorStatus(doctor) {
  return normalizeStatus(doctor?.availabilityStatus || doctor?.status);
}

function getExpectedAvailableAt(doctor) {
  return doctor?.expectedAvailableAt || doctor?.expected_available_at || "";
}

function formatDateTime(value) {
  if (!value) return "Not updated yet";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getUpdaterName() {
  const user = getCurrentUser();
  return user?.name || user?.fullName || "RHU Staff";
}

function mapDoctorToForm(doctor) {
  return {
    doctorName: getDoctorName(doctor),
    designation: getDesignation(doctor),
    availabilityStatus: getDoctorStatus(doctor),
    expectedAvailableAt: getExpectedAvailableAt(doctor),
  };
}

export default function DoctorSchedule() {
  const [availability, setAvailability] = useState(getDoctorAvailability);
  const [mode, setMode] = useState("add");
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [savedNotice, setSavedNotice] = useState("");

  useEffect(() => {
    return listenDoctorAvailabilityUpdates(setAvailability);
  }, []);

  const doctors = useMemo(
    () =>
      (availability.doctors || []).filter((doctor) => doctor.active !== false),
    [availability.doctors],
  );
  const selectedDoctor =
    doctors.find((doctor) => getDoctorId(doctor) === selectedDoctorId) || null;

  function showSavedNotice(message) {
    setSavedNotice(message);
    window.setTimeout(() => setSavedNotice(""), 2200);
  }

  function updateForm(field, value) {
    setErrors((prev) => ({ ...prev, [field]: "" }));
    setForm((prev) => ({
      ...prev,
      [field]: value,
      expectedAvailableAt:
        field === "availabilityStatus" && value === "Available"
          ? ""
          : prev.expectedAvailableAt,
    }));
  }

  function startAddMode() {
    setMode("add");
    setSelectedDoctorId("");
    setForm(EMPTY_FORM);
    setErrors({});
  }

  function selectDoctor(doctor) {
    setMode("update");
    setSelectedDoctorId(getDoctorId(doctor));
    setForm(mapDoctorToForm(doctor));
    setErrors({});
  }

  function validateForm() {
    const nextErrors = {};
    const status = normalizeStatus(form.availabilityStatus);

    if (mode === "add" && !form.doctorName.trim()) {
      nextErrors.doctorName = "Doctor name is required.";
    }

    if (
      mode === "add" &&
      doctors.some(
        (doctor) =>
          getDoctorName(doctor).trim().toLowerCase() ===
          form.doctorName.trim().toLowerCase(),
      )
    ) {
      nextErrors.doctorName = "A doctor with this name already exists.";
    }

    if (!status) {
      nextErrors.availabilityStatus = "Availability status is required.";
    }

    if (status === "Unavailable" && !form.expectedAvailableAt) {
      nextErrors.expectedAvailableAt =
        "Expected available at is required when unavailable.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function saveDoctor(event) {
    event.preventDefault();
    if (!validateForm()) return;

    const now = new Date().toISOString();
    const updatedBy = getUpdaterName();
    const status = normalizeStatus(form.availabilityStatus);
    const nextDoctor = createDoctorRecord({
      doctorName: form.doctorName.trim(),
      designation: form.designation.trim() || DEFAULT_DESIGNATION,
      availabilityStatus: status,
      expectedAvailableAt:
        status === "Unavailable" ? form.expectedAvailableAt : "",
      updatedAt: now,
      updatedBy,
    });
    const nextAvailability = saveDoctorAvailability({
      ...availability,
      doctors: [...doctors, nextDoctor],
      updatedAt: now,
      updatedBy,
    });

    setAvailability(nextAvailability);
    setMode("update");
    setSelectedDoctorId(getDoctorId(nextDoctor));
    setForm(mapDoctorToForm(nextDoctor));
    showSavedNotice("Doctor record saved.");
  }

  function saveAvailability(event) {
    event.preventDefault();
    if (!selectedDoctor || !validateForm()) return;

    const now = new Date().toISOString();
    const updatedBy = getUpdaterName();
    const status = normalizeStatus(form.availabilityStatus);
    const nextDoctors = availability.doctors.map((doctor) => {
      if (getDoctorId(doctor) !== selectedDoctorId) return doctor;

      return {
        ...doctor,
        designation: form.designation.trim() || DEFAULT_DESIGNATION,
        doctorType: form.designation.trim() || DEFAULT_DESIGNATION,
        role: form.designation.trim() || DEFAULT_DESIGNATION,
        availabilityStatus: status,
        status,
        expectedAvailableAt:
          status === "Unavailable" ? form.expectedAvailableAt : "",
        expected_available_at:
          status === "Unavailable" ? form.expectedAvailableAt : "",
        availabilityNote:
          status === "Unavailable" ? form.expectedAvailableAt : "",
        note: status === "Unavailable" ? form.expectedAvailableAt : "",
        updatedAt: now,
        updatedBy,
      };
    });
    const nextAvailability = saveDoctorAvailability({
      ...availability,
      doctors: nextDoctors,
      updatedAt: now,
      updatedBy,
    });

    setAvailability(nextAvailability);
    showSavedNotice("Availability saved.");
  }

  return (
    <DashboardLayout role="rhu" title="Doctor Availability">
      <div className="space-y-5">
        {savedNotice && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
            {savedNotice}
          </div>
        )}

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <main className="min-w-0">
            <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
              <div className="border-b border-[#E2E8F0] px-5 py-4">
                <h2 className="text-sm font-semibold text-[#0F172A]">
                  RHU Doctors
                </h2>
                <p className="mt-1 text-xs text-[#64748B]">
                  Select a doctor card to update availability.
                </p>
              </div>

              {doctors.length === 0 ? (
                <div className="px-6 py-20 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9] text-[#94A3B8]">
                    <Stethoscope size={20} />
                  </div>
                  <p className="text-[13px] font-semibold text-[#334155]">
                    No doctor records yet
                  </p>
                  <p className="mt-1 text-[11.5px] text-[#94A3B8]">
                    Add an RHU doctor record from Availability Controls.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 p-4 md:grid-cols-2">
                  {doctors.map((doctor) => (
                    <DoctorAvailabilityCard
                      key={getDoctorId(doctor)}
                      doctor={doctor}
                      isSelected={getDoctorId(doctor) === selectedDoctorId}
                      onSelect={() => selectDoctor(doctor)}
                    />
                  ))}
                </div>
              )}
            </section>
          </main>

          <aside className="space-y-4 xl:sticky xl:top-5">
            <section className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#0F172A]">
                    Availability Controls
                  </h3>
                  <p className="mt-1 text-xs text-[#64748B]">
                    Add doctors or update the selected doctor.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={startAddMode}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-2.5 text-[11px] font-semibold text-[#B91C1C] hover:bg-red-100"
                >
                  <Plus size={12} />
                  Add
                </button>
              </div>

              <form
                onSubmit={mode === "add" ? saveDoctor : saveAvailability}
                className="mt-4 space-y-4"
              >
                {mode === "add" ? (
                  <FieldInput
                    label="Doctor Name"
                    required
                    value={form.doctorName}
                    onChange={(event) =>
                      updateForm("doctorName", event.target.value)
                    }
                    error={errors.doctorName}
                    placeholder="Example: Dr. Maria Santos"
                  />
                ) : (
                  <div className="rounded-xl border border-[#F1F5F9] bg-[#F8FAFC] px-3.5 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                      Selected Doctor
                    </p>
                    <p className="mt-1 truncate text-sm font-bold text-[#0F172A]">
                      {getDoctorName(selectedDoctor)}
                    </p>
                  </div>
                )}

                <FieldInput
                  label="Designation / Role"
                  value={form.designation}
                  onChange={(event) =>
                    updateForm("designation", event.target.value)
                  }
                  placeholder={DEFAULT_DESIGNATION}
                />

                <FieldSelect
                  label="Availability Status"
                  required
                  value={form.availabilityStatus}
                  onChange={(event) =>
                    updateForm("availabilityStatus", event.target.value)
                  }
                  error={errors.availabilityStatus}
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </FieldSelect>

                {form.availabilityStatus === "Unavailable" && (
                  <FieldInput
                    label="Expected Available At"
                    type="datetime-local"
                    required
                    value={form.expectedAvailableAt}
                    onChange={(event) =>
                      updateForm("expectedAvailableAt", event.target.value)
                    }
                    error={errors.expectedAvailableAt}
                  />
                )}

                <button
                  type="submit"
                  disabled={mode === "update" && !selectedDoctor}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#B91C1C] text-xs font-semibold text-white shadow-sm transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:bg-[#E5E7EB] disabled:text-[#94A3B8]"
                >
                  <Save size={13} />
                  {mode === "add" ? "Save Doctor" : "Save Availability"}
                </button>
              </form>
            </section>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}

function DoctorAvailabilityCard({ doctor, isSelected, onSelect }) {
  const status = getDoctorStatus(doctor);
  const isAvailable = status === "Available";
  const expectedAvailableAt = getExpectedAvailableAt(doctor);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`min-h-[136px] rounded-xl border bg-white p-4 text-left shadow-sm outline-none transition-all hover:-translate-y-0.5 hover:shadow-md focus:ring-2 focus:ring-[#B91C1C]/10 ${
        isSelected
          ? "border-[#B91C1C] ring-2 ring-[#B91C1C]/10"
          : "border-[#E2E8F0] hover:border-red-100"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[#0F172A]">
            {getDoctorName(doctor)}
          </p>
          <p className="mt-1 text-xs font-medium text-[#64748B]">
            {getDesignation(doctor)}
          </p>
        </div>
        <StatusBadge status={status} expectedAvailableAt={expectedAvailableAt} />
      </div>

      <div className="mt-4 space-y-1.5 border-t border-[#F1F5F9] pt-3">
        <p className="flex items-center gap-1.5 text-[10.5px] text-[#94A3B8]">
          <Clock size={11} />
          Updated {formatDateTime(doctor.updatedAt)}
        </p>
        {doctor.updatedBy && (
          <p className="truncate text-[10.5px] font-medium text-[#94A3B8]">
            Updated by {doctor.updatedBy}
          </p>
        )}
        {!isAvailable && expectedAvailableAt && (
          <p className="text-[11px] font-semibold text-[#B45309]">
            Unavailable until {formatExpectedAvailableAt(expectedAvailableAt)}
          </p>
        )}
      </div>
    </button>
  );
}

function StatusBadge({ status, expectedAvailableAt }) {
  const isAvailable = status === "Available";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
        isAvailable
          ? "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]"
          : "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]"
      }`}
      title={
        !isAvailable && expectedAvailableAt
          ? `Unavailable until ${formatExpectedAvailableAt(expectedAvailableAt)}`
          : status
      }
    >
      {status}
    </span>
  );
}

function FieldInput({ label, error, required, ...props }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
        {label} {required && <span className="text-[#B91C1C]">*</span>}
      </label>
      <input
        {...props}
        className={`h-10 w-full rounded-lg border bg-white px-3.5 text-sm text-[#1F2937] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10 ${
          error ? "border-[#B91C1C]" : "border-[#E5E7EB]"
        }`}
      />
      {error && <p className="mt-1 text-[11px] text-[#B91C1C]">{error}</p>}
    </div>
  );
}

function FieldSelect({ label, error, required, children, ...props }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
        {label} {required && <span className="text-[#B91C1C]">*</span>}
      </label>
      <select
        {...props}
        className={`h-10 w-full rounded-lg border bg-white px-3.5 text-sm text-[#1F2937] outline-none transition focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10 ${
          error ? "border-[#B91C1C]" : "border-[#E5E7EB]"
        }`}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-[11px] text-[#B91C1C]">{error}</p>}
    </div>
  );
}
