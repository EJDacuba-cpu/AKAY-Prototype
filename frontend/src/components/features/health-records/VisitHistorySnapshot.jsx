import HistorySectionSummary from "../patients/history/HistorySectionSummary";
import { BACKGROUND_SECTION_LABELS } from "../../../utils/backgroundUpdate";
import { BHC_HIDDEN_SOCIAL_FIELDS } from "../../../utils/backgroundEditing";
import {
  visitHistoryInformantLine,
  visitHistorySectionKeys,
  visitHistorySimilarIllnessLine,
  visitHistorySnapshot,
} from "../../../utils/visitHistorySnapshot";

function VisitAnswer({ label, value, print = false }) {
  return (
    <div
      className={
        print
          ? "bhc-print-narrative"
          : "grid gap-1 py-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3"
      }
    >
      <dt className={print ? "bhc-print-k" : "text-xs font-medium text-neutral-500"}>{label}</dt>
      <dd
        className={
          print
            ? `bhc-print-prose${value ? "" : " bhc-print-muted"}`
            : `m-0 min-w-0 break-words text-[13px] ${value ? "text-neutral-900" : "text-neutral-500"}`
        }
      >
        {value || "Not recorded"}
      </dd>
    </div>
  );
}

/**
 * Read-only Patient History as documented on this visit. Missing snapshot
 * (legacy records) is stated as unavailable — never today's live background.
 */
export default function VisitHistorySnapshot({ record, print = false }) {
  const snapshot = visitHistorySnapshot(record);
  const informantLine = visitHistoryInformantLine(record);
  const similarLine = visitHistorySimilarIllnessLine(record);

  return (
    <section
      className={
        print
          ? "bhc-print-section"
          : "space-y-4 rounded-xl border border-slate-200 bg-white p-5"
      }
      aria-label="Patient History at This Visit"
    >
      <div>
        <h2 className={print ? undefined : "text-sm font-semibold text-slate-900"}>
          Patient History at This Visit
        </h2>
      </div>
      <dl className={print ? undefined : "divide-y divide-neutral-100 border-b border-neutral-100"}>
        <VisitAnswer label="Informant" value={informantLine} print={print} />
        {!snapshot && (
          <VisitAnswer label="Similar illness in the family" value={similarLine} print={print} />
        )}
      </dl>
      {!snapshot ? (
        <p role="status" className={print ? "bhc-print-muted" : "text-[13px] text-slate-500"}>
          Historical patient history is unavailable for this record.
        </p>
      ) : (
        visitHistorySectionKeys(snapshot).map((section) => (
          <div key={section}>
            <h3
              className={
                print
                  ? "bhc-print-subh"
                  : "mb-1 text-[12px] font-semibold uppercase tracking-wide text-slate-500"
              }
            >
              {BACKGROUND_SECTION_LABELS[section]}
            </h3>
            <HistorySectionSummary
              section={section}
              value={snapshot.sections[section]}
              omitFields={BHC_HIDDEN_SOCIAL_FIELDS}
              print={print}
              leading={
                section === "family"
                  ? [
                      {
                        key: "similarIllness",
                        label: "Similar illness in the family",
                        text: similarLine,
                      },
                    ]
                  : []
              }
            />
          </div>
        ))
      )}
    </section>
  );
}
