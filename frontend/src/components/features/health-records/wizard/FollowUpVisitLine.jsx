import { formatDate } from "../../../../utils/formatters";

/**
 * One compact line per follow-up task this visit will complete. Opening the
 * workspace completes nothing: saving the visit fulfils them, and "Remove
 * link" is how the worker unlinks one before that. A legacy condition on those
 * follow-ups is named and left out of monitoring until the RHU verifies it.
 */
export default function FollowUpVisitLine({ followUps = [], legacyConditionNames = [], onRemove, disabled = false }) {
  if (followUps.length === 0) return null;
  return (
    <ul aria-label="Follow-up visit" className="mb-4 divide-y divide-[#E5E7EB] border-y border-[#E5E7EB]">
      {followUps.map((task) => {
        const due = formatDate(task.dueDate, "");
        const from = formatDate(task.sourceDate, "");
        return (
          <li key={task.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-[13px] text-[#374151]">
            <p className="min-w-0 break-words">
              <span className="font-semibold text-[#111827]">Follow-up visit</span>
              {" · "}FU-{task.id}
              {" · "}{task.reason || "No reason recorded"}
              {due && ` · due ${due}`}
              {from && ` · from ${from} visit`}
            </p>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemove?.(task.id)}
              aria-label={`Remove link to follow-up FU-${task.id}`}
              className="text-[13px] font-semibold text-[#DC2626] underline underline-offset-2 hover:text-[#B91C1C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] disabled:cursor-not-allowed disabled:text-gray-400"
            >
              Remove link
            </button>
          </li>
        );
      })}
      {legacyConditionNames.map((name) => (
        <li key={`legacy-${name}`} className="py-2 text-[13px] text-[#92400E]">
          {name} (Legacy — Pending RHU Verification) is not continued as monitoring.
        </li>
      ))}
    </ul>
  );
}
