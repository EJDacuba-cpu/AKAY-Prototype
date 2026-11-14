import { useEffect, useId, useState } from "react";
import { Trash2 } from "lucide-react";
import { LaboratoryEvidencePicker, SupportingLaboratoryTestsPicker } from "../LaboratoryEvidence";
import RhuPrescriptionsSection from "./RhuPrescriptionsSection";
import { SERVICES_PRESCRIPTION_OWNER_ID } from "../../../../utils/rhuPrescriptions";

import { DatePickerField, TimePickerField } from "../../../common/forms/DatePickerField";
import { Button } from "../../../ui/button";
import { Input } from "../../../ui/input";
import { FieldError, FieldInput, FieldTextarea, RadioChoiceGroup } from "../fields/ClinicalFields";
import NextStepsSection from "./NextStepsSection";
import { createDiagnosisId, DIAGNOSIS_LIMITS } from "../../../../utils/diagnoses";
import {
  entryDestinations,
  REPORT_DESTINATIONS,
  toggleDestination,
} from "../../../../utils/reportingEntries";
import { reconcilePrescriptionsForDiagnosisRemoval } from "../../../../utils/rhuPrescriptions";
import { entryPurposeKey } from "../../../../utils/followUpSchedules";
import {
  applyRhuNextAction,
  diagnosisActivateConfirmed,
  diagnosisNextAction,
  emptyRhuDiagnosis,
  matchingMonitorableCondition,
  PRESUMPTIVE_TB_MANAGE_TO_BHC_ERROR,
  presumptiveManageToBhcBlocked,
  RHU_NEXT_ACTION_OPTIONS,
} from "../../../../utils/rhuCarePlan";
import {
  applyEstablishedTbDiseaseAssessment,
  isTbAssessmentLocked,
  TB_DISEASE_FOLLOW_UP_LOCK_MESSAGE,
} from "../../../../utils/establishedTbDisease";
import {
  DR_TB_PRIMARY,
  DR_TB_SUBTYPE_OPTIONS,
  drugResistanceForPrimary,
  drugResistancePrimary,
  isDrTbSubtype,
  isPresumptiveTb,
  isRecognizedTbDiagnosis,
  TB_ASSESSMENT_OPTIONS,
  TB_SUSCEPTIBILITY_PRIMARY_OPTIONS,
  tbManagementFields,
  tbManagementFor,
} from "../../../../utils/rhuTbCaseManagement";

function DiagnosisChoiceGroup({ options, disabled, ...props }) {
  const id = useId();
  const nextAction = props.name.endsWith(".nextAction");
  if (nextAction) return (
    <fieldset disabled={disabled} className="rhu-diagnosis-segments min-w-0" data-field={props.name}>
      <RadioChoiceGroup {...props} options={options} />
    </fieldset>
  );
  return (
    <div className="rhu-diagnosis-select" data-field={props.name}>
      <label htmlFor={id} className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-(--color-text-secondary)">
        {props.label}{props.required && <span className="ml-1 text-(--color-danger)">*</span>}
      </label>
      <select
        id={id}
        name={props.name}
        value={props.value || ""}
        disabled={disabled}
        aria-required={props.required || undefined}
        aria-invalid={Boolean(props.error)}
        className="h-10 w-full min-w-0 rounded-input border border-neutral-200 bg-white px-3.5 text-sm text-(--color-text) outline-none focus-visible:border-ink-400 focus-visible:ring-2 focus-visible:ring-ink-400/40 aria-invalid:border-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        onChange={(event) => props.onChange(event.target.value)}
      >
        <option value="">Select {props.label.toLowerCase()}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <FieldError error={props.error} />
    </div>
  );
}

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
    <fieldset disabled={disabled} className="min-w-0 space-y-3 pt-2">
      <div className="grid gap-3 md:grid-cols-2">
        <DatePickerField
          label="Follow-up Date"
          required
          name={`followUpSchedule.${purposeKey}.date`}
          value={followUp.date}
          error={errors[`followUpSchedule.${purposeKey}.date`]}
          disabled={disabled}
          onChange={(value) => onFollowUpChange({ ...followUp, date: value })}
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

function TbCaseManagementSection({
  entry,
  registry,
  existingTbCase,
  disabled,
  canConfirmTb,
  establishedLock = null,
  errors,
  onChange,
}) {
  if (!isRecognizedTbDiagnosis(entry?.name, registry)) return null;
  const locked = isTbAssessmentLocked(entry, establishedLock);
  const management = tbManagementFields(entry);
  const primaryResistance = drugResistancePrimary(management.drugResistance);
  const showDrSubtypes = primaryResistance === DR_TB_PRIMARY;
  const registered = String(existingTbCase?.tbCaseNumber || "").trim();
  const physicianLocked = disabled || !canConfirmTb;

  return (
    <fieldset disabled={physicianLocked} className="min-w-0 space-y-4 pt-3">
      <div>
        <p className="text-sm font-semibold text-[#0B1C30]">TB Case Management</p>
        <p className="mt-0.5 text-xs text-[#545F73]">
          Confirm diagnosis and drug susceptibility here. Existing registered TB treatment cases remain available on the health record when present.
        </p>
      </div>
      {!canConfirmTb && (
        <p className="text-xs text-[#545F73]">
          Only the RHU physician may confirm the TB assessment. Staff may prepare the consultation for physician review.
        </p>
      )}
      <FieldError error={errors[`diagnoses.${entry.id}.tbManagement`]} />
      {registered ? (
        <p className="text-xs text-[#0B1C30]">
          Registered treatment case <span className="font-semibold">{registered}</span> is referenced for this patient. A new TB case number is not requested.
        </p>
      ) : null}

      <div className="space-y-3 pt-3">
        <p className="text-[13px] font-semibold text-(--color-text)">Physician TB Assessment</p>
        <div className="space-y-3">
          <DiagnosisChoiceGroup
            label="TB Assessment"
            name={`diagnoses.${entry.id}.tbManagement.diagnosisType`}
            options={TB_ASSESSMENT_OPTIONS}
            value={management.diagnosisType}
            disabled={physicianLocked || locked}
            error={errors[`diagnoses.${entry.id}.tbManagement.diagnosisType`]}
            onChange={(value) => {
              if (locked) return;
              onChange(tbManagementFor(entry, { diagnosisType: value }));
            }}
          />
          {locked ? (
            <p className="text-xs text-[#545F73]">{TB_DISEASE_FOLLOW_UP_LOCK_MESSAGE}</p>
          ) : null}
          {management.diagnosisType === "tb_disease" && (
            <div className="space-y-3">
              <DiagnosisChoiceGroup
                label="Drug Susceptibility Classification"
                name={`diagnoses.${entry.id}.tbManagement.drugResistancePrimary`}
                options={TB_SUSCEPTIBILITY_PRIMARY_OPTIONS}
                value={primaryResistance}
                error={
                  showDrSubtypes
                    ? undefined
                    : errors[`diagnoses.${entry.id}.tbManagement.drugResistance`]
                }
                onChange={(value) => onChange(tbManagementFor(entry, {
                  drugResistance: drugResistanceForPrimary(value, management.drugResistance),
                }))}
              />
              {showDrSubtypes && (
                <div className="pt-3 space-y-2">
                  <DiagnosisChoiceGroup
                    label="Drug-resistant TB Classification"
                    name={`diagnoses.${entry.id}.tbManagement.drugResistance`}
                    options={DR_TB_SUBTYPE_OPTIONS}
                    value={isDrTbSubtype(management.drugResistance) ? management.drugResistance : ""}
                    error={errors[`diagnoses.${entry.id}.tbManagement.drugResistance`]}
                    onChange={(value) => onChange(tbManagementFor(entry, { drugResistance: value }))}
                  />
                  <p className="text-xs text-[#545F73]">
                    Updating susceptibility here does not start DR-TB treatment or create a new case.
                    DR-TB referral remains available after finalization on Health Record Details when clinically indicated.
                  </p>
                </div>
              )}
              <div className="rhu-diagnosis-select" data-field={`diagnoses.${entry.id}.tbManagement.tbCaseNumber`}>
                <label
                  htmlFor={`tb-case-number-${entry.id}`}
                  className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-(--color-text-secondary)"
                >
                  TB Case Number
                </label>
                {registered ? (
                  <input
                    id={`tb-case-number-${entry.id}`}
                    name={`diagnoses.${entry.id}.tbManagement.tbCaseNumber`}
                    value={registered}
                    readOnly
                    className="h-10 w-full min-w-0 rounded-input border border-neutral-200 bg-neutral-50 px-3.5 text-sm text-(--color-text)"
                  />
                ) : (
                  <input
                    id={`tb-case-number-${entry.id}`}
                    name={`diagnoses.${entry.id}.tbManagement.tbCaseNumber`}
                    value={management.tbCaseNumber || ""}
                    maxLength={100}
                    disabled={physicianLocked}
                    aria-invalid={Boolean(errors[`diagnoses.${entry.id}.tbManagement.tbCaseNumber`]) || undefined}
                    placeholder="Optional until assigned"
                    className="h-10 w-full min-w-0 rounded-input border border-neutral-200 bg-white px-3.5 text-sm text-(--color-text) outline-none focus-visible:border-ink-400 focus-visible:ring-2 focus-visible:ring-ink-400/40 aria-invalid:border-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    onChange={(event) => onChange(tbManagementFor(entry, { tbCaseNumber: event.target.value }))}
                  />
                )}
                <FieldError error={errors[`diagnoses.${entry.id}.tbManagement.tbCaseNumber`]} />
                <p className="mt-1 text-xs text-[#545F73]">
                  Optional reference number. Entering a number does not open a treatment case.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
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
  laboratoryOptions, laboratoryLoading, laboratoryError, onRefreshLaboratory,
  onUpdateCurrentLaboratoryTest, canUpdateHistoricalLaboratory = false,
  entry, schedules, errors, disabled, conditions, catchmentBhcs, isReferralVisit,
  registry, existingTbCase, canConfirmTb, establishedLock = null,
  onChange, onFollowUpChange, onRemove,
  prescriptions = [], diagnoses = [], onPrescriptionsChange, removalError = "",
  prescriptionEditor = null, onPrescriptionEditorChange,
}) {
  const action = diagnosisNextAction(entry);
  const confirmed = diagnosisActivateConfirmed(entry, conditions);
  const existing = matchingMonitorableCondition(entry.name, conditions);
  const key = `diagnoses.${entry.id}`;
  // Referral hides walk-in Next Action by default. Show it only when a restored
  // draft still carries a walk-in action the clinician must change (not auto-cleared).
  // Referral visits use the same care-plan next actions: Manage to BHC creates a
  // monitoring request; No further follow-up closes the referral with BHC notes.
  const showWalkInActions = true;
  const presumptive = isPresumptiveTb(entry);
  const blockPresumptiveManage = presumptive && !existing;
  const nextActionOptions = RHU_NEXT_ACTION_OPTIONS.map((option) => (
    option.value === "manage_to_bhc" && blockPresumptiveManage
      ? { ...option, disabled: true }
      : option
  ));
  return (
    <div className="rhu-diagnosis-card" data-field={showWalkInActions && errors[`${key}.nextAction`] ? `${key}.nextAction` : undefined}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-[#0B1C30]">{entry.name}</p>
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
      {removalError ? <div role="alert"><FieldError error={removalError} /></div> : null}
      <label className="flex cursor-pointer items-start gap-3 px-1 py-1">
        <input
          type="checkbox"
          name={`${key}.activate`}
          checked={Boolean(entry.activate) || Boolean(existing) || Boolean(entry.continued)}
          disabled={disabled || Boolean(existing) || Boolean(entry.continued) || (isRecognizedTbDiagnosis(entry.name, registry) && !canConfirmTb)}
          onChange={(event) => onChange({ ...entry, activate: event.target.checked })}
          className="mt-1 h-4 w-4 accent-[#B70011]"
        />
        <span>
          <span className="block text-sm font-semibold text-[#0B1C30]">
            {presumptive ? "Record as Under Evaluation" : "Active Patient Condition"}
          </span>
          <span className="mt-0.5 block text-xs text-[#545F73]">
            {existing || entry.continued
              ? "This identity is already Active or Controlled. Continuing it does not create another confirmation."
              : presumptive
                ? "Records Presumptive TB as Under Evaluation. This does not confirm Active TB Disease or open an active TB treatment case."
                : "Confirm this diagnosis as an Active patient condition. Off by default."}
          </span>
        </span>
      </label>
      <FieldError error={errors[`${key}.activate`]} />
      <fieldset className="border-t border-[#E5EEFF] pt-2" disabled={disabled}>
        <legend className="float-left mb-1 w-full text-sm font-semibold text-[#0B1C30]">
          Reporting Classification (check all applicable)
        </legend>
        <p className="clear-both text-xs text-[#545F73]">
          Optional. Choose the reports this diagnosis belongs to, if any apply.
        </p>
        <div className="mt-2 space-y-1">
          {REPORT_DESTINATIONS.map((destination) => (
            <label key={destination} className="flex cursor-pointer items-start gap-3 px-1 py-1.5 hover:bg-slate-50">
              <input
                type="checkbox"
                name={`${key}.reportIn`}
                checked={entryDestinations(entry).includes(destination)}
                disabled={disabled}
                onChange={(event) => onChange(toggleDestination(entry, destination, event.target.checked))}
                className="mt-1 h-4 w-4 accent-[#B70011]"
              />
              <span>
                <span className="block text-sm font-semibold text-[#0B1C30]">
                  {destination === "morbidity"
                    ? "Morbidity"
                    : destination === "notifiable"
                      ? "Notifiable Diseases"
                      : "Community Surveillance"}
                </span>
              </span>
            </label>
          ))}
        </div>
        <FieldError error={errors[`${key}.reportIn`]} />
      </fieldset>
      <div className="rhu-diagnosis-evidence">
        <div className="rhu-diagnosis-assessment">
          <TbCaseManagementSection
            entry={entry}
            registry={registry}
            existingTbCase={existingTbCase}
            canConfirmTb={canConfirmTb}
            establishedLock={establishedLock}
            errors={errors}
            disabled={disabled}
            onChange={onChange}
          />
        </div>
        <div className="rhu-diagnosis-laboratory">
          <SupportingLaboratoryTestsPicker
            options={laboratoryOptions}
            loading={laboratoryLoading}
            loadError={laboratoryError}
            onRefresh={onRefreshLaboratory}
            onUpdateCurrentTest={onUpdateCurrentLaboratoryTest}
            canUpdateHistorical={canUpdateHistoricalLaboratory}
            selected={entry.supportingLaboratoryTests || []}
            disabled={disabled}
            onChange={(supportingLaboratoryTests) => onChange({ ...entry, supportingLaboratoryTests })}
          />
          <RhuPrescriptionsSection
            diagnosisId={entry.id}
            diagnoses={diagnoses}
            prescriptions={prescriptions}
            onPrescriptionsChange={onPrescriptionsChange}
            errors={errors}
            disabled={disabled}
            editor={prescriptionEditor}
            onEditorChange={onPrescriptionEditorChange}
          />
        </div>
      </div>
      {showWalkInActions ? (
        <>
          <DiagnosisChoiceGroup
            disabled={disabled}
            label="Next action"
            name={`${key}.nextAction`}
            required
            options={nextActionOptions}
            value={action}
            error={errors[`${key}.nextAction`]}
            onChange={(value) => onChange(applyRhuNextAction(entry, value))}
          />
          {blockPresumptiveManage && action !== "manage_to_bhc" ? (
            <p className="text-xs text-[#545F73]">{PRESUMPTIVE_TB_MANAGE_TO_BHC_ERROR}</p>
          ) : null}
          {action === "none" && (
            <div className="space-y-3 pt-1">
              <p className="text-xs text-[#545F73]">
                {isReferralVisit
                  ? "Closes this referral and notifies the BHC that no further follow-up is needed."
                  : "No additional return is scheduled. An Active condition stays Active."}
              </p>
              {isReferralVisit ? (
                <FieldTextarea
                  label="Reason for BHC"
                  required
                  maxLength={2000}
                  name={`${key}.noFurtherFollowUpReason`}
                  value={entry.noFurtherFollowUpReason || ""}
                  error={errors[`${key}.noFurtherFollowUpReason`]}
                  rows={3}
                  placeholder="Why is no further follow-up needed? The BHC will see this."
                  onChange={(event) => onChange({ ...entry, noFurtherFollowUpReason: event.target.value })}
                />
              ) : null}
            </div>
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
          {action === "refer_higher_level" && (
            <fieldset disabled={disabled} className="min-w-0 space-y-3 pt-2">
              <legend className="sr-only">Higher-Level Referral Plan</legend>
              <p className="text-sm font-semibold text-[#0B1C30]">Higher-Level Referral Plan</p>
              <p className="text-xs text-[#545F73]">Documents the plan only. No referral is issued or facility notified.</p>
              <FieldTextarea
                label="Referral Reason"
                aria-label="Referral Reason"
                aria-required="true"
                required
                maxLength={2000}
                name={`${key}.higherLevelReferralPlan.reason`}
                value={entry.higherLevelReferralPlan?.reason || ""}
                error={errors[`${key}.higherLevelReferralPlan.reason`] || errors[`${key}.higherLevelReferralPlan`]}
                rows={2}
                onChange={(event) => onChange({ ...entry, higherLevelReferralPlan: { ...entry.higherLevelReferralPlan, reason: event.target.value } })}
              />
              <FieldInput
                label="Intended Facility (if known)"
                aria-label="Intended Facility (if known)"
                maxLength={255}
                name={`${key}.higherLevelReferralPlan.intendedFacility`}
                value={entry.higherLevelReferralPlan?.intendedFacility || ""}
                error={errors[`${key}.higherLevelReferralPlan.intendedFacility`]}
                onChange={(event) => onChange({ ...entry, higherLevelReferralPlan: { ...entry.higherLevelReferralPlan, intendedFacility: event.target.value } })}
              />
              <FieldTextarea
                label="Clinical Plan"
                aria-label="Clinical Plan"
                aria-required="true"
                required
                maxLength={2000}
                name={`${key}.higherLevelReferralPlan.clinicalPlan`}
                value={entry.higherLevelReferralPlan?.clinicalPlan || ""}
                error={errors[`${key}.higherLevelReferralPlan.clinicalPlan`]}
                rows={2}
                onChange={(event) => onChange({ ...entry, higherLevelReferralPlan: { ...entry.higherLevelReferralPlan, clinicalPlan: event.target.value } })}
              />
            </fieldset>
          )}
          {action === "manage_to_bhc" && !presumptiveManageToBhcBlocked(entry, conditions) && (
            <fieldset disabled={disabled} className="min-w-0 space-y-3 pt-2">
              <p className="text-xs text-[#545F73]">
                {isReferralVisit
                  ? "Sends a monitoring request to the receiving BHC and closes this referral so the BHC gets the update."
                  : "Sends a monitoring request to the receiving BHC. Monitoring does not start until that BHC accepts and begins a consultation."}
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
                {(catchmentBhcs || []).length === 0 && (
                  <p className="mt-1 text-xs text-[#6B7280]">No catchment BHC with an available account.</p>
                )}
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
              <LaboratoryEvidencePicker
                options={laboratoryOptions}
                loading={laboratoryLoading}
                loadError={laboratoryError}
                onRefresh={onRefreshLaboratory}
                selected={entry.laboratoryEvidence || []}
                confirmed={entry.laboratoryEvidenceConfirmed === true}
                disabled={disabled}
                error={errors[`${key}.laboratoryEvidence`] || errors[`${key}.laboratoryEvidenceConfirmed`] || errors.laboratoryEvidence || errors.laboratoryEvidenceConfirmed}
                onChange={(laboratoryEvidence, laboratoryEvidenceConfirmed) => onChange({ ...entry, laboratoryEvidence, laboratoryEvidenceConfirmed })}
              />
            </fieldset>
          )}
        </>
      ) : null}
    </div>
  );
}

export default function RhuDiagnosisCarePlanSection({
  laboratoryOptions = [], laboratoryLoading = false, laboratoryError = false, onRefreshLaboratory,
  onUpdateCurrentLaboratoryTest,
  canUpdateHistoricalLaboratory = false,
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
  serviceHandoffs = [],
  serviceSupportingLabs = [],
  onServiceNextAction,
  onServiceFollowUp,
  onServiceHandoffChange,
  onServiceSupportingLabsChange,
  treatmentNotes = "",
  onTreatmentNotesChange,
  prescriptions = [],
  onPrescriptionsChange,
  vaccineEntries = [],
  serviceUsages = [],
  onServiceUsagesChange,
  legacyServicePrescriptionReviewed = false,
  onLegacyServicePrescriptionReviewedChange,
  registry = {},
  existingTbCase = null,
  canConfirmTb = false,
  establishedLock = null,
  conditionReferences = [],
  errors = {},
  disabled = false,
}) {
  const [removalErrors, setRemovalErrors] = useState({});
  const [prescriptionEditor, setPrescriptionEditor] = useState(null);

  useEffect(() => {
    setPrescriptionEditor((current) => {
      if (!current) return current;
      const ownerExists = current.ownerDiagnosisId === SERVICES_PRESCRIPTION_OWNER_ID
        || diagnoses.some((entry) => entry.id === current.ownerDiagnosisId);
      const orderExists = current.mode !== "edit" || prescriptions.some((item) => item.id === current.draft?.id);
      return ownerExists && orderExists ? current : null;
    });
  }, [diagnoses, prescriptions]);

  useEffect(() => {
    setRemovalErrors((current) => {
      let changed = false;
      const next = {};
      for (const [id, message] of Object.entries(current)) {
        const result = reconcilePrescriptionsForDiagnosisRemoval(prescriptions, id);
        if (!result.blocked) {
          changed = true;
          continue;
        }
        next[id] = result.error;
        if (result.error !== message) changed = true;
      }
      return changed ? next : current;
    });
  }, [prescriptions]);

  function removeDiagnosis(id) {
    const result = reconcilePrescriptionsForDiagnosisRemoval(prescriptions, id);
    if (result.blocked) {
      setRemovalErrors((current) => ({ ...current, [id]: result.error }));
      return;
    }
    setRemovalErrors((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    onPrescriptionsChange?.(result.prescriptions);
    onRemoveDiagnosis?.(id);
  }

  function addDiagnosis() {
    const name = String(diagnosisDraft || "").trim().slice(0, DIAGNOSIS_LIMITS.name);
    if (!name || diagnoses.length >= DIAGNOSIS_LIMITS.count) return;
    const created = emptyRhuDiagnosis(name, createDiagnosisId());
    onAddDiagnosis?.(applyEstablishedTbDiseaseAssessment(created, establishedLock));
  }

  function changeDiagnosis(next) {
    onChangeDiagnosis?.(applyEstablishedTbDiseaseAssessment(next, establishedLock));
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
              laboratoryOptions={laboratoryOptions}
              laboratoryLoading={laboratoryLoading}
              laboratoryError={laboratoryError}
              onRefreshLaboratory={onRefreshLaboratory}
              onUpdateCurrentLaboratoryTest={onUpdateCurrentLaboratoryTest}
              canUpdateHistoricalLaboratory={canUpdateHistoricalLaboratory}
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
              canConfirmTb={canConfirmTb}
              establishedLock={establishedLock}
              prescriptions={prescriptions}
              diagnoses={diagnoses}
              onPrescriptionsChange={onPrescriptionsChange}
              prescriptionEditor={prescriptionEditor}
              onPrescriptionEditorChange={setPrescriptionEditor}
              removalError={removalErrors[entry.id] || ""}
              onChange={changeDiagnosis}
              onFollowUpChange={onFollowUpChange}
              onRemove={() => removeDiagnosis(entry.id)}
            />
          ))}
          <FollowUpConditionReferences references={conditionReferences} />
        </div>
        {errors.diagnoses && <div role="alert" className="mt-2"><FieldError error={errors.diagnoses} /></div>}
      </section>
      <NextStepsSection
        hideReferToRhu
        showManageToBhc
        showServiceSupportingLabs
        selectedPrograms={selectedPrograms}
        followUpSchedules={schedules}
        serviceHandoffs={serviceHandoffs}
        serviceSupportingLabs={serviceSupportingLabs}
        catchmentBhcs={catchmentBhcs}
        isReferralVisit={isReferralVisit}
        onServiceNextAction={onServiceNextAction}
        onServiceFollowUp={onServiceFollowUp}
        onServiceHandoffChange={onServiceHandoffChange}
        onServiceSupportingLabsChange={onServiceSupportingLabsChange}
        laboratoryOptions={laboratoryOptions}
        laboratoryLoading={laboratoryLoading}
        laboratoryError={laboratoryError}
        onRefreshLaboratory={onRefreshLaboratory}
        onUpdateCurrentLaboratoryTest={onUpdateCurrentLaboratoryTest}
        canUpdateHistoricalLaboratory={canUpdateHistoricalLaboratory}
        diagnoses={diagnoses}
        prescriptions={prescriptions}
        onPrescriptionsChange={onPrescriptionsChange}
        prescriptionEditor={prescriptionEditor}
        onPrescriptionEditorChange={setPrescriptionEditor}
        vaccineEntries={vaccineEntries}
        serviceUsages={serviceUsages}
        onServiceUsagesChange={onServiceUsagesChange}
        legacyServicePrescriptionReviewed={legacyServicePrescriptionReviewed}
        onLegacyServicePrescriptionReviewedChange={onLegacyServicePrescriptionReviewedChange}
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
          </>
        )}
      />
    </div>
  );
}
