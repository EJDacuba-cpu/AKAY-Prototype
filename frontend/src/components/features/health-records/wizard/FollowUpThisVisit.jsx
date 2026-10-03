import { formatDate } from "../../../../utils/formatters";
import { followUpSummaryRows } from "../../../../utils/followUpThisVisit";

/**
 * Read-only "Follow-up This Visit" summary near the top of the workspace: the
 * existing monitoring the worker chose in Start Consultation. It is context,
 * not a control - Patient Background keeps it as reference, Assessment is for
 * new diagnoses, and Care Plan & Next Steps records what happens to it today.
 * Renders nothing when none was chosen.
 */
export default function FollowUpThisVisit({ conditions = [] }) {
  const rows = followUpSummaryRows(conditions);
  if (rows.length === 0) return null;
  return (
    <section
      aria-label="Follow-up This Visit"
      className="mb-4 ml-0 mr-auto w-full max-w-5xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2"
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[#374151]">Follow-up This Visit</h2>
      <ul className="mt-1 space-y-0.5">
        {rows.map((row) => (
          <li key={row.id} className="text-[13px] text-[#111827]">
            <span className="font-semibold">{row.name}</span>
            <span className="text-[#4B5563]"> — Existing BHC monitoring</span>
            {row.startedAt && (
              <span className="text-[#4B5563]"> — Monitoring since {formatDate(row.startedAt, row.startedAt)}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
