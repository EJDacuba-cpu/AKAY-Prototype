import { calculateBmi, formatBmi, getBmiCategory } from "../../../../utils/bmi";
import { NCD_PATHWAY_KEY, getActiveNcdSections, normalizeNcdData } from "../../../../utils/ncdMonitoring";
import { getPathwayDiagnoses } from "../../../../utils/carePathways";

/**
 * NCD Monitoring for this consultation. Vital signs are shown, not asked
 * again: they were recorded once on the Vital Signs step. The monitored
 * conditions come from Diagnosis / Clinical Impression, and a condition's own
 * fields (FBS for Diabetes Mellitus) appear only while it is diagnosed.
 *
 * @param value     ncdData ({ conditions, diabetes: { fbs } })
 * @param diagnoses the consultation's saved diagnoses
 * @param vitals    { systolicBp, diastolicBp, pulse, spo2, weight, height, temp }
 */

const LABEL_CLASS = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#374151]";
const INPUT_CLASS =
  "h-9 w-full rounded-none border border-[#D1D5DB] bg-white px-3 text-sm text-[#111827] outline-none transition-colors duration-150 placeholder:text-[#9CA3AF] focus:border-[#DC2626] focus:ring-2 focus:ring-red-200";

function VitalItem({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">{label}</dt>
      <dd className="text-sm font-semibold text-[#111827]">{value || <span className="font-normal text-[#9CA3AF]">Not recorded</span>}</dd>
    </div>
  );
}

export default function NcdMonitoringForm({ value, onChange, diagnoses = [], vitals = {}, onEditVitals, disabled = false }) {
  const data = normalizeNcdData(value);
  const conditions = getPathwayDiagnoses(NCD_PATHWAY_KEY, diagnoses);
  const sections = getActiveNcdSections(diagnoses);
  const bmi = calculateBmi(vitals.weight, vitals.height);
  const bp = vitals.systolicBp || vitals.diastolicBp ? `${vitals.systolicBp || "?"}/${vitals.diastolicBp || "?"} mmHg` : "";

  function setField(sectionKey, fieldKey, fieldValue) {
    onChange({ ...data, [sectionKey]: { ...data[sectionKey], [fieldKey]: fieldValue } });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className={LABEL_CLASS}>Monitored Conditions</p>
        {conditions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {conditions.map((name) => (
              <span
                key={name}
                className="inline-flex items-center rounded-sm border border-red-200 bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-[#DC2626]"
              >
                {name}
              </span>
            ))}
          </div>
        ) : (
          <p className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-[#374151]">
            No diagnosis linked to NCD Monitoring is recorded. Add it under Diagnosis / Clinical Impression, or turn
            NCD Monitoring off in Programs &amp; Monitoring.
          </p>
        )}
        <p className="mt-1 text-[11px] text-[#6B7280]">Taken from Diagnosis / Clinical Impression.</p>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#374151]">Vital Signs (this visit)</p>
          {onEditVitals && (
            <button type="button" onClick={onEditVitals} className="text-[12px] font-semibold text-[#DC2626] hover:text-red-700">
              Edit vital signs
            </button>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-3 border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2.5 @xl:grid-cols-4">
          <VitalItem label="Blood Pressure" value={bp} />
          <VitalItem label="Pulse" value={vitals.pulse && `${vitals.pulse} bpm`} />
          <VitalItem label="SpO₂" value={vitals.spo2 && `${vitals.spo2}%`} />
          <VitalItem label="Temperature" value={vitals.temp && `${vitals.temp} °C`} />
          <VitalItem label="Weight" value={vitals.weight && `${vitals.weight} kg`} />
          <VitalItem label="Height" value={vitals.height && `${vitals.height} cm`} />
          <VitalItem label="BMI" value={bmi !== null && `${formatBmi(bmi)} (${getBmiCategory(bmi)})`} />
        </dl>
        <p className="mt-1 text-[11px] text-[#6B7280]">Recorded once on the Vital Signs step; not entered again here.</p>
      </div>

      {sections.map((section) => (
        <div key={section.key}>
          <p className={LABEL_CLASS}>{section.title}</p>
          <div className="grid gap-4 @xl:grid-cols-2">
            {section.fields.map((field) => (
              <label key={field.key} className="block">
                <span className="mb-1.5 block text-xs font-medium text-[#374151]">{field.label}</span>
                <input
                  value={data[section.key][field.key]}
                  onChange={(event) => setField(section.key, field.key, event.target.value)}
                  placeholder={field.placeholder}
                  maxLength={field.maxLength}
                  disabled={disabled}
                  className={INPUT_CLASS}
                />
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
