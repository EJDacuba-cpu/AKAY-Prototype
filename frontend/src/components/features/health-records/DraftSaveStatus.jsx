import { AlertTriangle, Check, WifiOff } from "lucide-react";

/**
 * Visual autosave status for the encrypted health-record draft.
 *
 * Three primary states (per the offline-resilience spec):
 *  - saved            subtle grey  "Saved 12:04 PM"
 *  - saving / pending subtle grey with spinner "Saving..."
 *  - offline          PROMINENT amber banner protecting the user's work
 *
 * conflict/error render a compact red line. The wrapper is aria-live="polite"
 * so screen readers announce transitions.
 */

function formatSavedTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function DraftSaveStatus({ status, lastSavedAt, className = "" }) {
  return (
    <div aria-live="polite" className={className}>
      {renderStatus(status, lastSavedAt)}
    </div>
  );
}

function renderStatus(status, lastSavedAt) {
  if (status === "offline") {
    return (
      <div
        role="alert"
        className="flex w-full items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5 text-amber-900 shadow-sm ring-1 ring-amber-200/60"
      >
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <WifiOff size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-snug">
            No connection. Your work is safe — do not close this tab.
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
            It will save automatically when the connection returns.
          </p>
        </div>
      </div>
    );
  }

  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-500">
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500"
          aria-hidden="true"
        />
        Saving...
      </span>
    );
  }

  if (status === "conflict") {
    return (
      <span className="inline-flex items-center gap-2 rounded-lg text-xs font-medium text-red-700">
        <AlertTriangle size={14} aria-hidden="true" />
        Draft updated elsewhere — reload to keep saving.
      </span>
    );
  }

  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-2 rounded-lg text-xs font-medium text-red-700">
        <AlertTriangle size={14} aria-hidden="true" />
        Couldn&apos;t save the draft. Your entries are still here.
      </span>
    );
  }

  if (status === "saved") {
    const time = formatSavedTime(lastSavedAt);
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <Check size={14} className="text-emerald-600" aria-hidden="true" />
        {time ? `Saved ${time}` : "Saved"}
      </span>
    );
  }

  // idle: nothing to announce yet.
  return null;
}
