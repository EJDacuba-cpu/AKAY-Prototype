import RestrictedArea from "../../../common/access/RestrictedArea";
import LockedPlaceholder from "../../../common/access/LockedPlaceholder";
import { Button } from "../../../ui/button";
import { overlayBackgroundUpdate } from "../../../../utils/backgroundUpdate";
import { hasRecordedData } from "../../../../utils/patientHistory";
import HistorySectionSummary from "./HistorySectionSummary";

/** A view of the shared history, including edits staged in this consultation. */
export default function PrenatalHistorySummary({ background, update, locked = false, canReview = true, editLink, onReview }) {
  if (locked) {
    return (
      <RestrictedArea
        locked
        label="Obstetric & Menstrual History"
        placeholder={<LockedPlaceholder lines={3} />}
      />
    );
  }

  const current = overlayBackgroundUpdate(background, update);
  const pending = Boolean(update?.sections?.obstetric);

  return (
    <section aria-label="Shared obstetric and menstrual history" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-neutral-900">Obstetric & Menstrual History</h3>
          <p className="mt-1 text-xs text-neutral-600">
            {pending
              ? "Includes changes from this visit. They save when the consultation is finalized."
              : "From Patient History. The patient profile uses this same history."}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" disabled={!canReview} onClick={onReview}>
          Review / Update History
        </Button>
      </div>
      {!canReview && (
        <p className="text-sm text-neutral-600">
          Verify patient sex in Patient Information before updating obstetric history.
          {editLink && (
            <a href={editLink} target="_blank" rel="noopener noreferrer" className="ml-1 font-medium text-[var(--color-primary)] underline underline-offset-4">
              Open Patient Information (new tab)
            </a>
          )}
        </p>
      )}
      {hasRecordedData(current, "obstetric") ? (
        <HistorySectionSummary section="obstetric" value={current} />
      ) : (
        <p className="text-sm text-neutral-600">
          No obstetric or menstrual history recorded yet.{canReview && " Use Review / Update History to record it once."}
        </p>
      )}
    </section>
  );
}
