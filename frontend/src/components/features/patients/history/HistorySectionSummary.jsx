import { BACKGROUND_SECTION_FIELDS } from "../../../../utils/backgroundUpdate";

/**
 * The same history wording is used during review and in the prenatal form.
 * `omitFields` (optional) leaves out fields by key, e.g. BHC_HIDDEN_SOCIAL_FIELDS
 * (Education / Past Occupations) on BHC surfaces; by default every field shows.
 */
export default function HistorySectionSummary({ section, value, omitFields = [] }) {
  return (
    <dl className="divide-y divide-neutral-100">
      {BACKGROUND_SECTION_FIELDS[section]
        .filter((field) => !omitFields.includes(field.key))
        .map((field) => {
          const text = String(field.read(value) || "").trim();
          return (
            <div key={field.key} className="grid gap-1 py-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3">
              <dt className="text-xs font-medium text-neutral-500">{field.label}</dt>
              <dd className={`m-0 min-w-0 break-words text-[13px] ${text ? "text-neutral-900" : "text-neutral-500"}`}>
                {text || "Not recorded"}
              </dd>
            </div>
          );
        })}
    </dl>
  );
}
