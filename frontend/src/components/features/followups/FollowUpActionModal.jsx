import { useEffect, useState } from "react";
import { RefreshCcw, X } from "lucide-react";

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
  const [reason, setReason] = useState("");

  useEffect(() => {
    setNotes("");
    setDueDate(modal?.task?.dueDate || "");
    setDueTime(modal?.task?.dueTime || "");
    setReason(modal?.task?.reason || "");
  }, [modal]);

  if (!modal) return null;

  const cancelling = modal.type === "cancel";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/35 px-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-[#0F172A]">
              {cancelling ? "Cancel Follow-up" : "Reschedule Follow-up"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {modal.task.patientName || "Selected patient"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-300 hover:bg-slate-50 hover:text-slate-500"
            aria-label="Close follow-up action"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {cancelling ? (
            <p className="text-sm leading-6 text-slate-600">
              This preserves the schedule in history and removes it from active
              follow-up lookup.
            </p>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  New Follow-up Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#B91C1C]/40 focus:bg-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Follow-up Time (optional)
                </label>
                <input
                  type="time"
                  value={dueTime}
                  onChange={(event) => setDueTime(event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#B91C1C]/40 focus:bg-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Follow-up Reason
                </label>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#B91C1C]/40 focus:bg-white"
                  placeholder="Reason for the return visit"
                />
              </div>
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

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50"
          >
            Close
          </button>
          <button
            type="button"
            disabled={saving || (!cancelling && (!dueDate || !reason.trim()))}
            onClick={() =>
              cancelling
                ? onCancel(modal.task, notes)
                : onReschedule(modal.task, {
                    dueDate,
                    dueTime,
                    reason,
                    notes,
                  })
            }
            className="inline-flex items-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw size={14} />
            {saving
              ? "Saving..."
              : cancelling
                ? "Cancel Follow-up"
                : "Reschedule"}
          </button>
        </div>
      </div>
    </div>
  );
}
