import { useEffect, useMemo, useState } from "react";
import { Clock, Lock, Stethoscope } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ConnectionErrorState,
  RefreshingIndicator,
  SearchField,
} from "../../components/common";
import { Button } from "../../components/ui/button";
import useAccess from "../../hooks/useAccess";
import {
  useDoctorAvailability,
  useProviderMutations,
  useRhuProviders,
} from "../../hooks/useDoctorAvailability";
import { errorStateVariant } from "../../utils/errorStateVariant";
import {
  AVAILABILITY_AVAILABLE,
  AVAILABILITY_STATUSES,
  normalizeAvailabilityStatus,
} from "../../services/doctorAvailability";
import {
  filterDoctorRoster,
  rosterCounts,
  ROSTER_STATUS,
} from "../../utils/doctorRoster";

const DEFAULT_DESIGNATION = "General Practitioner";
const MANAGE_PERMISSION = "rhu.providers.manage";
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50";

const EMPTY_FORM = {
  name: "",
  specialization: DEFAULT_DESIGNATION,
  availabilityStatus: AVAILABILITY_AVAILABLE,
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
    availabilityStatus: normalizeAvailabilityStatus(provider?.availabilityStatus),
  };
}

export default function DoctorSchedule() {
  const access = useAccess();
  const canManage = access.can(MANAGE_PERMISSION);
  const { providers, isLoading, isFetching, error, refetch } = useRhuProviders();
  const { availability } = useDoctorAvailability();
  const { update } = useProviderMutations();

  const [mode, setMode] = useState("idle");
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [statusFilter, setStatusFilter] = useState(ROSTER_STATUS.ALL);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [savedNotice, setSavedNotice] = useState("");

  const doctors = useMemo(
    () => (Array.isArray(providers) ? providers : []),
    [providers],
  );
  const counts = useMemo(() => rosterCounts(doctors), [doctors]);
  const visibleDoctors = useMemo(
    () => filterDoctorRoster(doctors, { status: statusFilter, query }),
    [doctors, statusFilter, query],
  );
  const selectedDoctor =
    doctors.find((doctor) => doctor.id === selectedDoctorId) || null;
  const saving = update.isPending;
  const editing = mode === "update" && Boolean(selectedDoctor);

  useEffect(() => {
    if (selectedDoctorId && !selectedDoctor && !isLoading) {
      setSelectedDoctorId("");
      setMode("idle");
      setForm(EMPTY_FORM);
    }
  }, [selectedDoctorId, selectedDoctor, isLoading]);

  function showSavedNotice(message) {
    setSavedNotice(message);
    window.setTimeout(() => setSavedNotice(""), 2200);
  }

  function updateForm(field, value) {
    setErrors((prev) => ({ ...prev, [field]: "", form: "" }));
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function selectDoctor(doctor) {
    setMode("update");
    setSelectedDoctorId(doctor.id);
    setForm(mapProviderToForm(doctor));
    setErrors({});
  }

  function validateForm() {
    const nextErrors = {};

    if (!AVAILABILITY_STATUSES.includes(form.availabilityStatus)) {
      nextErrors.availabilityStatus = "Availability status is required.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleMutationError(caught) {
    const message =
      caught?.payload?.errors?.name?.[0] ||
      caught?.payload?.message ||
      caught?.message ||
      "The provider could not be saved. Please try again.";
    setErrors((prev) => ({ ...prev, form: message }));
  }

  async function saveAvailability(event) {
    event.preventDefault();
    if (!canManage || !selectedDoctor || !validateForm() || saving) return;

    try {
      const updated = await update.mutateAsync({
        id: selectedDoctor.id,
        specialization: form.specialization.trim() || DEFAULT_DESIGNATION,
        availabilityStatus: form.availabilityStatus,
      });

      setForm(mapProviderToForm(updated));
      setErrors({});
      showSavedNotice("Availability saved.");
    } catch (caught) {
      handleMutationError(caught);
    }
  }

  const statusOptions = [
    { value: ROSTER_STATUS.ALL, label: "All", count: counts.all },
    { value: ROSTER_STATUS.AVAILABLE, label: "Available", count: counts.available },
    { value: ROSTER_STATUS.UNAVAILABLE, label: "Unavailable", count: counts.unavailable },
  ];

  return (
    <DashboardLayout role="rhu" title="Doctor Availability">
      <div className="space-y-4">
        <div className="min-w-0">
          <h1 className="text-[17px] font-bold leading-tight tracking-tight text-ink-800">Doctor Availability</h1>
          <p className="mt-0.5 text-[13px] text-neutral-600">
            Official doctors come from Admin accounts. Confirm they are on duty, then set Available or Unavailable. Status stays until it is changed.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SummaryChip
            label={`${availability.availableCount} of ${availability.totalCount} available`}
          />
          <SummaryChip
            label={availability.canSubmitReferral ? "Referrals can be submitted" : "Referral submissions blocked"}
            tone={availability.canSubmitReferral ? "success" : "warning"}
          />
          {isFetching && doctors.length > 0 ? (
            <RefreshingIndicator label="Updating roster..." />
          ) : null}
        </div>

        {savedNotice ? (
          <p className="rounded-xl border border-success-100 bg-success-50 px-4 py-3 text-xs font-semibold text-success-700">
            {savedNotice}
          </p>
        ) : null}

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <section className="min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <div className="space-y-3 border-b border-neutral-200 px-4 py-3 sm:px-5">
              <PillTrack
                label="Availability"
                value={statusFilter}
                onChange={setStatusFilter}
                options={statusOptions}
              />
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder="Search name or specialization"
                label="Search doctors"
              />
            </div>

            {isLoading ? (
              <div className="px-6 py-20 text-center text-[13px] text-neutral-500">
                Loading roster...
              </div>
            ) : error ? (
              <div className="p-6">
                <ConnectionErrorState
                  size="compact"
                  variant={errorStateVariant(error)}
                  onRetry={() => refetch()}
                  retrying={isFetching}
                />
              </div>
            ) : doctors.length === 0 ? (
              <EmptyRoster />
            ) : visibleDoctors.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="text-[13px] font-semibold text-ink-800">No doctors match these filters</p>
                <p className="mt-1 text-[12px] text-neutral-500">
                  Clear search or choose All to see the full roster.
                </p>
              </div>
            ) : (
              <div className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4">
                {visibleDoctors.map((doctor) => (
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

          <aside className="xl:sticky xl:top-5">
            <section className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-5">
              {!canManage ? (
                <ReadOnlyPanel doctor={selectedDoctor} />
              ) : editing ? (
                <AvailabilityForm
                  form={form}
                  errors={errors}
                  saving={saving}
                  selectedName={selectedDoctor.name}
                  onChange={updateForm}
                  onSubmit={saveAvailability}
                />
              ) : (
                <IdlePanel canManage={canManage} />
              )}
            </section>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}

function AvailabilityForm({ form, errors, saving, selectedName, onChange, onSubmit }) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-ink-800">Official doctor</h2>
        <p className="mt-1 text-[12px] text-neutral-600">
          Name is managed from the official account. Confirm they are on duty before setting Available.
        </p>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Official account</p>
        <p className="mt-1 truncate text-sm font-semibold text-ink-800">{selectedName}</p>
      </div>

      <FieldInput
        label="Specialization"
        value={form.specialization}
        onChange={(event) => onChange("specialization", event.target.value)}
        placeholder={DEFAULT_DESIGNATION}
      />

      <FieldSelect
        label="Availability status"
        required
        value={form.availabilityStatus}
        onChange={(event) => onChange("availabilityStatus", event.target.value)}
        error={errors.availabilityStatus}
      >
        {AVAILABILITY_STATUSES.map((status) => (
          <option key={status}>{status}</option>
        ))}
      </FieldSelect>

      {errors.form ? <p className="text-[12px] font-medium text-alert-700">{errors.form}</p> : null}

      <Button type="submit" variant="brand" className="w-full" disabled={saving}>
        {saving ? "Saving..." : "Save availability"}
      </Button>
    </form>
  );
}

function ReadOnlyPanel({ doctor }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Lock size={14} className="mt-0.5 shrink-0 text-brand-700" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold text-ink-800">View only</h2>
          <p className="mt-1 text-[12px] text-neutral-600">
            The MHO has not granted Manage doctor availability.
          </p>
        </div>
      </div>
      {doctor ? (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <IdentityChip />
            <AvailabilityChip status={doctor.availabilityStatus} />
          </div>
          <p className="mt-2 truncate text-sm font-semibold text-ink-800">{doctor.name}</p>
          <p className="mt-1 text-[12px] text-neutral-600">
            {doctor.specialization || DEFAULT_DESIGNATION}
          </p>
        </div>
      ) : (
        <p className="text-[12px] text-neutral-500">Select a doctor to see details.</p>
      )}
    </div>
  );
}

function IdlePanel({ canManage }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-ink-800">Availability controls</h2>
      <p className="mt-1 text-[12px] text-neutral-600">
        {canManage
          ? "Select a doctor to set Available or Unavailable after confirming they are on duty."
          : "Select a doctor to see who is on duty."}
      </p>
    </div>
  );
}

function EmptyRoster() {
  return (
    <div className="px-6 py-16 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
        <Stethoscope size={18} aria-hidden="true" />
      </div>
      <p className="text-[13px] font-semibold text-ink-800">No official doctors yet</p>
      <p className="mx-auto mt-1 max-w-sm text-[12px] text-neutral-500">
        Official doctors appear when Admin creates a Doctor account. With none, referrals stay blocked.
      </p>
    </div>
  );
}

function DoctorAvailabilityCard({ doctor, isSelected, onSelect }) {
  const status = normalizeAvailabilityStatus(doctor.availabilityStatus);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`min-h-[120px] rounded-xl border p-4 text-left outline-none transition-colors ${FOCUS_RING} ${
        isSelected
          ? "border-brand-600 bg-brand-50"
          : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-800">{doctor.name}</p>
          <p className="mt-1 text-[12px] text-neutral-600">
            {doctor.specialization || DEFAULT_DESIGNATION}
          </p>
        </div>
        <AvailabilityChip status={status} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-neutral-100 pt-3">
        <IdentityChip />
        <p className="flex items-center gap-1 text-[11px] text-neutral-500">
          <Clock size={11} aria-hidden="true" />
          Updated {formatDateTime(doctor.updatedAt)}
        </p>
      </div>
    </button>
  );
}

function PillTrack({ label, value, onChange, options }) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex min-h-11 w-fit max-w-full flex-wrap items-center gap-0.5 rounded-full bg-neutral-100 p-1"
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12px] font-medium transition-colors ${FOCUS_RING} ${
              selected ? "bg-white text-ink-800 shadow-xs" : "text-neutral-600 hover:text-ink-800"
            }`}
          >
            {option.label}
            <span
              className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                selected ? "bg-brand-50 text-brand-700" : "bg-white/80 text-neutral-500"
              }`}
            >
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SummaryChip({ label, tone = "neutral" }) {
  const tones = {
    success: "border-success-100 bg-success-50 text-success-700",
    warning: "border-warning-100 bg-warning-50 text-warning-700",
    neutral: "border-neutral-200 bg-white text-ink-700",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tones[tone]}`}>
      {label}
    </span>
  );
}

function IdentityChip() {
  return (
    <span className="inline-flex items-center rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-700">
      Official
    </span>
  );
}

function AvailabilityChip({ status }) {
  const available = status === AVAILABILITY_AVAILABLE;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        available
          ? "border-success-100 bg-success-50 text-success-700"
          : "border-warning-100 bg-warning-50 text-warning-700"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${available ? "bg-success-500" : "bg-warning-500"}`} />
      {status}
    </span>
  );
}

function FieldInput({ label, error, required, ...props }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-500">
        {label} {required ? <span className="text-alert-700">*</span> : null}
      </label>
      <input
        {...props}
        className={`h-10 w-full rounded-lg border bg-white px-3 text-[13px] text-ink-800 outline-none transition placeholder:text-neutral-400 focus:border-ink-400 focus:ring-2 focus:ring-ink-400/30 ${
          error ? "border-alert-600" : "border-neutral-200"
        }`}
      />
      {error ? <p className="mt-1 text-[12px] text-alert-700">{error}</p> : null}
    </div>
  );
}

function FieldSelect({ label, error, required, children, ...props }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-500">
        {label} {required ? <span className="text-alert-700">*</span> : null}
      </label>
      <select
        {...props}
        className={`h-10 w-full rounded-lg border bg-white px-3 text-[13px] text-ink-800 outline-none transition focus:border-ink-400 focus:ring-2 focus:ring-ink-400/30 ${
          error ? "border-alert-600" : "border-neutral-200"
        }`}
      >
        {children}
      </select>
      {error ? <p className="mt-1 text-[12px] text-alert-700">{error}</p> : null}
    </div>
  );
}
