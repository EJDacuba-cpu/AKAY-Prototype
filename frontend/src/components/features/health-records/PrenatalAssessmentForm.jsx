import { useState } from "react";
import { Pencil, Plus, X } from "lucide-react";

import { DatePickerField } from "../../common/forms/DatePickerField";
import { formatLongDate } from "../../../utils/formatters";
import {
  EMPTY_LABORATORY_ENTRY,
  EMPTY_PRENATAL_HISTORY,
  MATERNAL_LAB_TESTS,
  MATERNAL_RISK_GROUPS,
  OB_SCORE_GP_FIELDS,
  OB_SCORE_TPAL_FIELDS,
  PRENATAL_IMMUNIZATION_OPTIONS,
  hasPregnancyBaseline,
  labTestLabel,
  sanitizeLaboratoryEntries,
} from "../../../utils/prenatalForm";
import PatientHistoryPanel from "../patients/history/PatientHistoryPanel";
import { SMALL_BUTTON_CLASS } from "../patients/history/HistoryFields";
import { sectionVisibility } from "../../../utils/patientHistory";

const MATERNAL_EYEBROW_CLASS =
  "mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#DC2626]";

/**
 * Prenatal enrollment and visit assessment shared by BHC and RHU.
 *
 * Current-pregnancy fields stay here. Longitudinal Section V (menstrual
 * history and previous pregnancies) is staged on the same background update
 * when `includeObstetricHistory` is set (BHC and RHU ITR).
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
  fieldErrors = {},
  includeObstetricHistory = false,
  prenatalHistory = EMPTY_PRENATAL_HISTORY,
}) {
  const showObstetricHistory =
    includeObstetricHistory
    && typeof onBackgroundUpdateChange === "function"
    && sectionVisibility(patient).obstetric !== "hidden";
  const history = prenatalHistory || EMPTY_PRENATAL_HISTORY;
  const thisVisitLabs = Array.isArray(maternalData.laboratoryEntries) ? maternalData.laboratoryEntries : [];
  const hasThisVisitUltrasound = Boolean(
    String(maternalData.ultrasound?.result || "").trim() || maternalData.ultrasound?.dateDone,
  );
  const [addingLabs, setAddingLabs] = useState(false);
  const [labDraft, setLabDraft] = useState(EMPTY_LABORATORY_ENTRY);
  const [editingLabIndex, setEditingLabIndex] = useState(null);
  const [labFormError, setLabFormError] = useState("");
  const [addingUltrasound, setAddingUltrasound] = useState(false);
  const [startedWithBaseline] = useState(() => hasPregnancyBaseline(maternalData, expectedDeliveryDate));
  const [correctingBaseline, setCorrectingBaseline] = useState(false);
  const showLabForm = addingLabs || editingLabIndex !== null;
  const showUltrasoundEditor = hasThisVisitUltrasound || addingUltrasound;
  const showBaselineEditor = correctingBaseline || !startedWithBaseline;

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
          summaryWhenRecorded
          errors={historyErrors}
          fieldErrors={fieldErrors}
          initialSection="obstetric"
        />
      )}
      <FormSection
        title="Pregnancy / Obstetric Information"
        subtitle="Record this pregnancy's baseline once. Later visits keep it as a summary unless staff correct it."
        action={
          !locked && startedWithBaseline ? (
            <button
              type="button"
              aria-expanded={showBaselineEditor}
              onClick={() => setCorrectingBaseline((current) => !current)}
              className={SMALL_BUTTON_CLASS}
            >
              {showBaselineEditor ? "Done" : "Correct"}
            </button>
          ) : null
        }
      >
        {!showBaselineEditor ? (
          <HistoryList
            caption="Pregnancy baseline"
            rows={[
              { key: "lmp", label: "LMP", text: formatHistoryDate(maternalData.lmp) },
              { key: "edc", label: "EDC", text: formatHistoryDate(expectedDeliveryDate) },
              { key: "gravida", label: "Gravida (G)", text: maternalData.gravida },
              { key: "para", label: "Para (P)", text: maternalData.para },
              ...OB_SCORE_TPAL_FIELDS.map((field) => ({
                key: field.key,
                label: field.label,
                text: maternalData[field.key],
              })),
            ]}
          />
        ) : (
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
            </div>
          </LockedFormContent>
        )}
        <div className="mt-5">
          <p className={MATERNAL_EYEBROW_CLASS}>Current Prenatal Information</p>
          <LockedFormContent locked={locked}>
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
          </LockedFormContent>
        </div>
      </FormSection>

      <FormSection
        title="Obstetric Risk Factors"
        subtitle="Review documented risks and reassess any obstetric risk factors relevant to this pregnancy."
      >
        {history.risks.length > 0 && (
          <HistoryList
            caption="Documented risks"
            rows={history.risks.map((label) => ({ key: label, label: "Risk", text: label }))}
          />
        )}
        <LockedFormContent locked={locked}>
          <div className="grid gap-6">
            {MATERNAL_RISK_GROUPS.map((group) => (
              <RiskCodeChecklist
                key={group.key}
                eyebrow={history.risks.length > 0 ? "Reassessment this visit" : group.eyebrow}
                options={group.options}
                values={maternalData.riskAssessment}
                onChange={onRiskChange}
              />
            ))}
          </div>
        </LockedFormContent>
      </FormSection>

      <FormSection
        title="Laboratory Results"
        subtitle="Previous results stay on their own records. Add only tests taken this visit."
        action={
          !locked ? (
            <button
              type="button"
              onClick={() => {
                setEditingLabIndex(null);
                setLabDraft(EMPTY_LABORATORY_ENTRY);
                setLabFormError("");
                setAddingLabs(true);
              }}
              className={LAB_PILL_BUTTON_CLASS}
            >
              <Plus size={13} aria-hidden="true" />
              Add Lab Result
            </button>
          ) : null
        }
      >
        {history.labs.length > 0 && (
          <HistoryTable
            caption="Previous Laboratory Results"
            columns={["Test", "Result", "Date Performed", "Visit Date"]}
            rows={history.labs.map((item, index) => ({
              key: `${item.recordId}-${item.key}-${index}`,
              cells: [item.label, item.result, formatHistoryDate(item.date), formatHistoryDate(item.visitDate)],
            }))}
          />
        )}
        {thisVisitLabs.length > 0 && (
          <HistoryTable
            caption="New Results This Visit"
            columns={locked ? ["Test", "Result", "Date Performed"] : ["Test", "Result", "Date Performed", ""]}
            rows={thisVisitLabs.map((entry, index) => ({
              key: `this-visit-${entry.test}-${index}`,
              cells: [
                labTestLabel(entry.test),
                entry.result,
                formatHistoryDate(entry.datePerformed),
                ...(locked
                  ? []
                  : [
                      <span key={`actions-${index}`} className="flex justify-end gap-1">
                        <button
                          type="button"
                          aria-label={`Edit ${labTestLabel(entry.test)} result`}
                          onClick={() => {
                            setAddingLabs(false);
                            setEditingLabIndex(index);
                            setLabDraft({
                              test: entry.test,
                              result: entry.result,
                              datePerformed: entry.datePerformed || "",
                            });
                            setLabFormError("");
                          }}
                          className={LAB_ICON_BUTTON_CLASS}
                        >
                          <Pencil size={13} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${labTestLabel(entry.test)} result`}
                          onClick={() => {
                            onMaternalChange(
                              "laboratoryEntries",
                              thisVisitLabs.filter((_, itemIndex) => itemIndex !== index),
                            );
                            if (editingLabIndex === index) {
                              setEditingLabIndex(null);
                              setLabDraft(EMPTY_LABORATORY_ENTRY);
                            } else if (editingLabIndex !== null && editingLabIndex > index) {
                              setEditingLabIndex(editingLabIndex - 1);
                            }
                          }}
                          className={LAB_ICON_BUTTON_CLASS}
                        >
                          <X size={13} aria-hidden="true" />
                        </button>
                      </span>,
                    ]),
              ],
            }))}
          />
        )}
        {showLabForm && !locked && (
          <div className="rounded-none border border-[#E8ECF0] p-3">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {editingLabIndex !== null ? "Edit lab result" : "Add lab result"}
            </p>
            <div className="grid gap-3 @xl:grid-cols-3">
              <FieldSelect
                label="Test"
                value={labDraft.test}
                onChange={(event) => {
                  setLabFormError("");
                  setLabDraft((current) => ({ ...current, test: event.target.value }));
                }}
              >
                <option value="">Select test...</option>
                {MATERNAL_LAB_TESTS.map((test) => (
                  <option key={test.key} value={test.key}>
                    {test.label}
                  </option>
                ))}
              </FieldSelect>
              <FieldInput
                label="Result"
                placeholder="Enter result..."
                value={labDraft.result}
                onChange={(event) => {
                  setLabFormError("");
                  setLabDraft((current) => ({ ...current, result: event.target.value }));
                }}
              />
              <DatePickerField
                label="Date Performed"
                value={labDraft.datePerformed}
                onChange={(value) => setLabDraft((current) => ({ ...current, datePerformed: value }))}
              />
            </div>
            {labFormError ? (
              <p role="alert" className="mt-2 text-[11px] font-medium text-[#DC2626]">{labFormError}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAddingLabs(false);
                  setEditingLabIndex(null);
                  setLabDraft(EMPTY_LABORATORY_ENTRY);
                  setLabFormError("");
                }}
                className={LAB_PILL_BUTTON_CLASS}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const [entry] = sanitizeLaboratoryEntries([labDraft]);
                  if (!entry) {
                    setLabFormError("Choose a test and enter a result.");
                    return;
                  }
                  const next = [...thisVisitLabs];
                  if (editingLabIndex !== null) next[editingLabIndex] = entry;
                  else next.push(entry);
                  onMaternalChange("laboratoryEntries", next);
                  setLabDraft(EMPTY_LABORATORY_ENTRY);
                  setLabFormError("");
                  setEditingLabIndex(null);
                  setAddingLabs(false);
                }}
                className={LAB_PILL_PRIMARY_CLASS}
              >
                {editingLabIndex !== null ? "Save result" : "Add result"}
              </button>
            </div>
          </div>
        )}
      </FormSection>

      <FormSection
        title="Immunization"
        subtitle="Previous TT/Td doses stay on the record. Record only a vaccine given this visit."
      >
        {history.immunizations.length > 0 && (
          <HistoryTable
            caption="Previous doses"
            columns={["Vaccine", "Date given"]}
            rows={history.immunizations.map((item) => ({
              key: item.type,
              cells: [item.label, formatHistoryDate(item.dateGiven)],
            }))}
          />
        )}
        <LockedFormContent locked={locked}>
          <div className="grid gap-4 @xl:grid-cols-3">
            <FieldSelect
              label="Immunization This Visit"
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

      <FormSection
        title="Ultrasound"
        subtitle="Previous findings stay on their own records. Add only a result from this visit."
        action={
          !locked && !showUltrasoundEditor ? (
            <button type="button" onClick={() => setAddingUltrasound(true)} className={SMALL_BUTTON_CLASS}>
              <Plus size={13} aria-hidden="true" />
              Add Ultrasound
            </button>
          ) : null
        }
      >
        {history.ultrasounds.length > 0 && (
          <HistoryList
            caption="Previous ultrasound findings"
            rows={history.ultrasounds.map((item, index) => ({
              key: `${item.recordId}-${item.dateDone}-${index}`,
              label: formatHistoryDate(item.dateDone || item.visitDate),
              text: item.result || "Result not recorded",
            }))}
          />
        )}
        {showUltrasoundEditor ? (
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
        ) : (
          !history.ultrasounds.length && (
            <p className="text-[13px] text-gray-500">No ultrasound result recorded yet.</p>
          )
        )}
      </FormSection>
    </div>
  );
}

const LAB_PILL_BUTTON_CLASS =
  "inline-flex h-8 items-center gap-1 rounded-full border border-neutral-200 bg-white px-3 text-xs font-medium text-ink-800 hover:bg-neutral-50";
const LAB_PILL_PRIMARY_CLASS =
  "inline-flex h-8 items-center gap-1 rounded-full bg-brand-600 px-3 text-xs font-medium text-white hover:bg-brand-700";
const LAB_ICON_BUTTON_CLASS =
  "inline-flex size-7 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-ink-800";

function formatHistoryDate(value) {
  if (!value) return "Not recorded";
  const formatted = formatLongDate(value, "");
  return formatted || String(value);
}

function HistoryList({ caption, rows = [] }) {
  return (
    <div className={caption ? "mb-4" : undefined}>
      {caption ? (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{caption}</p>
      ) : null}
      <dl className="divide-y divide-neutral-100">
        {rows.map((row) => (
          <div key={row.key} className="grid gap-1 py-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3">
            <dt className="text-xs font-medium text-neutral-500">{row.label}</dt>
            <dd className="m-0 min-w-0 break-words text-[13px] text-neutral-900">
              {row.text == null || row.text === "" ? "Not recorded" : row.text}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function HistoryTable({ caption, columns, rows }) {
  return (
    <div className="mb-4">
      {caption ? (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{caption}</p>
      ) : null}
      <div className="overflow-x-auto rounded-none border border-[#E8ECF0]">
        <table className="w-full min-w-[420px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#EEF2F6] bg-gray-50">
              {columns.map((heading, index) => (
                <th
                  key={`${heading || "actions"}-${index}`}
                  scope="col"
                  className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#374151]"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-[#EEF2F6] last:border-b-0">
                {row.cells.map((cell, index) => (
                  <td key={`${row.key}-${index}`} className="px-4 py-2 text-[13px] text-[#1F2937]">
                    {cell == null || cell === "" ? "Not recorded" : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FormSection({ title, subtitle, action, children }) {
  return (
    <section className="rounded-none border border-[#E5E7EB] bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E5E7EB] px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-[14px] font-bold leading-snug text-[#111827]">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs leading-relaxed text-[#6B7280]">{subtitle}</p> : null}
        </div>
        {action || null}
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
