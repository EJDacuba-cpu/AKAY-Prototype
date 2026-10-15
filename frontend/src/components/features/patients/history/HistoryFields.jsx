import { useState } from "react";

/**
 * Small controls shared by the history sections. Controlled and stateless;
 * every input has a visible label and every button is type="button".
 */

const LABEL_CLASS = "block text-xs font-medium text-gray-500";
const CONTROL_CLASS =
  "mt-1 w-full rounded-none border border-gray-200 bg-white px-3 py-2 text-[12.5px] font-normal text-gray-900 outline-none transition focus:border-red-600";

export const SMALL_BUTTON_CLASS =
  "inline-flex items-center gap-1 rounded-none border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-600 transition hover:border-red-100 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-200 disabled:hover:bg-white disabled:hover:text-gray-600";

/** An integer, or null for blank / non-numeric input. Numbers are staged as integers only. */
export function parseInteger(raw) {
  if (raw === "" || raw === null || raw === undefined) return null;
  const number = Math.trunc(Number(raw));
  return Number.isFinite(number) ? number : null;
}

/** Plain strings and { value, label } entries both become { value, label }. */
export function normalizeOptions(options = []) {
  return options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );
}

function Label({ label, required }) {
  return (
    <>
      {label}
      {required && <span aria-hidden="true"> *</span>}
    </>
  );
}

export function TextField({ label, value, onChange, required = false, placeholder }) {
  return (
    <label className={LABEL_CLASS}>
      <Label label={label} required={required} />
      <input
        type="text"
        value={value ?? ""}
        placeholder={placeholder}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className={CONTROL_CLASS}
      />
    </label>
  );
}

export function NumberField({ label, value, onChange, min, max, required = false }) {
  return (
    <label className={LABEL_CLASS}>
      <Label label={label} required={required} />
      <input
        type="number"
        inputMode="numeric"
        step={1}
        min={min}
        max={max}
        value={value ?? ""}
        required={required}
        onChange={(event) => onChange(parseInteger(event.target.value))}
        className={CONTROL_CLASS}
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  emptyLabel = "Select",
  required = false,
}) {
  return (
    <label className={LABEL_CLASS}>
      <Label label={label} required={required} />
      <select
        value={value ?? ""}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className={CONTROL_CLASS}
      >
        <option value="">{emptyLabel}</option>
        {normalizeOptions(options).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CheckboxField({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-[12.5px] text-gray-800">
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(event) => onChange(event.target.checked)}
        className="size-3.5 rounded-none border-gray-300 accent-red-600"
      />
      {label}
    </label>
  );
}

/** A titled group inside a section. */
export function Block({ title, note, children }) {
  return (
    <div className="space-y-2">
      <div>
        <h4 className="text-[13px] font-semibold text-gray-900">{title}</h4>
        {note && <p className="text-[11px] text-gray-500">{note}</p>}
      </div>
      {children}
    </div>
  );
}

/** A group that starts collapsed (by age) and always offers a Show button. */
export function CollapsibleBlock({ title, collapsed, children }) {
  const [shown, setShown] = useState(false);
  if (collapsed && !shown) {
    return (
      <div className="flex items-center justify-between gap-3 border border-dashed border-gray-200 px-3 py-2">
        <span className="text-[13px] font-semibold text-gray-900">{title}</span>
        <button type="button" onClick={() => setShown(true)} className={SMALL_BUTTON_CLASS}>
          Show
        </button>
      </div>
    );
  }
  return children;
}

export function FieldGrid({ children }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">{children}</div>
  );
}
