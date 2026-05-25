export default function FormGroup({
  label,
  error,
  required = false,
  children,
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label
          className="
            block

            text-[11px]
            font-semibold
            uppercase
            tracking-wide

            text-[#6B7280]
          "
        >
          {label}

          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
      )}

      {children}

      {error && (
        <p
          className="
            text-[11px]
            text-red-500
          "
        >
          {error}
        </p>
      )}
    </div>
  );
}
