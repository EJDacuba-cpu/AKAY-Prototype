import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Calendar,
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

    function handleScroll() {
      onClose();
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", handleScroll, true);
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
  return `flex h-10 w-full items-center justify-between rounded-xl border bg-[#FAFBFC] px-3.5 text-left text-sm outline-none transition-all duration-200 ${
    error
      ? "border-[#B91C1C] bg-red-50/30 text-[#1F2937] ring-2 ring-[#B91C1C]/10"
      : "border-[#E8ECF0] text-[#1F2937] hover:border-[#D1D5DB] focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
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
}) {
  const selectedDate = useMemo(() => parseDateValue(value), [value]);
  const minDate = useMemo(() => parseDateValue(min), [min]);
  const maxDate = useMemo(() => parseDateValue(max), [max]);
  const [open, setOpen] = useState(false);
  const [monthDate, setMonthDate] = useState(selectedDate || new Date());
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const today = useMemo(() => new Date(), []);
  const calendarDays = useMemo(() => getCalendarDays(monthDate), [monthDate]);
  const { popoverRef, position } = useFloatingPopover({
    open,
    triggerRef,
    onClose: () => setOpen(false),
    minWidth: 300,
    maxWidth: 328,
    estimatedHeight: 300,
  });

  useEffect(() => {
    if (selectedDate && open) setMonthDate(selectedDate);
  }, [open, selectedDate]);

  function selectDate(date) {
    if ((minDate && date < minDate) || (maxDate && date > maxDate)) return;
    onChange(formatDateValue(date));
    setOpen(false);
  }

  function moveMonth(offset) {
    setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
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
              onClick={() => moveMonth(-1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748B] transition hover:bg-[#F8FAFC] hover:text-[#B91C1C]"
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="text-center">
              <p className="text-[13px] font-bold text-[#0F172A]">
                {MONTH_LABELS[monthDate.getMonth()]} {monthDate.getFullYear()}
              </p>
            </div>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#64748B] transition hover:bg-[#F8FAFC] hover:text-[#B91C1C]"
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </div>

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
              const isSelected = isSameDate(date, selectedDate);
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

          <div className="mt-2.5 flex items-center justify-between border-t border-[#F1F5F9] pt-2.5">
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
              className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-[#B91C1C] transition hover:bg-red-100"
            >
              Today
            </button>
          </div>
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
                className="h-8 w-full rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-2 text-center text-sm font-bold text-[#0F172A] outline-none transition focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
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
                className="h-8 w-full rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-2 text-center text-sm font-bold text-[#0F172A] outline-none transition focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
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

          <div className="mt-2 flex justify-end border-t border-[#F1F5F9] pt-2">
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
