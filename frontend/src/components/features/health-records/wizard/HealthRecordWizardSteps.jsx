import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  FileClock,
  Search,
  X,
} from "lucide-react";

import InlineSpinner from "../../../common/loading/InlineSpinner";

/**
 * Shared shell for every step of the Add Health Record wizard.
 *
 * The "Visit Overview" strip is part of the shell rather than each step because
 * the date and time it shows are properties of the visit being recorded, not of
 * whichever step happens to be on screen.
 */
export function WizardCard({
  title,
  subtitle,
  visitDate,
  visitTime,
  showVisitOverview = true,
  children,
}) {
  return (
    <section className="anim-fade-up ml-0 mr-auto w-full max-w-6xl">
      <div className="rounded-2xl border border-[#E8ECF0] bg-white px-6 py-6 shadow-sm sm:px-7">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[#0F172A]">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-[13px] leading-relaxed text-[#64748B]">
                {subtitle}
              </p>
            )}
          </div>
          {showVisitOverview && (
            <div className="flex flex-none items-center gap-3.5">
              <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#94A3B8]">
                Visit Overview
              </span>
              <span className="h-4 w-px bg-[#E2E8F0]" aria-hidden="true" />
              <span className="flex items-center gap-1.5">
                <CalendarDays size={14} className="text-[#B91C1C]" />
                <span className="text-[12.5px] font-bold text-[#0F172A]">
                  {visitDate}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <Clock size={14} className="text-[#B91C1C]" />
                <span className="text-[12.5px] font-bold text-[#0F172A]">
                  {visitTime}
                </span>
              </span>
            </div>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}

function WizardFooter({
  onBack,
  backLabel = "Back",
  onNext,
  nextLabel = "Next",
  nextDisabled = false,
  nextBusy = false,
  align = "between",
}) {
  return (
    <div
      className={`mt-8 flex items-center gap-3 ${
        align === "between" ? "justify-between" : "justify-end"
      }`}
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-[#E5E7EB] bg-white px-5 py-2.5 text-[12.5px] font-semibold text-[#475569] transition hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#B91C1C]"
        >
          {backLabel}
        </button>
      ) : (
        <span />
      )}
      {onNext && (
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled || nextBusy}
          className="inline-flex items-center gap-2 rounded-xl bg-[#B91C1C] px-6 py-2.5 text-[12.5px] font-bold text-white shadow-sm transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {nextBusy && <InlineSpinner />}
          {nextLabel}
        </button>
      )}
    </div>
  );
}

function PatientPanel({
  patients,
  selectedPatientId,
  onSelectPatient,
  searchOpen,
  searchTerm,
  onSearchChange,
  onToggleSearch,
  draftCount,
  onOpenDrafts,
  showDrafts,
  loading,
  loadError,
  onRetryLoad,
}) {
  return (
    <div className="w-full flex-none rounded-2xl border border-[#E8ECF0] bg-white p-4 lg:w-[290px]">
      <div className="mb-4 flex items-center justify-end gap-2">
        {searchOpen ? (
          <div className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-[#FECACA] bg-white px-2.5">
            <Search size={14} className="shrink-0 text-[#94A3B8]" />
            <input
              autoFocus
              value={searchTerm}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search patients..."
              className="min-w-0 flex-1 border-0 text-[12.5px] outline-none"
            />
            <button
              type="button"
              onClick={onToggleSearch}
              aria-label="Close patient search"
              className="shrink-0 text-[#94A3B8] hover:text-[#B91C1C]"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onToggleSearch}
            aria-label="Search patients"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#64748B] transition hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#B91C1C]"
          >
            <Search size={16} />
          </button>
        )}
        {showDrafts && (
          <button
            type="button"
            onClick={onOpenDrafts}
            className="inline-flex h-9 flex-none items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[12px] font-bold text-[#475569] transition hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#B91C1C]"
          >
            <FileClock size={14} />
            Drafts
            {draftCount > 0 && (
              <span className="flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-[#B91C1C] px-1 text-[9px] font-bold text-white">
                {draftCount}
              </span>
            )}
          </button>
        )}
      </div>

      <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#94A3B8]">
        Recent Patients
      </p>

      {loading ? (
        <div className="py-6 text-center">
          <InlineSpinner label="Loading patients..." />
        </div>
      ) : loadError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-amber-800">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            {loadError}
          </p>
          <button
            type="button"
            onClick={onRetryLoad}
            className="mt-2 text-[11px] font-bold text-[#991B1B] hover:text-[#7F1D1D]"
          >
            Retry
          </button>
        </div>
      ) : patients.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#E5E7EB] px-3 py-4 text-center text-[11.5px] text-[#94A3B8]">
          No matching patients.
        </p>
      ) : (
        <div className="flex max-h-[420px] flex-col overflow-y-auto border-t border-[#F1F5F9]">
          {patients.map((patient) => {
            const selected =
              String(patient.id) === String(selectedPatientId);

            return (
              <button
                key={patient.id}
                type="button"
                onClick={() => onSelectPatient(patient.id)}
                aria-pressed={selected}
                className={`flex min-w-0 items-center gap-2.5 border-b border-[#F1F5F9] px-2.5 py-2.5 text-left transition ${
                  selected ? "rounded-lg bg-[#FEF2F2]" : "hover:bg-[#F8FAFC]"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold text-[#111827]">
                    {patient.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-[#94A3B8]">
                    {patient.meta}
                  </span>
                </span>
                {selected && (
                  <Check size={14} strokeWidth={3} className="shrink-0 text-[#B91C1C]" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const CONSULTATION_TYPES = [
  {
    key: "new",
    title: "New Consultation",
    body: "For a new complaint or new assessment.",
  },
  {
    key: "followup",
    title: "Follow-up Visit",
    body: "For a scheduled or existing follow-up.",
  },
];

/**
 * Step 1 - pick the patient and whether this visit is new or a follow-up.
 *
 * These are one screen rather than two because the consultation type is only
 * meaningful for a specific patient: whether "Follow-up Visit" is even a valid
 * choice depends on that patient having an active follow-up task.
 */
export function ConsultationSetupStep({
  visitDate,
  visitTime,
  patients,
  selectedPatientId,
  onSelectPatient,
  consultationType,
  onConsultationTypeChange,
  searchOpen,
  searchTerm,
  onSearchChange,
  onToggleSearch,
  draftCount,
  onOpenDrafts,
  showDrafts,
  patientsLoading,
  patientsLoadError,
  onRetryLoadPatients,
  followUpUnavailableReason,
  error,
  onBack,
  onNext,
}) {
  const canProceed = Boolean(selectedPatientId && consultationType);

  return (
    <WizardCard
      title="New Health Record"
      subtitle="Set the patient and visit type to begin."
      visitDate={visitDate}
      visitTime={visitTime}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <PatientPanel
          patients={patients}
          selectedPatientId={selectedPatientId}
          onSelectPatient={onSelectPatient}
          searchOpen={searchOpen}
          searchTerm={searchTerm}
          onSearchChange={onSearchChange}
          onToggleSearch={onToggleSearch}
          draftCount={draftCount}
          onOpenDrafts={onOpenDrafts}
          showDrafts={showDrafts}
          loading={patientsLoading}
          loadError={patientsLoadError}
          onRetryLoad={onRetryLoadPatients}
        />

        <div className="min-w-0 flex-1 rounded-2xl border border-[#E8ECF0] bg-white p-5">
          <p className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-[#94A3B8]">
            Select Consultation Visit
          </p>
          <p className="mt-1 text-[13.5px] text-[#64748B]">
            Choose whether this is a new consultation or a follow-up visit.
          </p>

          <div
            className="mt-8 flex flex-col gap-3.5"
            data-field="consultationType"
            tabIndex={error ? -1 : undefined}
          >
            {CONSULTATION_TYPES.map((type) => {
              const selected = consultationType === type.key;
              const blocked =
                type.key === "followup" && Boolean(followUpUnavailableReason);

              return (
                <button
                  key={type.key}
                  type="button"
                  onClick={() => onConsultationTypeChange(type.key)}
                  disabled={blocked}
                  aria-pressed={selected}
                  className={`flex items-center gap-4 rounded-xl border-2 p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${
                    selected
                      ? "border-[#B91C1C] bg-[#FEF2F2]"
                      : "border-[#E8ECF0] bg-white hover:border-[#FECACA] hover:shadow-sm"
                  }`}
                >
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg border border-[#E5E7EB] bg-white">
                    {type.key === "new" ? (
                      <Search size={20} className="text-[#B91C1C]" />
                    ) : (
                      <CalendarDays size={20} className="text-[#B91C1C]" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15.5px] font-bold text-[#0F172A]">
                      {type.title}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-[#64748B]">
                      {blocked ? followUpUnavailableReason : type.body}
                    </span>
                  </span>
                  <ChevronRight size={18} className="flex-none text-[#CBD5E1]" />
                </button>
              );
            })}
          </div>

          {error && (
            <p className="mt-3 text-[11px] font-medium text-[#B91C1C]">{error}</p>
          )}

          <WizardFooter
            onBack={onBack}
            onNext={onNext}
            nextDisabled={!canProceed}
          />
        </div>
      </div>
    </WizardCard>
  );
}

/**
 * Step 2 - choose the program for a new consultation.
 *
 * Selecting a card advances immediately; there is no Next button, matching the
 * approved flow. The card list is supplied by the page so the stored
 * classification value stays owned by the page's RECORD_TYPE_OPTIONS.
 */
export function ProgramSelectStep({ programs, selected, onSelect, onBack, error }) {
  return (
    <WizardCard
      title="Select Program"
      subtitle="Choose the health program or service for this consultation."
      showVisitOverview={false}
    >
      <div
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        data-field="healthRecordType"
        tabIndex={error ? -1 : undefined}
      >
        {programs.map((program) => {
          const Icon = program.icon;
          const isSelected = selected === program.key;
          const isDisabled = Boolean(program.disabled);

          return (
            <button
              key={program.key}
              type="button"
              onClick={() => onSelect(program.key)}
              disabled={isDisabled}
              aria-pressed={isSelected}
              title={isDisabled ? program.disabledReason : undefined}
              className={`relative flex min-h-[150px] flex-col gap-3 rounded-xl p-5 text-left transition ${
                isDisabled
                  ? "cursor-not-allowed bg-[#F8FAFC] opacity-60"
                  : isSelected
                    ? "bg-[#FEF2F2] shadow-sm"
                    : "bg-white hover:bg-[#F8FAFC] hover:shadow-sm"
              }`}
            >
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg border border-[#E5E7EB] bg-white">
                <Icon size={21} className="text-[#B91C1C]" />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-[14.5px] font-bold ${
                    isSelected ? "text-[#B91C1C]" : "text-[#0F172A]"
                  }`}
                >
                  {program.title}
                </span>
                <span className="mt-1 block text-[12px] leading-relaxed text-[#64748B]">
                  {isDisabled ? program.disabledReason : program.description}
                </span>
              </span>
              {isSelected && !isDisabled && (
                <Check
                  size={20}
                  strokeWidth={2.4}
                  className="absolute right-4 top-4 text-[#B91C1C]"
                />
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="mt-3 text-[11px] font-medium text-[#B91C1C]">{error}</p>
      )}

      <WizardFooter onBack={onBack} />
    </WizardCard>
  );
}

/**
 * Step 3a - pick which existing follow-up this visit fulfils.
 *
 * Only tasks in an active state are listed. A follow-up visit must be tied to
 * one, because the server requires monitoring_data.followUpTaskId for any
 * record submitted with visit_type = follow_up_visit.
 */
export function FollowUpSelectStep({
  tasks,
  selectedTaskId,
  onSelect,
  loading,
  onBack,
  onNext,
  visitDate,
  visitTime,
}) {
  return (
    <WizardCard
      title="Select Existing Follow-up"
      subtitle="Choose the follow-up record you want to continue."
      visitDate={visitDate}
      visitTime={visitTime}
    >
      <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2.5 text-[12.5px] text-[#92400E]">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-[#B45309]" />
        The list below shows active follow-ups for this patient.
      </div>

      {loading ? (
        <div className="py-10 text-center">
          <InlineSpinner label="Loading follow-ups..." />
        </div>
      ) : tasks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#E5E7EB] bg-[#F8FAFC] px-4 py-10 text-center text-[13px] text-[#64748B]">
          This patient has no active follow-ups. Go back and choose New
          Consultation instead.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr>
                {[
                  "Follow-up ID",
                  "From Record",
                  "Service Type",
                  "Next Follow-up Date",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="px-2 py-2 text-[10px] font-bold uppercase tracking-[0.06em] text-[#94A3B8]"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const selected = String(task.id) === String(selectedTaskId);

                return (
                  <tr
                    key={task.id}
                    onClick={() => onSelect(task.id)}
                    className={`cursor-pointer border-t border-[#F1F5F9] ${
                      selected ? "bg-[#FEF2F2]" : "hover:bg-[#FAFBFD]"
                    }`}
                  >
                    <td className="px-2 py-3">
                      <span className="inline-flex items-center gap-2.5 text-[13px] font-bold text-[#0F172A]">
                        <span
                          className={`h-[15px] w-[15px] flex-none rounded-full border-[1.5px] ${
                            selected
                              ? "border-[#B91C1C] bg-[#B91C1C] shadow-[inset_0_0_0_3.5px_#fff]"
                              : "border-[#E5E7EB] bg-white"
                          }`}
                        />
                        {task.label}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-[13px] text-[#475569]">
                      {task.fromRecord}
                    </td>
                    <td className="px-2 py-3 text-[13px] text-[#475569]">
                      {task.serviceType}
                    </td>
                    <td className="px-2 py-3 text-[13px] text-[#475569]">
                      {task.dueLabel}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <WizardFooter
        onBack={onBack}
        onNext={onNext}
        nextDisabled={!selectedTaskId}
      />
    </WizardCard>
  );
}

/**
 * Step 3b - confirm the chosen follow-up before opening the record form.
 */
export function FollowUpConfirmStep({
  fields,
  onBack,
  onContinue,
  visitDate,
  visitTime,
}) {
  return (
    <WizardCard
      title="Selected Follow-up"
      subtitle="Review the linked follow-up before continuing to the record."
      visitDate={visitDate}
      visitTime={visitTime}
    >
      <div className="flex gap-4 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-5">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg border border-[#E5E7EB] bg-white">
          <CalendarDays size={21} className="text-[#B91C1C]" />
        </span>
        <dl className="grid flex-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.label}>
              <dt className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#94A3B8]">
                {field.label}
              </dt>
              <dd className="mt-0.5 font-bold text-[#0F172A]">
                {field.value || "Not recorded"}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <WizardFooter
        onBack={onBack}
        onNext={onContinue}
        nextLabel="Continue to Record"
      />
    </WizardCard>
  );
}

/**
 * Final step - the disposition, and the save.
 *
 * `NextActionSection` supplies the card grid and the conditional fields; this
 * wrapper only adds the wizard chrome and the primary action.
 */
export function NextActionStep({
  visitDate,
  visitTime,
  children,
  onBack,
  onSave,
  saving,
  saveLabel = "Save Record",
}) {
  return (
    <WizardCard
      title="New Health Record"
      subtitle="Set the patient and visit type to begin."
      visitDate={visitDate}
      visitTime={visitTime}
    >
      <h3 className="text-[15px] font-bold text-[#0F172A]">Next Action</h3>
      <p className="mb-4 mt-0.5 text-[12.5px] text-[#64748B]">
        What should be done next?
      </p>

      {children}

      <WizardFooter
        onBack={onBack}
        onNext={onSave}
        nextLabel={saveLabel}
        nextBusy={saving}
      />
    </WizardCard>
  );
}
