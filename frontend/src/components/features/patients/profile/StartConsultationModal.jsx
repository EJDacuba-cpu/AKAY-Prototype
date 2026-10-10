import { useId, useState } from "react";
import { Loader2 } from "lucide-react";

import ModalShell, { ModalButton } from "../../../common/modals/ModalShell";
import { formatDate } from "../../../../utils/formatters";
import { conditionStatusLabel, monitoringRecommendationOptions } from "../../../../utils/medicalConditions";
import {
  legacyMonitoringOptions,
  monitoredConditionOptions,
  scheduledFollowUpOptions,
} from "../../../../utils/startConsultation";

const GENERAL = "general";
const MONITORING = "monitoring";
const MONITORING_HINT = "Tick at least one monitored condition.";

function toggle(list, id) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function CheckRow({ checked, disabled, onChange, title, lines }) {
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
        <span className="block text-[13px] font-semibold text-slate-900">{title}</span>
        {lines.map((line) => (
          <span key={line} className="block text-xs text-slate-500">{line}</span>
        ))}
      </span>
    </label>
  );
}

function ConditionRow({ option, ...props }) {
  const { conditionName, startedAt, followUp } = option;
  const lines = [
    startedAt && `Monitoring since ${formatDate(startedAt, startedAt)}`,
    followUp && `Follow-up due ${formatDate(followUp.dueDate, followUp.dueDate)}${followUp.isOverdue ? " · Overdue" : ""}`,
  ].filter(Boolean);
  return <CheckRow {...props} title={conditionName} lines={lines} />;
}

function RecommendationRow({ option, ...props }) {
  const { conditionName, status, confirmedAt } = option;
  const lines = [
    [conditionStatusLabel(status), confirmedAt && `confirmed by RHU ${formatDate(confirmedAt, confirmedAt)}`]
      .filter(Boolean)
      .join(" · "),
  ].filter(Boolean);
  return <CheckRow {...props} title={conditionName} lines={lines} />;
}

function FollowUpRow({ option, ...props }) {
  const { followUpId, reason, dueDate, isOverdue, sourceDate } = option;
  const due = formatDate(dueDate, "");
  const from = formatDate(sourceDate, "");
  const lines = [
    [`FU-${followUpId}`, due && `due ${due}`, isOverdue && "Overdue"].filter(Boolean).join(" · "),
    from && `From ${from} visit`,
  ].filter(Boolean);
  return <CheckRow {...props} title={reason || "No reason recorded"} lines={lines} />;
}

function SectionHeading({ id, children }) {
  return (
    <h3 id={id} className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
      {children}
    </h3>
  );
}

/**
 * Shown by Start Consultation when the patient has verified monitoring,
 * conditions the RHU recommends BHC start monitoring, scheduled follow-ups, or
 * legacy monitoring waiting on RHU verification. The visit type is General
 * Consultation (the default, always present) or Follow-up Existing Monitoring
 * (offered only with verified monitoring, and it needs at least one ticked
 * condition). Scheduled follow-ups and RHU recommendations are optional
 * context under either type: nothing is preselected, and opening never
 * completes a follow-up (only a successful save does). Legacy monitoring is
 * listed read-only and can never be ticked. `onStart` (async) always loads
 * the patient first; with anything ticked it also reads the records fresh. The
 * modal stays open on a spinner until the workspace can open already populated; if a record is no longer
 * active, a follow-up was fulfilled, a recommendation was withdrawn, or they
 * cannot be read, the modal says so instead of opening half loaded. It does
 * not pick a service - Barangay Health Services stays in the workspace. Mount
 * it only while open so each opening starts empty.
 */
export default function StartConsultationModal({ overview, onStart, onCancel }) {
  const visitTypeId = useId();
  const monitoringHeadingId = useId();
  const followUpHeadingId = useId();
  const recommendedHeadingId = useId();
  const legacyHeadingId = useId();
  const hintId = useId();
  const [visitType, setVisitType] = useState(GENERAL);
  const [monitoringIds, setMonitoringIds] = useState([]);
  const [followUpIds, setFollowUpIds] = useState([]);
  const [startConditionIds, setStartConditionIds] = useState([]);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState("");
  const options = monitoredConditionOptions(overview);
  const followUps = scheduledFollowUpOptions(overview);
  const recommendations = monitoringRecommendationOptions(overview);
  const legacy = legacyMonitoringOptions(overview);
  const monitoringMode = options.length > 0 && visitType === MONITORING;
  // Ticks only count in Monitoring Visit mode; a hidden tick is never sent.
  const effectiveMonitoringIds = monitoringMode ? monitoringIds : [];
  const needsMonitoringTick = monitoringMode && monitoringIds.length === 0;
  const hasPendingFollowUp = options.some((o) => o.followUp && effectiveMonitoringIds.includes(o.monitoringId));
  const nothingTicked =
    effectiveMonitoringIds.length === 0 && startConditionIds.length === 0 && followUpIds.length === 0;

  function chooseVisitType(next) {
    setVisitType(next);
    // General Consultation never carries monitoring ticks from the other type.
    if (next === GENERAL) setMonitoringIds([]);
  }

  async function handleStart() {
    setProblem("");
    if (needsMonitoringTick) return;
    const names = new Map(options.map((option) => [option.monitoringId, option.conditionName]));
    const recommendedNames = new Map(recommendations.map((option) => [Number(option.conditionId), option.conditionName]));
    setStarting(true);
    try {
      await onStart({ monitoringIds: effectiveMonitoringIds, startConditionIds, followUpIds });
      // Navigation takes over; the modal unmounts with the page.
    } catch (error) {
      if (error?.kind === "inactive") {
        const dropped = error.droppedMonitoringIds || [];
        const droppedRecommendations = (error.droppedConditionIds || []).map(Number);
        const droppedFollowUps = (error.droppedFollowUpIds || []).map(Number);
        setMonitoringIds((current) => current.filter((id) => !dropped.includes(id)));
        setStartConditionIds((current) => current.filter((id) => !droppedRecommendations.includes(Number(id))));
        setFollowUpIds((current) => current.filter((id) => !droppedFollowUps.includes(Number(id))));
        const messages = [];
        if (dropped.length) {
          const label = dropped.map((id) => names.get(id) || "A condition").join(", ");
          messages.push(`${label} ${dropped.length === 1 ? "is" : "are"} no longer under active monitoring and was unticked.`);
        }
        for (const id of droppedRecommendations) {
          messages.push(`${recommendedNames.get(id) || "A condition"} is no longer recommended for BHC monitoring and was unticked.`);
        }
        for (const id of droppedFollowUps) {
          messages.push(`Follow-up FU-${id} is no longer pending (already attended or rescheduled) and was unticked.`);
        }
        setProblem(`${messages.join(" ")} Check the list, then start again.`);
      } else {
        setProblem(
          nothingTicked
            ? "Patient details could not be loaded. Try again."
            : "Records could not be loaded. Try again, or untick them to start a normal consultation.",
        );
      }
      setStarting(false);
    }
  }

  return (
    <ModalShell
      open
      title="Start Consultation"
      size="lg"
      onClose={onCancel}
      closeDisabled={starting}
      dismissOnBackdrop={!starting}
      dismissOnEscape={!starting}
      footerLeading={needsMonitoringTick ? <span id={hintId}>{MONITORING_HINT}</span> : null}
      footer={
        <>
          <ModalButton onClick={onCancel} disabled={starting}>Cancel</ModalButton>
          <ModalButton
            variant="primary"
            primary
            disabled={starting || needsMonitoringTick}
            aria-busy={starting}
            aria-describedby={needsMonitoringTick ? hintId : undefined}
            onClick={handleStart}
          >
            {starting ? (
              <>
                <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                {nothingTicked ? "Opening consultation…" : "Checking records…"}
              </>
            ) : (
              "Start Consultation"
            )}
          </ModalButton>
        </>
      }
    >
      <div className="space-y-4 text-[13px] text-slate-600">
        <fieldset disabled={starting}>
          <legend id={visitTypeId} className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
            Visit type
          </legend>
          <div role="radiogroup" aria-labelledby={visitTypeId} className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-slate-900">
              <input
                type="radio"
                name={visitTypeId}
                checked={!monitoringMode}
                onChange={() => chooseVisitType(GENERAL)}
                className="h-4 w-4 accent-[#DC2626]"
              />
              New / General Consultation
            </label>
            {options.length > 0 && (
              <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-slate-900">
                <input
                  type="radio"
                  name={visitTypeId}
                  checked={monitoringMode}
                  onChange={() => chooseVisitType(MONITORING)}
                  className="h-4 w-4 accent-[#DC2626]"
                />
                Follow-up Existing Monitoring
              </label>
            )}
          </div>
        </fieldset>
        {monitoringMode && (
          <section>
            <SectionHeading id={monitoringHeadingId}>Existing monitoring addressed in this visit</SectionHeading>
            <p className="mt-0.5 text-xs text-slate-500">Tick the monitored conditions this visit follows up.</p>
            <div role="group" aria-labelledby={monitoringHeadingId} className="mt-1">
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
              <p className="mt-1 text-xs text-slate-500">
                Pending follow-ups for the selected conditions are recorded as attended when this consultation is saved.
              </p>
            )}
          </section>
        )}
        {followUps.length > 0 && (
          <section>
            <SectionHeading id={followUpHeadingId}>Scheduled follow-ups (optional)</SectionHeading>
            <p className="mt-0.5 text-xs text-slate-500">
              Tick one to attend it in this visit. It is marked attended only when the consultation is saved.
            </p>
            <div role="group" aria-labelledby={followUpHeadingId} className="mt-1">
              {followUps.map((option) => (
                <FollowUpRow
                  key={option.followUpId}
                  option={option}
                  disabled={starting}
                  checked={followUpIds.includes(option.followUpId)}
                  onChange={() => setFollowUpIds((current) => toggle(current, option.followUpId))}
                />
              ))}
            </div>
          </section>
        )}
        {recommendations.length > 0 && (
          <section>
            <SectionHeading id={recommendedHeadingId}>Recommended by RHU — start BHC monitoring</SectionHeading>
            <p className="mt-0.5 text-xs text-slate-500">
              Optional. Ticked conditions are started in Care Plan &amp; Next Steps; unticked ones stay recommended.
            </p>
            <div role="group" aria-labelledby={recommendedHeadingId} className="mt-1">
              {recommendations.map((option) => (
                <RecommendationRow
                  key={option.conditionId}
                  option={option}
                  disabled={starting}
                  checked={startConditionIds.includes(option.conditionId)}
                  onChange={() => setStartConditionIds((current) => toggle(current, option.conditionId))}
                />
              ))}
            </div>
          </section>
        )}
        {legacy.length > 0 && (
          <section>
            <SectionHeading id={legacyHeadingId}>Pending RHU verification</SectionHeading>
            <p className="mt-0.5 text-xs text-slate-500">
              Refer to RHU for verification if care is needed. It cannot be continued as monitoring until verified.
            </p>
            <ul aria-labelledby={legacyHeadingId} className="mt-1">
              {legacy.map((option) => (
                <li key={option.monitoringId} className="border-b border-[#E5E7EB] px-1 py-2.5 last:border-b-0">
                  <span className="block text-[13px] font-semibold text-slate-900">{option.conditionName}</span>
                  <span className="block text-xs text-slate-500">
                    {[
                      "Legacy — Pending RHU Verification",
                      option.startedAt && `Monitoring since ${formatDate(option.startedAt, option.startedAt)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {problem && (
          <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {problem}
          </p>
        )}
      </div>
    </ModalShell>
  );
}
