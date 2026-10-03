import { useId, useState } from "react";

import ModalShell, { ModalButton } from "../../../common/modals/ModalShell";
import { formatDate } from "../../../../utils/formatters";
import { monitoredConditionOptions } from "../../../../utils/startConsultation";

function toggle(list, id) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function ConditionRow({ checked, onChange, option }) {
  const { conditionName, startedAt, followUp } = option;
  const lines = [
    startedAt && `Monitoring since ${formatDate(startedAt, startedAt)}`,
    followUp && `Follow-up due ${formatDate(followUp.dueDate, followUp.dueDate)}${followUp.isOverdue ? " · Overdue" : ""}`,
  ].filter(Boolean);
  return (
    <label className="flex cursor-pointer items-start gap-2.5 border-b border-[#E5E7EB] px-1 py-2.5 last:border-b-0">
      <input type="checkbox" checked={checked} onChange={onChange} className="mt-0.5 h-4 w-4 flex-none accent-[#DC2626]" />
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
 * consultation. Ticked records are carried into the same consultation as
 * conditions addressed today. It does not pick a service - Barangay Health
 * Services stays in the workspace. Mount it only while open so each opening
 * starts empty.
 */
export default function StartConsultationModal({ overview, onStart, onCancel }) {
  const headingId = useId();
  const [monitoringIds, setMonitoringIds] = useState([]);
  const options = monitoredConditionOptions(overview);
  const hasPendingFollowUp = options.some((o) => o.followUp && monitoringIds.includes(o.monitoringId));

  return (
    <ModalShell
      open
      title="Start Consultation"
      size="md"
      onClose={onCancel}
      footer={
        <>
          <ModalButton onClick={onCancel}>Cancel</ModalButton>
          <ModalButton variant="primary" primary onClick={() => onStart({ monitoringIds })}>
            Start Consultation
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
      </div>
    </ModalShell>
  );
}
