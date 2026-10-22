import { useId, useMemo, useState } from "react";
import { Stethoscope } from "lucide-react";

import {
  DatePickerField,
  ModalButton,
  ModalShell,
  TimePickerField,
} from "../../common";
import {
  AVAILABILITY_AVAILABLE,
  AVAILABILITY_UNAVAILABLE,
  combineExpectedReturn,
  formatExpectedReturnStamp,
  splitExpectedReturn,
} from "../../../services/doctorAvailabilityModel";
import {
  buildAvailabilityChange,
  validateAvailabilityChange,
} from "../../../utils/doctorAvailabilityChange";
import { manilaDateKey } from "../../../utils/doctorAvailabilityCalendar";
import { displayedAvailabilityStatus, filterDoctorRoster } from "../../../utils/doctorRoster";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50";
const TEXTAREA =
  "h-[4.5rem] w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] text-ink-800 outline-none transition placeholder:text-neutral-500 focus:border-ink-400 focus:ring-2 focus:ring-ink-400/30 disabled:bg-neutral-100 disabled:text-neutral-500";

// Both modes share one frame so switching never moves the modal: the right
// column swaps content, not size.
const FRAME = "grid gap-x-6 gap-y-4 md:min-h-[26rem] md:grid-cols-2";

const CONSEQUENCE = {
  available:
    "Confirms the doctor is on duty. An absence that is happening now keeps referrals blocked until it ends.",
  dated:
    "The doctor will not count as available during the absence, and stays unavailable after it ends until you confirm Available.",
  open: "Marks the doctor unavailable until you confirm Available again.",
};

/**
 * Mount with a fresh `key` per open: the form state is seeded from `initial`
 * once, so closing and reopening never shows a stale draft.
 */
export default function DoctorAvailabilityModal({
  doctors,
  initial,
  canManage,
  saving,
  error,
  onClose,
  onSubmit,
}) {
  const today = manilaDateKey();
  const [doctorId, setDoctorId] = useState(initial.doctorId || "");
  const [status, setStatus] = useState(initial.status || AVAILABILITY_UNAVAILABLE);
  const [untilFurtherNotice, setUntilFurtherNotice] = useState(false);
  const [date, setDate] = useState(initial.date || today);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [notesTouched, setNotesTouched] = useState(false);
  const [notes, setNotes] = useState(() => notesFromDoctor(doctors.find((item) => item.id === initial.doctorId)));
  const [showErrors, setShowErrors] = useState(false);

  const doctor = doctors.find((item) => item.id === doctorId) || null;
  const form = { doctorId, status, untilFurtherNotice, date, allDay, startTime, endTime };
  const errors = validateAvailabilityChange(form, { today });
  const available = status === AVAILABILITY_AVAILABLE;
  const dated = !available && !untilFurtherNotice;
  // Available keeps every field on screen but locked, so the modal never
  // changes shape when the status flips.
  const datedLocked = available || untilFurtherNotice;
  const saveLabel = saving
    ? "Saving..."
    : available
      ? "Confirm available"
      : dated
        ? "Save absence"
        : "Mark unavailable";

  function chooseDoctor(nextId) {
    setDoctorId(nextId);
    const next = doctors.find((item) => item.id === nextId);
    if (next && !notesTouched) setNotes(notesFromDoctor(next));
  }

  function updateNotes(field, value) {
    setNotesTouched(true);
    setNotes((prev) => ({ ...prev, [field]: value }));
  }

  function submit() {
    if (saving) return;
    setShowErrors(true);
    if (Object.keys(errors).length > 0) return;

    const notesPayload =
      notesTouched && !available
        ? {
            remarks: notes.remarks.trim() || null,
            internalNotes: notes.internal.trim() || null,
            expectedAvailableAt: combineExpectedReturn(notes.returnDate, notes.returnTime),
          }
        : null;

    onSubmit(buildAvailabilityChange(form, notesPayload));
  }

  if (!canManage) {
    return (
      <ModalShell
        open
        appearance="plain"
        title="Doctor details"
        subtitle={doctor?.name || ""}
        icon={<Stethoscope size={14} />}
        size="md"
        onClose={onClose}
        footer={<ModalButton onClick={onClose}>Close</ModalButton>}
      >
        <ReadOnlyDetails doctor={doctor} />
      </ModalShell>
    );
  }

  return (
    <ModalShell
      open
      appearance="plain"
      title="Doctor availability"
      subtitle={doctor ? doctor.name : "Choose a doctor"}
      icon={<Stethoscope size={14} />}
      size="3xl"
      onClose={onClose}
      closeDisabled={saving}
      footer={
        <>
          <ModalButton onClick={onClose} disabled={saving}>
            Cancel
          </ModalButton>
          <ModalButton variant="primary" primary onClick={submit} disabled={saving}>
            {saveLabel}
          </ModalButton>
        </>
      }
    >
      <div className={FRAME}>
        <div className="min-w-0 space-y-4">
          <DoctorPicker
            doctors={doctors}
            value={doctorId}
            onChange={chooseDoctor}
            error={showErrors ? errors.doctorId : ""}
          />

          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-600">Availability</p>
            <Segmented
              label="Availability"
              value={status}
              onChange={setStatus}
              options={[
                { value: AVAILABILITY_AVAILABLE, label: "Available" },
                { value: AVAILABILITY_UNAVAILABLE, label: "Unavailable" },
              ]}
            />
            <p className="mt-2 text-[12px] text-neutral-600">
              {available ? CONSEQUENCE.available : untilFurtherNotice ? CONSEQUENCE.open : CONSEQUENCE.dated}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DatePickerField
              label="Expected return date"
              value={notes.returnDate}
              onChange={(value) => updateNotes("returnDate", value)}
              disabled={available}
              allowClear
            />
            <TimePickerField
              label="Expected return time"
              value={notes.returnTime}
              onChange={(value) => updateNotes("returnTime", value)}
              disabled={available}
            />
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <label
            className={`flex w-fit items-center gap-2 text-[13px] ${
              available ? "cursor-not-allowed text-neutral-500" : "cursor-pointer text-ink-800"
            }`}
          >
            <input
              type="checkbox"
              checked={untilFurtherNotice}
              disabled={available}
              onChange={(event) => setUntilFurtherNotice(event.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 accent-brand-600"
            />
            No end date (until further notice)
          </label>

          <div className="grid grid-cols-2 gap-3">
            <DatePickerField
              label="Date"
              value={date}
              onChange={setDate}
              min={today}
              required
              disabled={datedLocked}
              error={showErrors && !datedLocked ? errors.date : ""}
            />
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-600">Length</p>
              <Segmented
                label="Absence length"
                value={allDay ? "all" : "range"}
                onChange={(value) => setAllDay(value === "all")}
                disabled={datedLocked}
                options={[
                  { value: "all", label: "All day" },
                  { value: "range", label: "Range" },
                ]}
              />
            </div>
          </div>

          <div>
            <div className="grid grid-cols-2 gap-3">
              <TimePickerField
                label="Starts"
                value={startTime}
                onChange={setStartTime}
                disabled={datedLocked || allDay}
              />
              <TimePickerField
                label="Ends"
                value={endTime}
                onChange={setEndTime}
                disabled={datedLocked || allDay}
              />
            </div>
            {showErrors && errors.time ? (
              <p className="mt-1.5 text-[12px] text-alert-700">{errors.time}</p>
            ) : null}
          </div>

          <NotesField
            label="BHC shared notes"
            value={notes.remarks}
            onChange={(value) => updateNotes("remarks", value)}
            disabled={available}
            placeholder="Referral coordination. Visible to authorized BHC staff."
          />
          <NotesField
            label="Internal notes"
            value={notes.internal}
            onChange={(value) => updateNotes("internal", value)}
            disabled={available}
            placeholder="RHU staff only. Not shown to BHC."
          />
        </div>
      </div>

      {error ? <p className="mt-3 text-[12px] font-medium text-alert-700">{error}</p> : null}
    </ModalShell>
  );
}

function notesFromDoctor(doctor) {
  const expected = splitExpectedReturn(doctor?.expectedAvailableAt);
  return {
    returnDate: expected.date,
    returnTime: expected.time,
    remarks: doctor?.remarks || "",
    internal: doctor?.internalNotes || "",
  };
}

function Segmented({ label, value, onChange, options, disabled = false }) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex h-10 w-fit items-center rounded-full bg-neutral-100 p-1 ${disabled ? "opacity-60" : ""}`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`h-8 rounded-full px-3.5 text-[12px] font-medium disabled:cursor-not-allowed ${FOCUS_RING} ${
              selected ? "bg-white text-ink-800 shadow-xs" : "text-neutral-600 hover:text-ink-800"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function NotesField({ label, value, onChange, placeholder, disabled = false }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-600">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={TEXTAREA}
      />
    </div>
  );
}

/**
 * Search box over an always-visible, fixed-height list. Nothing opens or
 * closes, so the modal never changes height while a doctor is picked.
 */
function DoctorPicker({ doctors, value, onChange, error }) {
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const matches = useMemo(() => filterDoctorRoster(doctors, { query }), [doctors, query]);

  function handleKeyDown(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (matches.length ? (index + step + matches.length) % matches.length : 0));
    } else if (event.key === "Enter" && matches[active]) {
      event.preventDefault();
      onChange(matches[active].id);
    }
  }

  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-600">
        Doctor <span className="text-alert-700">*</span>
      </label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={matches[active] ? `${listId}-${matches[active].id}` : undefined}
        autoComplete="off"
        value={query}
        placeholder="Search doctor name"
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={handleKeyDown}
        className={`h-10 w-full rounded-lg border bg-white px-3 text-[13px] text-ink-800 outline-none transition placeholder:text-neutral-500 focus:border-ink-400 focus:ring-2 focus:ring-ink-400/30 ${
          error ? "border-alert-600" : "border-neutral-200"
        }`}
      />
      {error ? <p className="mt-1 text-[12px] text-alert-700">{error}</p> : null}
      <ul
        id={listId}
        role="listbox"
        aria-label="Doctors"
        className="mt-1.5 h-28 overflow-y-auto rounded-lg border border-neutral-200 bg-white"
      >
        {matches.length === 0 ? (
          <li className="px-3 py-2 text-[12px] text-neutral-600">No doctor matches that name.</li>
        ) : (
          matches.map((doctor, index) => {
            const selected = doctor.id === value;
            const displayed = displayedAvailabilityStatus(doctor);
            return (
              <li
                key={doctor.id}
                id={`${listId}-${doctor.id}`}
                role="option"
                aria-selected={selected}
                onClick={() => onChange(doctor.id)}
                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-[13px] ${
                  selected
                    ? "bg-brand-50 text-brand-700"
                    : index === active
                      ? "bg-neutral-100 text-ink-800"
                      : "text-ink-800 hover:bg-neutral-50"
                }`}
              >
                <span className="min-w-0 truncate font-semibold">{doctor.name}</span>
                <span className="shrink-0 text-[12px] text-neutral-600">{displayed}</span>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

function ReadOnlyDetails({ doctor }) {
  if (!doctor) return <p className="text-[12px] text-neutral-600">Select a doctor to see details.</p>;

  const displayed = displayedAvailabilityStatus(doctor);
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-neutral-600">The MHO has not granted Manage doctor availability.</p>
      <ReadOnlyNote label="Availability" value={displayed} />
      <ReadOnlyNote label="Specialization" value={doctor.specialization || "General Practitioner"} />
      {displayed === AVAILABILITY_UNAVAILABLE ? (
        <>
          <ReadOnlyNote
            label="Expected return"
            value={formatExpectedReturnStamp(doctor.expectedAvailableAt) || "Not recorded"}
          />
          <ReadOnlyNote label="BHC shared notes" value={doctor.remarks || "None"} />
          <ReadOnlyNote label="Internal notes" value={doctor.internalNotes || "None"} />
        </>
      ) : null}
    </div>
  );
}

function ReadOnlyNote({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-600">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink-800">{value}</p>
    </div>
  );
}
