import { cloneElement, isValidElement } from "react";
import { TimePickerField } from "../../../common/forms/DatePickerField";
import { ClinicalFieldGroup, FieldInput, FieldTextarea, RadioChoiceGroup } from "../fields/ClinicalFields";
import { ATTENTION_LEVELS, DEFAULT_ATTENTION } from "../../../../utils/referralAttention";
import DiagnosisReportingField from "./DiagnosisReportingField";
import {
  CARE_PLAN_OPTIONS,
  NO_CONCERN_MESSAGE,
  carePlanFor,
  keepsBhcFollowUp,
  referredContinuingRows,
  refers,
} from "../../../../utils/carePlan";
import { carePlanFormHosts } from "../../../../utils/carePlanWorkspace";
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

/** "Concern A; Concern B" */
function joinNames(names) {
  return names.map((name) => String(name || "").trim()).filter(Boolean).join("; ");
}

/**
 * The visit's single referral: facility (with its availability panel and the
 * no-doctor warning), priority and reason. Drawn once - in the hosting concern
 * card, or below the cards when no concern hosts it.
 */
function ReferralFields({ referral, referralFacilityField, includedNames, errors, disabled, onReferralChange }) {
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
      {includedNames && (
        <p className="text-xs text-[#374151]">
          <span className="font-semibold">Included in this referral:</span> {includedNames}
        </p>
      )}
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
 * The visit's single follow-up. In a concern card the date is required (a
 * concern set to Recheck or Follow-up needs it - carePlanFollowUpErrors) and
 * so is the reason; below the cards both stay as before: the date optional,
 * the reason asked for once a date is set.
 */
function FollowUpFields({ followUp, errors, disabled, inCard, onFollowUpChange }) {
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <FieldInput
          label="Follow-up Date"
          required={inCard}
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
      {(inCard || followUp.date) && (
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

/**
 * The part of a concern card under its action that holds the hosted referral
 * or follow-up: flat, set off by a divider like the reporting part below it.
 */
function ActionDetails({ title, note, children }) {
  return (
    <div className="mt-3 border-t border-[#F3F4F6] pt-3">
      <p className={CONCERN_LABEL_CLASS}>{title}</p>
      {note && <p className="-mt-0.5 mb-2 text-xs text-[#6B7280]">{note}</p>}
      {children}
    </div>
  );
}

/**
 * Recheck and Follow-up both schedule the visit's single follow-up, so both
 * draw this same section; the concern keeps its own action value.
 */
function NextVisitDetails({ sharedWith = [], children }) {
  return (
    <ActionDetails
      title="Next Visit Details"
      note={sharedWith.length ? `Also applies to Health Concern ${sharedWith.join(", ")}.` : null}
    >
      {children}
    </ActionDetails>
  );
}

/** A concern sharing the referral or follow-up drawn in another card. */
function SharedNote({ children }) {
  return <p className="mt-2 border-l-2 border-[#D1D5DB] pl-2 text-xs text-[#6B7280]">{children}</p>;
}

/**
 * Care Plan & Next Steps. Two separate things:
 * - "This visit's health concerns": one card per concern the worker typed, in
 *   order - its optional next action (Recheck, Follow-up or Refer to RHU), the
 *   details that action needs, and its reporting controls. A concern never
 *   starts or stops monitoring.
 * - "Condition Monitoring": monitoring the BHC already follows (continue,
 *   refer back to the RHU, or stop with a reason) and RHU-confirmed conditions
 *   it starts this visit. There is no clinical-status control: only the RHU
 *   sets a condition's status.
 *
 * The visit still has ONE referral and ONE follow-up. Each is drawn in the
 * first concern card whose action needs it, and the other concerns with that
 * action say they share it (carePlanFormHosts). When no concern needs it but
 * the visit still does - a followed condition referred back, continuing
 * monitoring, a service visit - it is drawn below the cards as before. A
 * visit with no concern and nothing monitored is a General Consultation: a
 * plain empty state. Every rule it shows comes from utils/carePlan.js.
 */
export default function CarePlanSection({
  concerns = [], continuedMonitorings = [], startingConditions = [], stops = {},
  referrals = [],
  followUp = {}, referral = {}, referralFacilityField = null, showsFollowUp = false,
  needsReferral = false, errors = {}, disabled = false,
  notes = "", notesLabel = "Monitoring Notes", notesPlaceholder = "Write monitoring notes if useful...",
  onCarePlanChange, onStopChange, onMonitoringDecision, onFollowUpChange, onReferralChange, onNotesChange,
  onReportAsChange, onSurveillanceChange,
}) {
  const hasMonitoring = continuedMonitorings.length > 0 || startingConditions.length > 0;
  const hosts = carePlanFormHosts(concerns, { needsReferral, showsFollowUp });
  const numberOf = (id) => concerns.findIndex((concern) => concern.id === id) + 1;
  const nameOf = (id) => concerns.find((concern) => concern.id === id)?.name;
  const referredFollowed = referredContinuingRows(continuedMonitorings, stops, referrals);
  const referralIncludes = joinNames([
    ...hosts.referredConcernIds.map(nameOf),
    ...referredFollowed.map((monitoring) => monitoring.conditionName),
  ]);

  const referralFields = (
    <ReferralFields
      referral={referral}
      referralFacilityField={referralFacilityField}
      includedNames={referralIncludes}
      errors={errors}
      disabled={disabled}
      onReferralChange={onReferralChange}
    />
  );
  const followUpFields = (inCard) => (
    <FollowUpFields
      followUp={followUp}
      errors={errors}
      disabled={disabled}
      inCard={inCard}
      onFollowUpChange={onFollowUpChange}
    />
  );

  /** The referral or follow-up under a concern's action: the form in its host card, a note in the others. */
  function actionDetails(concern) {
    const value = carePlanFor(concern);
    if (keepsBhcFollowUp(value) && hosts.followUpHostId) {
      if (concern.id !== hosts.followUpHostId) {
        return <SharedNote>Uses the next visit set under Health Concern {numberOf(hosts.followUpHostId)}.</SharedNote>;
      }
      const others = hosts.followUpConcernIds.filter((id) => id !== concern.id).map(numberOf);
      return <NextVisitDetails sharedWith={others}>{followUpFields(true)}</NextVisitDetails>;
    }
    if (refers(value) && hosts.referralHostId) {
      if (concern.id !== hosts.referralHostId) {
        return <SharedNote>Included in the referral set under Health Concern {numberOf(hosts.referralHostId)}.</SharedNote>;
      }
      return (
        <ActionDetails
          title="Referral to RHU"
          note="One referral for this visit. The RHU receives it and assigns the practitioner."
        >
          {referralFields}
        </ActionDetails>
      );
    }
    return null;
  }

  return (
    <div className="space-y-6">
      {concerns.length === 0 && !hasMonitoring && (
        <p className="border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-sm text-[#374151]">{NO_CONCERN_MESSAGE}</p>
      )}

      {concerns.length > 0 && (
        <section aria-labelledby="care-plan-concerns">
          <h2 id="care-plan-concerns" className="text-sm font-bold text-[#111827]">This visit&apos;s health concerns</h2>
          {/* One card per concern, in order: its number and name, its next
              action with that action's details, then its reporting. */}
          <ul className="mt-2 space-y-3">
            {concerns.map((concern, index) => {
              const value = carePlanFor(concern);
              const headingId = `care-plan-concern-${concern.id}`;
              const actionLabelId = `${headingId}-action`;
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
                      <div>
                        <div role="radiogroup" aria-labelledby={actionLabelId}>
                          <p id={actionLabelId} className={CONCERN_LABEL_CLASS}>Care Plan Action</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                            {CARE_PLAN_OPTIONS.map((option) => {
                              const checked = value === option.value;
                              return (
                                <label key={option.value} className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                                  <input
                                    type="radio"
                                    name={`care-plan-${concern.id}`}
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
                        </div>
                        {actionDetails(concern)}
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
                    {monitoring.legacy && (
                      <p className="mt-0.5 text-xs font-semibold text-[#92400E]">Legacy BHC Monitoring</p>
                    )}
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
                        {hosts.referralHostId
                          ? `Included in the referral set under Health Concern ${numberOf(hosts.referralHostId)}. BHC monitoring stays active.`
                          : "BHC monitoring stays active; the referral is tracked separately."}
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

      {/* The referral / follow-up no concern card hosts (see carePlanFormHosts). */}
      {hosts.referralOutsideCards && (
        <ClinicalFieldGroup
          title="Referral to RHU"
          subtitle="One referral for this visit. The RHU receives it and assigns the practitioner."
        >
          {referralFields}
        </ClinicalFieldGroup>
      )}

      {hosts.followUpOutsideCards && (
        <ClinicalFieldGroup
          title="Next follow-up"
          subtitle="Optional. Linked to every condition monitored in this visit."
        >
          {followUpFields(false)}
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
