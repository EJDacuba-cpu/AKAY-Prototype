import { KeyRound, Link2 } from "lucide-react";
import { ModalButton, ModalShell } from "../../common";
import CopyValue from "../accounts/CopyValue";

/** Shows a temporary password once, with a Copy button (spec D4). */
export default function TemporaryPasswordDialog({ name, password, onClose }) {
  return (
    <ModalShell
      open={Boolean(password)}
      title="Temporary password"
      subtitle={name}
      icon={<KeyRound size={14} />}
      size="sm"
      onClose={onClose}
      dismissOnBackdrop={false}
      dismissOnEscape={false}
      footer={
        <ModalButton variant="primary" primary onClick={onClose}>
          Done
        </ModalButton>
      }
    >
      <CopyValue value={password} label="Temporary password" mono />
      <p className="mt-3 text-[13px] leading-5 text-slate-600">
        This is the only time it is shown. It expires in 72 hours. {name} must
        change it the first time they sign in.
      </p>
    </ModalShell>
  );
}

/** Copy link fallback when the browser blocks the clipboard (e.g. on plain http): the MHO copies it by hand. */
export function ManualCopyDialog({ name, url, onClose }) {
  return (
    <ModalShell
      open={Boolean(url)}
      title="Copy this link"
      subtitle={name}
      icon={<Link2 size={14} />}
      size="sm"
      onClose={onClose}
      footer={
        <ModalButton variant="primary" primary onClick={onClose}>
          Done
        </ModalButton>
      }
    >
      <CopyValue value={url} label="One-time link" />
      <p className="mt-3 text-[13px] leading-5 text-slate-600">
        The browser could not copy the link. Select it and copy it by hand,
        then share it with {name}. The emailed link no longer works.
      </p>
    </ModalShell>
  );
}
