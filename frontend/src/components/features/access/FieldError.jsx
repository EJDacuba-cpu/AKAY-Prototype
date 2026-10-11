import { Children, cloneElement, useId } from "react";

/**
 * Label + field + a reserved one-line slot for the error, so showing a message never moves the layout.
 * Wrap a single `Input`: the red border and the aria wiring are applied to it.
 */
export default function Field({ label, error, children, className = "" }) {
  const errorId = useId();
  const child = Children.only(children);
  return (
    <div className={className}>
      <label className="block text-sm">
        {label}
        <div className={`mt-1 ${error ? "[&_input]:border-red-500 [&_input]:focus:ring-red-500/20" : ""}`}>
          {cloneElement(child, { "aria-invalid": error ? true : undefined, "aria-describedby": error ? errorId : undefined })}
        </div>
      </label>
      <FieldMessage id={errorId}>{error}</FieldMessage>
    </div>
  );
}

/** The reserved error line, usable on its own under card groups. */
export function FieldMessage({ id, children }) {
  return <p id={id} role={children ? "alert" : undefined} className="mt-1 min-h-4 text-xs leading-4 text-red-600">{children}</p>;
}
