import { useEffect, useReducer, useRef } from "react";
import { Loader2 } from "lucide-react";
import ModalShell from "../modals/ModalShell";
import { Button } from "../../ui/button";
import { draftRecoveryDialogReducer } from "./draftRecoveryDialogState";

export function FormDraftRecoveryDialogView({
  open,
  title,
  contextLabel = "",
  description = "",
  classification = "",
  draftStatus = "",
  lastSavedAt = "",
  checking = false,
  loadingMessage = "Checking for unfinished work…",
  cancelLabel = "",
  busy = false,
  resuming = false,
  error = "",
  resumeLabel = "Resume",
  onResume,
  onDiscard,
  onClose,
  onRetry,
  onKeepDraft,
  onRequestDiscard,
  phase = "decision",
  initialFocusRef,
}) {
  const confirming = phase === "confirm-discard";
  const savedDate = lastSavedAt ? new Date(lastSavedAt) : null;
  const validDate = savedDate && Number.isFinite(savedDate.getTime());
  const problem = typeof error === "string" ? error : error?.message || "";
  const resolvedTitle = title
    || (onResume ? "You have unfinished work." : (problem ? "Unable to check unfinished work" : "You have unfinished work."));
  const defaultDescription = onResume
    ? "Continue where you left off?"
    : (problem && onRetry ? "We couldn't check for unfinished work. Please try again." : "");
  // Decision / check: plain chrome (not brand-red). Discard confirm: brand-red
  // header so destruction reads as deliberate. Errors stay inline alert, never amber.
  return (
    <ModalShell
      open={open}
      title={confirming ? "Discard unfinished work?" : resolvedTitle}
      appearance={confirming ? "default" : "plain"}
      size="sm"
      onClose={confirming ? onKeepDraft : onClose}
      closeDisabled={busy}
      initialFocusRef={initialFocusRef}
      footer={checking ? null : confirming ? (
        <>
          <Button ref={initialFocusRef} type="button" variant="secondary" data-modal-primary="true" disabled={busy} onClick={onKeepDraft}>Keep Draft</Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={onDiscard}>Discard</Button>
        </>
      ) : (
        <>
          {cancelLabel && <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>{cancelLabel}</Button>}
          {problem && onRetry && <Button type="button" variant="secondary" disabled={busy} onClick={onRetry}>Retry</Button>}
          {onDiscard && <Button type="button" variant="secondary" disabled={busy} onClick={onRequestDiscard}>Discard</Button>}
          {onResume && <Button ref={initialFocusRef} type="button" variant="brand" data-modal-primary="true" disabled={busy} aria-busy={resuming || undefined} onClick={onResume}>{resuming && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}{resuming ? "Restoring..." : resumeLabel}</Button>}
        </>
      )}
    >
      <div className="space-y-3 text-sm text-ink-600">
        {checking ? <p role="status" aria-live="polite">{loadingMessage}</p> : (
          <>
            {contextLabel && <p className="font-medium text-ink-800" style={{ overflowWrap: "anywhere" }}>{contextLabel}</p>}
            {confirming ? (
              <p>This removes the unfinished input. Saved records remain unchanged.</p>
            ) : (
              <>
                {(description || defaultDescription) && <p>{description || defaultDescription}</p>}
                {(classification || draftStatus) && (
                  <dl className="grid gap-1 text-xs text-ink-500">
                    {classification ? (
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-semibold text-ink-700">Consultation type</dt>
                        <dd>{classification}</dd>
                      </div>
                    ) : null}
                    {draftStatus ? (
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-semibold text-ink-700">Draft status</dt>
                        <dd>{draftStatus}</dd>
                      </div>
                    ) : null}
                  </dl>
                )}
              </>
            )}
            {(onResume || confirming) && (
              <p className="text-xs text-ink-500">
                Last saved
                {" · "}
                {validDate ? <time dateTime={lastSavedAt}>{savedDate.toLocaleString("en-PH")}</time> : "Saved time unavailable"}
              </p>
            )}
          </>
        )}
        {problem ? (
          <p role="alert" className="rounded-lg border border-alert-100 bg-alert-50 px-3 py-2 text-xs text-alert-700">
            {problem}
          </p>
        ) : null}
      </div>
    </ModalShell>
  );
}

function RecoveryDecision(props) {
  const [phase, dispatch] = useReducer(draftRecoveryDialogReducer, "decision");
  const safeFocus = useRef(null);
  useEffect(() => { safeFocus.current?.focus(); }, [phase, props.checking]);
  const keep = () => dispatch({ type: "keep-draft", blocked: props.busy });
  const close = () => {
    if (props.busy) return;
    dispatch({ type: "close" });
    props.onClose?.();
  };
  return (
    <FormDraftRecoveryDialogView
      {...props}
      phase={phase}
      initialFocusRef={safeFocus}
      onKeepDraft={keep}
      onClose={close}
      onRequestDiscard={() => dispatch({ type: "request-discard", blocked: props.busy })}
    />
  );
}

export default function FormDraftRecoveryDialog(props) {
  return props.open ? <RecoveryDecision {...props} /> : null;
}
