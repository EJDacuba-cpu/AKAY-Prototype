import { useEffect, useMemo, useState } from "react";
import {
  ClinicalCheckbox,
  ClinicalSectionCard as ClinicalSection,
  FieldEyebrow,
  FieldInput,
  FieldTextarea,
  FieldError,
} from "./fields/ClinicalFields";
import { formatEpiDate, getEpiCode } from "../../../utils/epiTracking";
import { visibleEpiVaccineOptions } from "../../../utils/epiApplicability";
import { normalizeVaccineName } from "../../../utils/healthRecordPrograms";
import {
  buildVaccineDoseCatalog,
  CPAB_EVIDENCE_SOURCES,
  CPAB_STATUS_OPTIONS,
  emptyMaternalEvidenceRow,
  findDoseOption,
  needsBirthDoseTime,
  vaccineEntryConflicts,
} from "../../../utils/epiVaccineCatalog";

const TIMED_NEWBORN_VACCINES = new Set(["BCG", "HEPA B"]);

function needsTimeGiven(vaccineName) {
  return TIMED_NEWBORN_VACCINES.has(normalizeVaccineName(vaccineName))
    || needsBirthDoseTime(vaccineName);
}

/** Date inputs need YYYY-MM-DD; callers may pass Date or ISO datetime. */
function toDateInputValue(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

/**
 * Services recorded on the EPI form that are screenings rather than vaccines.
 * These stay inside the same `vaccineEntries` data model.
 */
export const ESSENTIAL_SERVICE_LABELS = ["Newborn Screening"];

const DISPLAY_LABELS = {
  "Newborn Screening": "Newborn Screening (NBS) Done",
};

function displayLabel(storedName) {
  return DISPLAY_LABELS[storedName] || storedName;
}

const DEFAULT_BREASTFEEDING_MONTHS = [
  { key: "month1", label: "1 Month" },
  { key: "month2", label: "2 Months" },
  { key: "month3", label: "3 Months" },
  { key: "month4", label: "4 Months" },
  { key: "month5", label: "5 Months" },
  { key: "month6", label: "6 Months" },
];

function isEssentialService(label) {
  return ESSENTIAL_SERVICE_LABELS.some(
    (service) => service.toLowerCase() === String(label).toLowerCase(),
  );
}

function isCpabLabel(label) {
  return normalizeVaccineName(label) === "CPAB";
}

/**
 * Compact EPI visit form: Vaccine → Dose → Date → Add tracking list,
 * plus maternal TT/Td CPAB evidence for this child.
 */
export default function ImmunizationVisitFields({
  vaccineOptions = [],
  birthDate,
  visitDate,
  entries = [],
  epiHistoryByCode = null,
  epiCompletion = null,
  epiHistoryLoading = false,
  epiHistoryError = "",
  temperature,
  pulse,
  spo2,
  weight,
  height,
  breastfeedingMonitoring = {},
  breastfeedingMonths = DEFAULT_BREASTFEEDING_MONTHS,
  consultationNotes,
  errors = {},
  ageWarning = null,
  hideBasicMonitoring = false,
  otherVaccineSlot = null,
  medicinesSlot = null,
  emptySelectionHint = null,
  cpabAssessment = null,
  maternalTtTdEvidence = [],
  onTemperatureChange,
  onPulseChange,
  onSpo2Change,
  onWeightChange,
  onHeightChange,
  onBreastfeedingChange,
  onToggleVaccine,
  onVaccineFieldChange,
  onAddVaccineEntry,
  onRemoveVaccineEntry,
  onCpabAssessmentChange,
  onMaternalEvidenceChange,
  onNotesChange,
}) {
  const selectedVaccines = new Set(entries.map((entry) => entry.vaccineName));
  const historyByCode = epiHistoryByCode || new Map();
  const tracksHistory = Boolean(epiHistoryByCode);
  const visitDay = toDateInputValue(visitDate);
  const visibleOptions = birthDate
    ? visibleEpiVaccineOptions(vaccineOptions, {
        birthDate,
        visitDate: visitDay || visitDate,
        historyLabels: [
          ...vaccineOptions.filter((label) => historyByCode.has(getEpiCode(label))),
          ...entries.map((entry) => entry.vaccineName),
        ],
      })
    : vaccineOptions;

  const essentialOptions = visibleOptions.filter(isEssentialService);
  const vaccineOnlyOptions = visibleOptions.filter(
    (option) => !isEssentialService(option) && !isCpabLabel(option),
  );
  const catalogKey = vaccineOnlyOptions.join("|");
  const catalog = useMemo(
    () => buildVaccineDoseCatalog(vaccineOnlyOptions),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by stable join of option labels
    [catalogKey],
  );

  const [draftFamily, setDraftFamily] = useState("");
  const [draftDose, setDraftDose] = useState("");
  const [draftDate, setDraftDate] = useState(() => visitDay);
  const [draftTime, setDraftTime] = useState("");
  const [draftError, setDraftError] = useState("");

  useEffect(() => {
    if (!draftDate && visitDay) setDraftDate(visitDay);
  }, [visitDay, draftDate]);

  const selectedFamily = catalog.find((item) => item.key === draftFamily) || null;
  const selectedDose = selectedFamily
    ? findDoseOption(catalog, draftFamily, draftDose)
    : null;
  const showTime = selectedDose ? needsBirthDoseTime(selectedDose.storedLabel) : false;

  const assessment = cpabAssessment || { status: "not_assessed", notes: "" };
  const evidenceRows = Array.isArray(maternalTtTdEvidence) ? maternalTtTdEvidence : [];

  function resetDraft() {
    setDraftFamily("");
    setDraftDose("");
    setDraftDate(visitDay || "");
    setDraftTime("");
    setDraftError("");
  }

  function handleAddVaccine() {
    if (!selectedDose) {
      setDraftError("Choose a vaccine and dose.");
      return;
    }
    const storedLabel = selectedDose.storedLabel;
    const dateGiven = toDateInputValue(draftDate) || visitDay;
    const conflict = vaccineEntryConflicts({
      storedLabel,
      dateGiven,
      entries,
      historyByCode: tracksHistory ? historyByCode : null,
    });
    if (conflict) {
      setDraftError(conflict);
      return;
    }

    const entry = {
      vaccineName: storedLabel,
      dose: selectedDose.value === "birth" ? "Birth dose" : String(selectedDose.value),
      dateGiven,
      timeGiven: showTime ? draftTime : "",
    };

    if (typeof onAddVaccineEntry === "function") {
      onAddVaccineEntry(entry);
    } else if (typeof onToggleVaccine === "function") {
      onToggleVaccine(storedLabel, true);
      if (dateGiven && onVaccineFieldChange) {
        onVaccineFieldChange(storedLabel, "dateGiven", dateGiven);
      }
      if (showTime && draftTime && onVaccineFieldChange) {
        onVaccineFieldChange(storedLabel, "timeGiven", draftTime);
      }
    }
    resetDraft();
  }

  function handleRemove(entry, index) {
    if (typeof onRemoveVaccineEntry === "function") {
      onRemoveVaccineEntry(entry, index);
      return;
    }
    if (typeof onToggleVaccine === "function") {
      onToggleVaccine(entry.vaccineName, false);
    }
  }

  function updateEntryField(entry, index, field, value) {
    if (typeof onVaccineFieldChange === "function") {
      // Prefer index-aware callers; fall back to name-keyed legacy API.
      if (onVaccineFieldChange.length >= 4) {
        onVaccineFieldChange(entry.vaccineName, field, value, index);
      } else {
        onVaccineFieldChange(entry.vaccineName, field, value);
      }
    }
  }

  function renderEssentialOption(storedName) {
    const lockedEntry = tracksHistory
      ? historyByCode.get(getEpiCode(storedName))
      : null;
    const locked = Boolean(lockedEntry);
    const givenDate = formatEpiDate(lockedEntry?.dateGiven);

    return (
      <ClinicalCheckbox
        key={storedName}
        label={displayLabel(storedName)}
        checked={selectedVaccines.has(storedName)}
        locked={locked}
        lockedNote={`Already given${givenDate ? ` on ${givenDate}` : ""}`}
        onChange={(checked) => onToggleVaccine?.(storedName, checked)}
      />
    );
  }

  function addEvidenceRow() {
    onMaternalEvidenceChange?.([...evidenceRows, emptyMaternalEvidenceRow()]);
  }

  function updateEvidenceRow(index, field, value) {
    const next = evidenceRows.map((row, i) => (
      i === index ? { ...row, [field]: value } : row
    ));
    onMaternalEvidenceChange?.(next);
  }

  function removeEvidenceRow(index) {
    onMaternalEvidenceChange?.(evidenceRows.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      {ageWarning}

      {!hideBasicMonitoring && (
      <ClinicalSection
        title="Basic Monitoring"
        subtitle="Record the child's weight, height, temperature, pulse rate, and SpO2."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <FieldInput
            label="Weight (kg)"
            type="number"
            step="0.01"
            value={weight}
            onChange={(event) => onWeightChange(event.target.value)}
            placeholder="kg"
          />
          <FieldInput
            label="Height (cm)"
            type="number"
            step="0.01"
            value={height}
            onChange={(event) => onHeightChange(event.target.value)}
            placeholder="cm"
          />
          <FieldInput
            label="Temperature (&#176;C)"
            type="number"
            step="0.1"
            value={temperature}
            onChange={(event) => onTemperatureChange(event.target.value)}
            placeholder="&#176;C"
          />
          {onPulseChange && (
            <FieldInput
              label="Pulse Rate (bpm)"
              type="number"
              value={pulse}
              onChange={(event) => onPulseChange(event.target.value)}
              placeholder="e.g. 120"
            />
          )}
          {onSpo2Change && (
            <FieldInput
              label="SpO2 (%)"
              type="number"
              value={spo2}
              onChange={(event) => onSpo2Change(event.target.value)}
              placeholder="e.g. 98"
            />
          )}
        </div>
      </ClinicalSection>
      )}

      {essentialOptions.length > 0 && (
        <ClinicalSection
          title="Essential Services / Screening"
          subtitle="Record newborn screening status for this child."
        >
          <FieldEyebrow>Newborn Services</FieldEyebrow>
          <div className="flex flex-col gap-2.5">
            {essentialOptions.map(renderEssentialOption)}
          </div>
        </ClinicalSection>
      )}

      <ClinicalSection
        title="EPI Vaccine Tracking"
        subtitle="Vaccines given this visit or previously recorded for this child."
      >
        {errors.vaccineEntries && (
          <p
            className="mb-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-[#B91C1C]"
            data-field="vaccineEntries"
            tabIndex={-1}
          >
            {errors.vaccineEntries}
          </p>
        )}
        {epiHistoryLoading && (
          <p className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-[#64748B]">
            Checking previous EPI history...
          </p>
        )}
        {epiHistoryError && (
          <p className="mb-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            {epiHistoryError}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Vaccine
            </label>
            <select
              className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm text-[#1F2937]"
              value={draftFamily}
              onChange={(event) => {
                setDraftFamily(event.target.value);
                setDraftDose("");
                setDraftError("");
              }}
            >
              <option value="">Select vaccine</option>
              {catalog.map((family) => (
                <option key={family.key} value={family.key}>{family.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Dose
            </label>
            <select
              className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm text-[#1F2937]"
              value={draftDose}
              disabled={!selectedFamily}
              onChange={(event) => {
                setDraftDose(event.target.value);
                setDraftError("");
              }}
            >
              <option value="">Select dose</option>
              {(selectedFamily?.doses || []).map((dose) => (
                <option key={dose.value} value={dose.value}>{dose.label}</option>
              ))}
            </select>
          </div>
          <FieldInput
            label="Date given"
            type="date"
            value={draftDate}
            onChange={(event) => {
              setDraftDate(event.target.value);
              setDraftError("");
            }}
          />
          {showTime ? (
            <FieldInput
              label="Time given (optional)"
              type="time"
              value={draftTime}
              onChange={(event) => setDraftTime(event.target.value)}
            />
          ) : (
            <div className="hidden lg:block" aria-hidden="true" />
          )}
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className="h-10 rounded-lg bg-[#0B1C30] px-4 text-sm font-semibold text-white disabled:opacity-50"
            onClick={handleAddVaccine}
          >
            Add
          </button>
        </div>
        {draftError ? <FieldError error={draftError} /> : null}
        <p className="mt-2 text-[11px] text-neutral-500">
          Use the date the dose was actually given.
        </p>

        {entries.filter((entry) => !isEssentialService(entry.vaccineName) && !isCpabLabel(entry.vaccineName)).length > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-neutral-50 text-[10px] uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Vaccine</th>
                  <th className="px-3 py-2 font-semibold">Dose</th>
                  <th className="px-3 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Time</th>
                  <th className="px-3 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => {
                  if (isEssentialService(entry.vaccineName) || isCpabLabel(entry.vaccineName)) {
                    return null;
                  }
                  const timed = needsTimeGiven(entry.vaccineName);
                  return (
                    <tr key={`${entry.vaccineName}-${index}`} className="border-t border-neutral-100">
                      <td className="px-3 py-2 font-medium text-ink-900">{entry.vaccineName}</td>
                      <td className="px-3 py-2 text-neutral-700">{entry.dose || "—"}</td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          className="h-9 rounded-md border border-neutral-200 px-2 text-sm"
                          value={entry.dateGiven || ""}
                          onChange={(event) => updateEntryField(entry, index, "dateGiven", event.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        {timed ? (
                          <input
                            type="time"
                            className="h-9 rounded-md border border-neutral-200 px-2 text-sm"
                            value={entry.timeGiven || entry.time_given || ""}
                            onChange={(event) => updateEntryField(entry, index, "timeGiven", event.target.value)}
                          />
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          className="text-xs font-semibold text-red-700"
                          onClick={() => handleRemove(entry, index)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          emptySelectionHint || (
            <p className="mt-3 text-sm text-neutral-500">No vaccine doses on this visit list yet.</p>
          )
        )}

        {otherVaccineSlot}

        {epiCompletion && (
          <div className="mt-5 rounded-lg bg-[#F1F5F9] px-4 py-3">
            {epiCompletion.completeAfterSave ? (
              <p className="text-xs font-semibold leading-relaxed text-emerald-700">
                All required EPI vaccines/services will be completed after
                saving. No next follow-up date is needed.
              </p>
            ) : (
              <p className="text-[12.5px] leading-relaxed">
                <span className="font-semibold text-[#475569]">
                  Remaining after this visit:{" "}
                </span>
                <span className="font-bold text-[#B91C1C]">
                  {epiCompletion.remainingItems
                    .map((item) => displayLabel(item.label))
                    .join(", ")}
                </span>
              </p>
            )}
          </div>
        )}
      </ClinicalSection>

      <ClinicalSection
        title="CPAB — Maternal TT/Td Evidence"
        subtitle="Maternal tetanus protection for this child. Leave as Not assessed when evidence is incomplete."
      >
        {errors.cpabAssessment && (
          <p className="mb-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-[#B91C1C]">
            {errors.cpabAssessment}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              CPAB classification
            </label>
            <select
              className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm"
              value={assessment.status || "not_assessed"}
              onChange={(event) => onCpabAssessmentChange?.({
                ...assessment,
                status: event.target.value,
              })}
            >
              {CPAB_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <FieldTextarea
            label="Assessment notes"
            rows={2}
            value={assessment.notes || ""}
            onChange={(event) => onCpabAssessmentChange?.({
              ...assessment,
              notes: event.target.value,
            })}
            placeholder="Optional clinical notes for this CPAB decision"
          />
        </div>

        <div className="mt-4">
          <FieldEyebrow>Documented maternal TT / Td doses</FieldEyebrow>
        </div>
        <div className="space-y-3">
          {evidenceRows.map((row, index) => (
            <div key={row.id || index} className="grid gap-2 rounded-xl border border-neutral-200 p-3 sm:grid-cols-5">
              <select
                className="h-10 rounded-lg border border-neutral-200 px-2 text-sm"
                value={row.vaccineType || "TT"}
                onChange={(event) => updateEvidenceRow(index, "vaccineType", event.target.value)}
              >
                <option value="TT">TT</option>
                <option value="Td">Td</option>
              </select>
              <select
                className="h-10 rounded-lg border border-neutral-200 px-2 text-sm"
                value={String(row.dose || "1")}
                onChange={(event) => updateEvidenceRow(index, "dose", event.target.value)}
              >
                {[1, 2, 3, 4, 5].map((dose) => (
                  <option key={dose} value={String(dose)}>{dose}</option>
                ))}
              </select>
              <input
                type="date"
                className="h-10 rounded-lg border border-neutral-200 px-2 text-sm"
                value={row.dateAdministered || ""}
                onChange={(event) => updateEvidenceRow(index, "dateAdministered", event.target.value)}
              />
              <select
                className="h-10 rounded-lg border border-neutral-200 px-2 text-sm"
                value={row.evidenceSource || "unknown"}
                onChange={(event) => updateEvidenceRow(index, "evidenceSource", event.target.value)}
              >
                {CPAB_EVIDENCE_SOURCES.map((source) => (
                  <option key={source.value} value={source.value}>{source.label}</option>
                ))}
              </select>
              <button
                type="button"
                className="h-10 text-xs font-semibold text-red-700"
                onClick={() => removeEvidenceRow(index)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-3 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold text-ink-800"
          onClick={addEvidenceRow}
        >
          Add TT/Td evidence
        </button>
        <p className="mt-2 text-[11px] text-neutral-500">
          Mother/guardian report alone is not verified proof.
        </p>
      </ClinicalSection>

      <ClinicalSection
        title="Exclusive Breastfeeding Monitoring"
        subtitle="Months exclusive breastfeeding was maintained."
      >
        <FieldEyebrow>Months</FieldEyebrow>
        <div className="flex flex-col gap-2.5">
          {breastfeedingMonths.map((month) => (
            <ClinicalCheckbox
              key={month.key}
              label={month.label}
              checked={
                breastfeedingMonitoring?.[month.key] === true ||
                breastfeedingMonitoring?.[month.key] === "yes"
              }
              onChange={(checked) => onBreastfeedingChange?.(month.key, checked)}
            />
          ))}
        </div>
      </ClinicalSection>

      {medicinesSlot}

      <ClinicalSection
        title="Remarks"
        subtitle="Optional notes for this immunization visit."
      >
        <FieldTextarea
          label="Remarks"
          value={consultationNotes}
          onChange={(event) => onNotesChange?.(event.target.value)}
          placeholder="Enter clinical notes..."
          rows={3}
        />
      </ClinicalSection>
    </div>
  );
}
