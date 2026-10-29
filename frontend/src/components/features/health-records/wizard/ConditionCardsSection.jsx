import { useState } from "react";
import { Trash2 } from "lucide-react";

import { TimePickerField } from "../../../common/forms/DatePickerField";
import { Button } from "../../../ui/button";
import { Input } from "../../../ui/input";
import { FieldError, FieldInput, FieldTextarea, RadioChoiceGroup } from "../fields/ClinicalFields";
import { applyEntryCareOutcome, CARE_OUTCOMES, entryCareOutcome, namedConcern } from "../../../../utils/conditionCards";
import { DIAGNOSIS_LIMITS } from "../../../../utils/diagnoses";
import { entryPurposeKey } from "../../../../utils/followUpSchedules";
import { entryDestinations, newReportingEntry, REPORT_DESTINATIONS, toggleDestination } from "../../../../utils/reportingEntries";

const REPORTS = {
  morbidity: { label: "Morbidity Report", description: "Include this health concern in morbidity reporting." },
  notifiable: { label: "Notifiable Disease Report", description: "Include this health concern in notifiable disease reporting." },
  surveillance: { label: "Community-Based Surveillance", description: "Include this health concern in community surveillance." },
};

const CARE_OUTCOME_OPTIONS = Object.entries(CARE_OUTCOMES).map(([value, label]) => ({ value, label }));

function scheduleFor(entry, schedules) {
  const purposeKey = entryPurposeKey(entry?.id);
  return (schedules || []).find((item) => item?.purposeKey === purposeKey) || null;
}

function ConcernFollowUp({ entry, schedule, errors, disabled, onFollowUpChange }) {
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
        placeholder="Why should the patient return?"
        onChange={(event) => onFollowUpChange({ ...followUp, purpose: event.target.value })}
      />
    </fieldset>
  );
}

function ConcernRow({
  entry, schedules, errors, disabled, onChange, onFollowUpChange, onRemove, canRemove, showOptionalLabel, showHint,
}) {
  const key = `reportingEntry.${entry.id}`;
  const showDetails = namedConcern(entry);
  const careOutcome = entryCareOutcome(entry, schedules);
  const schedule = scheduleFor(entry, schedules);
  return (
    <div
      className="space-y-2"
      data-field={errors[`${key}.name`] ? `${key}.name` : errors[`${key}.clinicalOutcome`] ? `${key}.clinicalOutcome` : errors[`${key}.reportIn`] ? `${key}.reportIn` : undefined}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={`${entry.id}-name`} className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
            Health Concern{showOptionalLabel ? " (Optional)" : ""}
          </label>
          <Input
            id={`${entry.id}-name`}
            name={`${key}.name`}
            value={entry.name || ""}
            maxLength={150}
            autoComplete="off"
            disabled={disabled}
            placeholder="e.g. Suspected hypertension"
            aria-invalid={Boolean(errors[`${key}.name`] || errors[`${key}.duplicate`])}
            className="rounded-none"
            onChange={(event) => {
              const name = event.target.value;
              if (!String(name).trim()) {
                const cleared = { ...entry, name, reportIn: [] };
                delete cleared.clinicalOutcome;
                onChange(cleared);
                onFollowUpChange?.(entry.id, null);
                return;
              }
              onChange({ ...entry, name });
            }}
          />
          <FieldError error={errors[`${key}.name`] || errors[`${key}.duplicate`]} />
        </div>
        {canRemove && (
          <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label="Remove this health concern" onClick={onRemove} className="mt-6 h-8 w-8 shrink-0 rounded-none text-slate-500 hover:text-red-600">
            <Trash2 size={14} />
          </Button>
        )}
      </div>
      {showDetails ? (
        <div className="concern-reveal space-y-2">
          <fieldset className="border-t border-[#E5EEFF] pt-2">
            <legend className="float-left mb-1 w-full text-sm font-semibold text-[#0B1C30]">Reporting Classification (check all applicable)</legend>
            <p className="clear-both text-xs text-[#545F73]">Optional. Choose the reports this health concern belongs to, if any apply.</p>
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
                    <span className="block text-sm font-semibold text-[#0B1C30]">{REPORTS[destination].label}</span>
                    <span className="mt-0.5 block text-xs text-[#545F73]">{REPORTS[destination].description}</span>
                  </span>
                </label>
              ))}
            </div>
            <FieldError error={errors[`${key}.reportIn`]} />
          </fieldset>
          <fieldset className="border-t border-[#E5EEFF] pt-2" disabled={disabled}>
            <RadioChoiceGroup
              label="Care Outcome"
              name={`${key}.clinicalOutcome`}
              required
              inline
              options={CARE_OUTCOME_OPTIONS}
              value={careOutcome}
              error={errors[`${key}.clinicalOutcome`]}
              onChange={(value) => {
                onChange(applyEntryCareOutcome(entry, value));
                onFollowUpChange?.(entry.id, value === "bhc_follow_up" ? {
                  purpose: schedule?.purpose || entry.name || "BHC follow-up",
                  date: schedule?.date || "",
                  time: schedule?.time || "",
                } : null);
              }}
            />
            <p className="mt-1.5 text-xs text-[#545F73]">
              {careOutcome === "managed_at_bhc" && "No additional return or referral is required for this concern."}
              {careOutcome === "bhc_follow_up" && "Schedule a BHC return for this concern only."}
              {careOutcome === "refer_to_rhu" && "Include this concern in the RHU referral for this consultation."}
              {!careOutcome && "Choose local care, a BHC return, or referral for this concern."}
            </p>
          </fieldset>
          {careOutcome === "bhc_follow_up" && (
            <ConcernFollowUp
              entry={entry}
              schedule={schedule}
              errors={errors}
              disabled={disabled}
              onFollowUpChange={(next) => onFollowUpChange?.(entry.id, next)}
            />
          )}
        </div>
      ) : showHint ? (
        <p className="text-xs leading-5 text-[#708095]">Optional. Prenatal, family planning, and immunization visits can continue without a health concern.</p>
      ) : null}
    </div>
  );
}

export default function ConditionCardsSection({
  entries = [], schedules = [], errors = {}, disabled = false, onChange, onFollowUpChange, heading = null,
}) {
  const [starter] = useState(newReportingEntry);
  const rows = entries.length > 0 ? entries : [starter];
  const namedCount = rows.filter(namedConcern).length;
  const atLimit = rows.length >= DIAGNOSIS_LIMITS.count;
  const showAdd = !disabled && !atLimit && namedCount > 0;

  function currentRows() {
    return entries.length > 0 ? entries : [starter];
  }
  function updateAt(index, next) {
    onChange(currentRows().map((entry, itemIndex) => itemIndex === index ? next : entry));
  }
  function removeAt(id) {
    onFollowUpChange?.(id, null);
    onChange(currentRows().filter((entry) => entry.id !== id));
  }
  function addRow() {
    if (!showAdd) return;
    onChange([...currentRows(), newReportingEntry()]);
  }

  return (
    <section aria-label="Health concerns and reporting" className="space-y-3" data-field="diagnoses" tabIndex={errors.diagnoses ? -1 : undefined}>
      {heading}
      <div className="space-y-5">
        {rows.map((entry, index) => (
          <ConcernRow
            key={entry.id}
            entry={entry}
            schedules={schedules}
            errors={errors}
            disabled={disabled}
            showOptionalLabel={index === 0}
            showHint={index === 0 && !namedConcern(entry)}
            canRemove={!disabled && (namedConcern(entry) || rows.length > 1)}
            onChange={(next) => updateAt(index, next)}
            onFollowUpChange={onFollowUpChange}
            onRemove={() => removeAt(entry.id)}
          />
        ))}
      </div>
      {showAdd && (
        <button type="button" disabled={disabled} onClick={addRow} className="text-[13px] font-semibold text-[#DC2626] underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
          + Add Another Concern
        </button>
      )}
      {errors.diagnoses && <div role="alert"><FieldError error={errors.diagnoses} /></div>}
    </section>
  );
}
