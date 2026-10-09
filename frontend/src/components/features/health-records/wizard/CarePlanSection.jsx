import { TimePickerField } from "../../../common/forms/DatePickerField";
import { ClinicalFieldGroup, FieldInput, FieldTextarea, RadioChoiceGroup } from "../fields/ClinicalFields";
import { ATTENTION_LEVELS, DEFAULT_ATTENTION } from "../../../../utils/referralAttention";
import DiagnosisReportingField from "./DiagnosisReportingField";
import { CARE_PLAN_OPTIONS, NO_CONCERN_MESSAGE, carePlanFor } from "../../../../utils/carePlan";
import { formatDate } from "../../../../utils/formatters";
import { conditionStatusLabel } from "../../../../utils/medicalConditions";

const MONITORING_DECISIONS = [
  { value: "continue", label: "Continue Monitoring" },
  { value: "refer", label: "Refer back to RHU" },
  { value: "stop", label: "Stop BHC Monitoring" },
];

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

/**
 * Care Plan & Next Steps. Two separate things:
 * - "This visit's health concerns": what the worker typed, each with an
 *   optional next action (Recheck, Follow-up or Refer to RHU) and its reporting
 *   controls. A concern never starts or stops monitoring.
 * - "Condition Monitoring": monitoring the BHC already follows (continue,
 *   refer back to the RHU, or stop with a reason) and RHU-confirmed conditions
 *   it starts this visit. There is no clinical-status control: only the RHU
 *   sets a condition's status.
 * Then come the visit's single referral and single follow-up. A visit with no
 * concern and nothing monitored is a General Consultation: a plain empty
 * state. Every rule it shows comes from utils/carePlan.js.
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

  return (
    <div className="space-y-6">
      {concerns.length === 0 && !hasMonitoring && (
        <p className="border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-sm text-[#374151]">{NO_CONCERN_MESSAGE}</p>
      )}

      {concerns.length > 0 && (
        <section aria-labelledby="care-plan-concerns">
          <h2 id="care-plan-concerns" className="text-sm font-bold text-[#111827]">This visit&apos;s health concerns</h2>
          <ul className="mt-2 divide-y divide-[#E5E7EB] border-y border-[#E5E7EB]">
            {concerns.map((concern) => {
              const value = carePlanFor(concern);
              return (
                <li key={concern.id} className="py-3">
                  <fieldset disabled={disabled} className="min-w-0">
                    <legend className="text-sm font-semibold text-[#111827]">{concern.name}</legend>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
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
                    <div className="mt-2.5 border-t border-dashed border-[#E5E7EB] pt-2.5">
                      <DiagnosisReportingField
                        diagnosis={concern}
                        onChange={onReportAsChange}
                        onSurveillanceChange={onSurveillanceChange}
                      />
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
                      <p className="mt-1.5 text-xs text-[#6B7280]">BHC monitoring stays active; the referral is tracked separately.</p>
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

      {needsReferral && (
        <ClinicalFieldGroup
          title="Referral to RHU"
          subtitle="One referral for this visit. The RHU receives it and assigns the practitioner."
        >
          {/* RadioChoiceGroup has no disabled prop; the fieldset disables it. */}
          <fieldset disabled={disabled} className="min-w-0 space-y-4">
            {referralFacilityField}
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
            <FieldTextarea
              label="Reason for Referral"
              required
              name="reasonForReferral"
              value={referral.reason || ""}
              error={errors.reasonForReferral}
              rows={3}
              onChange={(event) => onReferralChange("reason", event.target.value)}
            />
          </fieldset>
        </ClinicalFieldGroup>
      )}

      {showsFollowUp && (
        <ClinicalFieldGroup
          title="Next follow-up"
          subtitle="Optional. Linked to every condition monitored in this visit."
        >
          <fieldset disabled={disabled} className="min-w-0 space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <FieldInput
                label="Follow-up Date"
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
            {followUp.date && (
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
