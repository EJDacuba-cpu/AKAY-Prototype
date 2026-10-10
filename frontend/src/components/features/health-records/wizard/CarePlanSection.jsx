import { cloneElement, isValidElement } from "react";
import { TimePickerField } from "../../../common/forms/DatePickerField";
import { ClinicalFieldGroup, FieldError, FieldInput, FieldTextarea, RadioChoiceGroup } from "../fields/ClinicalFields";
import { ATTENTION_LEVELS, DEFAULT_ATTENTION } from "../../../../utils/referralAttention";
import DiagnosisReportingField from "./DiagnosisReportingField";
import {
  CARE_PLAN,
  CARE_PLAN_OPTIONS,
  NO_CONCERN_MESSAGE,
  carePlanFor,
  schedulesBhcFollowUp,
  refers,
} from "../../../../utils/carePlan";
import { formatDate } from "../../../../utils/formatters";
import { conditionStatusLabel } from "../../../../utils/medicalConditions";

const MONITORING_DECISIONS = [
  { value: "continue", label: "Continue Monitoring" },
  { value: "refer", label: "Refer back to RHU" },
  { value: "stop", label: "Stop BHC Monitoring" },
];

// Labels of the parts of one concern's card.
const CONCERN_LABEL_CLASS = "mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#374151]";

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

/** "Concern 1 — Wound; Hypertension monitoring" */
function joinNames(names) {
  return names.map((name) => String(name || "").trim()).filter(Boolean).join("; ");
}

/** What the shared follow-up or referral applies to (carePlanCoverage). */
function Covers({ items = [] }) {
  if (items.length === 0) return null;
  return (
    <p className="mb-3 text-xs text-[#374151]">
      <span className="font-semibold">Covers:</span> {joinNames(items)}
    </p>
  );
}

/**
 * The worker confirms one date, or one facility and priority, suits every
 * listed item (H7). Unticked, Continue is blocked with the inline error below;
 * nothing entered is cleared.
 */
function Acknowledgment({ name, label, checked, error, disabled, onChange }) {
  return (
    <div className="mt-3">
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
 * no-doctor warning), priority and reason. Drawn once, in RHU Referral Details.
 */
function ReferralFields({ referral, referralFacilityField, errors, disabled, onReferralChange }) {
  const priority = (
    <RadioChoiceGroup
      label="Referral Priority"
      name="urgencyLevel"
      required
      inline
      options={ATTENTION_LEVELS}
      value={referral.urgencyLevel || DEFAULT_ATTENTION}
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
 * The visit's single follow-up. When a concern schedules it the date is
 * required (carePlanFollowUpErrors) and the reason is always asked for;
 * otherwise (monitoring or a service visit only) the date stays optional and
 * the reason is asked for once a date is set.
 */
function FollowUpFields({ followUp, errors, disabled, dateRequired, onFollowUpChange }) {
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <FieldInput
          label="Follow-up Date"
          required={dateRequired}
          type="date"
          name="followUpDate"
          value={followUp.date || ""}
          error={errors.followUpDate}
          onChange={(event) => onFollowUpChange("date", event.target.value)}
        />
        <TimePickerField
          label="Follow-up Time"
          name="followUpTime"
          value={followUp.time || ""}
          error={errors.followUpTime}
          disabled={disabled}
          onChange={(value) => onFollowUpChange("time", value)}
        />
      </div>
      {(dateRequired || followUp.date) && (
        <FieldTextarea
          label="Follow-up Reason"
          required
          name="followUpReason"
          value={followUp.reason || ""}
          error={errors.followUpReason}
          rows={2}
          placeholder="Why should the patient return?"
          onChange={(event) => onFollowUpChange("reason", event.target.value)}
        />
      )}
    </fieldset>
  );
}

/** Under a concern's action: which shared section below holds its follow-up or referral. */
function PointerLine({ children }) {
  return <p className="border-l-2 border-[#D1D5DB] pl-2 text-xs text-[#6B7280]">{children}</p>;
}

/**
 * Care Plan & Next Steps, top to bottom:
 * - "This visit's health concerns": one card per concern the worker typed, in
 *   order - its required Care Plan Action (no default), the BHC follow-up flag
 *   under Refer to RHU, a pointer to the shared section that holds its
 *   follow-up or referral, and its reporting controls. A concern never starts
 *   or stops monitoring.
 * - "Condition Monitoring": monitoring the BHC already follows (continue,
 *   refer back to the RHU, or stop with a reason) and RHU-confirmed conditions
 *   it starts this visit. There is no clinical-status control: only the RHU
 *   sets a condition's status.
 * - BHC Follow-up Details and RHU Referral Details: the visit's ONE follow-up
 *   and ONE referral, each with what it covers (carePlanCoverage) and the
 *   acknowledgment that one date / one facility and priority suits them all -
 *   when 2 or more concerns schedule the follow-up, or the referral covers 2
 *   or more items.
 * - Additional Clinical Notes.
 * A visit with no concern and nothing monitored is a General Consultation: a
 * plain empty state. Every rule it shows comes from utils/carePlan.js.
 */
export default function CarePlanSection({
  concerns = [], continuedMonitorings = [], startingConditions = [], stops = {},
  referrals = [],
  followUp = {}, referral = {}, referralFacilityField = null, showsFollowUp = false,
  needsReferral = false, errors = {}, disabled = false,
  coverage = {}, followUpAcknowledged = false, referralAcknowledged = false,
  notes = "", notesLabel = "Monitoring Notes", notesPlaceholder = "Write monitoring notes if useful...",
  onCarePlanChange, onBhcFollowUpChange, onStopChange, onMonitoringDecision, onFollowUpChange, onReferralChange,
  onAcknowledgeChange, onNotesChange, onReportAsChange, onSurveillanceChange,
}) {
  const hasMonitoring = continuedMonitorings.length > 0 || startingConditions.length > 0;
  const followUpCovers = coverage.followUpCovers || [];
  const referralCovers = coverage.referralCovers || [];
  const followUpConcernCount = coverage.followUpConcernCount || 0;
  const followUpDateRequired = concerns.some(schedulesBhcFollowUp);

  return (
    <div className="space-y-6">
      {concerns.length === 0 && !hasMonitoring && (
        <p className="border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-sm text-[#374151]">{NO_CONCERN_MESSAGE}</p>
      )}

      {concerns.length > 0 && (
        <section aria-labelledby="care-plan-concerns">
          <h2 id="care-plan-concerns" className="text-sm font-bold text-[#111827]">This visit&apos;s health concerns</h2>
          {/* One card per concern, in order: its number and name, its care plan
              action and where its follow-up / referral is set, then its reporting. */}
          <ul className="mt-2 space-y-3">
            {concerns.map((concern, index) => {
              const value = carePlanFor(concern);
              const headingId = `care-plan-concern-${concern.id}`;
              const actionLabelId = `${headingId}-action`;
              const actionErrorKey = `carePlanAction.${concern.id}`;
              const actionError = errors[actionErrorKey];
              return (
                <li key={concern.id} className="border border-[#E5E7EB] bg-white">
                  <fieldset disabled={disabled} aria-labelledby={headingId} className="min-w-0">
                    <h3
                      id={headingId}
                      className="break-words border-b border-[#E5E7EB] px-3 py-2 text-sm font-semibold text-[#111827]"
                    >
                      <span className="text-[#6B7280]">Health Concern {index + 1}</span>
                      <span aria-hidden="true" className="mx-1.5 text-[#D1D5DB]">—</span>
                      {concern.name}
                    </h3>
                    <div className="space-y-3 px-3 py-3">
                      <div className="space-y-2">
                        <div role="radiogroup" aria-labelledby={actionLabelId} aria-invalid={Boolean(actionError)}>
                          <p id={actionLabelId} className={CONCERN_LABEL_CLASS}>
                            Care Plan Action <span className="text-red-500">*</span>
                          </p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                            {CARE_PLAN_OPTIONS.map((option, optionIndex) => {
                              const checked = value === option.value;
                              return (
                                <label key={option.value} className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                                  <input
                                    type="radio"
                                    name={`care-plan-${concern.id}`}
                                    // The first option takes focus when no action was chosen.
                                    data-field={optionIndex === 0 ? actionErrorKey : undefined}
                                    value={option.value}
                                    checked={checked}
                                    onChange={() => onCarePlanChange(concern.id, option.value)}
                                    className="h-4 w-4 accent-[#DC2626]"
                                  />
                                  <span className={checked ? "font-semibold text-[#DC2626]" : "text-gray-600"}>{option.label}</span>
                                </label>
                              );
                            })}
                          </div>
                          <FieldError error={actionError} />
                        </div>
                        {value === CARE_PLAN.REFER && (
                          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[13px]">
                            <input
                              type="checkbox"
                              checked={concern.bhcFollowUp === true}
                              onChange={(event) => onBhcFollowUpChange(concern.id, event.target.checked)}
                              className="h-4 w-4 accent-[#DC2626]"
                            />
                            <span className={concern.bhcFollowUp === true ? "font-semibold text-[#DC2626]" : "text-gray-600"}>
                              Also schedule a BHC follow-up for this concern
                            </span>
                          </label>
                        )}
                        {/* A flagged referral points to both sections. */}
                        {schedulesBhcFollowUp(concern) && showsFollowUp && (
                          <PointerLine>Covered by BHC Follow-up Details below</PointerLine>
                        )}
                        {refers(value) && needsReferral && <PointerLine>Included in RHU Referral Details below</PointerLine>}
                      </div>
                      <div className="border-t border-[#F3F4F6] pt-3">
                        <DiagnosisReportingField
                          diagnosis={concern}
                          labelClassName={CONCERN_LABEL_CLASS}
                          onChange={onReportAsChange}
                          onSurveillanceChange={onSurveillanceChange}
                        />
                      </div>
                    </div>
                  </fieldset>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {hasMonitoring && (
        <section aria-labelledby="care-plan-monitoring">
          <h2 id="care-plan-monitoring" className="text-sm font-bold text-[#111827]">Condition Monitoring</h2>
          <ul className="mt-2 divide-y divide-[#E5E7EB] border-y border-[#E5E7EB]">
            {continuedMonitorings.map((monitoring) => {
              const stopping = Object.hasOwn(stops, monitoring.id);
              const referring = !stopping && referrals.map(Number).includes(Number(monitoring.id));
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
                        Included in RHU Referral Details below. BHC monitoring stays active.
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
        </section>
      )}

      {/* The visit's one follow-up and one referral, with what each covers. */}
      {showsFollowUp && (
        <ClinicalFieldGroup title="BHC Follow-up Details" subtitle="One BHC follow-up for this visit.">
          <Covers items={followUpCovers} />
          <FollowUpFields
            followUp={followUp}
            errors={errors}
            disabled={disabled}
            dateRequired={followUpDateRequired}
            onFollowUpChange={onFollowUpChange}
          />
          {/* Only concerns count: monitoring and the service visit are listed, not confirmed. */}
          {followUpConcernCount >= 2 && (
            <Acknowledgment
              name="followUpAcknowledged"
              label="One follow-up date is clinically appropriate for all listed concerns."
              checked={followUpAcknowledged}
              error={errors.followUpAcknowledged}
              disabled={disabled}
              onChange={(checked) => onAcknowledgeChange?.("followUp", checked)}
            />
          )}
        </ClinicalFieldGroup>
      )}

      {needsReferral && (
        <ClinicalFieldGroup
          title="RHU Referral Details"
          subtitle="One referral for this visit. The RHU receives it and assigns the practitioner."
        >
          <Covers items={referralCovers} />
          <ReferralFields
            referral={referral}
            referralFacilityField={referralFacilityField}
            errors={errors}
            disabled={disabled}
            onReferralChange={onReferralChange}
          />
          {referralCovers.length >= 2 && (
            <Acknowledgment
              name="referralAcknowledged"
              label="All listed concerns can go to this facility with this priority."
              checked={referralAcknowledged}
              error={errors.referralAcknowledged}
              disabled={disabled}
              onChange={(checked) => onAcknowledgeChange?.("referral", checked)}
            />
          )}
        </ClinicalFieldGroup>
      )}

      {/* Always offered, as the Next Action step did: the visit's monitoring /
          return-visit notes (monitoringNotes), shown on the saved record. */}
      <ClinicalFieldGroup
        title="Additional Clinical Notes"
        subtitle="Optional internal notes for this consultation."
      >
        <FieldTextarea
          label={notesLabel}
          name="monitoringNotes"
          value={notes || ""}
          disabled={disabled}
          placeholder={notesPlaceholder}
          rows={3}
          onChange={(event) => onNotesChange?.(event.target.value)}
        />
      </ClinicalFieldGroup>
    </div>
  );
}
