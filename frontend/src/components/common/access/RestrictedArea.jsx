import { Lock } from "lucide-react";

export const RESTRICTED_MESSAGE = "You are not permitted to access this module.";

function block(event) {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * Holds a restricted module's place without its content.
 * Unlocked: renders `children` untouched, with no wrapper, so the layout is exactly the original.
 * Locked: one wrapper (the caller's `className` places it like the real module) around `placeholder`,
 * which must be static, never real data, blurred, inert and unclickable, under a centred badge.
 */
export default function RestrictedArea({ locked, placeholder, label, compact = false, className = "", children }) {
  if (!locked) return children;

  return (
    <div
      role="group"
      aria-label={label ? `${label}: not permitted` : undefined}
      data-access="locked"
      className={`relative isolate overflow-hidden ${className}`}
    >
      <div
        inert
        aria-hidden="true"
        onClickCapture={block}
        onKeyDownCapture={block}
        className="pointer-events-none select-none blur-sm [&_*]:animate-none!"
      >
        {placeholder}
      </div>
      <div className="absolute inset-0 z-10 grid place-items-center bg-white/40 p-3">
        <p
          role="note"
          className={`inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-white text-center font-semibold text-slate-700 shadow-sm ${
            compact ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-1.5 text-xs"
          }`}
        >
          <Lock size={compact ? 12 : 14} className="shrink-0 text-red-700" aria-hidden="true" />
          {compact ? (
            <>
              <span aria-hidden="true">Locked</span>
              <span className="sr-only">{RESTRICTED_MESSAGE}</span>
            </>
          ) : (
            RESTRICTED_MESSAGE
          )}
        </p>
      </div>
    </div>
  );
}
