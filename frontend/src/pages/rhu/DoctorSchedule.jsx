import { useEffect, useMemo, useState } from "react";
import { Clock, Plus, Save, Stethoscope, UserMinus } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  AVAILABILITY_STATUSES,
  normalizeAvailabilityStatus,
} from "../../services/doctorAvailability";
import {
  useProviderMutations,
  useRhuProviders,
} from "../../hooks/useDoctorAvailability";

const DEFAULT_DESIGNATION = "General Practitioner";

const EMPTY_FORM = {
  name: "",
  specialization: DEFAULT_DESIGNATION,
  availabilityStatus: "Available",
  remarks: "",
};

function formatDateTime(value) {
  if (!value) return "Not updated yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapProviderToForm(provider) {
  return {
    name: provider?.name || "",
    specialization: provider?.specialization || DEFAULT_DESIGNATION,
    availabilityStatus: normalizeAvailabilityStatus(
      provider?.availabilityStatus,
    ),
    remarks: provider?.remarks || "",
  };
}

/**
 * DOC-20 - the RHU manages its own roster. The list is scoped server-side by
 * FacilityAccessService (DOC-15), so this page no longer filters by facility
 * in the browser: an RHU simply cannot receive another RHU's providers.
 */
export default function DoctorSchedule() {
  const { providers, isLoading, error } = useRhuProviders();
  const { create, update, deactivate } = useProviderMutations();

  const [mode, setMode] = useState("add");
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [savedNotice, setSavedNotice] = useState("");

  const doctors = useMemo(
    () => (Array.isArray(providers) ? providers : []),
    [providers],
  );
  const selectedDoctor =
    doctors.find((doctor) => doctor.id === selectedDoctorId) || null;
  const saving = create.isPending || update.isPending || deactivate.isPending;

  // A provider deactivated in another tab must not stay selected here.
  useEffect(() => {
    if (selectedDoctorId && !selectedDoctor && !isLoading) {
      setSelectedDoctorId("");
      setMode("add");
      setForm(EMPTY_FORM);
    }
  }, [selectedDoctorId, selectedDoctor, isLoading]);

  function showSavedNotice(message) {
    setSavedNotice(message);
    window.setTimeout(() => setSavedNotice(""), 2200);
  }

  function updateForm(field, value) {
    setErrors((prev) => ({ ...prev, [field]: "" }));
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function startAddMode() {
    setMode("add");
    setSelectedDoctorId("");
    setForm(EMPTY_FORM);
    setErrors({});
  }

  function selectDoctor(doctor) {
    setMode("update");
    setSelectedDoctorId(doctor.id);
    setForm(mapProviderToForm(doctor));
    setErrors({});
  }

  function validateForm() {
    const nextErrors = {};

    if (mode === "add" && !form.name.trim()) {
      nextErrors.name = "Doctor name is required.";
    }

    // The server holds the authoritative uniqueness rule (one active provider
    // per name per RHU); this check only avoids a pointless round trip.
    if (
      mode === "add" &&
      doctors.some(
        (doctor) =>
          doctor.name.trim().toLowerCase() === form.name.trim().toLowerCase(),
      )
    ) {
      nextErrors.name = "A doctor with this name already exists.";
    }

    if (!AVAILABILITY_STATUSES.includes(form.availabilityStatus)) {
      nextErrors.availabilityStatus = "Availability status is required.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleMutationError(error) {
    const message =
      error?.payload?.errors?.name?.[0] ||
      error?.message ||
      "The provider could not be saved. Please try again.";
    setErrors((prev) => ({ ...prev, form: message }));
  }

  async function saveDoctor(event) {
    event.preventDefault();
    if (!validateForm() || saving) return;

    try {
      const created = await create.mutateAsync({
        name: form.name.trim(),
        specialization: form.specialization.trim() || DEFAULT_DESIGNATION,
        availabilityStatus: form.availabilityStatus,
        remarks: form.remarks.trim(),
      });

      setMode("update");
      setSelectedDoctorId(created.id);
      setForm(mapProviderToForm(created));
      setErrors({});
      showSavedNotice("Doctor record saved.");
    } catch (error) {
      handleMutationError(error);
    }
  }

  async function saveAvailability(event) {
    event.preventDefault();
    if (!selectedDoctor || !validateForm() || saving) return;

    try {
      const updated = await update.mutateAsync({
        id: selectedDoctor.id,
        specialization: form.specialization.trim() || DEFAULT_DESIGNATION,
        availabilityStatus: form.availabilityStatus,
        remarks: form.remarks.trim(),
      });

      setForm(mapProviderToForm(updated));
      setErrors({});
      showSavedNotice("Availability saved.");
    } catch (error) {
      handleMutationError(error);
    }
  }

  async function deactivateDoctor() {
    if (!selectedDoctor || saving) return;

    const confirmed = window.confirm(
      `Remove ${selectedDoctor.name} from the roster?\n\nPast referrals keep the details recorded at submission time.`,
    );
    if (!confirmed) return;

    try {
      await deactivate.mutateAsync(selectedDoctor.id);
      startAddMode();
      showSavedNotice("Doctor removed from the roster.");
    } catch (error) {
      handleMutationError(error);
    }
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

              {isLoading ? (
                <div className="px-6 py-20 text-center text-[12px] text-[#94A3B8]">
                  Loading roster...
                </div>
              ) : error ? (
                <div className="px-6 py-20 text-center text-[12px] text-[#B91C1C]">
                  The provider roster could not be loaded. Please retry.
                </div>
              ) : doctors.length === 0 ? (
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
                      key={doctor.id}
                      doctor={doctor}
                      isSelected={doctor.id === selectedDoctorId}
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
                    value={form.name}
                    onChange={(event) => updateForm("name", event.target.value)}
                    error={errors.name}
                    placeholder="Example: Dr. Maria Santos"
                  />
                ) : (
                  <div className="rounded-xl border border-[#F1F5F9] bg-[#F8FAFC] px-3.5 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                      Selected Doctor
                    </p>
                    <p className="mt-1 truncate text-sm font-bold text-[#0F172A]">
                      {selectedDoctor?.name || ""}
                    </p>
                  </div>
                )}

                <FieldInput
                  label="Specialization"
                  value={form.specialization}
                  onChange={(event) =>
                    updateForm("specialization", event.target.value)
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
                  {AVAILABILITY_STATUSES.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </FieldSelect>

                <FieldInput
                  label="Remarks"
                  value={form.remarks}
                  onChange={(event) => updateForm("remarks", event.target.value)}
                  error={errors.remarks}
                  placeholder="Example: Covering provider, back Monday"
                />

                {errors.form && (
                  <p className="text-[11px] font-medium text-[#B91C1C]">
                    {errors.form}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={saving || (mode === "update" && !selectedDoctor)}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#B91C1C] text-xs font-semibold text-white shadow-sm transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:bg-[#E5E7EB] disabled:text-[#94A3B8]"
                >
                  <Save size={13} />
                  {saving
                    ? "Saving..."
                    : mode === "add"
                      ? "Save Doctor"
                      : "Save Availability"}
                </button>

                {mode === "update" && selectedDoctor && (
                  <button
                    type="button"
                    onClick={deactivateDoctor}
                    disabled={saving}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#E5E7EB] bg-white text-xs font-semibold text-[#64748B] transition hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <UserMinus size={13} />
                    Remove from roster
                  </button>
                )}
              </form>
            </section>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}

function DoctorAvailabilityCard({ doctor, isSelected, onSelect }) {
  const status = normalizeAvailabilityStatus(doctor.availabilityStatus);
  const isAvailable = status === "Available";

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
            {doctor.name}
          </p>
          <p className="mt-1 text-xs font-medium text-[#64748B]">
            {doctor.specialization || DEFAULT_DESIGNATION}
          </p>
        </div>
        <StatusBadge status={status} remarks={doctor.remarks} />
      </div>

      <div className="mt-4 space-y-1.5 border-t border-[#F1F5F9] pt-3">
        <p className="flex items-center gap-1.5 text-[10.5px] text-[#94A3B8]">
          <Clock size={11} />
          Updated {formatDateTime(doctor.updatedAt)}
        </p>
        {!isAvailable && doctor.remarks && (
          <p className="text-[11px] font-semibold text-[#B45309]">
            {doctor.remarks}
          </p>
        )}
      </div>
    </button>
  );
}

function StatusBadge({ status, remarks }) {
  const isAvailable = status === "Available";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
        isAvailable
          ? "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]"
          : "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]"
      }`}
      title={!isAvailable && remarks ? remarks : status}
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
