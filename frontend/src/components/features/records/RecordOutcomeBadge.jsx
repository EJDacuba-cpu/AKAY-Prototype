import {
  getRecordOutcome,
  getRecordOutcomeStyle,
  getRecordOutcomeSubLabel,
} from "../../../utils/healthRecordPrograms";

/**
 * The resolved disposition of a visit (Referred / Follow-up / Routine), with
 * the Awaiting-Provider sub-label when a referral never reached the RHU.
 *
 * The value is always the server's - this renders what the API returned and
 * derives nothing. A record whose payload carries no outcome (an older cached
 * response, or rows a caller assembled by hand) shows a dash rather than a
 * guessed disposition.
 *
 * Shared by the Health Records table, the Patient Profile's record list and
 * the profile Overview so one badge cannot drift from the others.
 */
export default function RecordOutcomeBadge({ record, align = "start" }) {
  const outcome = getRecordOutcome(record);
  if (!outcome) return <span className="text-[#94A3B8]">-</span>;

  const subLabel = getRecordOutcomeSubLabel(record);

  return (
    <span
      className={`inline-flex flex-col ${align === "end" ? "items-end" : "items-start"}`}
    >
      <span
        className={`inline-flex rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${getRecordOutcomeStyle(outcome)}`}
      >
        {outcome}
      </span>
      {subLabel && (
        <span className="mt-1 text-[10px] font-semibold text-[#94A3B8]">
          {subLabel}
        </span>
      )}
    </span>
  );
}
