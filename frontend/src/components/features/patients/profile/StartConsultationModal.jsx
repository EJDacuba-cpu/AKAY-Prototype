import { useId, useState } from "react";
import { Loader2 } from "lucide-react";

import ModalShell, { ModalButton } from "../../../common/modals/ModalShell";
import { formatDate } from "../../../../utils/formatters";
import { monitoredConditionOptions } from "../../../../utils/startConsultation";

function toggle(list, id) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function ConditionRow({ checked, disabled, onChange, option }) {
  const { conditionName, startedAt, followUp } = option;
  const lines = [
    startedAt && `Monitoring since ${formatDate(startedAt, startedAt)}`,
    followUp && `Follow-up due ${formatDate(followUp.dueDate, followUp.dueDate)}${followUp.isOverdue ? " · Overdue" : ""}`,
  ].filter(Boolean);
  return (
    <label className={`flex items-start gap-2.5 border-b border-[#E5E7EB] px-1 py-2.5 last:border-b-0 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 flex-none accent-[#DC2626]"
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-slate-900">{conditionName}</span>
        {lines.map((line) => (
          <span key={line} className="block text-xs text-slate-500">{line}</span>
        ))}
      </span>
    </label>
  );
}

/**
 * Shown by Start Consultation when the patient has active monitoring records.
 * Existing monitoring is optional context on the one encounter, not a visit
 * type: nothing is preselected, and starting with nothing ticked is a normal
 * consultation that opens at once. With monitoring ticked, `onStart` (async)
 * first reads the records fresh and the modal stays open on a spinner until
 * the workspace can open already populated; if a record is no longer active
 * or cannot be read, the modal says so instead of opening half loaded.
 * It does not pick a service - Barangay Health Services stays in the
 * workspace. Mount it only while open so each opening starts empty.
 */
export default function StartConsultationModal({ overview, onStart, onCancel }) {
  const headingId = useId();
  const [monitoringIds, setMonitoringIds] = useState([]);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState("");
  const options = monitoredConditionOptions(overview);
  const hasPendingFollowUp = options.some((o) => o.followUp && monitoringIds.includes(o.monitoringId));

  async function handleStart() {
    setProblem("");
    if (monitoringIds.length === 0) {
      onStart({ monitoringIds: [] });
      return;
    }
    const names = new Map(options.map((option) => [option.monitoringId, option.conditionName]));
    setStarting(true);
    try {
      await onStart({ monitoringIds });
      // Navigation takes over; the modal unmounts with the page.
    } catch (error) {
      if (error?.kind === "inactive") {
        const dropped = error.droppedMonitoringIds || [];
        setMonitoringIds((current) => current.filter((id) => !dropped.includes(id)));
        const label = dropped.map((id) => names.get(id) || "A condition").join(", ");
        setProblem(
          `${label} ${dropped.length === 1 ? "is" : "are"} no longer under active monitoring and was unticked. Check the list, then start again.`,
        );
      } else {
        setProblem("Monitoring records could not be loaded. Try again, or untick them to start a normal consultation.");
      }
      setStarting(false);
    }
  }

  return (
    <ModalShell
      open
      title="Start Consultation"
      size="md"
      onClose={onCancel}
      closeDisabled={starting}
      dismissOnBackdrop={!starting}
      dismissOnEscape={!starting}
      footer={
        <>
          <ModalButton onClick={onCancel} disabled={starting}>Cancel</ModalButton>
          <ModalButton variant="primary" primary disabled={starting} aria-busy={starting} onClick={handleStart}>
            {starting ? (
              <>
                <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                Loading monitoring…
              </>
            ) : (
              "Start Consultation"
            )}
          </ModalButton>
        </>
      }
    >
      <div className="text-[13px] text-slate-600">
        <h3 id={headingId} className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
          Existing monitoring addressed in this visit
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">Optional. Leave all unticked to start a normal consultation.</p>
        <div role="group" aria-labelledby={headingId} className="mt-1">
          {options.map((option) => (
            <ConditionRow
              key={option.monitoringId}
              option={option}
              disabled={starting}
              checked={monitoringIds.includes(option.monitoringId)}
              onChange={() => setMonitoringIds((current) => toggle(current, option.monitoringId))}
            />
          ))}
        </div>
        {hasPendingFollowUp && (
          <p className="mt-2 text-xs text-slate-500">
            Pending follow-ups for the selected conditions are recorded as attended when this consultation is saved.
          </p>
        )}
        {problem && (
          <p role="alert" className="mt-2 border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {problem}
          </p>
        )}
      </div>
    </ModalShell>
  );
}
