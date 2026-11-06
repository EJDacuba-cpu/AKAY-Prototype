import { useState } from "react";

import ModalShell, { ModalButton } from "../../../common/modals/ModalShell";
import { Input } from "../../../ui/input";
import { getFacilityCalendarDate } from "../../../../utils/medicineInventoryStatus";
import { formatShortDate } from "../../../../utils/patientProfile";

export const NUTRITION_CLOSE_REASONS = [
  { value: "goals_met", label: "Goals met / discharged" },
  { value: "transferred", label: "Transferred / moved out" },
  { value: "lost_to_follow_up", label: "Lost to follow-up" },
  { value: "other", label: "Other" },
];

const NOTE_LIMIT = 500;

function isoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Empty string when the close date is allowed. */
export function nutritionCloseDateError(closedOn, { today, enrolledOn } = {}) {
  if (!isoDate(closedOn)) return "Choose a close date.";
  if (isoDate(today) && closedOn > today) return "Close date cannot be after today.";
  if (isoDate(enrolledOn) && closedOn < enrolledOn) return "Close date cannot be before the enrollment date.";
  return "";
}

export default function CloseNutritionCareModal({
  enrolledOn = "",
  saving = false,
  error = "",
  onClose,
  onConfirm,
}) {
  const today = getFacilityCalendarDate();
  const minDate = isoDate(enrolledOn) ? enrolledOn : "";
  const [reason, setReason] = useState("");
  const [closedOn, setClosedOn] = useState(today);
  const [note, setNote] = useState("");
  const dateError = nutritionCloseDateError(closedOn, { today, enrolledOn: minDate });
  const canConfirm = Boolean(reason) && !dateError && note.length <= NOTE_LIMIT && !saving;

  return (
    <ModalShell
      title="Close Nutrition Care"
      subtitle="The episode stays in the patient's history. A later visit can enroll again."
      size="md"
      onClose={onClose}
      closeDisabled={saving}
      dismissOnBackdrop={!saving}
      dismissOnEscape={!saving}
      footer={
        <>
          <ModalButton onClick={onClose} disabled={saving}>Cancel</ModalButton>
          <ModalButton
            variant="primary"
            primary
            disabled={!canConfirm}
            onClick={() => onConfirm?.({ reason, closedOn, note: note.trim() })}
          >
            {saving ? "Closing..." : "Close Nutrition Care"}
          </ModalButton>
        </>
      }
    >
      <fieldset className="space-y-4" disabled={saving}>
        <legend className="text-[13px] font-semibold text-neutral-900">Reason for closing</legend>
        <div className="flex flex-col gap-2">
          {NUTRITION_CLOSE_REASONS.map((option) => (
            <label
              key={option.value}
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-[13px] ${
                reason === option.value
                  ? "border-brand-200 bg-brand-50 text-brand-800"
                  : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300"
              }`}
            >
              <input
                type="radio"
                name="nutrition-close-reason"
                value={option.value}
                checked={reason === option.value}
                onChange={() => setReason(option.value)}
                className="accent-brand-600"
              />
              {option.label}
            </label>
          ))}
        </div>

        <label className="block" htmlFor="nutrition-closed-on">
          <span className="text-[12px] font-medium text-neutral-600">Close date</span>
          <Input
            id="nutrition-closed-on"
            type="date"
            value={closedOn}
            min={minDate || undefined}
            max={today}
            required
            aria-invalid={Boolean(closedOn) && Boolean(dateError)}
            aria-describedby={dateError ? "nutrition-closed-on-error" : undefined}
            onChange={(event) => setClosedOn(event.target.value)}
            className="mt-1 h-9 text-sm"
          />
        </label>
        {dateError ? (
          <p id="nutrition-closed-on-error" className="text-[12px] text-alert-700">{dateError}</p>
        ) : (
          <p className="text-[12px] text-neutral-500">
            {minDate ? `On or after ${formatShortDate(minDate)}, and on or before today.` : "On or before today."}
          </p>
        )}

        <label className="block" htmlFor="nutrition-close-note">
          <span className="text-[12px] font-medium text-neutral-600">Note</span>
          <textarea
            id="nutrition-close-note"
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, NOTE_LIMIT))}
            maxLength={NOTE_LIMIT}
            rows={3}
            placeholder="Optional"
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          />
          <span className="mt-1 block text-right text-[11px] text-neutral-500">{note.length}/{NOTE_LIMIT}</span>
        </label>

        {error ? <p role="alert" className="text-[13px] text-alert-700">{error}</p> : null}
      </fieldset>
    </ModalShell>
  );
}
