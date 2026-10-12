import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { ModalButton } from "../../common";
import { copyText } from "../../../utils/clipboard";

/** A read-only value with a Copy button; if the clipboard refuses, the text is selected for Ctrl+C. */
export default function CopyValue({ value, label, mono = false }) {
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
