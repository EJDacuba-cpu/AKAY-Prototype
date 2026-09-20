import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  FileClock,
  Search,
  X,
} from "lucide-react";
import { forwardRef, useRef } from "react";

import ButtonSpinner from "../../../common/loading/ButtonSpinner";
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
  unboxed = false,
  headerActions = null,
  backAction = null,
  children,
}) {
  return (
    <section className="anim-fade-up ml-0 mr-auto w-full max-w-6xl">
      <div className={unboxed ? "" : "rounded-xl border border-[#E8ECF0] bg-white px-5 py-5 shadow-sm sm:px-6"}>
        {backAction}
        {/* The step-based consultation carries its title above the card, so the
            heading here is optional; the Visit Overview strip stays either way. */}
        {(title || subtitle || showVisitOverview || headerActions) && (
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {title || subtitle ? (
          <div className="min-w-0">
            {title && (
              <h2 className="text-lg font-bold tracking-tight text-[#0F172A]">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 text-[13px] leading-relaxed text-[#64748B]">
                {subtitle}
              </p>
            )}
          </div>
          ) : (
            <span />
          )}
          {(showVisitOverview || headerActions) && (
            <div className="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:items-end">
              {showVisitOverview && (
                <div className="flex flex-none flex-wrap items-center gap-3.5">
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
              {headerActions}
            </div>
          )}
        </div>
        )}
        {children}
      </div>
    </section>
  );
}

/**
 * One footer for every wizard screen: an optional Back on the left (or, where
 * the page-level Back already handles that, a subtle "Step n of N" line), and
 * the primary action on the right.
 */
export function WizardFooter({
  onBack,
  backLabel = "Back",
  onNext,
  nextLabel = "Next",
  nextDisabled = false,
  nextBusy = false,
  // Shown INSTEAD of nextLabel while the action runs - never alongside it.
  busyLabel = "Loading...",
  helper = "",
  extra = null,
  align = "between",
}) {
  // The consultation workspace navigates from its own sticky action bar, so a
  // step that passes no actions gets no footer at all.
  if (!onBack && !onNext && !extra && !helper) return null;

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
      ) : helper ? (
        <p className="hidden min-w-0 truncate text-[11px] font-medium text-[#94A3B8] sm:block">
          {helper}
        </p>
      ) : (
        <span />
      )}
      {(onNext || extra) && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          {extra}
          {onNext && (
            <button
              type="button"
              onClick={onNext}
              disabled={nextDisabled || nextBusy}
              aria-busy={nextBusy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-6 py-2.5 text-[12.5px] font-bold text-white shadow-sm transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {nextBusy ? (
                <>
                  <ButtonSpinner />
                  {busyLabel}
                </>
              ) : (
                nextLabel
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Page-level patient search for the setup step. Presentational only: the rows,
 * the search term and the open state all come from the page's existing patient
 * search, so there is still exactly one search implementation.
 */
const PatientSearchBar = forwardRef(function PatientSearchBar(
  {
    searchRef,
    patients,
    selectedPatientId,
    onSelectPatient,
    searchOpen,
    searchTerm,
    onSearchChange,
    onOpenSearch,
    onCloseSearch,
    draftCount,
    onOpenDrafts,
    showDrafts,
    loading,
    loadError,
    onRetryLoad,
  },
  inputRef,
) {
  return (
    <div className="flex w-full min-w-0 items-center gap-2 sm:w-[420px]">
      <div ref={searchRef} className="relative min-w-0 flex-1">
        <div
          className={`flex h-9 items-center gap-2 rounded-lg border bg-white px-2.5 transition ${
            searchOpen ? "border-[#FECACA]" : "border-[#E5E7EB] hover:border-[#FECACA]"
          }`}
        >
          <Search size={14} className="shrink-0 text-[#94A3B8]" />
          <input
            ref={inputRef}
            value={searchTerm}
            onFocus={onOpenSearch}
            onChange={(event) => {
              onSearchChange(event.target.value);
              if (!searchOpen) onOpenSearch();
            }}
            placeholder="Search patient by name or Patient ID..."
            aria-label="Search patient"
            aria-expanded={searchOpen}
            aria-controls="setup-patient-results"
            role="combobox"
            className="min-w-0 flex-1 border-0 bg-transparent text-[12.5px] text-[#0F172A] outline-none placeholder:text-[#94A3B8]"
          />
          {(searchTerm || searchOpen) && (
            <button
              type="button"
              onClick={() => {
                onSearchChange("");
                onCloseSearch();
              }}
              aria-label="Clear patient search"
              className="shrink-0 text-[#94A3B8] hover:text-[#B91C1C]"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {searchOpen && (
          <div
            id="setup-patient-results"
            role="listbox"
            className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-[#E8ECF0] bg-white shadow-lg shadow-black/[0.06]"
          >
            <p className="border-b border-[#F1F5F9] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[#94A3B8]">
              {searchTerm.trim() ? "Matching Patients" : "Recent Patients"}
            </p>
            {loading ? (
              <div className="py-6 text-center">
                <InlineSpinner label="Loading patients..." />
              </div>
            ) : loadError ? (
              <div className="m-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
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
              <p className="px-3 py-5 text-center text-[11.5px] text-[#94A3B8]">
                No matching patients.
              </p>
            ) : (
              <div className="max-h-[340px] overflow-y-auto">
                {patients.map((patient) => {
                  const selected =
                    String(patient.id) === String(selectedPatientId);

                  return (
                    <button
                      key={patient.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => onSelectPatient(patient.id)}
                      className={`flex w-full min-w-0 items-start gap-2.5 border-b border-[#F1F5F9] px-3 py-2.5 text-left transition last:border-b-0 ${
                        selected ? "bg-[#FEF2F2]" : "hover:bg-[#F8FAFC]"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold text-[#111827]">
                          {patient.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-[#64748B]">
                          {patient.meta}
                        </span>
                        {patient.address && (
                          <span className="mt-0.5 block truncate text-[11px] text-[#94A3B8]">
                            {patient.address}
                          </span>
                        )}
                      </span>
                      {selected && (
                        <Check
                          size={14}
                          strokeWidth={3}
                          className="mt-1 shrink-0 text-[#B91C1C]"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

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
  );
});

/**
 * Read-only preview of the chosen patient. "Change Patient" only reopens the
 * top search; the current selection stays until another patient is picked.
 */
function PatientPreview({ selectedPatient, onChangePatient }) {
  return (
    <div className="w-full flex-none rounded-2xl border border-[#E8ECF0] bg-white p-4 lg:w-[280px]">
      <p className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-[#94A3B8]">
        Patient Preview
      </p>

      {selectedPatient ? (
        <div className="mt-3 text-xs">
          <div className="border-b border-[#F1F5F9] pb-3">
            <p className="text-[14px] font-bold text-[#0F172A]">
              {selectedPatient.name}
            </p>
            <p className="mt-0.5 text-[11px] text-[#94A3B8]">
              Patient #{selectedPatient.id}
            </p>
          </div>
          <dl className="mt-3 space-y-3">
            {selectedPatient.fields.map(({ label, value }) => (
              <div key={label}>
                <dt className="text-[9.5px] font-bold uppercase tracking-wider text-[#94A3B8]">
                  {label}
                </dt>
                <dd className="mt-0.5 break-words text-[12.5px] text-[#0F172A]">
                  {value || "Not recorded"}
                </dd>
              </div>
            ))}
          </dl>
          <button
            type="button"
            onClick={onChangePatient}
            className="mt-4 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] font-semibold text-[#475569] transition hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#B91C1C]"
          >
            Change Patient
          </button>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-[#E5E7EB] px-3 py-8 text-center">
          <p className="text-[12.5px] font-semibold text-[#475569]">
            No patient selected yet.
          </p>
          <p className="mt-1 text-[11.5px] text-[#94A3B8]">
            Search for a patient above to begin.
          </p>
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
  selectedPatient,
  visitDate,
  visitTime,
  patients,
  selectedPatientId,
  onSelectPatient,
  consultationType,
  onConsultationTypeChange,
  searchRef,
  searchOpen,
  searchTerm,
  onSearchChange,
  onOpenSearch,
  onCloseSearch,
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
  nextBusy = false,
}) {
  const canProceed = Boolean(selectedPatientId && consultationType);
  const searchInputRef = useRef(null);

  // Focusing the input opens the dropdown through its onFocus, so Change
  // Patient reuses the normal search path and leaves the selection untouched.
  function handleChangePatient() {
    onOpenSearch();
    searchInputRef.current?.focus();
  }

  return (
    <WizardCard
      unboxed
      backAction={
        onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-2 inline-flex items-center gap-1.5 rounded-md text-[12px] font-semibold text-[#64748B] transition hover:text-[#B91C1C]"
          >
            <ArrowLeft size={14} />
            Back
          </button>
        )
      }
      title="New Health Record"
      subtitle="Set the patient and visit type to begin."
      visitDate={visitDate}
      visitTime={visitTime}
      headerActions={
        <PatientSearchBar
          ref={searchInputRef}
          searchRef={searchRef}
          patients={patients}
          selectedPatientId={selectedPatientId}
          onSelectPatient={onSelectPatient}
          searchOpen={searchOpen}
          searchTerm={searchTerm}
          onSearchChange={onSearchChange}
          onOpenSearch={onOpenSearch}
          onCloseSearch={onCloseSearch}
          draftCount={draftCount}
          onOpenDrafts={onOpenDrafts}
          showDrafts={showDrafts}
          loading={patientsLoading}
          loadError={patientsLoadError}
          onRetryLoad={onRetryLoadPatients}
        />
      }
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <PatientPreview
          selectedPatient={selectedPatient}
          onChangePatient={handleChangePatient}
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

          {/* Only the primary action here; Back sits at the top of the screen. */}
          <WizardFooter
            onNext={onNext}
            nextDisabled={!canProceed}
            nextBusy={nextBusy}
            align="end"
          />
        </div>
      </div>
    </WizardCard>
  );
}

/** Current visit fields and program selection reuse the page's clinical state. */
export function ConsultationClinicalStep({ programs, selected = [], primary, onSelect, onPrimaryChange, mode, onModeChange, onNext, nextBusy = false, helper = "", error, indicator = null, children }) {
  return (
    <section className="max-w-5xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      {/* Back and the patient line live above this card. */}
      {indicator}
      {children}
      <div className="mt-6 border-t border-slate-100 pt-5" data-field="healthRecordType">
        <h3 className="text-sm font-semibold text-slate-900">Consultation Type<span className="text-red-700">*</span></h3>
        <p className="mb-3 text-xs text-slate-500">General consultation, or connected to a health program?</p>
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {[["general", "General Consultation"], ["program", "With Health Program"]].map(([key, label]) => (
            <button key={key} type="button" aria-pressed={mode === key} onClick={() => onModeChange(key)} className={"rounded-md px-2 py-2.5 text-xs transition " + (mode === key ? "bg-[#B91C1C] text-white" : "text-slate-600 hover:bg-white")}>{label}</button>
          ))}
        </div>
        {mode === "program" && <>
          <p className="mb-3 mt-4 text-xs text-slate-500">Select one or more health programs related to today's consultation.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {programs.map(program => {
              const Icon = program.icon;
              const active = selected.includes(program.key);
              return <div key={program.key} className={"relative rounded-xl border " + (active ? "border-red-600 bg-red-50" : "border-slate-200 bg-white")}>
                <button type="button" disabled={program.disabled} title={program.disabledReason} aria-pressed={active} onClick={() => onSelect(program.key)} className="flex h-full min-h-[112px] w-full flex-col items-start p-3 text-left disabled:cursor-not-allowed disabled:opacity-40">
                  <span className="mb-2 rounded-md border border-slate-200 bg-white p-1.5"><Icon size={15} className="text-red-700" /></span>
                  <span className="text-xs font-semibold text-slate-900">{program.title}</span>
                  <span className="mt-1 text-[11px] text-slate-500">{program.description}</span>
                  {program.disabled && <span className="mt-2 text-[10px] italic">Not applicable to this patient</span>}
                  {active && <Check size={14} className="absolute bottom-3 right-3 text-red-700" />}
                </button>
                {active && <button type="button" onClick={() => onPrimaryChange(program.key)} aria-label={"Make " + program.title + " primary"} className="absolute right-2 top-2 rounded border border-red-200 bg-white px-1.5 py-0.5 text-[9px] text-red-700">{primary === program.key ? "PRIMARY" : "Make primary"}</button>}
              </div>;
            })}
          </div>
        </>}
        {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
      </div>
      <WizardFooter helper={helper} onNext={onNext} nextDisabled={!mode || (mode === "program" && !selected.length)} nextBusy={nextBusy} />
    </section>
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
  // Blank in the step-based consultation, where the page header above the card
  // already carries the title.
  title = "New Health Record",
  subtitle = "Set the patient and visit type to begin.",
  children,
  onBack,
  onSave,
  saving,
  saveLabel = "Save Record",
  savingLabel = "Saving...",
  helper = "",
  indicator = null,
}) {
  return (
    <WizardCard
      title={title}
      subtitle={subtitle}
      visitDate={visitDate}
      visitTime={visitTime}
    >
      {indicator}
      {!indicator && (
        <>
          <h3 className="text-[15px] font-bold text-[#0F172A]">Next Action</h3>
          <p className="mb-4 mt-0.5 text-[12.5px] text-[#64748B]">
            What should be done next?
          </p>
        </>
      )}

      {children}

      <WizardFooter
        onBack={onBack}
        onNext={onSave}
        nextLabel={saveLabel}
        nextBusy={saving}
        busyLabel={savingLabel}
        helper={helper}
      />
    </WizardCard>
  );
}

/**
 * Last step: a read-only recap of what the consultation will save, each block
 * with an Edit shortcut back to the step that owns it. It reads the page's
 * existing state - nothing here is a second copy of the data.
 */
export function ConsultationReviewStep({
  visitDate,
  visitTime,
  sections,
  errors = [],
  onEditStep,
  onSave,
  saving,
  saveLabel = "Save Record",
  savingLabel = "Saving...",
  helper = "",
  indicator = null,
}) {
  return (
    <WizardCard
      title={indicator ? "" : "Review & Save"}
      subtitle={
        indicator ? "" : "Confirm the consultation details below before saving."
      }
      visitDate={visitDate}
      visitTime={visitTime}
    >
      {indicator}
      {/* Save happens here, where the fields themselves are not on screen, so
          anything the checks or the server rejected is listed in one place. */}
      {errors.length > 0 && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3"
        >
          <p className="text-[12.5px] font-bold text-[#B91C1C]">
            Please review before saving
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-[#B91C1C]">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-4">
        {sections.map((section) => (
          <section
            key={section.key}
            className="rounded-xl border border-[#E8ECF0] bg-white"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#F1F5F9] px-4 py-2.5">
              <h3 className="text-[13px] font-bold text-[#0F172A]">{section.title}</h3>
              {section.stepKey && (
                <button
                  type="button"
                  onClick={() => onEditStep(section.stepKey)}
                  className="text-[11.5px] font-semibold text-[#B91C1C] hover:text-[#991B1B]"
                >
                  Edit
                </button>
              )}
            </div>
            <dl className="divide-y divide-[#F1F5F9]">
              {section.rows.map(({ label, value }) => (
                <div
                  key={label}
                  className="grid gap-1 px-4 py-2.5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4"
                >
                  <dt className="text-[10.5px] font-bold uppercase tracking-wider text-[#94A3B8]">
                    {label}
                  </dt>
                  <dd className="min-w-0 whitespace-pre-line break-words text-[12.5px] text-[#0F172A]">
                    {value || <span className="text-[#94A3B8]">Not recorded</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <WizardFooter
        onNext={onSave}
        nextLabel={saveLabel}
        nextBusy={saving}
        busyLabel={savingLabel}
        helper={helper}
      />
    </WizardCard>
  );
}
