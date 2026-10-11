import { useRef, useState } from "react";
import { Check, Copy, KeyRound, Link2 } from "lucide-react";
import { ModalButton, ModalShell } from "../../common";
import { copyText } from "../../../utils/clipboard";

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

/** A read-only value with a Copy button; if the clipboard refuses, the text is selected for Ctrl+C. */
function CopyValue({ value, label, mono = false }) {
  const inputRef = useRef(null);
  const [state, setState] = useState("idle");

  async function handleCopy() {
    if (await copyText(value)) {
      setState("copied");
      return;
    }
    inputRef.current?.focus();
    inputRef.current?.select();
    setState("manual");
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          readOnly
          value={value || ""}
          aria-label={label}
          onFocus={(event) => event.target.select()}
          className={`h-10 min-w-0 flex-1 rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20 ${
            mono ? "font-mono tracking-wide" : ""
          }`}
        />
        <ModalButton onClick={handleCopy} className="shrink-0">
          {state === "copied" ? <Check size={14} /> : <Copy size={14} />}
          {state === "copied" ? "Copied" : "Copy"}
        </ModalButton>
      </div>
      <p className="mt-1 min-h-4 text-xs leading-4 text-slate-500" aria-live="polite">
        {state === "manual" ? "Press Ctrl+C to copy the selected text." : ""}
      </p>
    </div>
  );
}
