import HistorySectionSummary from "../patients/history/HistorySectionSummary";
import { BACKGROUND_SECTION_LABELS } from "../../../utils/backgroundUpdate";
import { BHC_HIDDEN_SOCIAL_FIELDS } from "../../../utils/backgroundEditing";
import {
  visitHistoryChangeRows,
  visitHistorySectionKeys,
  visitHistorySnapshot,
} from "../../../utils/visitHistorySnapshot";
import { informantPayload, similarIllnessPayload } from "../../../utils/historyStep";

function VisitAnswer({ label, value }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-xs font-medium text-neutral-500">{label}</dt>
      <dd className={`m-0 min-w-0 break-words text-[13px] ${value ? "text-neutral-900" : "text-neutral-500"}`}>
        {value || "Not recorded"}
      </dd>
    </div>
  );
}

/**
 * Read-only Patient History as documented on this visit, plus Previous → New
 * for sections that actually changed. Missing snapshot (legacy records) is
 * stated as unavailable — never today's live background.
 */
export default function VisitHistorySnapshot({ record }) {
  const snapshot = visitHistorySnapshot(record);
  const informant = informantPayload(record?.informant);
  const similar = similarIllnessPayload(record?.similarIllness || record?.similar_illness);
  const informantLine = informant ? [informant.relation, informant.name].filter(Boolean).join(" · ") : "";
  const similarLine = similar ? [similar.answer, similar.who, similar.note].filter(Boolean).join(" · ") : "";

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5" aria-label="Patient History for this visit">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Patient History</h2>
        <p className="mt-0.5 text-[12px] text-slate-500">As documented on this visit</p>
      </div>
      <dl className="divide-y divide-neutral-100 border-b border-neutral-100">
        <VisitAnswer label="Informant" value={informantLine} />
        <VisitAnswer label="Similar illness in the family" value={similarLine} />
      </dl>
      {!snapshot ? (
        <p role="status" className="text-[13px] text-slate-500">
          Historical patient history is unavailable for this record.
        </p>
      ) : (
        <>
          {visitHistorySectionKeys(snapshot).map((section) => (
            <div key={section}>
              <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                {BACKGROUND_SECTION_LABELS[section]}
              </h3>
              <HistorySectionSummary
                section={section}
                value={snapshot.sections[section]}
                omitFields={BHC_HIDDEN_SOCIAL_FIELDS}
              />
            </div>
          ))}
          <VisitHistoryChanges changes={snapshot.changes} />
        </>
      )}
    </section>
  );
}

function VisitHistoryChanges({ changes }) {
  const groups = (Array.isArray(changes) ? changes : [])
    .map((change) => ({ change, rows: visitHistoryChangeRows(change) }))
    .filter((group) => group.rows.length > 0);
  if (!groups.length) {
    return <p className="text-[13px] text-slate-500">No history fields were changed on this visit.</p>;
  }
  return (
    <div>
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500">Changes this visit</h3>
      <ul className="space-y-2">
        {groups.map(({ change, rows }) => (
          <li key={change.section} className="border border-slate-200">
            <p className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[12.5px] font-semibold text-slate-900">
              {BACKGROUND_SECTION_LABELS[change.section]}
            </p>
            <dl className="divide-y divide-slate-100">
              {rows.map((row) => (
                <div key={row.key} className="grid gap-1 px-3 py-1.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3">
                  <dt className="text-xs font-medium text-slate-500">{row.label}</dt>
                  <dd className="m-0 min-w-0 break-words text-[13px] text-slate-900">
                    <span className="text-slate-500">{row.before || "Not recorded"}</span>
                    <span aria-hidden="true" className="px-1.5 text-slate-400">
                      →
                    </span>
                    <span className="sr-only"> changed to </span>
                    <span className="font-medium">{row.after || "Not recorded"}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
