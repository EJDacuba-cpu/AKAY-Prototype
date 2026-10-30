import { useRef } from "react";
import { AlertTriangle } from "lucide-react";
import ButtonSpinner from "../loading/ButtonSpinner";
import ModalShell, { ModalButton } from "./ModalShell";

export default function ConfirmationModal({
  open,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  loading = false,
  loadingText = "Saving...",
  tone = "danger",
}) {
  const cancelRef = useRef(null);
  const isDanger = tone === "danger";

  return (
    <ModalShell
      open={open}
      title={title}
      appearance={isDanger ? "default" : "plain"}
      icon={isDanger ? <AlertTriangle size={14} strokeWidth={2.2} /> : undefined}
      size="sm"
      onClose={onCancel}
      closeDisabled={loading}
      dismissOnBackdrop={!loading}
      dismissOnEscape={!loading}
      initialFocusRef={isDanger ? cancelRef : undefined}
      footer={
        <>
          <ModalButton ref={cancelRef} onClick={onCancel} disabled={loading}>
            {cancelText}
          </ModalButton>
          <ModalButton
            variant={isDanger ? "destructive" : "ink"}
            primary={!isDanger}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <ButtonSpinner />}
            {loading ? loadingText : confirmText}
          </ModalButton>
        </>
      }
    >
      <p className="text-[13px] leading-5 text-neutral-600">{description}</p>
    </ModalShell>
  );
}
