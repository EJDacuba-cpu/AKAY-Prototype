import { RefreshCcw, WifiOff } from "lucide-react";

export default function ConnectionErrorState({
  title = "Connection Lost",
  message = "We couldn't load this page because the connection was interrupted. Please check your internet connection and try again.",
  onRetry,
  retrying = false,
  variant = "offline",
  fullPage = false,
}) {
  const isTimeout = variant === "timeout";
  const wrapperClass = fullPage
    ? "flex min-h-[calc(100dvh-9rem)] items-center justify-center rounded-xl bg-white px-4 py-12"
    : "flex min-h-[420px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-12 shadow-sm";

  return (
    <div className={wrapperClass}>
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-red-100 bg-red-50 text-[#B91C1C]">
          {isTimeout ? <RefreshCcw size={21} /> : <WifiOff size={21} />}
        </div>
        <h2 className="mt-4 text-base font-bold text-[#0F172A]">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{message}</p>
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
