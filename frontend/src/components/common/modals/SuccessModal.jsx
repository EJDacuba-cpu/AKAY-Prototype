import { CheckCircle2 } from "lucide-react";
import ModalShell, { ModalButton } from "./ModalShell";

export default function SuccessModal({
  open,
  title,
  description,
  actions,
  buttonText = "Continue",
  onClose,
  secondaryButtonText,
  onSecondaryAction,
}) {
  if (!open) return null;
  const hasCustomActions = Array.isArray(actions) && actions.length > 0;
  const orderedActions = hasCustomActions
    ? [
        ...actions.filter((action) => action.variant !== "primary"),
        ...actions.filter((action) => action.variant === "primary"),
      ]
    : [];

  const footer = hasCustomActions ? (
    orderedActions.map((action) => (
      <ModalButton
        key={action.label}
        variant={
          action.variant === "primary" || action.variant === "destructive"
            ? action.variant
            : "secondary"
        }
        primary={action.variant === "primary"}
        disabled={action.disabled}
        onClick={action.onClick}
      >
        {action.icon}
        {action.label}
      </ModalButton>
    ))
  ) : (
    <>
      {secondaryButtonText && onSecondaryAction && (
        <ModalButton onClick={onSecondaryAction}>
          {secondaryButtonText}
        </ModalButton>
      )}
      <ModalButton variant="primary" primary onClick={onClose}>
        {buttonText}
      </ModalButton>
    </>
  );

  return (
    <ModalShell
      open={open}
      title={title}
      icon={<CheckCircle2 size={14} strokeWidth={2.2} />}
      size="sm"
      onClose={onClose}
      footer={footer}
    >
      <p className="text-[13px] leading-5 text-slate-600">{description}</p>
    </ModalShell>
  );
}
