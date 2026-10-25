import { cloneElement, isValidElement } from "react";
import { TimePickerField } from "../../../common/forms/DatePickerField";
import { FieldInput, FieldTextarea, RadioChoiceGroup } from "../fields/ClinicalFields";
import { ATTENTION_LEVELS, DEFAULT_ATTENTION } from "../../../../utils/referralAttention";
import { formatDate } from "../../../../utils/formatters";
import { conditionStatusLabel } from "../../../../utils/medicalConditions";
import { Card } from "../../../ui/card";

const MONITORING_DECISIONS = [
  { value: "continue", label: "Continue Monitoring" },
  { value: "refer", label: "Refer back to RHU" },
  { value: "stop", label: "Stop BHC Monitoring" },
];

const SECTION_HEADING_CLASS = "text-sm font-bold text-[#111827]";

// A condition the RHU has already closed: BHC may still be following it, so say so.
const CLOSED_STATUSES = new Set(["resolved", "ruled_out"]);

function StopReason({ monitoringId, value, error, disabled, onChange }) {
  return (
    <FieldInput
      label="Reason for stopping monitoring"
      required
      name={`carePlanStop.${monitoringId}`}
      value={value || ""}
      error={error}
      disabled={disabled}
      maxLength={500}
      onChange={(event) => onChange(monitoringId, event.target.value)}
    />
  );
}

/** "General consultation; Hypertension" */
function joinNames(names) {
  return names
    .map((name) => String(typeof name === "string" ? name : name?.name || "").trim())
    .filter(Boolean)
    .join("; ");
}

/** What the visit's one referral covers. */
function Covers({ items = [] }) {
  const text = joinNames(items);
  if (!text) return null;
  return (
    <p className="text-xs text-[#374151]">
      <span className="font-semibold">Covers:</span> {text}
    </p>
  );
}

/**
 * The worker confirms one facility and priority suits every listed item (H7).
 * Unticked, Continue and Save are blocked with the inline error below; nothing
 * entered is cleared.
 */
function Acknowledgment({ name, label, checked, error, disabled, onChange }) {
  return (
    <div>
      <label className="inline-flex cursor-pointer items-start gap-1.5 text-[13px]">
        <input
          type="checkbox"
          name={name}
          checked={checked}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#DC2626]"
        />
        <span className={checked ? "font-semibold text-[#111827]" : "text-[#374151]"}>{label}</span>
      </label>
      {error && (
        <p role="alert" className="mt-1.5 border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium leading-relaxed text-[#B91C1C]">
          {error}
        </p>
      )}
    </div>
  );
}

/** One of the two independent Next Actions. */
function ActionCheckbox({ name, label, checked, disabled, onChange }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-[13px]">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
        className="h-4 w-4 shrink-0 accent-[#DC2626]"
      />
      <span className={checked ? "font-semibold text-[#DC2626]" : "text-[#374151]"}>{label}</span>
    </label>
  );
}

/**
 * The visit's single referral: facility (with its availability panel and the
 * no-doctor warning), priority and reason.
 */
function ReferralFields({ referral, referralFacilityField, errors, disabled, onReferralChange }) {
  const priority = (
    <RadioChoiceGroup
      label="Referral Urgency"
      name="urgencyLevel"
      required
      inline
      options={ATTENTION_LEVELS}
      value={referral.urgencyLevel ?? DEFAULT_ATTENTION}
      error={errors.urgencyLevel}
      onChange={(value) => onReferralChange("urgencyLevel", value)}
      helperText="Workflow handling only. The RHU decides queue order."
    />
  );
  return (
    // RadioChoiceGroup has no disabled prop; the fieldset disables it.
    <fieldset disabled={disabled} className="min-w-0 space-y-3">
      {/* Priority sits beside the facility select (ReferralFacilityField's selectAside). */}
      {isValidElement(referralFacilityField) ? (
        cloneElement(referralFacilityField, { selectAside: priority })
      ) : (
        <>
          {referralFacilityField}
          {priority}
        </>
      )}
      <FieldTextarea
        label="Reason for Referral"
        required
        maxLength={5000}
        name="reasonForReferral"
        value={referral.reason || ""}
        error={errors.reasonForReferral}
        rows={2}
        onChange={(event) => onReferralChange("reason", event.target.value)}
      />
    </fieldset>
  );
}

/**
 * The visit's single BHC follow-up. The date is always required once Schedule
 * BHC Follow-up is ticked; the reason is required unless the return covers
 * only a selected service or continued monitoring (H6, `reasonRequired`).
 */
function FollowUpFields({ followUp, errors, disabled, reasonRequired, hint, onFollowUpChange, dateName = "followUpDate", timeName = "followUpTime", reasonName = "followUpReason" }) {
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <FieldInput
          label="Follow-up Date"
          required
          type="date"
          name={dateName}
          value={followUp.date || ""}
          error={errors.followUpDate || errors[dateName]}
          onChange={(event) => onFollowUpChange("date", event.target.value)}
        />
        <TimePickerField
          label="Follow-up Time"
          name={timeName}
          value={followUp.time || ""}
          error={errors.followUpTime || errors[timeName]}
          disabled={disabled}
          onChange={(value) => onFollowUpChange("time", value)}
        />
      </div>
      <div>
        <FieldTextarea
          label="Follow-up Reason"
          maxLength={1000}
          required={reasonRequired}
          name={reasonName}
          value={followUp.reason || followUp.purpose || ""}
          error={errors.followUpReason || errors[reasonName]}
          rows={2}
          placeholder="Why should the patient return?"
          onChange={(event) => onFollowUpChange("reason", event.target.value)}
        />
        {hint && <p className="mt-1 text-xs text-[#6B7280]">{hint}</p>}
      </div>
    </fieldset>
  );
}

/**
 * Service-proposed return dates (EPI next dose, FP next appointment). "Use this
 * date" fills the follow-up date only: it never ticks the follow-up or
 * schedules anything.
 */
function DateSuggestions({ suggestions = [], disabled, onUse }) {
  if (suggestions.length === 0) return null;
  return (
    <ul className="space-y-1">
      {suggestions.map((suggestion) => (
        <li key={`${suggestion.source}-${suggestion.date}`} className="text-xs text-[#374151]">
          <span className="font-semibold">{suggestion.source}:</span> {formatDate(suggestion.date, suggestion.date)}
          <span aria-hidden="true" className="mx-1.5 text-[#D1D5DB]">—</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onUse?.(suggestion.date)}
            className="font-semibold text-[#DC2626] hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            Use this date
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Non-blocking: shown while the follow-up is ticked, never an error. */
function DateWarnings({ warnings = [] }) {
  if (warnings.length === 0) return null;
  return (
    <Card role="status" className="rounded-none px-3 py-2 text-xs leading-relaxed text-black">
      {warnings.map((warning) => (
        <p key={warning}>{warning}</p>
      ))}
    </Card>
  );
}

function extraScheduleHeading(row) {
  const key = String(row?.purposeKey || "");
  if (key.startsWith("service:")) return row.purpose || "Service return";
  if (key === "visit") return row.purpose || "BHC follow-up";
  return row.purpose || "Scheduled return";
}

function referralDecisionHint({ conditionReferred, monitoringReferred, referOn }) {
  if (conditionReferred) return "From conditions marked Refer to RHU. Change the condition outcome to cancel this referral.";
  if (monitoringReferred && !referOn) return "From condition monitoring. Change the monitoring decision to cancel this referral.";
  return "One referral for this consultation.";
}

/**
 * Care and Outcome, flat sections divided by thin
 * rules, top to bottom:
 * - Scheduled Returns: locally managed concerns plus extra or service returns.
 * - RHU referral details, only after a condition, visit, or monitoring decision.
 * - Condition Monitoring, only when the visit continues or starts monitoring:
 *   Continue / Refer back to RHU / Stop per monitored condition (only the RHU
 *   sets a condition's status), with Additional Clinical Notes.
 * - Next Actions: Refer to RHU when no condition or monitoring already refers.
 * - Actions Taken / Treatment: `treatmentSlot`.
 * - Reporting: `reportingSlot`.
 * Rules live in utils/nextActions.js and utils/followUpSchedules.js.
 */
export default function NextStepsSection({
  continuedMonitorings = [], startingConditions = [], stops = {}, referrals = [],
  referralFacilityField = null, errors = {}, disabled = false,
  onStopChange, onMonitoringDecision,
  monitoringNotes = "", notesLabel = "Monitoring Notes", notesPlaceholder = "Write monitoring notes if useful...",
  onMonitoringNotesChange,
  nextActions = {}, onReferCheckedChange, onMultipleIssuesChange,
  suggestions = [], onUseSuggestedDate, warnings = [],
  referral = {}, onReferralChange, coverage = [],
  acknowledgmentRequired = false, referralAcknowledged = false, onAcknowledgeChange,
  treatmentSlot = null, reportingSlot = null, earlierDraftNotes = "", earlierDraftContinued = "",
  conditionReferred = false,
  managedReturns = [], onManagedReturnChange,
  extraSchedules = [], onExtraScheduleChange, onAddExtraSchedule, onRemoveExtraSchedule,
}) {
  const hasMonitoring = continuedMonitorings.length > 0 || startingConditions.length > 0;
  const referredIds = new Set(referrals.map(Number));
  const monitoringReferred = continuedMonitorings.some(
    (monitoring) => referredIds.has(Number(monitoring.id)) && !Object.hasOwn(stops, monitoring.id),
  );
  const referOn = nextActions.referToRhu === true;
  const hasReferralDecision = conditionReferred || monitoringReferred || referOn;
  const showVisitReferralToggle = !conditionReferred && !monitoringReferred;
  const showExtraSchedules = typeof onAddExtraSchedule === "function";

  return (
    <div className="divide-y divide-[#E5E7EB] [&>section]:py-5 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
      <section aria-labelledby="scheduled-returns-title">
        <h2 id="scheduled-returns-title" className={SECTION_HEADING_CLASS}>Scheduled Returns</h2>
        <p className="mb-3 mt-1 text-xs text-[#6B7280]">Each return identifies the condition or service, date, and reason. If none is added, no follow-up is scheduled.</p>
        {managedReturns.length > 0 && (
          <ul className="divide-y divide-[#E5E7EB] border-y border-[#E5E7EB]">
            {managedReturns.map((row) => (
              <li key={row.purposeKey} className="py-3">
                <p className="text-sm font-semibold text-[#111827]">{row.name}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                  <label className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                    <input type="radio" name={`return-${row.purposeKey}`} checked={!row.needed} disabled={disabled} onChange={() => onManagedReturnChange?.(row.purposeKey, { ...row, needed: false, date: "", time: "" })} className="h-4 w-4 accent-[#DC2626]" />
                    <span className={!row.needed ? "font-semibold text-[#111827]" : "text-gray-600"}>Care completed — no scheduled return</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                    <input type="radio" name={`return-${row.purposeKey}`} checked={row.needed === true} disabled={disabled} onChange={() => onManagedReturnChange?.(row.purposeKey, { ...row, needed: true })} className="h-4 w-4 accent-[#DC2626]" />
                    <span className={row.needed ? "font-semibold text-[#DC2626]" : "text-gray-600"}>Schedule another BHC visit</span>
                  </label>
                </div>
                {row.needed && (
                  <div className="mt-3">
                    <FollowUpFields
                      followUp={{ date: row.date, time: row.time, purpose: row.purpose }}
                      errors={errors}
                      disabled={disabled}
                      reasonRequired
                      dateName={`followUpSchedule.${row.purposeKey}.date`}
                      timeName={`followUpSchedule.${row.purposeKey}.time`}
                      reasonName={`followUpSchedule.${row.purposeKey}.purpose`}
                      onFollowUpChange={(field, value) => onManagedReturnChange?.(row.purposeKey, { ...row, needed: true, [field === "reason" ? "purpose" : field]: value })}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {showExtraSchedules && (
          <div className={managedReturns.length > 0 ? "mt-3" : undefined}>
            <DateSuggestions suggestions={suggestions} disabled={disabled} onUse={onUseSuggestedDate} />
            {extraSchedules.map((row, index) => (
              <div key={row.purposeKey || index} className="mt-3 border-l border-[#E5E7EB] pl-3">
                <p className="mb-2 text-sm font-semibold text-[#111827]">{extraScheduleHeading(row)}</p>
                <FollowUpFields
                  followUp={{ date: row.date, time: row.time, purpose: row.purpose, reason: row.purpose }}
                  errors={errors}
                  disabled={disabled}
                  reasonRequired
                  dateName={`extraFollowUp.${index}.date`}
                  timeName={`extraFollowUp.${index}.time`}
                  reasonName={`extraFollowUp.${index}.purpose`}
                  onFollowUpChange={(field, value) => onExtraScheduleChange?.(index, { ...row, [field === "reason" ? "purpose" : field]: value })}
                />
                <button type="button" disabled={disabled} onClick={() => onRemoveExtraSchedule?.(index)} className="mt-2 text-xs font-semibold text-[#DC2626] underline underline-offset-2">
                  Remove this schedule
                </button>
              </div>
            ))}
            <DateWarnings warnings={warnings} />
            <button type="button" disabled={disabled} onClick={onAddExtraSchedule} className="mt-2 text-[13px] font-semibold text-[#DC2626] underline underline-offset-2">
              Add a scheduled return
            </button>
          </div>
        )}
      </section>
      {hasMonitoring && (
        <section aria-labelledby="next-steps-monitoring">
          <h2 id="next-steps-monitoring" className={SECTION_HEADING_CLASS}>Condition Monitoring</h2>
          <ul className="mt-2 divide-y divide-[#E5E7EB] border-y border-[#E5E7EB]">
            {continuedMonitorings.map((monitoring) => {
              const stopping = Object.hasOwn(stops, monitoring.id);
              const referring = !stopping && referredIds.has(Number(monitoring.id));
              const decision = stopping ? "stop" : referring ? "refer" : "continue";
              const closedByRhu = CLOSED_STATUSES.has(monitoring.conditionStatus);
              return (
                <li key={monitoring.id} className="py-3">
                  <fieldset disabled={disabled} className="min-w-0">
                    <legend className="text-sm font-semibold text-[#111827]">{monitoring.conditionName}</legend>
                    {closedByRhu && (
                      <p className="mt-0.5 text-xs text-[#6B7280]">
                        RHU marked this condition {conditionStatusLabel(monitoring.conditionStatus)}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                      {MONITORING_DECISIONS.map((option) => (
                        <label key={option.value} className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                          <input
                            type="radio"
                            name={`continue-${monitoring.id}`}
                            checked={decision === option.value}
                            onChange={() => onMonitoringDecision(monitoring.id, option.value)}
                            className="h-4 w-4 accent-[#DC2626]"
                          />
                          <span className={decision === option.value ? "font-semibold text-[#DC2626]" : "text-gray-600"}>{option.label}</span>
                        </label>
                      ))}
                    </div>
                    {referring && (
                      <p className="mt-1.5 text-xs text-[#6B7280]">
                        Included in the RHU referral for this consultation. BHC monitoring stays active.
                      </p>
                    )}
                    {stopping && (
                      <div className="mt-2">
                        <StopReason monitoringId={monitoring.id} value={stops[monitoring.id]} error={errors[`carePlanStop.${monitoring.id}`]} disabled={disabled} onChange={onStopChange} />
                      </div>
                    )}
                  </fieldset>
                </li>
              );
            })}
            {startingConditions.map((condition) => (
              <li key={`start-${condition.conditionId}`} className="py-3">
                <p className="text-sm font-semibold text-[#111827]">{condition.conditionName}</p>
                <p className="mt-0.5 text-xs text-[#6B7280]">
                  Start BHC Monitoring — confirmed by RHU{" "}
                  {condition.confirmedAt ? formatDate(condition.confirmedAt, condition.confirmedAt) : ""}
                </p>
              </li>
            ))}
          </ul>
          {/* Additional Clinical Notes: the visit's monitoring notes (monitoringNotes). */}
          <div className="mt-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#374151]">Additional Clinical Notes</p>
            <FieldTextarea
              label={notesLabel}
              name="monitoringNotes"
              value={monitoringNotes || ""}
              disabled={disabled}
              placeholder={notesPlaceholder}
              rows={3}
              onChange={(event) => onMonitoringNotesChange?.(event.target.value)}
            />
          </div>
        </section>
      )}
      {(showVisitReferralToggle || hasReferralDecision) && (
        <section aria-labelledby="shared-rhu-referral-title">
          {showVisitReferralToggle && !hasReferralDecision ? (
            <>
              <h2 id="shared-rhu-referral-title" className={SECTION_HEADING_CLASS}>RHU Referral</h2>
              <div className="mt-2">
                <ActionCheckbox
                  name="referToRhu"
                  label="Refer to RHU"
                  checked={referOn}
                  disabled={disabled}
                  onChange={onReferCheckedChange}
                />
              </div>
            </>
          ) : (
            <Card className="rounded-none border-slate-200 p-5 text-black shadow-sm">
              <h2 id="shared-rhu-referral-title" className={SECTION_HEADING_CLASS}>Refer to RHU</h2>
              <p className="mb-4 mt-1 text-xs text-[#6B7280]">{referralDecisionHint({ conditionReferred, monitoringReferred, referOn })}</p>
              {showVisitReferralToggle && (
                <div className="mb-4">
                  <ActionCheckbox
                    name="referToRhu"
                    label="Refer to RHU"
                    checked={referOn}
                    disabled={disabled}
                    onChange={onReferCheckedChange}
                  />
                </div>
              )}
              <div className="space-y-4">
                <Covers items={coverage} />
                <ReferralFields referral={referral} referralFacilityField={referralFacilityField} errors={errors} disabled={disabled} onReferralChange={onReferralChange} />
                {referOn && (
                  <ActionCheckbox
                    name="referralMultipleIssues"
                    label="This referral covers more than one health issue"
                    checked={nextActions.referralMultipleIssues === true}
                    disabled={disabled}
                    onChange={onMultipleIssuesChange}
                  />
                )}
                {acknowledgmentRequired && <Acknowledgment name="referralAcknowledged" label="All listed concerns can go to this facility with this priority." checked={referralAcknowledged} error={errors.referralAcknowledged} disabled={disabled} onChange={(checked) => onAcknowledgeChange?.(checked)} />}
              </div>
            </Card>
          )}
        </section>
      )}

      {treatmentSlot && (
        <section aria-labelledby="next-steps-treatment">
          <h2 id="next-steps-treatment" className={SECTION_HEADING_CLASS}>Actions Taken / Treatment</h2>
          <div className="mt-2 space-y-4">{treatmentSlot}</div>
        </section>
      )}

      {reportingSlot && <section>{reportingSlot}</section>}

      {earlierDraftNotes && (
        <section aria-labelledby="next-steps-earlier-notes">
          <h2 id="next-steps-earlier-notes" className={SECTION_HEADING_CLASS}>Earlier draft notes</h2>
          <p className="mt-1 whitespace-pre-wrap text-[13px] text-[#374151]">{earlierDraftNotes}</p>
        </section>
      )}

      {/* Read-only: the rest of a converted draft's text, kept in monitoringNotes
          because it did not fit one field (draftConversion.js). */}
      {earlierDraftContinued && (
        <section aria-labelledby="next-steps-earlier-notes-continued">
          <h2 id="next-steps-earlier-notes-continued" className={SECTION_HEADING_CLASS}>Earlier draft notes (continued)</h2>
          <p className="mt-1 text-xs text-[#6B7280]">
            The earlier draft had more text than fits in one field. The rest is kept here and saved with this visit.
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[13px] text-[#374151]">{earlierDraftContinued}</p>
        </section>
      )}
    </div>
  );
}
