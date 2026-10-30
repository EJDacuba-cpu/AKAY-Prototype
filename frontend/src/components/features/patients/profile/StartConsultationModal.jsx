import { useId, useState } from "react";
import { Loader2 } from "lucide-react";

import ModalShell, { ModalButton } from "../../../common/modals/ModalShell";
import { formatDate } from "../../../../utils/formatters";
import { conditionStatusLabel, monitoringRecommendationOptions } from "../../../../utils/medicalConditions";
import {
  legacyMonitoringOptions,
  monitoredConditionOptions,
  pendingFollowUpOptions,
  startConsultationFailureMessage,
} from "../../../../utils/startConsultation";

const NEW_VISIT = "new";
const CONTINUE = "continue";

function toggle(list, id) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function CheckRow({ checked, disabled, onChange, title, lines }) {
  return (
    <label className={`flex items-start gap-2.5 border-b border-neutral-200 px-1 py-2.5 last:border-b-0 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 flex-none accent-ink-700"
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-neutral-900">{title}</span>
        {lines.map((line) => (
          <span key={line} className="block text-xs text-neutral-500">{line}</span>
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
  const { followUpId, reason, purpose, dueDate, isOverdue, sourceDate, sourceChiefComplaint, sourceAssessment } = option;
  const due = formatDate(dueDate, "");
  const from = formatDate(sourceDate, "");
  const lines = [
    [`FU-${followUpId}`, due && `due ${due}`, isOverdue && "Overdue"].filter(Boolean).join(" · "),
    from && `From ${from} visit`,
    sourceChiefComplaint && `Previous complaint: ${sourceChiefComplaint}`,
    sourceAssessment && `Previous findings: ${sourceAssessment}`,
  ].filter(Boolean);
  return <CheckRow {...props} title={purpose || reason || "No reason recorded"} lines={lines} />;
}

function SectionHeading({ id, children }) {
  return (
    <h3 id={id} className="text-[13px] font-semibold text-neutral-900">
      {children}
    </h3>
  );
}

/**
 * Shown by Start Consultation for first-time and returning patients. The two
 * entry paths are New Consultation (default; never attaches pending
 * follow-ups) and Continue Scheduled Follow-up (only when eligible pending
 * tasks exist; one selected by default on BHC, more only if explicitly added).
 * Opening never completes a follow-up. Legacy monitoring is listed read-only.
 * `onStart` (async) always loads the patient first. Mount it only while open
 * so each opening starts empty.
 */
export default function StartConsultationModal({ overview, onStart, onCancel, variant = "bhc" }) {
  const visitTypeId = useId();
  const monitoringHeadingId = useId();
  const followUpHeadingId = useId();
  const recommendedHeadingId = useId();
  const legacyHeadingId = useId();
  const hintId = useId();
  const [visitType, setVisitType] = useState(NEW_VISIT);
  const [monitoringIds, setMonitoringIds] = useState([]);
  const [followUpIds, setFollowUpIds] = useState([]);
  const [startConditionIds, setStartConditionIds] = useState([]);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState("");
  const rhu = variant === "rhu";
  const options = monitoredConditionOptions(overview);
  const followUps = pendingFollowUpOptions(overview, { facility: rhu ? "rhu" : "any" });
  const recommendations = monitoringRecommendationOptions(overview);
  const legacy = legacyMonitoringOptions(overview);
  const continueMode = followUps.length > 0 && visitType === CONTINUE;
  const effectiveFollowUpIds = continueMode ? followUpIds : [];
  const needsFollowUpTick = continueMode && followUpIds.length === 0;
  const nothingTicked =
    monitoringIds.length === 0 && startConditionIds.length === 0 && effectiveFollowUpIds.length === 0;

  function chooseVisitType(next) {
    setVisitType(next);
    if (next === NEW_VISIT) setFollowUpIds([]);
    if (next === CONTINUE && followUpIds.length === 0 && followUps[0] && !rhu) {
      setFollowUpIds([followUps[0].followUpId]);
    }
  }

  async function handleStart() {
    setProblem("");
    if (needsFollowUpTick) return;
    const names = new Map(options.map((option) => [option.monitoringId, option.conditionName]));
    const recommendedNames = new Map(recommendations.map((option) => [Number(option.conditionId), option.conditionName]));
    setStarting(true);
    try {
      await onStart({ monitoringIds, startConditionIds, followUpIds: effectiveFollowUpIds });
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
        setProblem(startConsultationFailureMessage(error, nothingTicked));
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
      footerLeading={needsFollowUpTick ? <span id={hintId}>Select the scheduled follow-up this visit continues.</span> : null}
      footer={
        <>
          <ModalButton onClick={onCancel} disabled={starting}>Cancel</ModalButton>
          <ModalButton
            variant="primary"
            primary
            disabled={starting || needsFollowUpTick}
            aria-busy={starting}
            aria-describedby={needsFollowUpTick ? hintId : undefined}
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
      <div className="space-y-4 text-[13px] text-neutral-600">
        <fieldset disabled={starting}>
          <legend id={visitTypeId} className="text-[13px] font-semibold text-neutral-900">
            How is this visit starting?
          </legend>
          <div role="radiogroup" aria-labelledby={visitTypeId} className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-neutral-900">
              <input
                type="radio"
                name={visitTypeId}
                checked={!continueMode}
                onChange={() => chooseVisitType(NEW_VISIT)}
                className="h-4 w-4 accent-ink-700"
              />
              New Consultation
            </label>
            {followUps.length > 0 && (
              <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-neutral-900">
                <input
                  type="radio"
                  name={visitTypeId}
                  checked={continueMode}
                  onChange={() => chooseVisitType(CONTINUE)}
                  className="h-4 w-4 accent-ink-700"
                />
                Continue Scheduled Follow-up
              </label>
            )}
          </div>
        </fieldset>
        {!continueMode && (
          <p className="text-xs text-neutral-500">
            Opens a new clinical encounter. Pending follow-ups stay pending unless you switch to Continue Scheduled Follow-up.
          </p>
        )}
        {continueMode && (
          <section>
            <SectionHeading id={followUpHeadingId}>Scheduled follow-up for this visit</SectionHeading>
            <p className="mt-0.5 text-xs text-neutral-500">
              {rhu
                ? "Check every follow-up this encounter genuinely addresses. Nothing is marked attended until the consultation is finalized."
                : "One follow-up is selected by default. Add another only if it is genuinely addressed in this same encounter. Nothing is marked attended until the consultation is saved."}
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
        {!rhu && options.length > 0 && (
          <section>
            <SectionHeading id={monitoringHeadingId}>Condition monitoring addressed today</SectionHeading>
            <p className="mt-0.5 text-xs text-neutral-500">
              Optional read-only context until ticked. Ticking a condition does not complete its follow-up appointment.
            </p>
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
          </section>
        )}
        {!rhu && recommendations.length > 0 && (
          <section>
            <SectionHeading id={recommendedHeadingId}>Recommended by RHU — start BHC monitoring</SectionHeading>
            <p className="mt-0.5 text-xs text-neutral-500">
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
        {!rhu && legacy.length > 0 && (
          <section>
            <SectionHeading id={legacyHeadingId}>Pending RHU verification</SectionHeading>
            <p className="mt-0.5 text-xs text-neutral-500">
              Refer to RHU for verification if care is needed. It cannot be continued as monitoring until verified.
            </p>
            <ul aria-labelledby={legacyHeadingId} className="mt-1">
              {legacy.map((option) => (
                <li key={option.monitoringId} className="border-b border-neutral-200 px-1 py-2.5 last:border-b-0">
                  <span className="block text-[13px] font-semibold text-neutral-900">{option.conditionName}</span>
                  <span className="block text-xs text-neutral-500">
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
          <p role="alert" className="rounded-lg border border-alert-100 bg-alert-50 px-3 py-2 text-xs text-alert-700">
            {problem}
          </p>
        )}
      </div>
    </ModalShell>
  );
}
