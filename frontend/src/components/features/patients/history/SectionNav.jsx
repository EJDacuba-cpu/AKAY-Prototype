import { formatShortDate } from "../../../../utils/patientProfile";

/** How a sectionStatus() result reads in the list. */
export function statusText(status) {
  switch (status?.kind) {
    case "auto":
      return "From registration";
    case "updatedToday":
      return "Updated today";
    case "reviewedToday":
      return "Reviewed today";
    case "lastReviewed": {
      const date = status.date ? ` ${formatShortDate(status.date)}` : "";
      const facility = status.facility ? ` · ${status.facility}` : "";
      return `Last reviewed${date}${facility}`;
    }
    case "recorded": {
      const date = status.date ? formatShortDate(status.date) : "";
      return date ? `Recorded ${date} (not yet reviewed)` : "Recorded (not yet reviewed)";
    }
    default:
      return "Not recorded";
  }
}

const TODAY_KINDS = ["updatedToday", "reviewedToday"];

/**
 * The section list (I-V) with each section's status. Controlled: `active` is
 * the open section key and `onSelect(key)` asks to open another. Sections with
 * `visible === false` are left out.
 */
export default function SectionNav({ sections, active, onSelect }) {
  return (
    <nav aria-label="History sections">
      <ul className="divide-y divide-gray-100 border border-gray-200 bg-white">
        {sections
          .filter((section) => section.visible !== false)
          .map((section) => {
            const isActive = section.key === active;
            const doneToday = TODAY_KINDS.includes(section.status?.kind);
            return (
              <li key={section.key}>
                <button
                  type="button"
                  onClick={() => onSelect(section.key)}
                  aria-current={isActive ? "true" : undefined}
                  className={`block w-full border-l-2 px-3 py-2.5 text-left transition ${
                    isActive
                      ? "border-red-600 bg-gray-50"
                      : "border-transparent hover:bg-gray-50"
                  }`}
                >
                  <span className="block text-[13px] font-semibold text-gray-900">
                    {section.label}
                  </span>
                  <span
                    className={`mt-0.5 block text-[11px] ${
                      doneToday ? "font-medium text-gray-800" : "text-gray-500"
                    }`}
                  >
                    {statusText(section.status)}
                  </span>
                </button>
              </li>
            );
          })}
      </ul>
    </nav>
  );
}
