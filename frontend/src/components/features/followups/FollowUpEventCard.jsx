import ActionMenu from "../../common/tables/ActionMenu";
import { formatDisplayValue } from "../../../utils/formatters";
import {
  buildTaskActions,
  formatStateLabel,
  formatTimeLabel,
  getStateConfig,
  getTaskServiceTypeLabel,
} from "./followUpStatusStyles.jsx";

export default function FollowUpEventCard({
  task,
  onClick,
  onRecordVisit,
  onReschedule,
  dense = false,
}) {
  const config = getStateConfig(task.effectiveState);
  const timeLabel =
    formatTimeLabel(task.dueTime) || formatStateLabel(task.effectiveState);
  const patientName = formatDisplayValue(task.patientName, "Unnamed Patient");
  const actions = buildTaskActions(task, {
    onRecordVisit: () => onRecordVisit?.(task),
    onReschedule: () => onReschedule?.(task),
  });

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onClick?.(task)}
        className={`w-full rounded-md border-l-4 px-2 py-1.5 pr-7 text-left shadow-sm transition-transform hover:-translate-y-px hover:shadow ${config.event}`}
      >
        <span className="block text-[9.5px] font-bold uppercase tracking-wide opacity-80">
          {timeLabel}
        </span>
        <span className={`block truncate font-semibold text-[#0F172A] ${dense ? "text-[11px]" : "text-[12.5px]"}`}>
          {patientName}
        </span>
        {!dense && (
          <span className="block truncate text-[10.5px] opacity-80">
            {task.reason || getTaskServiceTypeLabel(task)}
          </span>
        )}
      </button>

      <div className="absolute right-0.5 top-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <ActionMenu
          title={patientName}
          subtitle={`#${task.healthRecordId}`}
          actions={actions}
        />
      </div>
    </div>
  );
}
