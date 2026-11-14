import HistorySectionSummary from "../patients/history/HistorySectionSummary";
import { BACKGROUND_SECTION_LABELS } from "../../../utils/backgroundUpdate";
import { BHC_HIDDEN_SOCIAL_FIELDS } from "../../../utils/backgroundEditing";
import { infantHiddenSocialKeys } from "../../../utils/infantVisibility";
import { getRecordDateValue } from "./recordDetailsHelpers";
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

function HistorySectionBlock({ section, snapshot, similarLine, hiddenSocialKeys, print = false }) {
  return (
    <div>
      <h3
        className={
          print
            ? "bhc-print-subh"
            : "mb-1 text-[12px] font-semibold uppercase tracking-wide text-neutral-500"
        }
      >
        {BACKGROUND_SECTION_LABELS[section]}
      </h3>
      <HistorySectionSummary
        section={section}
        value={snapshot.sections[section]}
        omitFields={hiddenSocialKeys}
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
  );
}

/**
 * Read-only Patient History as documented on this visit. Missing snapshot
 * (legacy records) is stated as unavailable — never today's live background.
 */
export default function VisitHistorySnapshot({ record, patient, print = false }) {
  const snapshot = visitHistorySnapshot(record);
  const hiddenSocialKeys = [
    ...BHC_HIDDEN_SOCIAL_FIELDS,
    ...infantHiddenSocialKeys(patient || record?.patient, getRecordDateValue(record), {
      includeBhcProfileFields: false,
    }),
  ];
  const informantLine = visitHistoryInformantLine(record);
  const similarLine = visitHistorySimilarIllnessLine(record);
  const sectionKeys = snapshot ? visitHistorySectionKeys(snapshot) : [];

  const unavailable = (
    <p role="status" className={print ? "bhc-print-muted" : "text-[13px] text-neutral-500"}>
      Historical patient history is unavailable for this record.
    </p>
  );

  if (print) {
    return (
      <section className="bhc-print-section" aria-label="Patient History at This Visit">
        <div>
          <h2>Patient History at This Visit</h2>
        </div>
        <dl>
          <VisitAnswer label="Informant" value={informantLine} print />
          {!snapshot && (
            <VisitAnswer label="Similar illness in the family" value={similarLine} print />
          )}
        </dl>
        {!snapshot
          ? unavailable
          : sectionKeys.map((section) => (
              <HistorySectionBlock
                key={section}
                section={section}
                snapshot={snapshot}
                similarLine={similarLine}
                hiddenSocialKeys={hiddenSocialKeys}
                print
              />
            ))}
      </section>
    );
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-5 shadow-card"
      aria-label="Patient History at This Visit"
    >
      <div>
        <h2 className="text-sm font-semibold text-neutral-900">Patient History at This Visit</h2>
      </div>
      <dl className="m-0 divide-y divide-neutral-100 border-b border-neutral-200 pb-3">
        <div className="grid gap-2 py-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-baseline">
          <dt className="text-xs font-medium text-neutral-500">Informant</dt>
          <dd
            className={`m-0 min-w-0 break-words text-[13px] ${
              informantLine ? "text-neutral-900" : "text-neutral-500"
            }`}
          >
            {informantLine || "Not recorded"}
          </dd>
        </div>
        {!snapshot && (
          <div className="grid gap-2 pt-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-baseline">
            <dt className="text-xs font-medium text-neutral-500">
              Similar illness in the family
            </dt>
            <dd
              className={`m-0 min-w-0 break-words text-[13px] ${
                similarLine ? "text-neutral-900" : "text-neutral-500"
              }`}
            >
              {similarLine || "Not recorded"}
            </dd>
          </div>
        )}
      </dl>
      {!snapshot ? (
        unavailable
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 min-[900px]:grid-cols-2">
          {sectionKeys.map((section, index) => {
            const isLastOdd =
              index === sectionKeys.length - 1 && sectionKeys.length % 2 === 1;
            return (
              <div
                key={section}
                className={isLastOdd ? "min-[900px]:col-span-2" : undefined}
              >
                <HistorySectionBlock
                  section={section}
                  snapshot={snapshot}
                  similarLine={similarLine}
                  hiddenSocialKeys={hiddenSocialKeys}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
