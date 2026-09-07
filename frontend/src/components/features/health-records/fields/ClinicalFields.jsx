/**
 * Form primitives shared by the health-record sections that both the BHC and
 * RHU record pages render.
 *
 * Both pages still define their own private copies of these for the fields that
 * remain inline in each page. These are the extracted versions, lifted verbatim
 * from the BHC page so that a section moved out of either page keeps rendering
 * identically. Import these from shared sections only - do not re-point the
 * pages' remaining inline fields at them as a drive-by change.
 */

const ERROR_RING =
  "border-[#B91C1C] bg-white ring-2 ring-[#B91C1C]/10";
const IDLE_RING =
  "border-[#E5E7EB] bg-white focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10";

function fieldRing(error) {
  return error ? ERROR_RING : IDLE_RING;
}

export function FieldLabel({ label, required }) {
  return (
    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
  );
}

export function FieldError({ error }) {
  if (!error) return null;
  return <p className="mt-1 text-[11px] font-medium text-[#B91C1C]">{error}</p>;
}

export function FieldInput({
  label,
  required,
  error,
  className = "",
  wrapperClassName = "",
  ...props
}) {
  return (
    <div className={wrapperClassName}>
      <FieldLabel label={label} required={required} />
      <input
        {...props}
        aria-invalid={Boolean(error)}
        className={`h-10 w-full rounded-lg border px-3.5 text-sm text-[#1F2937] outline-none transition-all duration-200 placeholder:text-[#9CA3AF] disabled:cursor-not-allowed disabled:opacity-60 ${fieldRing(error)} ${className}`}
      />
      <FieldError error={error} />
    </div>
  );
}

export function FieldTextarea({
  label,
  required,
  error,
  rows = 3,
  className = "",
  wrapperClassName = "",
  ...props
}) {
  return (
    <div className={wrapperClassName}>
      <FieldLabel label={label} required={required} />
      <textarea
        {...props}
        aria-invalid={Boolean(error)}
        rows={rows}
        className={`w-full resize-none rounded-lg border px-3.5 py-3 text-sm leading-relaxed text-[#1F2937] outline-none transition-all duration-200 placeholder:text-[#9CA3AF] ${fieldRing(error)} ${className}`}
      />
      <FieldError error={error} />
    </div>
  );
}

/**
 * A titled block inside a record form card.
 *
 * Mirrors the page-local FormSection: a dark bold heading, a grey explanatory
 * line, and a hairline rule separating it from the block above. Sections
 * rendered by shared components use this so they sit in the same visual system
 * as the ones the pages still render inline.
 */
export function ClinicalSection({ title, subtitle, children }) {
  return (
    <section className="border-t border-[#F1F5F9] pt-5">
      <h3 className="text-sm font-bold text-[#1A1A1A]">{title}</h3>
      {subtitle && (
        <p className="mt-0.5 text-xs leading-relaxed text-[#6B7280]">
          {subtitle}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * The small red uppercase label that names a group of controls inside a
 * section - "Newborn Services", "Vaccines Given This Visit", "Months".
 */
export function FieldEyebrow({ children }) {
  return (
    <p className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#B91C1C]">
      {children}
    </p>
  );
}

/**
 * A single-choice radio group.
 *
 * `options` accepts plain strings or `{ value, label }` objects, because some
 * option lists are reference data stored verbatim (FP_SOURCE_OPTIONS) while
 * others carry a short code separate from their label.
 */
export function RadioChoiceGroup({
  label,
  name,
  value,
  options = [],
  onChange,
  helperText,
  error,
  required = false,
  inline = false,
}) {
  const choices = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );

  return (
    <div data-field={name} tabIndex={error ? -1 : undefined}>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
        {required && <span className="ml-1 text-[#B91C1C]">*</span>}
      </p>
      <div className={inline ? "flex flex-wrap items-center gap-x-6 gap-y-2" : "grid gap-2"}>
        {choices.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#475569]"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="h-4 w-4 accent-[#B91C1C]"
            />
            <span
              className={
                value === option.value
                  ? "font-semibold text-[#B91C1C]"
                  : "text-[#475569]"
              }
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
      {helperText && (
        <p className="mt-2 text-xs leading-relaxed text-[#64748B]">
          {helperText}
        </p>
      )}
      {error && (
        <p className="mt-2 text-[11px] font-medium text-[#B91C1C]">{error}</p>
      )}
    </div>
  );
}

export function ClinicalFieldGroup({ title, subtitle, children, accent }) {
  const titleClass = accent === "pink" ? "text-pink-700" : "text-[#B91C1C]";

  return (
    <div className="border-t border-[#E8ECF0] pt-4">
      <p
        className={`text-[10px] font-bold uppercase tracking-widest ${titleClass} ${
          subtitle ? "mb-1" : "mb-3"
        }`}
      >
        {title}
      </p>
      {subtitle && (
        <p className="mb-3 text-xs leading-relaxed text-[#64748B]">{subtitle}</p>
      )}
      {children}
    </div>
  );
}

/**
 * The checkbox used by every clinical multi-select. `locked` renders a checked,
 * disabled row with an explanatory sub-line - the EPI history case, where an
 * item was already given at an earlier visit and must not be re-recorded.
 */
export function ClinicalCheckbox({
  label,
  checked,
  onChange,
  locked = false,
  lockedNote = "",
  disabled = false,
}) {
  return (
    <label
      className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm font-medium ${
        locked || disabled
          ? "cursor-not-allowed bg-slate-50 text-[#94A3B8]"
          : "cursor-pointer text-[#475569]"
      }`}
    >
      <input
        type="checkbox"
        checked={locked || checked}
        disabled={locked || disabled}
        onChange={(event) => onChange?.(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-[#D1D5DB] accent-[#B91C1C] disabled:cursor-not-allowed"
      />
      <span>
        <span>{label}</span>
        {locked && lockedNote && (
          <span className="block text-[11px] font-medium text-[#64748B]">
            {lockedNote}
          </span>
        )}
      </span>
    </label>
  );
}
