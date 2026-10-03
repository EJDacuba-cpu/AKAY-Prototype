import { TimePickerField } from "../../../common/forms/DatePickerField";
import { ClinicalFieldGroup, FieldInput, FieldTextarea, RadioChoiceGroup } from "../fields/ClinicalFields";
import { ATTENTION_LEVELS, DEFAULT_ATTENTION } from "../../../../utils/referralAttention";
import DiagnosisReportingField from "./DiagnosisReportingField";
import {
  CARE_PLAN, CARE_PLAN_OPTIONS, NO_CONDITION_MESSAGE, carePlanFor, continuedByIdentity, conditionIdentity,
  continuingRows, endsMonitoring,
} from "../../../../utils/carePlan";

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
 * Care Plan & Next Steps. With no suspected condition the visit is a General
 * Consultation: a plain empty state, no condition controls (the visit is still
 * saved and counted from its own record). With conditions, one row per
 * condition holds its care plan (No Ongoing Tracking unless the worker changes
 * it, Monitor at BHC for a continued one) and its reporting controls, then come
 * the continued monitoring brought into this visit and the visit's single
 * referral and single follow-up. Every rule it shows comes from utils/carePlan.js.
 */
export default function CarePlanSection({
  diagnoses = [], continuedMonitorings = [], activeMonitorings = [], stops = {}, registry = {},
  followUp = {}, referral = {}, referralFacilityField = null, showsFollowUp = false,
  needsReferral = false, errors = {}, disabled = false,
  notes = "", notesLabel = "Monitoring Notes", notesPlaceholder = "Write monitoring notes if useful...",
  onCarePlanChange, onStopChange, onFollowUpChange, onReferralChange, onNotesChange,
  onReportAsChange, onSurveillanceChange,
}) {
  const continuedMap = continuedByIdentity(continuedMonitorings, registry);
  const activeMap = continuedByIdentity(activeMonitorings, registry);
  const rows = continuingRows(diagnoses, continuedMonitorings, registry);

  return (
    <div className="space-y-6">
      {diagnoses.length === 0 && rows.length === 0 && (
        <p className="border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-sm text-[#374151]">{NO_CONDITION_MESSAGE}</p>
      )}

      {diagnoses.length > 0 && (
        <section aria-labelledby="care-plan-diagnoses">
          <h2 id="care-plan-diagnoses" className="text-sm font-bold text-[#111827]">This visit&apos;s suspected conditions</h2>
          <ul className="mt-2 divide-y divide-[#E5E7EB] border-y border-[#E5E7EB]">
            {diagnoses.map((diagnosis) => {
              const value = carePlanFor(diagnosis, continuedMonitorings, registry);
              const identity = conditionIdentity(diagnosis.name, registry);
              const continued = continuedMap.get(identity);
              const alreadyActive = continued || activeMap.get(identity);
              return (
                <li key={diagnosis.id} className="py-3">
                  <fieldset disabled={disabled} className="min-w-0">
                    <legend className="text-sm font-semibold text-[#111827]">{diagnosis.name}</legend>
                    {alreadyActive && (
                      <p className="mt-0.5 text-xs text-[#6B7280]">
                        Monitored at BHC{alreadyActive.startedAt ? ` since ${alreadyActive.startedAt}` : ""}
                        {continued
                          ? value === CARE_PLAN.REFER
                            ? " — stays active; the referral is tracked separately."
                            : " — continued in this visit."
                          : ". Choosing Monitor adds this visit to it."}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                      {CARE_PLAN_OPTIONS.map((option) => {
                        const checked = value === option.value;
                        return (
                          <label key={option.value} className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                            <input
                              type="radio"
                              name={`care-plan-${diagnosis.id}`}
                              value={option.value}
                              checked={checked}
                              onChange={() => onCarePlanChange(diagnosis.id, option.value)}
                              className="h-4 w-4 accent-[#DC2626]"
                            />
                            <span className={checked ? "font-semibold text-[#DC2626]" : "text-gray-600"}>{option.label}</span>
                          </label>
                        );
                      })}
                    </div>
                    {continued && endsMonitoring(value) && (
                      <div className="mt-2">
                        <StopReason monitoringId={continued.id} value={stops[continued.id]} error={errors[`carePlanStop.${continued.id}`]} disabled={disabled} onChange={onStopChange} />
                      </div>
                    )}
                    <div className="mt-2.5 border-t border-dashed border-[#E5E7EB] pt-2.5">
                      <DiagnosisReportingField
                        diagnosis={diagnosis}
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

      {rows.length > 0 && (
        <section aria-labelledby="care-plan-continuing">
          <h2 id="care-plan-continuing" className="text-sm font-bold text-[#111827]">Monitored conditions addressed in this visit</h2>
          <ul className="mt-2 divide-y divide-[#E5E7EB] border-y border-[#E5E7EB]">
            {rows.map((monitoring) => {
              const stopping = Object.hasOwn(stops, monitoring.id);
              return (
                <li key={monitoring.id} className="py-3">
                  <fieldset disabled={disabled} className="min-w-0">
                    <legend className="text-sm font-semibold text-[#111827]">{monitoring.conditionName}</legend>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                      <label className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                        <input type="radio" name={`continue-${monitoring.id}`} checked={!stopping} onChange={() => onStopChange(monitoring.id, null)} className="h-4 w-4 accent-[#DC2626]" />
                        <span className={!stopping ? "font-semibold text-[#DC2626]" : "text-gray-600"}>Continue monitoring</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-1.5 text-[13px]">
                        <input type="radio" name={`continue-${monitoring.id}`} checked={stopping} onChange={() => onStopChange(monitoring.id, "")} className="h-4 w-4 accent-[#DC2626]" />
                        <span className={stopping ? "font-semibold text-[#DC2626]" : "text-gray-600"}>Stop monitoring</span>
                      </label>
                    </div>
                    {stopping && (
                      <div className="mt-2">
                        <StopReason monitoringId={monitoring.id} value={stops[monitoring.id]} error={errors[`carePlanStop.${monitoring.id}`]} disabled={disabled} onChange={onStopChange} />
                      </div>
                    )}
                  </fieldset>
                </li>
              );
            })}
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
