import { Link2 } from "lucide-react";
import { ModalButton, ModalShell } from "../../common";
import CopyValue from "../accounts/CopyValue";

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
      <CopyValue value={url} label="Reset link" mono />
      <p className="mt-3 text-[13px] leading-5 text-slate-600">
        Copy this link and share it with {name}. The previous emailed link no longer works.
      </p>
    </ModalShell>
  );
}
