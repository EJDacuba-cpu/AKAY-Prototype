import { Trash2 } from "lucide-react";

import { TimePickerField } from "../../../common/forms/DatePickerField";
import { Button } from "../../../ui/button";
import { Input } from "../../../ui/input";
import PrescribedMedicinesSection from "../PrescribedMedicinesSection";
import { FieldError, FieldInput, FieldTextarea, RadioChoiceGroup } from "../fields/ClinicalFields";
import NextStepsSection from "./NextStepsSection";
import { createDiagnosisId, DIAGNOSIS_LIMITS } from "../../../../utils/diagnoses";
import { entryPurposeKey } from "../../../../utils/followUpSchedules";
import {
  applyRhuNextAction,
  diagnosisActivateConfirmed,
  diagnosisNextAction,
  emptyRhuDiagnosis,
  matchingMonitorableCondition,
  RHU_NEXT_ACTION_OPTIONS,
} from "../../../../utils/rhuCarePlan";
import {
  TB_DIAGNOSIS_TYPE_OPTIONS,
  TB_DRUG_RESISTANCE_OPTIONS,
} from "../TbTreatmentCardForm";
import {
  canOpenDsTbTreatmentCard,
  isDrTb,
  isRecognizedTbDiagnosis,
  isTbInfection,
  tbManagementFields,
  tbManagementFor,
} from "../../../../utils/rhuTbCaseManagement";

function scheduleFor(entry, schedules) {
  const purposeKey = entryPurposeKey(entry?.id);
  return (schedules || []).find((item) => item?.purposeKey === purposeKey) || null;
}

function DiagnosisFollowUp({ entry, schedule, errors, disabled, onFollowUpChange }) {
  const purposeKey = entryPurposeKey(entry.id);
  const followUp = {
    date: schedule?.date || "",
    time: schedule?.time || "",
    purpose: schedule?.purpose || entry.name || "",
  };
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3 border-t border-[#E5EEFF] pt-2">
      <div className="grid gap-3 md:grid-cols-2">
        <FieldInput
          label="Follow-up Date"
          required
          type="date"
          name={`followUpSchedule.${purposeKey}.date`}
          value={followUp.date}
          error={errors[`followUpSchedule.${purposeKey}.date`]}
          onChange={(event) => onFollowUpChange({ ...followUp, date: event.target.value })}
        />
        <TimePickerField
          label="Follow-up Time"
          name={`followUpSchedule.${purposeKey}.time`}
          value={followUp.time}
          error={errors[`followUpSchedule.${purposeKey}.time`]}
          disabled={disabled}
          onChange={(value) => onFollowUpChange({ ...followUp, time: value })}
        />
      </div>
      <FieldTextarea
        label="Follow-up Reason"
        maxLength={1000}
        required
        name={`followUpSchedule.${purposeKey}.purpose`}
        value={followUp.purpose}
        error={errors[`followUpSchedule.${purposeKey}.purpose`]}
        rows={2}
        placeholder="Why should the patient return to the RHU?"
        onChange={(event) => onFollowUpChange({ ...followUp, purpose: event.target.value })}
      />
    </fieldset>
  );
}

function TbCaseManagementSection({ entry, registry, existingTbCase, disabled, onChange }) {
  if (!isRecognizedTbDiagnosis(entry?.name, registry)) return null;
  const management = tbManagementFields(entry);
  const blocked = isTbInfection(entry) || isDrTb(entry);
  const canOpen = canOpenDsTbTreatmentCard(entry);
  const registered = String(existingTbCase?.tbCaseNumber || "").trim();
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3 border-t border-[#E5EEFF] pt-3">
      <div>
        <p className="text-sm font-semibold text-[#0B1C30]">TB Case Management</p>
        <p className="mt-0.5 text-xs text-[#545F73]">
          Evaluation does not register a treatment case. Opening Form 4B is a separate decision from confirming an Active Patient Condition.
        </p>
      </div>
      {registered ? (
        <p className="text-xs text-[#0B1C30]">
          Registered treatment case <span className="font-semibold">{registered}</span> is referenced for this patient. A new TB case number is not requested.
        </p>
      ) : null}
      <RadioChoiceGroup
        label="TB classification"
        name={`diagnoses.${entry.id}.tbManagement.diagnosisType`}
        options={TB_DIAGNOSIS_TYPE_OPTIONS}
        value={management.diagnosisType}
        onChange={(value) => onChange(tbManagementFor(entry, { diagnosisType: value, openTreatmentCard: false }))}
      />
      {management.diagnosisType === "tb_disease" && (
        <RadioChoiceGroup
          label="Drug resistance"
          name={`diagnoses.${entry.id}.tbManagement.drugResistance`}
          options={TB_DRUG_RESISTANCE_OPTIONS}
          value={management.drugResistance}
          onChange={(value) => onChange(tbManagementFor(entry, { drugResistance: value, openTreatmentCard: false }))}
        />
      )}
      {blocked && (
        <p className="text-xs text-[#545F73]">
          DS-TB Form 4B is not used for DR-TB or TB infection / TPT. Document evaluation here without opening a treatment card.
        </p>
      )}
      {canOpen && !registered && (
        <label className="flex cursor-pointer items-start gap-3 px-1 py-1">
          <input
            type="checkbox"
            name={`diagnoses.${entry.id}.tbManagement.openTreatmentCard`}
            checked={management.openTreatmentCard}
            onChange={(event) => onChange(tbManagementFor(entry, { openTreatmentCard: event.target.checked }))}
            className="mt-1 h-4 w-4 accent-[#B70011]"
          />
          <span>
            <span className="block text-sm font-semibold text-[#0B1C30]">Open DS-TB Treatment Card (Form 4B)</span>
            <span className="mt-0.5 block text-xs text-[#545F73]">
              Registers this confirmed drug-susceptible TB case. Leave off to evaluate without creating a treatment record.
            </span>
          </span>
        </label>
      )}
    </fieldset>
  );
}

function FollowUpConditionReferences({ references = [] }) {
  if (!references.length) return null;
  return (
    <section className="border border-[#E5EEFF] bg-[#F8FAFF] p-4">
      <h3 className="text-sm font-semibold text-[#0B1C30]">Other Active Patient Conditions</h3>
      <p className="mt-0.5 text-xs text-[#545F73]">Shown for reference. They are not part of today&apos;s assessment unless added as a new concern.</p>
      <ul className="mt-2 space-y-1 text-sm text-[#0B1C30]">
        {references.map((condition) => (
          <li key={condition.id || condition.conditionName}>
            {condition.conditionName || condition.name}
            <span className="ml-2 text-xs text-[#545F73]">
              {condition.status === "controlled" ? "Controlled" : "Active"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DiagnosisCard({
  entry, schedules, errors, disabled, conditions, catchmentBhcs, isReferralVisit,
  registry, existingTbCase, onChange, onFollowUpChange, onRemove,
}) {
  const action = diagnosisNextAction(entry);
  const confirmed = diagnosisActivateConfirmed(entry, conditions);
  const existing = matchingMonitorableCondition(entry.name, conditions);
  const key = `diagnoses.${entry.id}`;
  const showWalkInActions = !isReferralVisit;
  return (
    <div className="space-y-3 border border-[#E5EEFF] p-4" data-field={errors[`${key}.nextAction`] ? `${key}.nextAction` : undefined}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#0B1C30]">{entry.name}</p>
          {existing && (
            <p className="mt-0.5 text-xs text-[#545F73]">
              Already confirmed {existing.status === "controlled" ? "Controlled" : "Active"} for this patient.
            </p>
          )}
        </div>
        <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={`Remove ${entry.name}`} onClick={onRemove} className="h-8 w-8 shrink-0 rounded-none text-slate-500 hover:text-red-600">
          <Trash2 size={14} />
        </Button>
      </div>
      <label className="flex cursor-pointer items-start gap-3 px-1 py-1">
        <input
          type="checkbox"
          name={`${key}.activate`}
          checked={Boolean(entry.activate) || Boolean(existing) || Boolean(entry.continued)}
          disabled={disabled || Boolean(existing) || Boolean(entry.continued)}
          onChange={(event) => onChange({ ...entry, activate: event.target.checked })}
          className="mt-1 h-4 w-4 accent-[#B70011]"
        />
        <span>
          <span className="block text-sm font-semibold text-[#0B1C30]">Active Patient Condition</span>
          <span className="mt-0.5 block text-xs text-[#545F73]">
            {existing || entry.continued
              ? "This identity is already Active or Controlled. Continuing it does not create another confirmation."
              : "Confirm this diagnosis as an Active patient condition. Off by default."}
          </span>
        </span>
      </label>
      <FieldError error={errors[`${key}.activate`]} />
      <TbCaseManagementSection
        entry={entry}
        registry={registry}
        existingTbCase={existingTbCase}
        disabled={disabled}
        onChange={onChange}
      />
      {showWalkInActions ? (
        <>
          <RadioChoiceGroup
            label="Next action"
            name={`${key}.nextAction`}
            required
            options={RHU_NEXT_ACTION_OPTIONS}
            value={action}
            error={errors[`${key}.nextAction`]}
            onChange={(value) => onChange(applyRhuNextAction(entry, value))}
          />
          {action === "none" && (
            <p className="text-xs text-[#545F73]">No additional return is scheduled. An Active condition stays Active.</p>
          )}
          {action === "rhu_follow_up" && (
            <DiagnosisFollowUp
              entry={entry}
              schedule={scheduleFor(entry, schedules)}
              errors={errors}
              disabled={disabled}
              onFollowUpChange={(next) => onFollowUpChange?.(entry.id, next)}
            />
          )}
          {action === "manage_to_bhc" && (
            <fieldset disabled={disabled} className="min-w-0 space-y-3 border-t border-[#E5EEFF] pt-2">
              <p className="text-xs text-[#545F73]">
                Sends a monitoring request to the receiving BHC. Monitoring does not start until that BHC accepts and begins a consultation.
                {confirmed ? "" : " This condition must already be Active or Controlled, or Active must be chosen on this card."}
              </p>
              <div>
                <label htmlFor={`${entry.id}-bhc`} className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                  Receiving Barangay Health Center <span className="text-red-500">*</span>
                </label>
                <select
                  id={`${entry.id}-bhc`}
                  name={`${key}.receivingBhcId`}
                  value={entry.receivingBhcId || ""}
                  onChange={(event) => onChange({ ...entry, receivingBhcId: event.target.value })}
                  aria-invalid={Boolean(errors[`${key}.receivingBhcId`])}
                  className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3.5 text-sm text-[#1F2937] outline-none"
                >
                  <option value="">Select a catchment BHC</option>
                  {(catchmentBhcs || []).map((bhc) => (
                    <option key={bhc.id} value={String(bhc.id)}>{bhc.name}</option>
                  ))}
                </select>
                <FieldError error={errors[`${key}.receivingBhcId`]} />
              </div>
              <FieldTextarea
                label="Monitoring recommendation"
                required
                maxLength={2000}
                name={`${key}.monitoringRecommendation`}
                value={entry.monitoringRecommendation || ""}
                error={errors[`${key}.monitoringRecommendation`]}
                rows={3}
                placeholder="What should the BHC monitor, and why?"
                onChange={(event) => onChange({ ...entry, monitoringRecommendation: event.target.value })}
              />
            </fieldset>
          )}
        </>
      ) : (
        <p className="text-sm text-neutral-600">This visit came from a referral. Completing the Return Slip is a separate step and is not done here.</p>
      )}
    </div>
  );
}

export default function RhuDiagnosisCarePlanSection({
  diagnoses = [],
  diagnosisDraft = "",
  onDiagnosisDraftChange,
  onAddDiagnosis,
  onChangeDiagnosis,
  onRemoveDiagnosis,
  monitoredNames = [],
  schedules = [],
  onFollowUpChange,
  conditions = [],
  catchmentBhcs = [],
  isReferralVisit = false,
  selectedPrograms = [],
  onServiceNextAction,
  onServiceFollowUp,
  treatmentNotes = "",
  onTreatmentNotesChange,
  prescribedMedicines = [],
  onPrescribedMedicinesChange,
  catalog = [],
  catalogError = "",
  onRetryCatalog,
  canPrescribe = false,
  registry = {},
  existingTbCase = null,
  conditionReferences = [],
  errors = {},
  disabled = false,
}) {
  function addDiagnosis() {
    const name = String(diagnosisDraft || "").trim().slice(0, DIAGNOSIS_LIMITS.name);
    if (!name || diagnoses.length >= DIAGNOSIS_LIMITS.count) return;
    onAddDiagnosis?.(emptyRhuDiagnosis(name, createDiagnosisId()));
  }

  return (
    <div className="ehr-consult__care-plan">
      <section aria-label="Named diagnoses" data-field="diagnoses">
        <h2 className="text-sm font-bold text-[#111827]">Diagnosis</h2>
        <p className="mt-1 text-xs text-[#545F73]">Add each diagnosis, then choose whether it is an Active patient condition and what happens next.</p>
        <div className="mt-3 flex gap-2">
          <Input
            value={diagnosisDraft}
            list="rhu-itr-conditions"
            maxLength={DIAGNOSIS_LIMITS.name}
            autoComplete="off"
            disabled={disabled}
            placeholder="Hypertension, TB, diabetes…"
            className="rounded-none"
            onChange={(event) => onDiagnosisDraftChange?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addDiagnosis();
              }
            }}
          />
          <datalist id="rhu-itr-conditions">
            {monitoredNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <Button type="button" variant="secondary" disabled={disabled} onClick={addDiagnosis} className="rounded-none">
            Add
          </Button>
        </div>
        <div className="mt-4 space-y-4">
          {diagnoses.map((entry) => (
            <DiagnosisCard
              key={entry.id}
              entry={entry}
              schedules={schedules}
              errors={errors}
              disabled={disabled}
              conditions={conditions}
              catchmentBhcs={catchmentBhcs}
              isReferralVisit={isReferralVisit}
              registry={registry}
              existingTbCase={existingTbCase}
              onChange={(next) => onChangeDiagnosis?.(next)}
              onFollowUpChange={onFollowUpChange}
              onRemove={() => onRemoveDiagnosis?.(entry.id)}
            />
          ))}
          <FollowUpConditionReferences references={conditionReferences} />
        </div>
        {errors.diagnoses && <div role="alert" className="mt-2"><FieldError error={errors.diagnoses} /></div>}
      </section>
      <NextStepsSection
        hideReferToRhu
        selectedPrograms={selectedPrograms}
        followUpSchedules={schedules}
        onServiceNextAction={onServiceNextAction}
        onServiceFollowUp={onServiceFollowUp}
        errors={errors}
        disabled={disabled}
        treatmentSlot={(
          <>
            <FieldTextarea
              label="Actions Taken / Treatment"
              name="actionsTaken"
              value={treatmentNotes}
              error={errors.actionsTaken}
              rows={4}
              placeholder="What was done at this visit?"
              onChange={(event) => onTreatmentNotesChange?.(event.target.value)}
            />
            <PrescribedMedicinesSection
              catalog={catalog}
              value={prescribedMedicines}
              onChange={onPrescribedMedicinesChange}
              disabled={disabled || !canPrescribe}
              error={catalogError}
              onRetry={onRetryCatalog}
            />
          </>
        )}
      />
    </div>
  );
}
