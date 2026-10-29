import { BACKGROUND_SECTION_FIELDS } from "../../../../utils/backgroundUpdate";

/**
 * The same history wording is used during review and in the prenatal form.
 * `omitFields` (optional) leaves out fields by key, e.g. BHC_HIDDEN_SOCIAL_FIELDS
 * (Education / Past Occupations) on BHC surfaces; by default every field shows.
 * `leading` prepends extra rows (`{ key, label, text }`) — used for visit
 * answers that sit with a section, such as Similar illness in Family History.
 */
export default function HistorySectionSummary({
  section,
  value,
  omitFields = [],
  leading = [],
  print = false,
}) {
  const rows = [
    ...leading.map((row) => ({
      key: row.key,
      label: row.label,
      text: String(row.text || "").trim(),
    })),
    ...BACKGROUND_SECTION_FIELDS[section]
      .filter((field) => !omitFields.includes(field.key))
      .map((field) => ({
        key: field.key,
        label: field.label,
        text: String(field.read(value) || "").trim(),
      })),
  ];
  return (
    <dl className={print ? undefined : "divide-y divide-neutral-100"}>
      {rows.map((row) => (
        <div
          key={row.key}
          className={
            print
              ? "bhc-print-narrative"
              : "grid gap-1 py-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3"
          }
        >
          <dt className={print ? "bhc-print-k" : "text-xs font-medium text-neutral-500"}>
            {row.label}
          </dt>
          <dd
            className={
              print
                ? `bhc-print-prose${row.text ? "" : " bhc-print-muted"}`
                : `m-0 min-w-0 break-words text-[13px] ${row.text ? "text-neutral-900" : "text-neutral-500"}`
            }
          >
            {row.text || "Not recorded"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
