import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  X,
} from "lucide-react";

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
let popoverIdCounter = 0;

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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getPopoverPosition(trigger, minWidth, maxWidth, estimatedHeight) {
  if (!trigger || typeof window === "undefined") {
    return { top: 0, left: 0, width: maxWidth, maxHeight: estimatedHeight };
  }

  const rect = trigger.getBoundingClientRect();
  const padding = 12;
  const gap = 8;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const popoverWidth = Math.min(
    Math.max(rect.width, minWidth),
    maxWidth,
    viewportWidth - padding * 2,
  );

  const left = clamp(rect.left, padding, viewportWidth - popoverWidth - padding);

  const top = rect.bottom + gap;

  const spaceBelow = viewportHeight - rect.bottom - padding - gap;
  const maxHeight = Math.max(
    260,
    Math.min(estimatedHeight, Math.max(spaceBelow, 260)),
  );

  return {
    top,
    left,
    width: popoverWidth,
    maxHeight,
  };
}

function useFloatingPopover({
  open,
  triggerRef,
  onClose,
  minWidth,
  maxWidth,
  estimatedHeight,
}) {
  const popoverIdRef = useRef(`akay-datetime-popover-${++popoverIdCounter}`);
  const popoverRef = useRef(null);
  const [position, setPosition] = useState(() => ({
    top: 0,
    left: 0,
    width: maxWidth,
    maxHeight: estimatedHeight,
  }));

  useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;

    window.dispatchEvent(
      new CustomEvent("akay:datetime-popover-open", {
        detail: { id: popoverIdRef.current },
      }),
    );

    function handleOtherPopoverOpen(event) {
      if (event.detail?.id !== popoverIdRef.current) {
        onClose();
      }
    }

    window.addEventListener(
      "akay:datetime-popover-open",
      handleOtherPopoverOpen,
    );

    return () => {
      window.removeEventListener(
        "akay:datetime-popover-open",
        handleOtherPopoverOpen,
      );
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;

    function handleCloseRequest() {
      onClose();
    }

    window.addEventListener("akay:datetime-popover-close", handleCloseRequest);

    return () => {
      window.removeEventListener(
        "akay:datetime-popover-close",
        handleCloseRequest,
      );
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return undefined;

    function updatePosition() {
      setPosition(
        getPopoverPosition(
          triggerRef.current,
          minWidth,
          maxWidth,
          estimatedHeight,
        ),
      );
    }

    function handleScrollOrResize() {
      updatePosition();
    }

      updatePosition();
      window.addEventListener("resize", handleScrollOrResize);
      window.addEventListener("scroll", handleScrollOrResize, true);

      return () => {
        window.removeEventListener("resize", handleScrollOrResize);
        window.removeEventListener("scroll", handleScrollOrResize, true);
      };
  }, [estimatedHeight, maxWidth, minWidth, onClose, open, triggerRef]);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      const target = event.target;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }

      onClose();
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open, popoverRef, triggerRef]);

  return { popoverRef, position };
}

function FieldLabel({ label, required }) {
  return (
    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
  );
}

function FieldError({ error }) {
  if (!error) return null;
  return <p className="mt-1 text-[11px] font-medium text-[#B91C1C]">{error}</p>;
}

function getTriggerClasses(error, disabled) {
  return `flex h-10 w-full items-center justify-between rounded-lg border bg-white px-3.5 text-left text-sm outline-none transition-all duration-200 ${
    error
      ? "border-[#B91C1C] text-[#1F2937] ring-2 ring-[#B91C1C]/10"
      : "border-[#E5E7EB] text-[#1F2937] hover:border-[#D1D5DB] focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10"
  } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`;
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
}) {
  const selectedDate = useMemo(() => parseDateValue(value), [value]);
  const today = useMemo(() => normalizeDateOnly(new Date()), []);
  const minDate = useMemo(
    () => parseDateValue(minDateProp || min),
    [min, minDateProp],
  );
  const explicitMaxDate = useMemo(
    () => parseDateValue(maxDateProp || max),
    [max, maxDateProp],
  );
  const maxDate = disableFuture && !explicitMaxDate ? today : explicitMaxDate;
  const isBirthdateMode = mode === "birthdate" || variant === "birthdate";
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("days");
  const [monthDate, setMonthDate] = useState(selectedDate || new Date());
  const [draftDate, setDraftDate] = useState(selectedDate);
  const [yearPageStart, setYearPageStart] = useState(() =>
    getYearPageStart((selectedDate || new Date()).getFullYear()),
  );
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const calendarDays = useMemo(() => getCalendarDays(monthDate), [monthDate]);
  const activeDate = isBirthdateMode ? draftDate || selectedDate : selectedDate;
  const yearOptions = useMemo(
    () =>
      Array.from({ length: YEAR_PAGE_SIZE }, (_, index) => yearPageStart + index),
    [yearPageStart],
  );
  const { popoverRef, position } = useFloatingPopover({
    open,
    triggerRef,
    onClose: () => setOpen(false),
    minWidth: 300,
    maxWidth: 328,
    estimatedHeight: 300,
  });

  useEffect(() => {
    if (!open) return;
    const baseDate = selectedDate || maxDate || today;
    setMonthDate(baseDate);
    setDraftDate(selectedDate);
    setYearPageStart(
      yearRangeStart || getYearPageStart(baseDate.getFullYear()),
    );
    setView(
      initialView ||
        (isBirthdateMode && !selectedDate ? "years" : "days"),
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

  function selectDate(date) {
    if ((minDate && date < minDate) || (maxDate && date > maxDate)) return;
    if (isBirthdateMode) {
      setDraftDate(date);
      setMonthDate(date);
      return;
    }

    onChange(formatDateValue(date));
    setOpen(false);
  }
function isDateOutOfRange(date) {
  if (!date) return true;

  const normalizedDate = normalizeDateOnly(date);

  return (
    (minDate && normalizedDate < minDate) ||
    (maxDate && normalizedDate > maxDate)
  );
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
    setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  }

  function selectMonth(month) {
    const nextMonthDate = new Date(monthDate.getFullYear(), month, 1);

    setMonthDate(nextMonthDate);

    if (isBirthdateMode) {
      const nextDraftDate = buildDraftDate(
        nextMonthDate.getFullYear(),
        nextMonthDate.getMonth(),
      );

      if (nextDraftDate) {
        setDraftDate(nextDraftDate);
      }
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

      if (nextDraftDate) {
        setDraftDate(nextDraftDate);
      }
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
    const monthEnd = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0);
    return (minDate && monthEnd < minDate) || (maxDate && monthStart > maxDate);
  }

  function yearOutOfRange(year) {
    if (yearRangeStart && year < yearRangeStart) return true;
    if (yearRangeEnd && year > yearRangeEnd) return true;
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    return (minDate && yearEnd < minDate) || (maxDate && yearStart > maxDate);
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

  return (
    <div ref={wrapperRef} className="relative min-w-0" data-field={name}>
      <FieldLabel label={label} required={required} />
      <button
        ref={triggerRef}
        type="button"
        name={name}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-expanded={open}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={`${getTriggerClasses(error, disabled)} min-w-0`}
      >
        <span className={value ? "text-[#1F2937]" : "text-[#9CA3AF]"}>
          {formatDisplayDate(value) || placeholder}
        </span>
        <Calendar size={15} className="shrink-0 text-[#9CA3AF]" />
      </button>
      <FieldError error={error} />

      {open &&
        createPortal(
        <div
          ref={popoverRef}
          className="anim-drop-in fixed z-[9999] rounded-2xl border border-[#E8ECF0] bg-white p-2.5 shadow-xl shadow-slate-900/10"
          style={{
            top: position.top,
            left: position.left,
            width: position.width,
          }}
        >
          <div className="mb-2.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                view === "years" ? moveYearPage(-1) : moveMonth(-1)
              }
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748B] transition hover:bg-[#F8FAFC] hover:text-[#B91C1C]"
              aria-label={view === "years" ? "Previous years" : "Previous month"}
            >
              <ChevronLeft size={16} />
            </button>
            {view === "years" ? (
              <button
                type="button"
                onClick={() => setView("days")}
                className="rounded-lg px-3 py-1.5 text-[13px] font-bold text-[#0F172A] transition hover:bg-[#F8FAFC]"
              >
                {yearOptions[0]} - {yearOptions.at(-1)}
              </button>
            ) : (
              <div className="flex items-center justify-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setView(view === "months" ? "days" : "months")}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-bold transition ${
                    view === "months"
                      ? "bg-red-50 text-[#B91C1C]"
                      : "text-[#0F172A] hover:bg-[#F8FAFC]"
                  }`}
                >
                  {MONTH_LABELS[monthDate.getMonth()].slice(0, 3)}
                  <ChevronDown size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setYearPageStart(getYearPageStart(monthDate.getFullYear()));
                    setView("years");
                  }}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-bold text-[#0F172A] transition hover:bg-[#F8FAFC]"
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
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748B] transition hover:bg-[#F8FAFC] hover:text-[#B91C1C]"
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
                    className={`rounded-lg px-2 py-2 text-xs font-bold transition ${
                      selected
                        ? "bg-[#B91C1C] text-white shadow-sm shadow-[#B91C1C]/20"
                        : "text-[#334155] hover:bg-[#F8FAFC] hover:text-[#B91C1C]"
                    } ${
                      disabledMonth
                        ? "cursor-not-allowed opacity-30 hover:bg-transparent hover:text-[#334155]"
                        : ""
                    }`}
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
                    className={`rounded-lg px-2 py-2 text-xs font-bold transition ${
                      selected
                        ? "bg-[#B91C1C] text-white shadow-sm shadow-[#B91C1C]/20"
                        : "text-[#334155] hover:bg-[#F8FAFC] hover:text-[#B91C1C]"
                    } ${
                      disabledYear
                        ? "cursor-not-allowed opacity-30 hover:bg-transparent hover:text-[#334155]"
                        : ""
                    }`}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          )}

          {view === "days" && (
            <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAY_LABELS.map((weekday) => (
              <span
                key={weekday}
                className="py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#94A3B8]"
              >
                {weekday}
              </span>
            ))}
            {calendarDays.map((date) => {
              const isSelected = isSameDate(date, activeDate);
              const isToday = isSameDate(date, today);
              const isCurrentMonth = date.getMonth() === monthDate.getMonth();
              const outOfRange =
                (minDate && date < minDate) || (maxDate && date > maxDate);

              return (
                <button
                  key={formatDateValue(date)}
                  type="button"
                  disabled={outOfRange}
                  onClick={() => selectDate(date)}
                  className={`flex h-7 items-center justify-center rounded-lg text-[11px] font-semibold transition ${
                    isSelected
                      ? "bg-[#B91C1C] text-white shadow-sm shadow-[#B91C1C]/20"
                      : isToday
                        ? "border border-red-100 bg-red-50 text-[#B91C1C]"
                        : "text-[#334155] hover:bg-[#F8FAFC] hover:text-[#B91C1C]"
                  } ${!isCurrentMonth && !isSelected ? "text-[#CBD5E1]" : ""} ${
                    outOfRange
                      ? "cursor-not-allowed opacity-30 hover:bg-transparent hover:text-[#334155]"
                      : ""
                  }`}
                >
                  {date.getDate()}
                </button>
              );
            })}
            </div>
          )}

          {isBirthdateMode ? (
            <div className="mt-2.5 flex items-center justify-end gap-2 pt-2.5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#64748B] transition hover:bg-[#F8FAFC]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyDraftDate}
                disabled={!draftDate}
                className="rounded-lg bg-[#B91C1C] px-3 py-1.5 text-xs font-bold text-white shadow-sm shadow-[#B91C1C]/15 transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="mt-2.5 flex items-center justify-between pt-2.5">
              {allowClear ? (
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#64748B] transition hover:bg-[#F8FAFC]"
                >
                  <X size={12} />
                  Clear
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => selectDate(new Date())}
                disabled={(minDate && today < minDate) || (maxDate && today > maxDate)}
                className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-[#B91C1C] transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Today
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
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
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(parseTimeValue(value));
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const { popoverRef, position } = useFloatingPopover({
    open,
    triggerRef,
    onClose: () => setOpen(false),
    minWidth: 260,
    maxWidth: 280,
    estimatedHeight: 210,
  });

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
    <div ref={wrapperRef} className="relative" data-field={name}>
      <FieldLabel label={label} required={required} />
      <button
        ref={triggerRef}
        type="button"
        name={name}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-expanded={open}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={getTriggerClasses(error, disabled)}
      >
        <span className={value ? "text-[#1F2937]" : "text-[#9CA3AF]"}>
          {formatDisplayTime(value) || placeholder}
        </span>
        <Clock size={15} className="shrink-0 text-[#9CA3AF]" />
      </button>
      <FieldError error={error} />

      {open &&
        createPortal(
        <div
          ref={popoverRef}
          className="anim-drop-in fixed z-[9999] rounded-xl border border-[#E8ECF0] bg-white p-2 shadow-xl shadow-slate-900/10"
          style={{
            top: position.top,
            left: position.left,
            width: position.width,
            maxHeight: position.maxHeight,
            overflowY: "auto",
          }}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
              Time of Visit
            </p>
            <button
              type="button"
              onClick={useCurrentTime}
              className="rounded-md bg-red-50 px-2 py-1 text-[11px] font-bold text-[#B91C1C] transition hover:bg-red-100"
            >
              Now
            </button>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-1.5">
            <div>
              <label className="mb-1 block text-[9px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                Hour
              </label>
              <input
                type="number"
                min="1"
                max="12"
                value={draft.hour}
                onChange={(event) => updateDraft("hour", event.target.value)}
                className="h-8 w-full rounded-lg border border-[#E5E7EB] bg-white px-2 text-center text-sm font-bold text-[#0F172A] outline-none transition focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10"
              />
            </div>
            <span className="pb-1.5 text-base font-bold text-[#CBD5E1]">:</span>
            <div>
              <label className="mb-1 block text-[9px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                Minute
              </label>
              <input
                type="number"
                min="0"
                max="59"
                value={draft.minute}
                onChange={(event) => updateDraft("minute", event.target.value)}
                className="h-8 w-full rounded-lg border border-[#E5E7EB] bg-white px-2 text-center text-sm font-bold text-[#0F172A] outline-none transition focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10"
              />
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 rounded-lg border border-[#E8ECF0] bg-[#F8FAFC] p-0.5">
            {["AM", "PM"].map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => updateDraft("period", period)}
                className={`h-7 rounded-md text-[11px] font-bold transition ${
                  draft.period === period
                    ? "bg-[#B91C1C] text-white shadow-sm shadow-[#B91C1C]/15"
                    : "text-[#64748B] hover:bg-white hover:text-[#B91C1C]"
                }`}
              >
                {period}
              </button>
            ))}
          </div>

          <div className="mt-2 flex justify-end pt-2">
            <button
              type="button"
              onClick={() => applyTime()}
              className="rounded-md bg-[#B91C1C] px-3 py-1.5 text-[11px] font-bold text-white shadow-sm shadow-[#B91C1C]/15 transition hover:bg-[#991B1B]"
            >
              Set
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
