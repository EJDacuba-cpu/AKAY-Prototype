import { cloneElement, isValidElement } from "react";
import { TimePickerField } from "../../../common/forms/DatePickerField";
import { FieldInput, FieldTextarea, RadioChoiceGroup } from "../fields/ClinicalFields";
import { ATTENTION_LEVELS, DEFAULT_ATTENTION } from "../../../../utils/referralAttention";
import { formatDate } from "../../../../utils/formatters";
import { conditionStatusLabel } from "../../../../utils/medicalConditions";
import { Card } from "../../../ui/card";
import {
  CARE_PLAN_SERVICE_LABELS,
  SERVICE_NEXT_ACTIONS,
  defaultServicePurpose,
  serviceNextAction,
  serviceSchedule,
  suggestionsForProgram,
} from "../../../../utils/serviceNextActions";
import { followUpDateWarnings } from "../../../../utils/nextActions";
import { servicePurposeKey } from "../../../../utils/followUpSchedules";

const MONITORING_DECISIONS = [
  { value: "continue", label: "Continue Monitoring" },
  { value: "refer", label: "Refer back to RHU" },
  { value: "stop", label: "Stop BHC Monitoring" },
];

const SERVICE_NEXT_ACTION_OPTIONS = Object.entries(SERVICE_NEXT_ACTIONS).map(([value, label]) => ({ value, label }));

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
 * Service-proposed return dates (EPI next dose, FP next appointment). Shown
 * only after Schedule next visit is chosen; "Use this date" fills that
 * service's date and never starts a schedule or referral on its own.
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

function referralDecisionHint({ conditionReferred, monitoringReferred, serviceReferred, referOn }) {
  if (conditionReferred && serviceReferred) {
    return "From concerns and selected health services marked Refer to RHU. Change those outcomes to cancel this referral.";
  }
  if (conditionReferred) return "From conditions marked Refer to RHU. Change the condition outcome to cancel this referral.";
  if (serviceReferred) return "From selected health services marked Refer to RHU. Change the service next action to cancel this referral.";
  if (monitoringReferred && !referOn) return "From condition monitoring. Change the monitoring decision to cancel this referral.";
  return "One referral for this consultation.";
}

function serviceNextActionHint(action) {
  if (action === "none") return "No additional return or referral is required for this service.";
  if (action === "schedule") return "Schedule a BHC return for this service only.";
  if (action === "refer_to_rhu") return "Include this service in the RHU referral for this consultation.";
  return "Choose no additional action, a BHC return, or referral for this service.";
}

function ServiceFollowUp({ program, schedule, errors, disabled, suggestions, onFollowUpChange }) {
  const purposeKey = servicePurposeKey(program);
  const followUp = {
    date: schedule?.date || "",
    time: schedule?.time || "",
    purpose: schedule?.purpose || defaultServicePurpose(program),
  };
  const warnings = followUpDateWarnings(followUp.date, suggestions);
  return (
    <div className="space-y-3">
      <FollowUpFields
        followUp={{ date: followUp.date, time: followUp.time, purpose: followUp.purpose, reason: followUp.purpose }}
        errors={errors}
        disabled={disabled}
        reasonRequired
        dateName={`followUpSchedule.${purposeKey}.date`}
        timeName={`followUpSchedule.${purposeKey}.time`}
        reasonName={`followUpSchedule.${purposeKey}.purpose`}
        onFollowUpChange={(field, value) => onFollowUpChange?.({
          ...followUp,
          [field === "reason" ? "purpose" : field]: value,
        })}
      />
      <DateSuggestions
        suggestions={suggestions}
        disabled={disabled}
        onUse={(date) => onFollowUpChange?.({ ...followUp, date })}
      />
      <DateWarnings warnings={warnings} />
    </div>
  );
}

/**
 * Assessment & Care Plan remainder: Selected Health Services next actions,
 * the shared RHU referral panel, monitoring, and treatment. Concern
 * follow-ups live on each concern row.
 */
export default function NextStepsSection({
  continuedMonitorings = [], startingConditions = [], stops = {}, referrals = [],
  referralFacilityField = null, errors = {}, disabled = false,
  onStopChange, onMonitoringDecision,
  monitoringNotes = "", notesLabel = "Monitoring Notes", notesPlaceholder = "Write monitoring notes if useful...",
  onMonitoringNotesChange,
  nextActions = {},
  suggestions = [],
  referral = {}, onReferralChange, coverage = [],
  acknowledgmentRequired = false, referralAcknowledged = false, onAcknowledgeChange,
  treatmentSlot = null, reportingSlot = null, earlierDraftNotes = "", earlierDraftContinued = "",
  conditionReferred = false,
  selectedPrograms = [], followUpSchedules = [], serviceReferrals = [],
  onServiceNextAction, onServiceFollowUp,
  hideReferToRhu = false,
}) {
  const hasMonitoring = continuedMonitorings.length > 0 || startingConditions.length > 0;
  const referredIds = new Set(referrals.map(Number));
  const monitoringReferred = continuedMonitorings.some(
    (monitoring) => referredIds.has(Number(monitoring.id)) && !Object.hasOwn(stops, monitoring.id),
  );
  const namedServiceReferrals = serviceReferrals || [];
  const serviceReferred = namedServiceReferrals.length > 0;
  const referOn = nextActions.referToRhu === true || serviceReferred;
  const hasReferralDecision = conditionReferred || monitoringReferred || serviceReferred || nextActions.referToRhu === true;

  return (
    <div className="divide-y divide-[#E5E7EB] [&>section]:py-5 [&>section:first-child]:pt-0 [&>section:last-child]:pb-0">
      <section aria-labelledby="selected-health-services-title">
        <h2 id="selected-health-services-title" className={SECTION_HEADING_CLASS}>Selected Health Services</h2>
        {selectedPrograms.length === 0 ? (
          <p className="mt-2 text-xs text-[#6B7280]">No health services selected for this consultation.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[#E5E7EB]">
            {selectedPrograms.map((program) => {
              const action = serviceNextAction(program, { schedules: followUpSchedules, serviceReferrals: namedServiceReferrals });
              const schedule = serviceSchedule(program, followUpSchedules);
              const programSuggestions = suggestionsForProgram(program, suggestions);
              return (
                <li key={program} className="py-3 first:pt-2">
                  <fieldset disabled={disabled} className="min-w-0 space-y-2">
                    <legend className="text-sm font-semibold text-[#111827]">{CARE_PLAN_SERVICE_LABELS[program] || program}</legend>
                    <RadioChoiceGroup
                      label="Next action"
                      name={`serviceNextAction.${program}`}
                      inline
                      options={hideReferToRhu
                        ? SERVICE_NEXT_ACTION_OPTIONS.filter((option) => option.value !== "refer_to_rhu")
                        : SERVICE_NEXT_ACTION_OPTIONS}
                      value={hideReferToRhu && action === "refer_to_rhu" ? "none" : action}
                      onChange={(value) => onServiceNextAction?.(program, value)}
                    />
                    <p className="text-xs text-[#6B7280]">{serviceNextActionHint(action)}</p>
                    {action === "schedule" && (
                      <ServiceFollowUp
                        program={program}
                        schedule={schedule}
                        errors={errors}
                        disabled={disabled}
                        suggestions={programSuggestions}
                        onFollowUpChange={(next) => onServiceFollowUp?.(program, next)}
                      />
                    )}
                  </fieldset>
                </li>
              );
            })}
          </ul>
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
      {hasReferralDecision && !hideReferToRhu && (
        <section aria-labelledby="shared-rhu-referral-title">
          <Card className="rounded-none border-slate-200 p-5 text-black shadow-sm">
            <h2 id="shared-rhu-referral-title" className={SECTION_HEADING_CLASS}>Refer to RHU</h2>
            <p className="mb-4 mt-1 text-xs text-[#6B7280]">{referralDecisionHint({ conditionReferred, monitoringReferred, serviceReferred, referOn })}</p>
            <div className="space-y-4">
              <Covers items={coverage} />
              <ReferralFields referral={referral} referralFacilityField={referralFacilityField} errors={errors} disabled={disabled} onReferralChange={onReferralChange} />
              {acknowledgmentRequired && <Acknowledgment name="referralAcknowledged" label="All listed concerns can go to this facility with this priority." checked={referralAcknowledged} error={errors.referralAcknowledged} disabled={disabled} onChange={(checked) => onAcknowledgeChange?.(checked)} />}
            </div>
          </Card>
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
