import { RefreshCcw, ServerCrash, WifiOff } from "lucide-react";

const VARIANT_DEFAULTS = {
  offline: {
    title: "Connection Lost",
    message:
      "We couldn't load this page because your device appears to be offline. Please check your internet connection and try again.",
    icon: WifiOff,
  },
  timeout: {
    title: "Server Is Taking Too Long",
    message:
      "The server took longer than expected to respond. This is usually a temporary server issue, not your internet. Please try again in a moment.",
    icon: RefreshCcw,
  },
  error: {
    title: "Unable to Load Data",
    message:
      "Something went wrong while loading this page. Please try again in a moment.",
    icon: ServerCrash,
  },
};

export default function ConnectionErrorState({
  title,
  message,
  onRetry,
  retrying = false,
  variant = "offline",
  fullPage = false,
}) {
  const defaults = VARIANT_DEFAULTS[variant] || VARIANT_DEFAULTS.offline;
  const Icon = defaults.icon;
  const resolvedTitle = title || defaults.title;
  const resolvedMessage = message || defaults.message;
  const wrapperClass = fullPage
    ? "flex min-h-[calc(100dvh-9rem)] items-center justify-center rounded-xl bg-white px-4 py-12"
    : "flex min-h-[420px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-12 shadow-sm";

  return (
    <div className={wrapperClass}>
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-red-100 bg-red-50 text-[#B91C1C]">
          <Icon size={21} />
        </div>
        <h2 className="mt-4 text-base font-bold text-[#0F172A]">{resolvedTitle}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{resolvedMessage}</p>
        <p className="mt-2 text-xs text-slate-400">
          Your saved records are safe.
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCcw size={15} className={retrying ? "animate-spin" : ""} />
          {retrying ? "Retrying..." : "Retry"}
        </button>
      </div>
    </div>
  );
}
