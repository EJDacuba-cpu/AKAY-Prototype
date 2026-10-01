import { useState } from "react";

import ModalShell, { ModalButton } from "../../../common/modals/ModalShell";

function toggle(list, id) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function isToday(date) {
  return date === new Date().toLocaleDateString("en-CA");
}

function Row({ checked, onChange, title, lines }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 border-b border-[#E5E7EB] px-1 py-2.5 last:border-b-0">
      <input type="checkbox" checked={checked} onChange={onChange} className="mt-0.5 h-4 w-4 flex-none accent-[#DC2626]" />
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-slate-900">{title}</span>
        {lines.filter(Boolean).map((line, index) => (
          <span key={`${index}-${line}`} className="block text-xs text-slate-500">{line}</span>
        ))}
      </span>
    </label>
  );
}

/**
 * Shown by Start Consultation only when the patient has pending follow-ups or
 * active monitoring with no follow-up (utils/startConsultation.needsStartModal).
 * Continue Selected links the ticked items to the new ITR; Start New
 * Consultation leaves them untouched. Mount it only while open so each opening
 * starts with nothing ticked.
 */
export default function StartConsultationModal({ overview, open = Boolean(overview), onContinue, onStartNew, onCancel }) {
  const [followUpIds, setFollowUpIds] = useState([]);
  const [monitoringIds, setMonitoringIds] = useState([]);
  const pending = overview?.pendingFollowUps || [];
  const unscheduled = overview?.monitoringWithoutFollowUp || [];
  const nothingSelected = followUpIds.length === 0 && monitoringIds.length === 0;

  return (
    <ModalShell
      open={open}
      title="Start Consultation"
      size="md"
      onClose={onCancel}
      footer={
        <>
          <ModalButton onClick={onCancel}>Cancel</ModalButton>
          <ModalButton onClick={onStartNew}>Start New Consultation</ModalButton>
          <ModalButton variant="primary" primary disabled={nothingSelected} onClick={() => onContinue({ followUpIds, monitoringIds })}>
            Continue Selected
          </ModalButton>
        </>
      }
    >
      <div className="space-y-4 text-[13px] text-slate-600">
        <p>This patient has follow-ups or monitored conditions. Continue them in this visit, or start a new consultation.</p>
        {pending.length > 0 && (
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Pending follow-ups</h3>
            {pending.map((task) => (
              <Row
                key={task.id}
                checked={followUpIds.includes(task.id)}
                onChange={() => setFollowUpIds((current) => toggle(current, task.id))}
                title={`${task.dueDate}${task.isOverdue ? " · Overdue" : isToday(task.dueDate) ? " · Due" : ""}`}
                lines={[
                  task.reason,
                  (task.conditions || []).map((c) => c.conditionName).join(", "),
                  task.sourceDate && `From visit on ${task.sourceDate}`,
                ]}
              />
            ))}
          </section>
        )}
        {unscheduled.length > 0 && (
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Monitored at BHC — no follow-up scheduled</h3>
            {unscheduled.map((monitoring) => (
              <Row
                key={monitoring.id}
                checked={monitoringIds.includes(monitoring.id)}
                onChange={() => setMonitoringIds((current) => toggle(current, monitoring.id))}
                title={monitoring.conditionName}
                lines={[
                  monitoring.startedAt && `Monitoring since ${monitoring.startedAt}`,
                  monitoring.lastVisitDate && `Last visit ${monitoring.lastVisitDate}`,
                ]}
              />
            ))}
          </section>
        )}
      </div>
    </ModalShell>
  );
}
