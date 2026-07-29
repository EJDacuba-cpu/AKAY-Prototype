import { useEffect, useRef, useState } from "react";
import { AlertTriangle, LoaderCircle, RotateCw } from "lucide-react";
import ModalShell, { ModalButton } from "./ModalShell";

export default function ConnectionIssueModal({
  open,
  title = "Connection Lost",
  message = "The server did not confirm this submission. Your form remains available while this tab stays open.",
  canRetry = true,
  retryDisabled = false,
  retryLabel = "Retry",
  retryLoading = false,
  retryLoadingLabel = "Retrying...",
  onContinue,
  onRetry,
}) {
  const retryButtonRef = useRef(null);
  const mountedRef = useRef(false);
  const [internalRetrying, setInternalRetrying] = useState(false);
  const retryBusy = Boolean(retryLoading || internalRetrying);

  useEffect(() => {
    mountedRef.current = Boolean(open);
    if (!open) setInternalRetrying(false);
    return () => {
      mountedRef.current = false;
    };
  }, [open]);

  function handleContinue() {
    if (!retryBusy) onContinue?.();
  }

  async function handleRetry() {
    if (!onRetry || retryBusy || retryDisabled) return;
    setInternalRetrying(true);
    try {
      await onRetry();
    } finally {
      if (mountedRef.current) setInternalRetrying(false);
    }
  }

  return (
    <ModalShell
      open={open}
      title={title}
      subtitle="Save interrupted"
      icon={<AlertTriangle size={14} strokeWidth={2.2} />}
      size="md"
      onClose={handleContinue}
      closeDisabled={retryBusy}
      dismissOnBackdrop={!retryBusy}
      dismissOnEscape={!retryBusy}
      initialFocusRef={canRetry ? retryButtonRef : undefined}
      footer={
        <>
          <ModalButton onClick={handleContinue} disabled={retryBusy}>
            Continue Editing
          </ModalButton>
          {canRetry && (
            <ModalButton
              ref={retryButtonRef}
              variant="primary"
              primary
              onClick={handleRetry}
              disabled={retryDisabled || retryBusy}
              aria-busy={retryBusy}
            >
              {retryBusy ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                <RotateCw size={14} />
              )}
              {retryBusy ? retryLoadingLabel : retryLabel}
            </ModalButton>
          )}
        </>
      }
    >
      <p className="text-[13px] leading-5 text-slate-600">{message}</p>
      <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-500">
        Your entries are still on this form. Continue editing, keep this tab
        open, or retry the official save when the connection is stable.
      </div>
    </ModalShell>
  );
}
