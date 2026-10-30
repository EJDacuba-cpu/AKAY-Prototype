import {
  BACKGROUND_SECTION_LABELS,
  backgroundChangeRows,
  sliceBackground,
} from "../../../../utils/backgroundUpdate";
import { EDITABLE_SECTION_KEYS, reviewGroups } from "../../../../utils/patientHistory";

function GroupTitle({ children, count }) {
  return (
    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
      {children} <span className="font-normal">({count})</span>
    </h4>
  );
}

/**
 * The Patient History block on Review: what this visit updated (each changed
 * field before -> after), what was reviewed with no changes, and what was not
 * reviewed. Informational only - nothing here blocks saving.
 * `visibleSections` leaves out a section the patient does not have (V for a
 * non-female patient).
 */
export default function PatientHistoryReview({
  background,
  update,
  visibleSections = EDITABLE_SECTION_KEYS,
  omitFields = [],
}) {
  const groups = reviewGroups({ update, sections: visibleSections });

  return (
    <div className="space-y-3">
      {groups.updated.length > 0 && (
        <div>
          <GroupTitle count={groups.updated.length}>Updated</GroupTitle>
          <ul className="mt-1 space-y-2">
            {groups.updated.map((section) => {
              const rows = backgroundChangeRows(
                sliceBackground(background, section),
                update.sections[section],
                section,
              ).filter((row) => !omitFields.includes(row.key));
              return (
                <li key={section} className="border border-gray-200">
                  <p className="border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-[12.5px] font-semibold text-gray-900">
                    {BACKGROUND_SECTION_LABELS[section]}
                  </p>
                  {rows.length ? (
                    <dl className="divide-y divide-gray-100">
                      {rows.map((row) => (
                        <div key={row.key} className="grid gap-1 px-3 py-1.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3">
                          <dt className="text-xs font-medium text-gray-500">{row.label}</dt>
                          <dd className="m-0 min-w-0 break-words text-[13px] text-gray-900">
                            <span className="text-gray-500">{row.before || "Not recorded"}</span>
                            <span aria-hidden="true" className="px-1.5 text-gray-400">
                              &rarr;
                            </span>
                            <span className="sr-only"> changed to </span>
                            <span className="font-medium">{row.after || "Not recorded"}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="px-3 py-1.5 text-[12.5px] text-gray-500">No field differs from the saved history.</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {groups.reviewed.length > 0 && (
        <div>
          <GroupTitle count={groups.reviewed.length}>Reviewed, no changes</GroupTitle>
          <p className="mt-1 text-[13px] text-gray-900">
            {groups.reviewed.map((section) => BACKGROUND_SECTION_LABELS[section]).join(" · ")}
          </p>
        </div>
      )}

      {groups.notReviewed.length > 0 && (
        <div>
          <GroupTitle count={groups.notReviewed.length}>Not reviewed</GroupTitle>
          <p className="mt-1 text-[13px] text-gray-500">
            {groups.notReviewed.map((section) => BACKGROUND_SECTION_LABELS[section]).join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}
