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
  onCancel,
  onViewRecord,
  dense = false,
}) {
  const config = getStateConfig(task.effectiveState);
  const timeLabel = formatTimeLabel(task.dueTime);
  const stateLabel = formatStateLabel(task.effectiveState);
  // Untimed tasks show their status in the time slot; timed ones show both,
  // except in dense cells where the card colour already carries the status.
  const headline = !timeLabel
    ? stateLabel
    : dense
      ? timeLabel
      : `${timeLabel} · ${stateLabel}`;
  const patientName = formatDisplayValue(task.patientName, "Unnamed Patient");
  const actions = buildTaskActions(task, {
    onRecordVisit: () => onRecordVisit?.(task),
    onReschedule: () => onReschedule?.(task),
    onCancel: onCancel ? () => onCancel(task) : undefined,
    onViewRecord: onViewRecord ? () => onViewRecord(task) : undefined,
  });

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onClick?.(task)}
        title={`${patientName} · ${getTaskServiceTypeLabel(task)}`}
        className={`w-full rounded-md border-l-4 px-2 py-1.5 pr-7 text-left transition-colors hover:brightness-[0.98] ${config.event}`}
      >
        <span className="block truncate text-[9.5px] font-bold uppercase tracking-wide opacity-80">
          {headline}
        </span>
        <span className={`block truncate font-semibold text-[#0F172A] ${dense ? "text-[11px]" : "text-[12.5px]"}`}>
          {patientName}
        </span>
        {!dense && (
          <span className="block truncate text-[10.5px] opacity-80">
            {getTaskServiceTypeLabel(task)}
          </span>
        )}
      </button>

      <div className="absolute right-0.5 top-0.5 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <ActionMenu
          title={patientName}
          subtitle={task.healthRecordId ? `#${task.healthRecordId}` : ""}
          actions={actions}
          triggerVariant="calendar"
        />
      </div>
    </div>
  );
}
