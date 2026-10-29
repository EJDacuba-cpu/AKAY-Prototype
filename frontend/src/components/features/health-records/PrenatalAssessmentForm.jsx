import { DatePickerField } from "../../common/forms/DatePickerField";
import { PREVIOUS_FP_METHOD_OPTIONS } from "../../../utils/familyPlanning";
import {
  MATERNAL_LAB_TESTS,
  MATERNAL_RISK_GROUPS,
  OB_SCORE_GP_FIELDS,
  OB_SCORE_TPAL_FIELDS,
  PRENATAL_IMMUNIZATION_OPTIONS,
} from "../../../utils/prenatalForm";
import PatientHistoryPanel from "../patients/history/PatientHistoryPanel";
import { sectionVisibility } from "../../../utils/patientHistory";

const MATERNAL_EYEBROW_CLASS =
  "mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#DC2626]";
const MATERNAL_TABLE_INPUT_CLASS =
  "h-9 w-full rounded-none border border-[#D1D5DB] bg-white px-3 text-sm text-[#111827] outline-none transition-colors duration-150 placeholder:text-[#9CA3AF] focus:border-[#DC2626] focus:ring-2 focus:ring-red-200";

/**
 * Prenatal enrollment and visit assessment shared by BHC and RHU.
 *
 * Current-pregnancy fields stay here. Longitudinal Section V (menstrual
 * history and previous pregnancies) is staged on the same background update
 * when `includeObstetricHistory` is set (BHC). RHU keeps Section V on its
 * Patient History step.
 */
export default function PrenatalAssessmentForm({
  maternalData,
  expectedDeliveryDate,
  aog,
  onMaternalChange,
  onNestedChange,
  onRiskChange,
  onExpectedDeliveryDateChange,
  onAogChange,
  locked = false,
  errors = {},
  patient,
  background,
  backgroundUpdate,
  onBackgroundUpdateChange,
  historyErrors = [],
  includeObstetricHistory = false,
}) {
  const showObstetricHistory =
    includeObstetricHistory
    && typeof onBackgroundUpdateChange === "function"
    && sectionVisibility(patient).obstetric !== "hidden";

  return (
    <div className="space-y-4">
      {showObstetricHistory && (
        <PatientHistoryPanel
          patient={patient}
          background={background}
          update={backgroundUpdate}
          onUpdateChange={onBackgroundUpdateChange}
          today={new Date()}
          layout="section"
          locked={locked}
          showGeneral={false}
          sections={["obstetric"]}
          showSimilarIllness={false}
          inline
          errors={historyErrors}
          initialSection="obstetric"
        />
      )}
      <FormSection
        title="Pregnancy / Obstetric Information"
        subtitle="Record and verify G/P, TPAL, and pregnancy information for this prenatal assessment."
      >
        <LockedFormContent locked={locked}>
          <div className="space-y-5">
            <div>
              <p className={MATERNAL_EYEBROW_CLASS}>Pregnancy Information</p>
              <div className="grid gap-4 @xl:grid-cols-2">
                <DatePickerField
                  label="LMP"
                  value={maternalData.lmp}
                  onChange={(value) => onMaternalChange("lmp", value)}
                  error={errors.lmp || errors["maternalData.lmp"] || errors["maternal_data.lmp"]}
                />
                <DatePickerField
                  label="EDC"
                  value={expectedDeliveryDate}
                  onChange={onExpectedDeliveryDateChange}
                />
              </div>
            </div>

            <div className="grid gap-4 @xl:grid-cols-2">
              {OB_SCORE_GP_FIELDS.map((field) => (
                <FieldInput
                  key={field.key}
                  label={field.label}
                  type="number"
                  min="0"
                  placeholder={field.placeholder}
                  value={maternalData[field.key]}
                  onChange={(event) => onMaternalChange(field.key, event.target.value)}
                />
              ))}
            </div>

            <div>
              <p className={MATERNAL_EYEBROW_CLASS}>OB Score (TPAL)</p>
              <div className="grid grid-cols-2 gap-4 @xl:grid-cols-4">
                {OB_SCORE_TPAL_FIELDS.map((field) => (
                  <FieldInput
                    key={field.key}
                    label={field.label}
                    type="number"
                    min="0"
                    placeholder="0"
                    value={maternalData[field.key]}
                    onChange={(event) => onMaternalChange(field.key, event.target.value)}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className={MATERNAL_EYEBROW_CLASS}>Current Prenatal Information</p>
              <div className="grid gap-4 @xl:grid-cols-2">
                <FieldInput
                  label="AOG (Age of Gestation)"
                  placeholder="e.g. 28 weeks"
                  value={aog}
                  onChange={(event) => onAogChange(event.target.value)}
                />
                <FieldInput
                  label="FHT (Fetal Heart Tone)"
                  placeholder="e.g. 140 bpm"
                  value={maternalData.fht}
                  onChange={(event) => onMaternalChange("fht", event.target.value)}
                />
              </div>
            </div>
          </div>
        </LockedFormContent>
      </FormSection>

      <FormSection title="Obstetric Risk Factors" subtitle="Mark any obstetric risk factors relevant to this pregnancy.">
        <LockedFormContent locked={locked}>
          <div className="grid gap-6">
            {MATERNAL_RISK_GROUPS.map((group) => (
              <RiskCodeChecklist
                key={group.key}
                eyebrow={group.eyebrow}
                options={group.options}
                values={maternalData.riskAssessment}
                onChange={onRiskChange}
              />
            ))}
          </div>
        </LockedFormContent>
      </FormSection>

      <FormSection title="Laboratory Results" subtitle="Record laboratory test results taken for this pregnancy.">
        <LockedFormContent locked={locked}>
          <div className="overflow-x-auto rounded-none border border-[#E8ECF0]">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#EEF2F6] bg-gray-50">
                  {["Test", "Result", "Date"].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#374151]"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATERNAL_LAB_TESTS.map((test) => (
                  <tr key={test.key} className="border-b border-[#EEF2F6] last:border-b-0">
                    <th scope="row" className="w-1/3 px-4 py-2 text-sm font-medium text-[#1F2937]">
                      {test.label}
                    </th>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        aria-label={`${test.label} result`}
                        placeholder="Enter result..."
                        value={maternalData.laboratoryResults?.[test.key] || ""}
                        onChange={(event) => onNestedChange("laboratoryResults", test.key, event.target.value)}
                        className={MATERNAL_TABLE_INPUT_CLASS}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <DatePickerField
                        hideLabel
                        label={`${test.label} date`}
                        value={maternalData.laboratoryResultDates?.[test.key] || ""}
                        onChange={(value) => onNestedChange("laboratoryResultDates", test.key, value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </LockedFormContent>
      </FormSection>

      <FormSection title="OB History" subtitle="Record the client's prior family planning method use.">
        <LockedFormContent locked={locked}>
          <div className="grid gap-4 @xl:grid-cols-2">
            <FieldSelect
              label="Previous FP Method Used"
              value={maternalData.previousFpMethodUsed}
              onChange={(event) => onMaternalChange("previousFpMethodUsed", event.target.value)}
            >
              <option value="">Select method...</option>
              {PREVIOUS_FP_METHOD_OPTIONS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </FieldSelect>
            {maternalData.previousFpMethodUsed === "Other" && (
              <FieldInput
                label="Specify FP Method"
                value={maternalData.previousFpMethodOther}
                onChange={(event) => onMaternalChange("previousFpMethodOther", event.target.value)}
              />
            )}
          </div>
        </LockedFormContent>
      </FormSection>

      <FormSection title="Immunization This Visit" subtitle="Record any immunization given during this prenatal visit.">
        <LockedFormContent locked={locked}>
          <div className="grid gap-4 @xl:grid-cols-3">
            <FieldSelect
              label="Immunization Type"
              value={maternalData.immunizationThisVisit?.type || ""}
              onChange={(event) => onNestedChange("immunizationThisVisit", "type", event.target.value)}
            >
              <option value="">Select vaccine...</option>
              {PRENATAL_IMMUNIZATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </FieldSelect>
            <FieldInput
              label="Dose / Status"
              placeholder="Enter dose or status..."
              value={maternalData.immunizationThisVisit?.doseStatus || ""}
              onChange={(event) => onNestedChange("immunizationThisVisit", "doseStatus", event.target.value)}
            />
            <DatePickerField
              label="Date Given"
              value={maternalData.immunizationThisVisit?.dateGiven || ""}
              onChange={(value) => onNestedChange("immunizationThisVisit", "dateGiven", value)}
            />
          </div>
        </LockedFormContent>
      </FormSection>

      <FormSection title="Ultrasound" subtitle="Record the latest ultrasound result and date for this pregnancy.">
        <LockedFormContent locked={locked}>
          <div className="grid gap-4 @xl:grid-cols-2">
            <FieldInput
              label="Ultrasound Result"
              value={maternalData.ultrasound?.result || ""}
              onChange={(event) => onNestedChange("ultrasound", "result", event.target.value)}
            />
            <DatePickerField
              label="Date of Ultrasound"
              value={maternalData.ultrasound?.dateDone || ""}
              onChange={(value) => onNestedChange("ultrasound", "dateDone", value)}
            />
          </div>
        </LockedFormContent>
      </FormSection>
    </div>
  );
}

function FormSection({ title, subtitle, children }) {
  return (
    <section className="rounded-none border border-[#E5E7EB] bg-white">
      <div className="border-b border-[#E5E7EB] px-4 py-2.5">
        <h2 className="text-[14px] font-bold leading-snug text-[#111827]">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs leading-relaxed text-[#6B7280]">{subtitle}</p> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function LockedFormContent({ locked, children }) {
  if (!locked) return children;
  return (
    <fieldset disabled className="space-y-4">
      <div className="pointer-events-none opacity-60">{children}</div>
    </fieldset>
  );
}

function FieldInput({ label, required, error, className = "", wrapperClassName = "", ...props }) {
  const inputClass = error
    ? "border-[#DC2626] bg-white ring-2 ring-red-200"
    : "border-[#D1D5DB] bg-white focus:border-[#DC2626] focus:ring-2 focus:ring-red-200";
  return (
    <div className={wrapperClassName}>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#374151]">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      <input
        {...props}
        aria-invalid={Boolean(error)}
        className={`h-9 w-full rounded-none border px-3 text-sm text-[#111827] outline-none transition-colors duration-150 placeholder:text-[#9CA3AF] disabled:cursor-not-allowed disabled:opacity-60 ${inputClass} ${className}`}
      />
      {error ? <p className="mt-1 text-[11px] font-medium text-[#DC2626]">{error}</p> : null}
    </div>
  );
}

function FieldSelect({ label, required, error, children, className = "", wrapperClassName = "", ...props }) {
  const selectClass = error
    ? "border-[#DC2626] bg-white ring-2 ring-red-200"
    : "border-[#D1D5DB] bg-white focus:border-[#DC2626] focus:ring-2 focus:ring-red-200";
  return (
    <div className={wrapperClassName}>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#374151]">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      <select
        {...props}
        aria-invalid={Boolean(error)}
        className={`h-9 w-full appearance-none rounded-none border px-3 text-sm text-[#111827] outline-none transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${selectClass} ${className}`}
      >
        {children}
      </select>
      {error ? <p className="mt-1 text-[11px] font-medium text-[#DC2626]">{error}</p> : null}
    </div>
  );
}

function RiskCodeChecklist({ eyebrow, options, values = {}, onChange }) {
  return (
    <div>
      <p className={MATERNAL_EYEBROW_CLASS}>{eyebrow}</p>
      <div className="flex flex-col gap-3">
        {options.map((option) => {
          const checked = Boolean(values[option.key]);
          return (
            <label key={option.key} className="flex cursor-pointer items-start gap-2.5 text-sm font-medium">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(option.key, event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded-none border-[#D1D5DB] accent-[#DC2626]"
              />
              <span className={checked ? "font-semibold text-[#DC2626]" : "text-gray-600"}>{option.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
