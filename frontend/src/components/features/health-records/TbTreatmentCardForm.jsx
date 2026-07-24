import { useState } from "react";
import { Download, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { DatePickerField } from "../../common/forms/DatePickerField";
import { downloadTbCardPdf } from "../../../services/healthRecordService";
import TbDoseCalendar, {
  createEmptyMonth,
  normalizeMonth,
  recomputeCalendar,
} from "./TbDoseCalendar";

// ---------------------------------------------------------------------------
// Option sets (mirror the DOH Form 4b checkboxes)
// ---------------------------------------------------------------------------
export const TB_REFERRED_BY_OPTIONS = [
  { value: "public", label: "Public" },
  { value: "other_public", label: "Other Public" },
  { value: "private", label: "Private" },
  { value: "community", label: "Community" },
];

export const TB_SCREENING_CATEGORY_OPTIONS = [
  { value: "PCF", label: "PCF" },
  { value: "ACF", label: "ACF" },
  { value: "ICF", label: "ICF" },
  { value: "ECF", label: "ECF" },
];

export const TB_DIAGNOSIS_TYPE_OPTIONS = [
  { value: "tb_disease", label: "TB Disease" },
  { value: "tb_infection", label: "TB Infection" },
];

export const TB_BACTERIOLOGICAL_OPTIONS = [
  { value: "bacteriologically_confirmed", label: "Bacteriologically-confirmed TB" },
  { value: "clinically_diagnosed", label: "Clinically-diagnosed TB" },
];

export const TB_ANATOMICAL_SITE_OPTIONS = [
  { value: "pulmonary", label: "Pulmonary" },
  { value: "extrapulmonary", label: "Extra-pulmonary" },
];

export const TB_DRUG_RESISTANCE_OPTIONS = [
  { value: "drug_susceptible", label: "Drug-susceptible" },
  { value: "rr_tb", label: "Bacteriologically-confirmed RR-TB" },
  { value: "mdr_tb", label: "Bacteriologically-confirmed MDR-TB" },
  { value: "clinically_mdr_tb", label: "Clinically-diagnosed MDR-TB" },
  { value: "xdr_tb", label: "Bacteriologically-confirmed XDR-TB" },
  { value: "other", label: "Other Drug-resistant TB" },
];

export const TB_REGISTRATION_GROUP_OPTIONS = [
  { value: "new", label: "New" },
  { value: "relapse", label: "Relapse" },
  { value: "taf", label: "TAF" },
  { value: "talf", label: "TALF" },
  { value: "ptou", label: "PTOU" },
  { value: "unknown_history", label: "Unknown History" },
];

export const TB_LOCATION_OF_TREATMENT_OPTIONS = [
  { value: "facility", label: "Facility-based" },
  { value: "community", label: "Community-based" },
  { value: "home_based", label: "Home-based" },
];

const LAB_TESTS = [
  { key: "xpert", label: "Xpert MTB/RIF (± Ultra)" },
  { key: "smearOrLamp", label: "Smear Microscopy / TB LAMP" },
  { key: "chestXray", label: "Chest X-ray" },
  { key: "tst", label: "Tuberculin Skin Test" },
];

// ---------------------------------------------------------------------------
// Empty shape + normalization (single source of truth, shared by BHC + RHU)
// ---------------------------------------------------------------------------
function emptyLabTest() {
  return { collectionDate: "", examDate: "", result: "" };
}

export function createEmptyRegimenRow() {
  return {
    dateStart: "",
    drug4fdc: "",
    drug2fdc: "",
    drugH: "",
    drugR: "",
    drugZ: "",
    drugE: "",
    strength: "",
    unit: "",
  };
}

export function createEmptyAdverseEvent() {
  return { dateOfAe: "", specificAe: "", dateReportedToFda: "" };
}

export const EMPTY_TB_DATA = {
  caseFinding: {
    diagnosingFacility: "",
    ntpFacilityCode: "",
    provinceHuc: "",
    region: "",
    referredBy: "",
    screeningCategory: "",
    dateOfScreening: "",
  },
  laboratory: {
    xpert: emptyLabTest(),
    smearOrLamp: emptyLabTest(),
    chestXray: emptyLabTest(),
    tst: emptyLabTest(),
    other: { label: "", collectionDate: "", examDate: "", result: "" },
  },
  diagnosis: {
    diagnosisType: "",
    dateOfDiagnosis: "",
    dateOfNotification: "",
    tbCaseNumber: "",
    attendingPhysician: "",
    referredTo: "",
  },
  classification: {
    bacteriologicalStatus: "",
    anatomicalSite: "",
    extrapulmonarySite: "",
    drugResistance: "",
    registrationGroup: "",
  },
  regimen: { rows: [createEmptyRegimenRow()] },
  treatmentSupporter: {
    locationOfTreatment: "",
    supporterName: "",
    supporterDesignation: "",
    supporterType: "",
    contactInfo: "",
    datSupported: false,
    scheduleOfTreatment: "",
  },
  phases: {
    intensiveStart: "",
    intensiveEnd: "",
    continuationStart: "",
    continuationEnd: "",
  },
  adverseEvents: [],
  doseCalendar: { months: [createEmptyMonth(0)], adherencePercent: 0 },
};

function mergeGroup(empty, source) {
  return { ...empty, ...(source && typeof source === "object" ? source : {}) };
}

// Deep-merge a loaded record's tb_data into the canonical empty shape so every
// field is defined and the dose calendar is padded/recomputed.
export function normalizeTbData(source) {
  const data = source && typeof source === "object" ? source : {};
  const laboratory = data.laboratory || {};
  const rawRows = Array.isArray(data.regimen?.rows) ? data.regimen.rows : [];
  const rawMonths = Array.isArray(data.doseCalendar?.months)
    ? data.doseCalendar.months
    : [];

  const months = rawMonths.length
    ? rawMonths.map((m, i) => normalizeMonth(m, i))
    : [createEmptyMonth(0)];

  return {
    caseFinding: mergeGroup(EMPTY_TB_DATA.caseFinding, data.caseFinding),
    laboratory: {
      xpert: mergeGroup(emptyLabTest(), laboratory.xpert),
      smearOrLamp: mergeGroup(emptyLabTest(), laboratory.smearOrLamp),
      chestXray: mergeGroup(emptyLabTest(), laboratory.chestXray),
      tst: mergeGroup(emptyLabTest(), laboratory.tst),
      other: mergeGroup(EMPTY_TB_DATA.laboratory.other, laboratory.other),
    },
    diagnosis: mergeGroup(EMPTY_TB_DATA.diagnosis, data.diagnosis),
    classification: mergeGroup(
      EMPTY_TB_DATA.classification,
      data.classification,
    ),
    regimen: {
      rows: rawRows.length
        ? rawRows.map((row) => mergeGroup(createEmptyRegimenRow(), row))
        : [createEmptyRegimenRow()],
    },
    treatmentSupporter: mergeGroup(
      EMPTY_TB_DATA.treatmentSupporter,
      data.treatmentSupporter,
    ),
    phases: mergeGroup(EMPTY_TB_DATA.phases, data.phases),
    adverseEvents: Array.isArray(data.adverseEvents)
      ? data.adverseEvents.map((ae) => mergeGroup(createEmptyAdverseEvent(), ae))
      : [],
    // Recompute totals on load so stored/derived values are always consistent.
    doseCalendar: recomputeCalendar(months),
  };
}

// ---------------------------------------------------------------------------
// Small presentational field helpers (match the app's form design tokens)
// ---------------------------------------------------------------------------
function FieldLabel({ label, required }) {
  return (
    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
  );
}

const inputClass =
  "h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3.5 text-sm text-[#1F2937] outline-none transition-all duration-200 hover:border-[#D1D5DB] focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10";

function TextField({ label, value, onChange, required, placeholder }) {
  return (
    <div className="min-w-0">
      <FieldLabel label={label} required={required} />
      <input
        type="text"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options, required, placeholder }) {
  return (
    <div className="min-w-0">
      <FieldLabel label={label} required={required} />
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} cursor-pointer`}
      >
        <option value="">{placeholder || "Select…"}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function DateField({ label, value, onChange, required }) {
  return (
    <DatePickerField
      label={label}
      value={value ?? ""}
      onChange={onChange}
      required={required}
      allowClear
    />
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-4">
        <h4 className="text-sm font-bold text-[#0F172A]">{title}</h4>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main form section
// ---------------------------------------------------------------------------
/**
 * Full DOH Form 4b (DS-TB Treatment Card) editor. Controlled: `value` is the
 * tb_data object, `onChange(nextTbData)` receives every mutation. Shared by the
 * BHC and RHU health-record forms so the two stay in sync.
 */
export default function TbTreatmentCardForm({
  value,
  onChange,
  readOnly = false,
  recordId = null,
}) {
  const data = value || EMPTY_TB_DATA;
  const [downloading, setDownloading] = useState(false);

  const handleDownloadPdf = async () => {
    if (!recordId || downloading) return;
    setDownloading(true);
    try {
      await downloadTbCardPdf(recordId);
    } catch {
      toast.error("Unable to generate the DOH treatment card PDF.");
    } finally {
      setDownloading(false);
    }
  };

  const setGroupField = (group, field, fieldValue) => {
    onChange({
      ...data,
      [group]: { ...data[group], [field]: fieldValue },
    });
  };

  const setLabField = (test, field, fieldValue) => {
    onChange({
      ...data,
      laboratory: {
        ...data.laboratory,
        [test]: { ...data.laboratory[test], [field]: fieldValue },
      },
    });
  };

  const setRegimenRow = (index, field, fieldValue) => {
    const rows = data.regimen.rows.map((row, i) =>
      i === index ? { ...row, [field]: fieldValue } : row,
    );
    onChange({ ...data, regimen: { rows } });
  };

  const addRegimenRow = () => {
    if (data.regimen.rows.length >= 10) return;
    onChange({
      ...data,
      regimen: { rows: [...data.regimen.rows, createEmptyRegimenRow()] },
    });
  };

  const removeRegimenRow = (index) => {
    const rows = data.regimen.rows.filter((_, i) => i !== index);
    onChange({
      ...data,
      regimen: { rows: rows.length ? rows : [createEmptyRegimenRow()] },
    });
  };

  const setAdverseEvent = (index, field, fieldValue) => {
    const adverseEvents = data.adverseEvents.map((ae, i) =>
      i === index ? { ...ae, [field]: fieldValue } : ae,
    );
    onChange({ ...data, adverseEvents });
  };

  const addAdverseEvent = () => {
    if (data.adverseEvents.length >= 30) return;
    onChange({
      ...data,
      adverseEvents: [...data.adverseEvents, createEmptyAdverseEvent()],
    });
  };

  const removeAdverseEvent = (index) => {
    onChange({
      ...data,
      adverseEvents: data.adverseEvents.filter((_, i) => i !== index),
    });
  };

  const setCalendar = (nextCalendar) => {
    onChange({ ...data, doseCalendar: nextCalendar });
  };

  return (
    <div className="space-y-4">
      {recordId && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#B91C1C] px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-[#B91C1C]/20 transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download size={14} />
            {downloading ? "Preparing…" : "Download DOH Card (PDF)"}
          </button>
        </div>
      )}

      {/* I. Case Finding / Notification */}
      <SectionCard
        title="I. Case Finding / Notification"
        subtitle="Diagnosing facility and screening details."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Diagnosing Facility"
            value={data.caseFinding.diagnosingFacility}
            onChange={(v) => setGroupField("caseFinding", "diagnosingFacility", v)}
          />
          <TextField
            label="NTP Facility Code"
            value={data.caseFinding.ntpFacilityCode}
            onChange={(v) => setGroupField("caseFinding", "ntpFacilityCode", v)}
          />
          <TextField
            label="Province / HUC"
            value={data.caseFinding.provinceHuc}
            onChange={(v) => setGroupField("caseFinding", "provinceHuc", v)}
          />
          <TextField
            label="Region"
            value={data.caseFinding.region}
            onChange={(v) => setGroupField("caseFinding", "region", v)}
          />
          <SelectField
            label="Referred By"
            value={data.caseFinding.referredBy}
            onChange={(v) => setGroupField("caseFinding", "referredBy", v)}
            options={TB_REFERRED_BY_OPTIONS}
          />
          <SelectField
            label="Screening Category"
            value={data.caseFinding.screeningCategory}
            onChange={(v) => setGroupField("caseFinding", "screeningCategory", v)}
            options={TB_SCREENING_CATEGORY_OPTIONS}
          />
          <DateField
            label="Date of Screening"
            value={data.caseFinding.dateOfScreening}
            onChange={(v) => setGroupField("caseFinding", "dateOfScreening", v)}
          />
        </div>
      </SectionCard>

      {/* Laboratory Tests */}
      <SectionCard
        title="Laboratory Tests"
        subtitle="Collection / examination dates and results."
      >
        <div className="space-y-3">
          {LAB_TESTS.map((test) => (
            <div
              key={test.key}
              className="grid grid-cols-1 gap-3 rounded-lg bg-slate-50/60 p-3 sm:grid-cols-[1.3fr_1fr_1fr_1.3fr]"
            >
              <div className="flex items-center text-xs font-semibold text-[#334155]">
                {test.label}
              </div>
              <DateField
                label="Collection"
                value={data.laboratory[test.key].collectionDate}
                onChange={(v) => setLabField(test.key, "collectionDate", v)}
              />
              <DateField
                label="Examination"
                value={data.laboratory[test.key].examDate}
                onChange={(v) => setLabField(test.key, "examDate", v)}
              />
              <TextField
                label="Result"
                value={data.laboratory[test.key].result}
                onChange={(v) => setLabField(test.key, "result", v)}
              />
            </div>
          ))}
          <div className="grid grid-cols-1 gap-3 rounded-lg bg-slate-50/60 p-3 sm:grid-cols-[1.3fr_1fr_1fr_1.3fr]">
            <TextField
              label="Other Test"
              value={data.laboratory.other.label}
              onChange={(v) => setLabField("other", "label", v)}
            />
            <DateField
              label="Collection"
              value={data.laboratory.other.collectionDate}
              onChange={(v) => setLabField("other", "collectionDate", v)}
            />
            <DateField
              label="Examination"
              value={data.laboratory.other.examDate}
              onChange={(v) => setLabField("other", "examDate", v)}
            />
            <TextField
              label="Result"
              value={data.laboratory.other.result}
              onChange={(v) => setLabField("other", "result", v)}
            />
          </div>
        </div>
      </SectionCard>

      {/* Diagnosis */}
      <SectionCard title="Diagnosis">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField
            label="Diagnosis"
            value={data.diagnosis.diagnosisType}
            onChange={(v) => setGroupField("diagnosis", "diagnosisType", v)}
            options={TB_DIAGNOSIS_TYPE_OPTIONS}
          />
          <DateField
            label="Date of Diagnosis"
            value={data.diagnosis.dateOfDiagnosis}
            onChange={(v) => setGroupField("diagnosis", "dateOfDiagnosis", v)}
          />
          <DateField
            label="Date of Notification"
            value={data.diagnosis.dateOfNotification}
            onChange={(v) => setGroupField("diagnosis", "dateOfNotification", v)}
          />
          <TextField
            label="TB Case Number"
            value={data.diagnosis.tbCaseNumber}
            onChange={(v) => setGroupField("diagnosis", "tbCaseNumber", v)}
            required
          />
          <TextField
            label="Attending Physician"
            value={data.diagnosis.attendingPhysician}
            onChange={(v) => setGroupField("diagnosis", "attendingPhysician", v)}
          />
          <TextField
            label="Referred To"
            value={data.diagnosis.referredTo}
            onChange={(v) => setGroupField("diagnosis", "referredTo", v)}
          />
        </div>
      </SectionCard>

      {/* TB Disease Classification */}
      <SectionCard title="TB Disease Classification">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField
            label="Bacteriological Status"
            value={data.classification.bacteriologicalStatus}
            onChange={(v) =>
              setGroupField("classification", "bacteriologicalStatus", v)
            }
            options={TB_BACTERIOLOGICAL_OPTIONS}
          />
          <SelectField
            label="Anatomical Site"
            value={data.classification.anatomicalSite}
            onChange={(v) => setGroupField("classification", "anatomicalSite", v)}
            options={TB_ANATOMICAL_SITE_OPTIONS}
          />
          <TextField
            label="Extra-pulmonary Site"
            value={data.classification.extrapulmonarySite}
            onChange={(v) =>
              setGroupField("classification", "extrapulmonarySite", v)
            }
          />
          <SelectField
            label="Drug Resistance Status"
            value={data.classification.drugResistance}
            onChange={(v) => setGroupField("classification", "drugResistance", v)}
            options={TB_DRUG_RESISTANCE_OPTIONS}
          />
          <SelectField
            label="Registration Group"
            value={data.classification.registrationGroup}
            onChange={(v) =>
              setGroupField("classification", "registrationGroup", v)
            }
            options={TB_REGISTRATION_GROUP_OPTIONS}
          />
        </div>
      </SectionCard>

      {/* Drug Regimen */}
      <SectionCard
        title="Drug Regimen"
        subtitle="Encircle a regimen change on the paper card. Add a row per date-start."
      >
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[880px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Date Start</th>
                <th className="px-2 py-2">4FDC</th>
                <th className="px-2 py-2">2FDC</th>
                <th className="px-2 py-2">H</th>
                <th className="px-2 py-2">R</th>
                <th className="px-2 py-2">Z</th>
                <th className="px-2 py-2">E</th>
                <th className="px-2 py-2">Strength</th>
                <th className="px-2 py-2">Unit</th>
                {!readOnly && <th className="px-1 py-2" />}
              </tr>
            </thead>
            <tbody>
              {data.regimen.rows.map((row, index) => (
                <tr key={index} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-2 py-1.5">
                    <DatePickerField
                      value={row.dateStart}
                      onChange={(v) => setRegimenRow(index, "dateStart", v)}
                      allowClear
                      placeholder="Date"
                    />
                  </td>
                  {["drug4fdc", "drug2fdc", "drugH", "drugR", "drugZ", "drugE"].map(
                    (drug) => (
                      <td key={drug} className="px-1 py-1.5">
                        <input
                          type="text"
                          value={row[drug] ?? ""}
                          maxLength={20}
                          onChange={(e) =>
                            setRegimenRow(index, drug, e.target.value)
                          }
                          className="h-9 w-16 rounded border border-[#E5E7EB] bg-white px-1 text-center text-xs text-[#0F172A] outline-none transition focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]/20"
                        />
                      </td>
                    ),
                  )}
                  <td className="px-1 py-1.5">
                    <input
                      type="text"
                      value={row.strength ?? ""}
                      onChange={(e) => setRegimenRow(index, "strength", e.target.value)}
                      className="h-9 w-28 rounded border border-[#E5E7EB] bg-white px-2 text-xs text-[#0F172A] outline-none transition focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]/20"
                    />
                  </td>
                  <td className="px-1 py-1.5">
                    <input
                      type="text"
                      value={row.unit ?? ""}
                      onChange={(e) => setRegimenRow(index, "unit", e.target.value)}
                      className="h-9 w-20 rounded border border-[#E5E7EB] bg-white px-2 text-xs text-[#0F172A] outline-none transition focus:border-[#B91C1C] focus:ring-1 focus:ring-[#B91C1C]/20"
                    />
                  </td>
                  {!readOnly && (
                    <td className="px-1 py-1.5">
                      <button
                        type="button"
                        onClick={() => removeRegimenRow(index)}
                        className="flex h-8 w-8 items-center justify-center rounded text-slate-400 transition hover:bg-red-50 hover:text-[#B91C1C]"
                        aria-label="Remove regimen row"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={addRegimenRow}
            disabled={data.regimen.rows.length >= 10}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-[#B91C1C] hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={14} />
            Add Regimen Row
          </button>
        )}
      </SectionCard>

      {/* Treatment Supporter + Phases */}
      <SectionCard title="Administration of Drugs">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField
            label="Location of Treatment"
            value={data.treatmentSupporter.locationOfTreatment}
            onChange={(v) =>
              setGroupField("treatmentSupporter", "locationOfTreatment", v)
            }
            options={TB_LOCATION_OF_TREATMENT_OPTIONS}
          />
          <TextField
            label="Tx Supporter Name"
            value={data.treatmentSupporter.supporterName}
            onChange={(v) =>
              setGroupField("treatmentSupporter", "supporterName", v)
            }
          />
          <TextField
            label="Designation"
            value={data.treatmentSupporter.supporterDesignation}
            onChange={(v) =>
              setGroupField("treatmentSupporter", "supporterDesignation", v)
            }
          />
          <TextField
            label="Supporter Type"
            value={data.treatmentSupporter.supporterType}
            onChange={(v) =>
              setGroupField("treatmentSupporter", "supporterType", v)
            }
            placeholder="Facility HCW / Community HCW / Family…"
          />
          <TextField
            label="Contact Information"
            value={data.treatmentSupporter.contactInfo}
            onChange={(v) => setGroupField("treatmentSupporter", "contactInfo", v)}
          />
          <TextField
            label="Schedule of Treatment"
            value={data.treatmentSupporter.scheduleOfTreatment}
            onChange={(v) =>
              setGroupField("treatmentSupporter", "scheduleOfTreatment", v)
            }
            placeholder="e.g. Once daily before breakfast"
          />
          <label className="flex items-center gap-2 pt-6 text-sm font-medium text-[#334155]">
            <input
              type="checkbox"
              checked={Boolean(data.treatmentSupporter.datSupported)}
              onChange={(e) =>
                setGroupField("treatmentSupporter", "datSupported", e.target.checked)
              }
              className="h-4 w-4 rounded border-slate-300 text-[#B91C1C] focus:ring-[#B91C1C]/30"
            />
            DAT-supported
          </label>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DateField
            label="Intensive Phase Start"
            value={data.phases.intensiveStart}
            onChange={(v) => setGroupField("phases", "intensiveStart", v)}
            required
          />
          <DateField
            label="Intensive Phase End"
            value={data.phases.intensiveEnd}
            onChange={(v) => setGroupField("phases", "intensiveEnd", v)}
          />
          <DateField
            label="Continuation Phase Start"
            value={data.phases.continuationStart}
            onChange={(v) => setGroupField("phases", "continuationStart", v)}
          />
          <DateField
            label="Continuation Phase End"
            value={data.phases.continuationEnd}
            onChange={(v) => setGroupField("phases", "continuationEnd", v)}
          />
        </div>
      </SectionCard>

      {/* Dose Calendar */}
      <SectionCard
        title="Administration of Drugs — Dose Calendar"
        subtitle="Mark each supervised dose with the Tx supporter's initials. Totals and adherence auto-compute."
      >
        <TbDoseCalendar
          value={data.doseCalendar}
          onChange={setCalendar}
          readOnly={readOnly}
        />
      </SectionCard>

      {/* Adverse Events */}
      <SectionCard
        title="Serious Adverse Events / AEs of Special Interest"
        subtitle="Record any adverse event and its FDA report date."
      >
        {data.adverseEvents.length === 0 ? (
          <p className="text-sm text-slate-400">No adverse events recorded.</p>
        ) : (
          <div className="space-y-3">
            {data.adverseEvents.map((ae, index) => (
              <div
                key={index}
                className="grid grid-cols-1 gap-3 rounded-lg bg-slate-50/60 p-3 sm:grid-cols-[1fr_1.6fr_1fr_auto]"
              >
                <DateField
                  label="Date of AE"
                  value={ae.dateOfAe}
                  onChange={(v) => setAdverseEvent(index, "dateOfAe", v)}
                />
                <TextField
                  label="Specific AE"
                  value={ae.specificAe}
                  onChange={(v) => setAdverseEvent(index, "specificAe", v)}
                />
                <DateField
                  label="Date Reported to FDA"
                  value={ae.dateReportedToFda}
                  onChange={(v) => setAdverseEvent(index, "dateReportedToFda", v)}
                />
                {!readOnly && (
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeAdverseEvent(index)}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-[#B91C1C]"
                      aria-label="Remove adverse event"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {!readOnly && (
          <button
            type="button"
            onClick={addAdverseEvent}
            disabled={data.adverseEvents.length >= 30}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-[#B91C1C] hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={14} />
            Add Adverse Event
          </button>
        )}
      </SectionCard>
    </div>
  );
}
