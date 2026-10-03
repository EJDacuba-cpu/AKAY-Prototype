import { useState } from "react";

import ModalShell, { ModalButton } from "../../../common/modals/ModalShell";
import {
  VISIT_CONTEXT,
  canStartVisit,
  monitoredConditionOptions,
} from "../../../../utils/startConsultation";

function toggle(list, id) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function ContextOption({ checked, disabled, onChange, title, description, hint, children }) {
  return (
    <div className={`border ${checked ? "border-[#DC2626]" : "border-[#E5E7EB]"} ${disabled ? "bg-[#F9FAFB]" : ""}`}>
      <label className={`flex items-start gap-2.5 px-3 py-2.5 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
        <input
          type="radio"
          name="visit-context"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          className="mt-0.5 h-4 w-4 flex-none accent-[#DC2626]"
        />
        <span className="min-w-0">
          <span className={`block text-[13px] font-semibold ${disabled ? "text-slate-500" : "text-slate-900"}`}>{title}</span>
          <span className="block text-xs text-slate-500">{description}</span>
          {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
        </span>
      </label>
      {children}
    </div>
  );
}

function ConditionRow({ checked, onChange, option }) {
  const { conditionName, startedAt, followUp } = option;
  const lines = [
    startedAt && `Monitoring since ${startedAt}`,
    followUp && `Follow-up due ${followUp.dueDate}${followUp.isOverdue ? " · Overdue" : ""}`,
  ].filter(Boolean);
  return (
    <label className="flex cursor-pointer items-start gap-2.5 border-t border-[#E5E7EB] px-3 py-2 first:border-t-0">
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
 * Shown by Start Consultation before the workspace opens. It only records the
 * visit context: a new / general consultation, or a follow-up of conditions
 * already under active BHC monitoring (never the Past Medical History). It
 * does not pick a service - Barangay Health Services stays in the workspace -
 * and it preselects nothing. Mount it only while open so each opening starts
 * empty.
 */
export default function StartConsultationModal({ overview, overviewUnavailable = false, onStart, onCancel }) {
  const [context, setContext] = useState(null);
  const [monitoringIds, setMonitoringIds] = useState([]);
  const options = monitoredConditionOptions(overview);
  const followUpDisabled = options.length === 0;
  const isFollowUp = context === VISIT_CONTEXT.MONITORING;
  const hasPendingFollowUp = isFollowUp && options.some((o) => o.followUp && monitoringIds.includes(o.monitoringId));

  return (
    <ModalShell
      open
      title="Start Consultation"
      size="md"
      onClose={onCancel}
      footer={
        <>
          <ModalButton onClick={onCancel}>Cancel</ModalButton>
          <ModalButton
            variant="primary"
            primary
            disabled={!canStartVisit(context, monitoringIds)}
            onClick={() => onStart({ context, monitoringIds: isFollowUp ? monitoringIds : [] })}
          >
            Start Consultation
          </ModalButton>
        </>
      }
    >
      <div role="radiogroup" aria-label="Visit context" className="space-y-2 text-[13px] text-slate-600">
        <ContextOption
          checked={context === VISIT_CONTEXT.GENERAL}
          onChange={() => setContext(VISIT_CONTEXT.GENERAL)}
          title="New / General Consultation"
          description="A new complaint, concern, or ordinary consultation."
        />
        <ContextOption
          checked={isFollowUp}
          disabled={followUpDisabled}
          onChange={() => setContext(VISIT_CONTEXT.MONITORING)}
          title="Follow-up Existing Monitoring"
          description="Reviewing a condition already monitored at this BHC."
          hint={
            followUpDisabled
              ? overviewUnavailable
                ? "Monitored conditions could not be loaded."
                : "No conditions under active BHC monitoring."
              : undefined
          }
        >
          {isFollowUp && (
            <div className="border-t border-[#E5E7EB]">
              <h3 className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                Monitored conditions addressed in this visit
              </h3>
              <div className="mt-1">
                {options.map((option) => (
                  <ConditionRow
                    key={option.monitoringId}
                    option={option}
                    checked={monitoringIds.includes(option.monitoringId)}
                    onChange={() => setMonitoringIds((current) => toggle(current, option.monitoringId))}
                  />
                ))}
              </div>
              {monitoringIds.length === 0 && (
                <p className="border-t border-[#E5E7EB] px-3 py-2 text-xs text-slate-500">
                  Select at least one monitored condition.
                </p>
              )}
              {hasPendingFollowUp && (
                <p className="border-t border-[#E5E7EB] px-3 py-2 text-xs text-slate-500">
                  Pending follow-ups for the selected conditions are recorded as attended when this consultation is saved.
                </p>
              )}
            </div>
          )}
        </ContextOption>
      </div>
    </ModalShell>
  );
}
