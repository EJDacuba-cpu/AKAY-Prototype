import { AlertCircle, Check, Loader2, PencilLine } from "lucide-react";
import { Button } from "../../ui/button";

const labels = {
  checking: "Checking for unfinished work…",
  pending: "Unsaved changes",
  saving: "Saving draft…",
  saved: "Draft saved",
  offline: "Connection lost",
  unavailable: "Unable to save",
  error: "Unable to save",
  conflict: "Draft needs review",
};

const date = (value) => (value && Number.isFinite(new Date(value).getTime()) ? new Date(value) : null);

function StatusIcon({ status }) {
  const className = "size-3.5 shrink-0";
  if (status === "saving" || status === "checking") {
    return <Loader2 className={`${className} animate-spin text-ink-400`} aria-hidden="true" />;
  }
  if (status === "saved") {
    return <Check className={`${className} text-success-700`} aria-hidden="true" strokeWidth={2.5} />;
  }
  if (status === "pending") {
    return <PencilLine className={`${className} text-ink-400`} aria-hidden="true" />;
  }
  if (status === "error" || status === "unavailable" || status === "conflict" || status === "offline") {
    return <AlertCircle className={`${className} text-alert-600`} aria-hidden="true" />;
  }
  return null;
}

export default function FormDraftStatus({
  status = "idle",
  lastSavedAt = "",
  error = "",
  onRetry,
  className = "",
}) {
  if (status === "idle") return null;
  const server = date(lastSavedAt);
  const label = labels[status] || labels.error;
  const problem = typeof error === "string" ? error : error?.message || "";
  const canRetry = onRetry && ["error", "unavailable", "offline", "conflict"].includes(status);
  const tone =
    status === "saved" ? "text-success-700"
      : status === "error" || status === "unavailable" || status === "conflict" ? "text-alert-700"
        : "text-ink-500";

  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs ${tone} ${className}`}>
      <span role="status" aria-live="polite" aria-atomic="true" className="inline-flex min-w-0 items-center gap-1.5 font-medium">
        <StatusIcon status={status} />
        <span className="min-w-0">{label}</span>
      </span>
      {server && status !== "pending" && status !== "saving" && (
        <span className="text-ink-400">
          Saved <time dateTime={lastSavedAt}>{server.toLocaleTimeString("en-PH")}</time>
        </span>
      )}
      {problem && <span role="alert" className="text-alert-700">{problem}</span>}
      {canRetry && (
        <Button type="button" variant="link" size="compact" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
