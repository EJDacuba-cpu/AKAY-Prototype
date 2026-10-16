import { BACKGROUND_SECTION_FIELDS } from "../../../../utils/backgroundUpdate";

/** The same history wording is used during review and in the prenatal form. */
export default function HistorySectionSummary({ section, value }) {
  return (
    <dl className="divide-y divide-neutral-100">
      {BACKGROUND_SECTION_FIELDS[section].map((field) => {
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
