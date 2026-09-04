import {
  ClinicalCheckbox,
  ClinicalSection,
  FieldEyebrow,
  FieldInput,
  FieldTextarea,
} from "./fields/ClinicalFields";
import { formatEpiDate, getEpiCode } from "../../../utils/epiTracking";

/**
 * Services recorded on the EPI form that are screenings rather than vaccines.
 *
 * These stay inside the same `vaccineEntries` data model and still count toward
 * EPI completion (REQUIRED_EPI_ITEMS in utils/epiTracking includes
 * NEWBORN_SCREENING) - only their placement in the form differs. Splitting them
 * out of the vaccine grid is presentation, never a change to what is stored or
 * to the "remaining after this visit" arithmetic.
 */
export const ESSENTIAL_SERVICE_LABELS = ["Newborn Screening"];

/**
 * Wording shown to the user for items whose STORED name is shorter.
 *
 * The key is the stored vaccine name and must not change - it is what
 * getEpiCode maps and what previous records already hold. Only the right-hand
 * side is display text.
 */
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

/**
 * The EPI visit form, in the order the clinical flow reads:
 * measurements -> screening -> vaccines -> breastfeeding -> supplies -> remarks.
 *
 * Renders its own sections, so callers place it directly in the form card
 * rather than wrapping it in another titled section.
 *
 * Shared by the BHC and RHU record pages, which pass DIFFERENT `vaccineOptions`
 * on purpose. The two facilities record different vaccine label sets ("HEPA B"
 * vs "Hepatitis B", RHU additionally records MMR / Vitamin A / Other) and those
 * labels are the stored value, mapped by getEpiCode. Unifying the lists here
 * would silently rewrite what each facility records, so the component owns the
 * layout and each page owns its list.
 *
 * EPI-history props are optional. When `epiHistoryByCode` is omitted the grid
 * renders unlocked with no completion panel, which is the RHU page's existing
 * behaviour - it does not compile a patient's prior EPI history.
 */
export default function ImmunizationVisitFields({
  vaccineOptions = [],
  entries = [],
  epiHistoryByCode = null,
  epiCompletion = null,
  epiHistoryLoading = false,
  epiHistoryError = "",
  temperature,
  weight,
  height,
  breastfeedingMonitoring = {},
  breastfeedingMonths = DEFAULT_BREASTFEEDING_MONTHS,
  consultationNotes,
  errors = {},
  ageWarning = null,
  otherVaccineSlot = null,
  medicinesSlot = null,
  emptySelectionHint = null,
  onTemperatureChange,
  onWeightChange,
  onHeightChange,
  onBreastfeedingChange,
  onToggleVaccine,
  onNotesChange,
}) {
  const selectedVaccines = new Set(entries.map((entry) => entry.vaccineName));
  const historyByCode = epiHistoryByCode || new Map();
  const tracksHistory = Boolean(epiHistoryByCode);

  const essentialOptions = vaccineOptions.filter(isEssentialService);
  const vaccineOnlyOptions = vaccineOptions.filter(
    (option) => !isEssentialService(option),
  );

  function renderOption(storedName) {
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
        onChange={(checked) => onToggleVaccine(storedName, checked)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {ageWarning}

      <ClinicalSection
        title="Basic Monitoring"
        subtitle="Record the child's weight, height, and temperature."
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
        </div>
      </ClinicalSection>

      {essentialOptions.length > 0 && (
        <ClinicalSection
          title="Essential Services / Screening"
          subtitle="Record newborn screening status for this child."
        >
          <FieldEyebrow>Newborn Services</FieldEyebrow>
          <div className="flex flex-col gap-2.5">
            {essentialOptions.map(renderOption)}
          </div>
        </ClinicalSection>
      )}

      <ClinicalSection
        title="EPI Vaccines Given"
        subtitle="Select the EPI vaccines given during this visit."
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

        <FieldEyebrow>Vaccines Given This Visit</FieldEyebrow>
        <div className="flex flex-wrap gap-x-5 gap-y-3">
          {vaccineOnlyOptions.map(renderOption)}
        </div>

        {otherVaccineSlot}

        {entries.length === 0 && emptySelectionHint}

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
        title="Exclusive Breastfeeding Monitoring"
        subtitle="Check the months exclusive breastfeeding was maintained."
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
              onChange={(checked) => onBreastfeedingChange(month.key, checked)}
            />
          ))}
        </div>
      </ClinicalSection>

      {medicinesSlot}

      <ClinicalSection
        title="Remarks"
        subtitle="Document clinical notes for this immunization visit."
      >
        <FieldTextarea
          label="Remarks"
          value={consultationNotes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Enter clinical notes..."
          rows={3}
        />
      </ClinicalSection>
    </div>
  );
}
