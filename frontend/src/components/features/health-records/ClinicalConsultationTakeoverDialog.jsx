import { useEffect, useRef, useState } from "react";
import ModalShell from "../../common/modals/ModalShell";
import { Button } from "../../ui/button";

/** Explicit confirmed takeover for a clinical draft held by another editor. */
export default function ClinicalConsultationTakeoverDialog({
  open = true,
  patientName = "",
  editorName = "another staff member",
  canTakeover = true,
  busy = false,
  takingOver = false,
  error = "",
  onClose,
  onTakeover,
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const focusRef = useRef(null);
  const trimmed = reason.trim();

  useEffect(() => {
    if (!open) {
      setConfirming(false);
      setReason("");
    }
  }, [open]);

  useEffect(() => {
    focusRef.current?.focus();
  }, [confirming, canTakeover, open]);

  if (!open) return null;

  if (!canTakeover) {
    return (
      <ModalShell
        open
        title="Consultation in use"
        size="sm"
        onClose={onClose}
        closeDisabled={busy}
        initialFocusRef={focusRef}
        footer={<Button ref={focusRef} type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>}
      >
        <div className="space-y-3 text-sm text-ink-600">
          <p className="font-medium text-ink-800" style={{ overflowWrap: "anywhere" }}>
            {patientName || "Selected patient"}
          </p>
          <p>{`Being edited by ${editorName}. You can't edit this consultation right now.`}</p>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      open
      title={confirming ? "Take over this consultation?" : "Consultation in use"}
      size="sm"
      onClose={confirming ? () => { if (!busy) setConfirming(false); } : onClose}
      closeDisabled={busy}
      initialFocusRef={focusRef}
      footer={confirming ? (
        <>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>Back</Button>
          <Button
            ref={focusRef}
            type="button"
            variant="brand"
            data-modal-primary="true"
            disabled={busy || !trimmed}
            onClick={() => onTakeover?.(trimmed)}
          >
            {takingOver ? "Taking over..." : "Confirm Take Over"}
          </Button>
        </>
      ) : (
        <>
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button ref={focusRef} type="button" variant="brand" data-modal-primary="true" disabled={busy} onClick={() => setConfirming(true)}>
            Take Over
          </Button>
        </>
      )}
    >
      <div className="space-y-3 text-sm text-ink-600">
        <p className="font-medium text-ink-800" style={{ overflowWrap: "anywhere" }}>
          {patientName || "Selected patient"}
        </p>
        {confirming ? (
          <>
            <p>Add a short reason for the record, then continue with the saved draft.</p>
            <label className="block space-y-1 text-xs font-semibold text-ink-700">
              Reason
              <textarea
                ref={focusRef}
                rows={3}
                maxLength={2000}
                value={reason}
                disabled={busy}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm font-normal text-ink-800 shadow-xs focus:border-ink-400 focus:outline-none focus:ring-2 focus:ring-ink-400/40 disabled:opacity-50"
              />
            </label>
          </>
        ) : (
          <p>{`Being edited by ${editorName}. Take over only if they stopped working on it.`}</p>
        )}
        {error ? <p role="alert" className="text-xs text-alert-700">{error}</p> : null}
      </div>
    </ModalShell>
  );
}
