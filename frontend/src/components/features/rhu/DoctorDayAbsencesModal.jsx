import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";

import { ModalButton, ModalShell } from "../../common";
import {
  formatLongDate,
  manilaDateKey,
  unavailabilityChipLabel,
} from "../../../utils/doctorAvailabilityCalendar";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50";

export default function DoctorDayAbsencesModal({
  open,
  date,
  rows = [],
  canManage,
  saving,
  error,
  onRemove,
  onClose,
}) {
  const [confirmingId, setConfirmingId] = useState("");
  const past = Boolean(date && date < manilaDateKey());

  useEffect(() => {
    setConfirmingId("");
  }, [date, open]);

  if (!open || !date) return null;

  function handleRemove(row) {
    if (confirmingId !== row.id) {
      setConfirmingId(row.id);
      return;
    }
    setConfirmingId("");
    onRemove(row);
  }

  return (
    <ModalShell
      open={open}
      title={formatLongDate(date)}
      subtitle={`${rows.length} ${rows.length === 1 ? "absence" : "absences"} scheduled`}
      icon={<CalendarDays size={14} />}
      size="sm"
      onClose={onClose}
      footer={<ModalButton onClick={onClose}>Close</ModalButton>}
    >
      {rows.length === 0 ? (
        <p className="text-[12px] text-neutral-600">No absences scheduled.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const confirming = confirmingId === row.id;
            return (
              <li
                key={row.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-neutral-100 px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-semibold text-ink-800">
                    {row.doctorName || "Doctor"}
                  </span>
                  <span className="block truncate text-[12px] text-neutral-600">
                    {unavailabilityChipLabel(row)}
                  </span>
                </span>
                {canManage && !past ? (
                  <span className="flex shrink-0 items-center gap-2">
                    {confirming ? (
                      <button
                        type="button"
                        onClick={() => setConfirmingId("")}
                        className={`rounded text-[12px] font-semibold text-neutral-600 hover:underline ${FOCUS_RING}`}
                      >
                        Cancel
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleRemove(row)}
                      disabled={saving}
                      aria-label={`${confirming ? "Confirm remove" : "Remove"} ${unavailabilityChipLabel(row)} absence for ${row.doctorName || "doctor"}`}
                      className={`rounded text-[12px] font-semibold text-alert-700 hover:underline disabled:opacity-50 ${FOCUS_RING}`}
                    >
                      {confirming ? "Confirm remove" : "Remove"}
                    </button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {past ? <p className="mt-3 text-[12px] text-neutral-600">Past dates are view-only.</p> : null}
      {error ? <p className="mt-3 text-[12px] font-medium text-alert-700">{error}</p> : null}
    </ModalShell>
  );
}
