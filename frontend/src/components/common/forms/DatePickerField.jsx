import { useEffect, useId, useMemo, useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  X,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../ui/popover";
import useFacilityCalendarDate from "../../../hooks/useFacilityCalendarDate";
import { getFacilityCalendarDate } from "../../../utils/medicineInventoryStatus";
import { cn } from "../../../lib/utils";

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const YEAR_PAGE_SIZE = 12;

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDateValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateValue(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatDisplayDate(value) {
  const date = parseDateValue(value);
  if (!date) return "";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isSameDate(a, b) {
  return (
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getCalendarDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function getYearPageStart(year) {
  return year - 5;
}

function normalizeDateOnly(date) {
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function FieldLabel({ label, required, htmlFor }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-neutral-500"
    >
      {label} {required && <span className="text-alert-600">*</span>}
    </label>
  );
}

function FieldError({ error, id }) {
  if (!error) return null;
  return (
    <p id={id} className="mt-1 text-[11px] font-medium text-alert-600">
      {error}
    </p>
  );
}

function getTriggerClasses(error, disabled) {
  return cn(
    "flex h-10 w-full min-w-0 items-center justify-between rounded-input border bg-white px-3.5 text-left text-sm outline-none transition-colors",
    error
      ? "border-alert-600 text-ink-800 ring-2 ring-alert-600/15"
      : "border-neutral-200 text-ink-800 hover:border-neutral-300 focus-visible:border-ink-400 focus-visible:ring-2 focus-visible:ring-ink-400/40",
    disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
  );
}

const dayButtonBase =
  "flex h-8 items-center justify-center rounded-lg text-[12px] font-semibold transition-colors";

const chromeButton =
  "flex h-7 w-7 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-brand-700";

const pillGhost =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-ink-800 disabled:cursor-not-allowed disabled:opacity-50";

const pillMuted =
  "inline-flex h-8 items-center justify-center rounded-full bg-brand-50 px-3 text-xs font-bold text-brand-700 transition-colors hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50";

const pillPrimary =
  "inline-flex h-8 items-center justify-center rounded-full bg-brand-600 px-3 text-xs font-bold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50";

function useDateTimePopoverOpen(open, setOpen) {
  useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;

    function handleCloseRequest() {
      setOpen(false);
    }

    window.addEventListener("akay:datetime-popover-close", handleCloseRequest);
    return () => {
      window.removeEventListener(
        "akay:datetime-popover-close",
        handleCloseRequest,
      );
    };
  }, [open, setOpen]);
}

export function DatePickerField({
  label,
  value,
  onChange,
  name,
  required,
  error,
  disabled = false,
  placeholder = "Select date",
  allowClear = false,
  min,
  max,
  minDate: minDateProp,
  maxDate: maxDateProp,
  disableFuture = false,
  mode = "default",
  variant,
  initialView,
  yearRangeStart,
  yearRangeEnd,
  hideLabel = false,
}) {
  const triggerId = useId();
  const errorId = useId();
  const facilityTodayIso = useFacilityCalendarDate();
  const selectedDate = useMemo(() => parseDateValue(value), [value]);
  const today = useMemo(
    () => parseDateValue(facilityTodayIso || getFacilityCalendarDate()),
    [facilityTodayIso],
  );
  const minDate = useMemo(
    () => normalizeDateOnly(parseDateValue(minDateProp || min)),
    [min, minDateProp],
  );
  const explicitMaxDate = useMemo(
    () => normalizeDateOnly(parseDateValue(maxDateProp || max)),
    [max, maxDateProp],
  );
  const maxDate = disableFuture && !explicitMaxDate ? today : explicitMaxDate;
  const isBirthdateMode = mode === "birthdate" || variant === "birthdate";
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("days");
  const [monthDate, setMonthDate] = useState(selectedDate || today || new Date());
  const [draftDate, setDraftDate] = useState(selectedDate);
  const [yearPageStart, setYearPageStart] = useState(() =>
    getYearPageStart((selectedDate || today || new Date()).getFullYear()),
  );

  const calendarDays = useMemo(() => getCalendarDays(monthDate), [monthDate]);
  const activeDate = isBirthdateMode ? draftDate || selectedDate : selectedDate;
  const yearOptions = useMemo(
    () =>
      Array.from({ length: YEAR_PAGE_SIZE }, (_, index) => yearPageStart + index),
    [yearPageStart],
  );

  useDateTimePopoverOpen(open, setOpen);

  useEffect(() => {
    if (!open) return;
    const baseDate = selectedDate || maxDate || today || new Date();
    setMonthDate(baseDate);
    setDraftDate(selectedDate);
    setYearPageStart(
      yearRangeStart || getYearPageStart(baseDate.getFullYear()),
    );
    setView(
      initialView || (isBirthdateMode && !selectedDate ? "years" : "days"),
    );
  }, [
    initialView,
    isBirthdateMode,
    maxDate,
    open,
    selectedDate,
    today,
    yearRangeStart,
  ]);

  function isDateOutOfRange(date) {
    if (!date) return true;
    const normalizedDate = normalizeDateOnly(date);
    return (
      (minDate && normalizedDate < minDate) ||
      (maxDate && normalizedDate > maxDate)
    );
  }

  function selectDate(date) {
    const normalized = normalizeDateOnly(date);
    if (!normalized || isDateOutOfRange(normalized)) return;

    if (isBirthdateMode) {
      setDraftDate(normalized);
      setMonthDate(normalized);
      return;
    }

    onChange(formatDateValue(normalized));
    setOpen(false);
  }

  function buildDraftDate(year, month) {
    const baseDate = draftDate || selectedDate;
    if (!baseDate) return null;

    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    const safeDay = Math.min(baseDate.getDate(), lastDayOfMonth);
    const nextDate = new Date(year, month, safeDay);
    if (isDateOutOfRange(nextDate)) return null;
    return nextDate;
  }

  function moveMonth(offset) {
    setMonthDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1),
    );
  }

  function selectMonth(month) {
    const nextMonthDate = new Date(monthDate.getFullYear(), month, 1);
    setMonthDate(nextMonthDate);

    if (isBirthdateMode) {
      const nextDraftDate = buildDraftDate(
        nextMonthDate.getFullYear(),
        nextMonthDate.getMonth(),
      );
      if (nextDraftDate) setDraftDate(nextDraftDate);
    }

    setView("days");
  }

  function selectYear(year) {
    const nextMonthDate = new Date(year, monthDate.getMonth(), 1);
    setMonthDate(nextMonthDate);

    if (isBirthdateMode) {
      const nextDraftDate = buildDraftDate(
        nextMonthDate.getFullYear(),
        nextMonthDate.getMonth(),
      );
      if (nextDraftDate) setDraftDate(nextDraftDate);
    }

    setYearPageStart(getYearPageStart(year));
    setView(isBirthdateMode ? "months" : "days");
  }

  function applyDraftDate() {
    if (!draftDate || isDateOutOfRange(draftDate)) return;
    onChange(formatDateValue(draftDate));
    setOpen(false);
  }

  function monthOutOfRange(month) {
    const candidate = new Date(monthDate.getFullYear(), month, 1);
    const monthStart = new Date(candidate.getFullYear(), candidate.getMonth(), 1);
    const monthEnd = new Date(
      candidate.getFullYear(),
      candidate.getMonth() + 1,
      0,
    );
    return (
      (minDate && monthEnd < minDate) || (maxDate && monthStart > maxDate)
    );
  }

  function yearOutOfRange(year) {
    if (yearRangeStart && year < yearRangeStart) return true;
    if (yearRangeEnd && year > yearRangeEnd) return true;
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    return (
      (minDate && yearEnd < minDate) || (maxDate && yearStart > maxDate)
    );
  }

  function moveYearPage(offset) {
    setYearPageStart((prev) => {
      const next = prev + offset * YEAR_PAGE_SIZE;
      if (yearRangeStart && next + YEAR_PAGE_SIZE - 1 < yearRangeStart) {
        return prev;
      }
      if (yearRangeEnd && next > yearRangeEnd) return prev;
      return next;
    });
  }

  const todayDisabled = !today || isDateOutOfRange(today);

  return (
    <div className="relative min-w-0" data-field={name}>
      {!hideLabel && label && (
        <FieldLabel label={label} required={required} htmlFor={triggerId} />
      )}
      <Popover
        modal={false}
        open={open}
        onOpenChange={(next) => !disabled && setOpen(next)}
      >
        <PopoverTrigger asChild>
          <button
            id={triggerId}
            type="button"
            name={name}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            aria-haspopup="dialog"
            className={getTriggerClasses(error, disabled)}
          >
            <span className={value ? "text-ink-800" : "text-neutral-500"}>
              {formatDisplayDate(value) || placeholder}
            </span>
            <Calendar size={15} className="shrink-0 text-neutral-500" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={8}
          collisionPadding={12}
          data-akay-datepicker=""
          aria-label={label || "Choose date"}
          className="z-[10001] w-[min(calc(100vw-1.5rem),328px)] max-w-[328px] overflow-hidden rounded-card border-neutral-200 bg-white p-0 shadow-lg"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="p-2.5">
            <div className="mb-2 flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={() =>
                  view === "years" ? moveYearPage(-1) : moveMonth(-1)
                }
                className={chromeButton}
                aria-label={
                  view === "years" ? "Previous years" : "Previous month"
                }
              >
                <ChevronLeft size={16} />
              </button>
              {view === "years" ? (
                <button
                  type="button"
                  onClick={() => setView("days")}
                  className="rounded-lg px-2.5 py-1.5 text-[13px] font-bold text-ink-800 transition-colors hover:bg-neutral-100"
                >
                  {yearOptions[0]} – {yearOptions.at(-1)}
                </button>
              ) : (
                <div className="flex items-center justify-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setView(view === "months" ? "days" : "months")
                    }
                    className={cn(
                      "inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] font-bold transition-colors",
                      view === "months"
                        ? "bg-brand-50 text-brand-700"
                        : "text-ink-800 hover:bg-neutral-100",
                    )}
                  >
                    {MONTH_LABELS[monthDate.getMonth()].slice(0, 3)}
                    <ChevronDown size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setYearPageStart(
                        getYearPageStart(monthDate.getFullYear()),
                      );
                      setView("years");
                    }}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] font-bold text-ink-800 transition-colors hover:bg-neutral-100"
                  >
                    {monthDate.getFullYear()}
                    <ChevronDown size={13} />
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() =>
                  view === "years" ? moveYearPage(1) : moveMonth(1)
                }
                className={chromeButton}
                aria-label={view === "years" ? "Next years" : "Next month"}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {view === "months" && (
              <div className="grid grid-cols-3 gap-1.5">
                {MONTH_LABELS.map((month, index) => {
                  const selected = monthDate.getMonth() === index;
                  const disabledMonth = monthOutOfRange(index);
                  return (
                    <button
                      key={month}
                      type="button"
                      disabled={disabledMonth}
                      onClick={() => selectMonth(index)}
                      className={cn(
                        "rounded-lg px-2 py-2 text-xs font-bold transition-colors",
                        selected
                          ? "bg-brand-600 text-white"
                          : "text-ink-700 hover:bg-neutral-100 hover:text-brand-700",
                        disabledMonth &&
                          "cursor-not-allowed opacity-30 hover:bg-transparent hover:text-ink-700",
                      )}
                    >
                      {month.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            )}

            {view === "years" && (
              <div className="grid grid-cols-3 gap-1.5">
                {yearOptions.map((year) => {
                  const selected = monthDate.getFullYear() === year;
                  const disabledYear = yearOutOfRange(year);
                  return (
                    <button
                      key={year}
                      type="button"
                      disabled={disabledYear}
                      onClick={() => selectYear(year)}
                      className={cn(
                        "rounded-lg px-2 py-2 text-xs font-bold transition-colors",
                        selected
                          ? "bg-brand-600 text-white"
                          : "text-ink-700 hover:bg-neutral-100 hover:text-brand-700",
                        disabledYear &&
                          "cursor-not-allowed opacity-30 hover:bg-transparent hover:text-ink-700",
                      )}
                    >
                      {year}
                    </button>
                  );
                })}
              </div>
            )}

            {view === "days" && (
              <div className="grid grid-cols-7 gap-0.5 text-center">
                {WEEKDAY_LABELS.map((weekday) => (
                  <span
                    key={weekday}
                    className="py-1 text-[9px] font-bold uppercase tracking-wide text-neutral-500"
                  >
                    {weekday}
                  </span>
                ))}
                {calendarDays.map((date) => {
                  const isSelected = isSameDate(date, activeDate);
                  const isToday = isSameDate(date, today);
                  const isCurrentMonth =
                    date.getMonth() === monthDate.getMonth();
                  const outOfRange = isDateOutOfRange(date);

                  return (
                    <button
                      key={formatDateValue(date)}
                      type="button"
                      disabled={outOfRange}
                      onClick={() => selectDate(date)}
                      className={cn(
                        dayButtonBase,
                        isSelected
                          ? "bg-brand-600 text-white"
                          : isToday
                            ? "bg-neutral-100 text-ink-800 ring-1 ring-inset ring-ink-400/50"
                            : "text-ink-700 hover:bg-neutral-100 hover:text-brand-700",
                        !isCurrentMonth &&
                          !isSelected &&
                          "text-neutral-400",
                        outOfRange &&
                          "cursor-not-allowed opacity-30 hover:bg-transparent hover:text-ink-700",
                      )}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-neutral-200 px-2.5 py-2">
            {isBirthdateMode ? (
              <>
                <span />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className={pillGhost}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={applyDraftDate}
                    disabled={!draftDate || isDateOutOfRange(draftDate)}
                    className={pillPrimary}
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                {allowClear ? (
                  <button
                    type="button"
                    onClick={() => {
                      onChange("");
                      setOpen(false);
                    }}
                    className={pillGhost}
                  >
                    <X size={12} />
                    Clear
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => selectDate(today)}
                  disabled={todayDisabled}
                  className={pillMuted}
                >
                  Today
                </button>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <FieldError error={error} id={errorId} />
    </div>
  );
}

function parseTimeValue(value) {
  const [hourPart, minutePart] = String(value || "").split(":");
  const hour24 = Number(hourPart);
  const minute = Number(minutePart);

  if (
    Number.isNaN(hour24) ||
    Number.isNaN(minute) ||
    hour24 < 0 ||
    hour24 > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return { hour: 8, minute: 0, period: "AM" };
  }

  const period = hour24 >= 12 ? "PM" : "AM";
  const hour = hour24 % 12 || 12;
  return { hour, minute, period };
}

function formatTimeValue({ hour, minute, period }) {
  const normalizedHour = Math.min(Math.max(Number(hour) || 12, 1), 12);
  const normalizedMinute = Math.min(Math.max(Number(minute) || 0, 0), 59);
  let hour24 = normalizedHour % 12;
  if (period === "PM") hour24 += 12;

  return `${pad(hour24)}:${pad(normalizedMinute)}`;
}

function formatDisplayTime(value) {
  const [hourPart, minutePart] = String(value || "").split(":");
  const date = new Date();
  date.setHours(Number(hourPart), Number(minutePart), 0, 0);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TimePickerField({
  label,
  value,
  onChange,
  name,
  required,
  error,
  disabled = false,
  placeholder = "Select time",
}) {
  const triggerId = useId();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(parseTimeValue(value));

  useDateTimePopoverOpen(open, setOpen);

  useEffect(() => {
    if (open) setDraft(parseTimeValue(value));
  }, [open, value]);

  function updateDraft(field, nextValue) {
    setDraft((prev) => ({ ...prev, [field]: nextValue }));
  }

  function applyTime(nextDraft = draft) {
    onChange(formatTimeValue(nextDraft));
    setOpen(false);
  }

  function useCurrentTime() {
    const now = new Date();
    onChange(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
    setOpen(false);
  }

  return (
    <div className="relative min-w-0" data-field={name}>
      {label && (
        <FieldLabel label={label} required={required} htmlFor={triggerId} />
      )}
      <Popover
        modal={false}
        open={open}
        onOpenChange={(next) => !disabled && setOpen(next)}
      >
        <PopoverTrigger asChild>
          <button
            id={triggerId}
            type="button"
            name={name}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            aria-haspopup="dialog"
            className={getTriggerClasses(error, disabled)}
          >
            <span className={value ? "text-ink-800" : "text-neutral-500"}>
              {formatDisplayTime(value) || placeholder}
            </span>
            <Clock size={15} className="shrink-0 text-neutral-500" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={8}
          collisionPadding={12}
          data-akay-datepicker=""
          aria-label={label || "Choose time"}
          className="z-[10001] w-[min(calc(100vw-1.5rem),280px)] max-w-[280px] overflow-hidden rounded-card border-neutral-200 bg-white p-0 shadow-lg"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
              Time
            </p>
            <button type="button" onClick={useCurrentTime} className={pillMuted}>
              Now
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-1.5 px-3 py-3">
            <div>
              <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-neutral-500">
                Hour
              </label>
              <input
                type="number"
                min="1"
                max="12"
                value={draft.hour}
                onChange={(event) => updateDraft("hour", event.target.value)}
                className="h-9 w-full rounded-input border border-neutral-200 bg-white px-2 text-center text-sm font-bold text-ink-800 outline-none transition-colors focus:border-ink-400 focus:ring-2 focus:ring-ink-400/40"
              />
            </div>
            <span className="pb-2 text-base font-bold text-neutral-400">:</span>
            <div>
              <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-neutral-500">
                Minute
              </label>
              <input
                type="number"
                min="0"
                max="59"
                value={draft.minute}
                onChange={(event) => updateDraft("minute", event.target.value)}
                className="h-9 w-full rounded-input border border-neutral-200 bg-white px-2 text-center text-sm font-bold text-ink-800 outline-none transition-colors focus:border-ink-400 focus:ring-2 focus:ring-ink-400/40"
              />
            </div>
          </div>

          <div className="mx-3 grid grid-cols-2 rounded-full border border-neutral-200 bg-neutral-100 p-0.5">
            {["AM", "PM"].map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => updateDraft("period", period)}
                className={cn(
                  "h-8 rounded-full text-[11px] font-bold transition-colors",
                  draft.period === period
                    ? "bg-brand-600 text-white"
                    : "text-neutral-600 hover:bg-white hover:text-brand-700",
                )}
              >
                {period}
              </button>
            ))}
          </div>

          <div className="mt-2 flex justify-end border-t border-neutral-200 px-3 py-2">
            <button type="button" onClick={() => applyTime()} className={pillPrimary}>
              Set
            </button>
          </div>
        </PopoverContent>
      </Popover>
      <FieldError error={error} id={errorId} />
    </div>
  );
}
