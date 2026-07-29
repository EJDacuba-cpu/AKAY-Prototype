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
}) {
  return (
    <ModalShell
      open={open}
      title={title}
      icon={<AlertTriangle size={14} strokeWidth={2.2} />}
      size="sm"
      onClose={onCancel}
      closeDisabled={loading}
      dismissOnBackdrop={!loading}
      dismissOnEscape={!loading}
      footer={
        <>
          <ModalButton onClick={onCancel} disabled={loading}>
            {cancelText}
          </ModalButton>
          <ModalButton
            variant="primary"
            primary
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <ButtonSpinner />}
            {loading ? loadingText : confirmText}
          </ModalButton>
        </>
      }
    >
      <p className="text-[13px] leading-5 text-slate-600">{description}</p>
    </ModalShell>
  );
}
