import { RefreshCcw, ServerCrash, WifiOff } from "lucide-react";

const VARIANT_DEFAULTS = {
  forbidden: {
    title: "Access Not Assigned",
    message: "Your current facility permissions do not include this page. Contact MHO if your work requires this access.",
    icon: ServerCrash,
  },
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
  size = "page",
}) {
  const defaults = VARIANT_DEFAULTS[variant] || VARIANT_DEFAULTS.offline;
  const Icon = defaults.icon;
  const resolvedTitle = title || defaults.title;
  const resolvedMessage = message || defaults.message;
  // No card: the message sits directly on the page, like the empty states.
  // `compact` is for a section or tab inside a page: shorter, smaller type, same Retry.
  const compact = size === "compact";
  const wrapperClass = compact
    ? "flex min-h-[160px] items-center justify-center px-4 py-6"
    : fullPage
      ? "flex min-h-[calc(100dvh-9rem)] items-center justify-center px-4 py-12"
      : "flex min-h-[420px] items-center justify-center px-4 py-12";

  return (
    <div className={wrapperClass}>
      <div className="mx-auto max-w-md text-center">
        <div
          className={`mx-auto flex items-center justify-center rounded-full border border-red-100 bg-red-50 text-[#B91C1C] ${
            compact ? "h-9 w-9" : "h-12 w-12"
          }`}
        >
          <Icon size={compact ? 16 : 21} />
        </div>
        <h2 className={`font-bold text-[#0F172A] ${compact ? "mt-3 text-sm" : "mt-4 text-base"}`}>{resolvedTitle}</h2>
        <p className={`leading-relaxed text-slate-500 ${compact ? "mt-1 text-xs" : "mt-2 text-sm"}`}>{resolvedMessage}</p>
        {!compact && (
          <p className="mt-2 text-xs text-slate-400">
            Your saved records are safe.
          </p>
        )}
        {variant !== "forbidden" && onRetry && <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className={`${compact ? "mt-3" : "mt-5"} inline-flex items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <RefreshCcw size={15} className={retrying ? "animate-spin" : ""} />
          {retrying ? "Retrying..." : "Retry"}
        </button>}
      </div>
    </div>
  );
}
