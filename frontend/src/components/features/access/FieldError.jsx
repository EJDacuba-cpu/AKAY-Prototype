import { Children, cloneElement, useId } from "react";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";

/**
 * Label + field + a reserved one-line slot for the error, so showing a message never moves the layout.
 * Wrap a single `Input`: the red border and the aria wiring are applied to it.
 * `state` ("valid" | "checking" | "invalid", see utils/fieldState) puts a status icon inside the input's right edge.
 */
export default function Field({ label, error, state, children, className = "" }) {
  const errorId = useId();
  const child = Children.only(children);
  return (
    <div className={className}>
      <label className="block text-sm">
        {label}
        <div className={`relative mt-1 ${error ? "[&_input]:border-red-500 [&_input]:focus:ring-red-500/20" : ""} ${state ? "[&_input]:pr-9" : ""}`}>
          {cloneElement(child, { "aria-invalid": error ? true : undefined, "aria-describedby": error ? errorId : undefined })}
          {state && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"><StateIcon state={state} /></span>}
        </div>
      </label>
      <FieldMessage id={errorId}>{error}</FieldMessage>
    </div>
  );
}

function StateIcon({ state }) {
  if (state === "valid") return <CircleCheck size={16} aria-hidden="true" className="akay-check-in text-emerald-600" />;
  if (state === "checking") return <><LoaderCircle size={16} aria-hidden="true" className="animate-spin text-slate-400 motion-reduce:animate-none" /><span className="sr-only">Checking…</span></>;
  return <CircleAlert size={16} aria-hidden="true" className="text-red-600" />;
}

/** The reserved error line, usable on its own under card groups. */
export function FieldMessage({ id, children }) {
  return <p id={id} role={children ? "alert" : undefined} className="mt-1 min-h-4 text-xs leading-4 text-red-600">{children}</p>;
}
