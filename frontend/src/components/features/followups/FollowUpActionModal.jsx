import { useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";
import {
  ModalButton,
  ModalShell,
} from "../../common";
import {
  DatePickerField,
  TimePickerField,
} from "../../common/forms/DatePickerField";

export default function FollowUpActionModal({
  modal,
  saving,
  onClose,
  onReschedule,
  onCancel,
}) {
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");

  useEffect(() => {
    setNotes("");
    setDueDate(modal?.task?.dueDate || "");
    setDueTime(modal?.task?.dueTime || "");
  }, [modal]);

  if (!modal) return null;

  const cancelling = modal.type === "cancel";

  return (
    <ModalShell
      open={Boolean(modal)}
      title={cancelling ? "Cancel Follow-up" : "Reschedule Follow-up"}
      subtitle={modal.task.patientName || "Selected patient"}
      icon={<RefreshCcw size={14} />}
      size="md"
      onClose={onClose}
      dismissOnBackdrop={false}
      footer={
        <>
          <ModalButton onClick={onClose}>Close</ModalButton>
          <ModalButton
            variant="primary"
            primary
            disabled={saving || (!cancelling && !dueDate)}
            onClick={() =>
              cancelling
                ? onCancel(modal.task, notes)
                : onReschedule(modal.task, {
                    dueDate,
                    dueTime,
                    notes,
                  })
            }
          >
            <RefreshCcw size={14} />
            {saving
              ? "Saving..."
              : cancelling
                ? "Cancel Follow-up"
                : "Reschedule"}
          </ModalButton>
        </>
      }
    >
      <div className="space-y-4">
          {cancelling ? (
            <p className="text-sm leading-6 text-slate-600">
              This preserves the schedule in history and removes it from active
              follow-up lookup.
            </p>
          ) : (
            <>
              <DatePickerField
                label="New Follow-up Date"
                name="dueDate"
                value={dueDate}
                onChange={setDueDate}
              />
              <TimePickerField
                label="Follow-up Time (optional)"
                name="dueTime"
                value={dueTime}
                onChange={setDueTime}
              />
            </>
          )}
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Remarks
            </label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#B91C1C]/40 focus:bg-white"
              placeholder={
                cancelling
                  ? "Reason for cancellation..."
                  : "Rescheduling notes..."
              }
            />
          </div>
      </div>
    </ModalShell>
  );
}
