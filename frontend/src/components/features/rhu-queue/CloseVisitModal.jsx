import { useState } from "react";

import ModalShell from "../../common/modals/ModalShell";
import { Button } from "../../ui/button";
import { CLOSE_REASONS } from "../../../utils/rhuQueueView";

/**
 * Close a waiting visit with one of the three audited reasons (D10). Other requires a note.
 */
export default function CloseVisitModal({ row, saving = false, error = "", onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const needsNote = reason === "other";
  const canSubmit = reason !== "" && (!needsNote || note.trim() !== "") && !saving;

  return (
    <ModalShell
      title="Close visit"
      subtitle={row?.name ? `${row.name} stays in patient history.` : "The visit stays in patient history."}
      size="md"
      onClose={onClose}
      closeDisabled={saving}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            type="button"
            variant="brand"
            disabled={!canSubmit}
            onClick={() => onConfirm({ reason, note: needsNote ? note.trim() : note.trim() || undefined })}
          >
            {saving ? "Closing..." : "Close visit"}
          </Button>
        </>
      }
    >
      <fieldset className="space-y-3" disabled={saving}>
        <legend className="text-[13px] font-semibold text-neutral-900">Why is this visit closing?</legend>
        <div className="flex flex-col gap-2">
          {CLOSE_REASONS.map((option) => (
            <label
              key={option.value}
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-full border px-3 text-[13px] ${
                reason === option.value
                  ? "border-brand-200 bg-brand-50 text-brand-800"
                  : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300"
              }`}
            >
              <input
                type="radio"
                name="close-reason"
                value={option.value}
                checked={reason === option.value}
                onChange={() => setReason(option.value)}
                className="accent-brand-600"
              />
              {option.label}
            </label>
          ))}
        </div>
        {needsNote && (
          <label className="block">
            <span className="text-[12px] font-medium text-neutral-600">Note</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              rows={3}
              required
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] text-neutral-900 shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50"
            />
          </label>
        )}
        {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
      </fieldset>
    </ModalShell>
  );
}
