import { AlertCircle } from "lucide-react";
import ModalShell, { ModalButton } from "./ModalShell";

export default function NoticeModal({
  open,
  title,
  subtitle = "AKAY Notice",
  message,
  children,
  actions,
  buttonText = "OK",
  onClose,
  icon = <AlertCircle size={14} />,
  size = "md",
  closeDisabled = false,
  dismissOnBackdrop = true,
}) {
  if (!open) return null;
  const resolvedActions =
    Array.isArray(actions) && actions.length > 0
      ? actions
      : [{ label: buttonText, variant: "primary", onClick: onClose }];
  const orderedActions = [
    ...resolvedActions.filter((action) => action.variant === "secondary"),
    ...resolvedActions.filter((action) => action.variant !== "secondary"),
  ];

  return (
    <ModalShell
      open={open}
      title={title}
      subtitle={subtitle}
      icon={icon}
      size={size}
      onClose={onClose}
      closeDisabled={closeDisabled}
      dismissOnBackdrop={dismissOnBackdrop && !closeDisabled}
      dismissOnEscape={!closeDisabled}
      footer={orderedActions.map((action) => {
        const primary =
          action.variant === "primary" ||
          action.variant === "destructive" ||
          action.variant !== "secondary";
        return (
          <ModalButton
            key={action.label}
            variant={
              action.variant === "destructive"
                ? "destructive"
                : primary
                  ? "primary"
                  : "secondary"
            }
            primary={action.variant === "primary"}
            disabled={action.disabled}
            onClick={() => {
              if (action.onClick === onClose) {
                onClose?.();
                return;
              }
              onClose?.();
              action.onClick?.();
            }}
          >
            {action.icon}
            {action.label}
          </ModalButton>
        );
      })}
    >
      {children || (
        <p className="whitespace-pre-line text-[13px] leading-5 text-slate-600">
          {message}
        </p>
      )}
    </ModalShell>
  );
}
