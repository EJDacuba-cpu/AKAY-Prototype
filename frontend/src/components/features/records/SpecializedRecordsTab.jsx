import { Link } from "react-router";
import { Baby, ClipboardList, HeartPulse, UsersRound } from "lucide-react";

import {
  EPI_VACCINE_ROWS,
  formatDisplayTime,
  getConfirmedBreastfeedingMonths,
  getEpiBreastfeedingMonitoring,
  getEpiVaccineEntries,
  getRecordClassificationText,
  getRecordDateValue,
  getRecordId,
  getRecordTimeValue,
  getRecordValue,
  isEpiRecord,
  isFamilyPlanningRecord,
  isMaternalRecord,
  isNcdRecord,
  isTbRecord,
  normalizeVaccineName,
} from "../../../utils/healthRecordPrograms";
import { formatDate, formatDisplayValue } from "../../../utils/formatters";

export default function SpecializedRecordsTab({ records = [], basePath = "/bhc" }) {
  const epiRecords = records.filter(isEpiRecord);
  const maternalRecords = records.filter(isMaternalRecord);
  const fpRecords = records.filter(isFamilyPlanningRecord);
  const ncdRecords = records.filter(isNcdRecord);
  const tbRecords = records.filter(isTbRecord);
  const hasAny =
    epiRecords.length ||
    maternalRecords.length ||
    fpRecords.length ||
    ncdRecords.length ||
    tbRecords.length;

  if (!hasAny) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-400 shadow-sm">
        <ClipboardList className="mx-auto mb-3 text-slate-300" size={32} />
        No specialized records available for this patient.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {epiRecords.length > 0 && (
        <SpecializedSection
          icon={<Baby size={15} />}
          title="Immunization / EPI History"
          subtitle="Compiled from all Child Health / EPI health record visits."
        >
          <EpiHistory records={epiRecords} basePath={basePath} />
        </SpecializedSection>
      )}

      {maternalRecords.length > 0 && (
        <SpecializedSection
          icon={<HeartPulse size={15} />}
          title="Prenatal / Maternal History"
          subtitle="Visit-specific prenatal findings, supplements, and next checkups."
        >
          <MaternalHistory records={maternalRecords} basePath={basePath} />
        </SpecializedSection>
      )}

      {fpRecords.length > 0 && (
        <SpecializedSection
          icon={<UsersRound size={15} />}
          title="Family Planning History"
          subtitle="Family planning visits, methods, concerns, and appointments."
        >
          <FamilyPlanningHistory records={fpRecords} basePath={basePath} />
        </SpecializedSection>
      )}

      {ncdRecords.length > 0 && (
        <SpecializedSection
          icon={<HeartPulse size={15} />}
          title="NCD Monitoring History"
          subtitle="Compiled non-communicable disease monitoring visits."
        >
          <NcdHistory records={ncdRecords} basePath={basePath} />
        </SpecializedSection>
      )}

      {tbRecords.length > 0 && (
        <SpecializedSection
          icon={<ClipboardList size={15} />}
          title="TB DOTS / TB Monitoring History"
          subtitle="Compiled TB-related visits and monitoring notes."
        >
          <TbHistory records={tbRecords} basePath={basePath} />
        </SpecializedSection>
      )}
    </div>
  );
}

function SpecializedSection({ icon, title, subtitle, children }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 bg-slate-50/50 px-6 py-4">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[#B91C1C]">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[#0F172A]">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function EpiHistory({ records, basePath }) {
  const rows = compileEpiRows(records);
  const breastfeedingMonths = compileBreastfeedingMonths(records);

  return (
    <div>
      <ResponsiveTable minWidth="min-w-[980px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <TableHead>Vaccine</TableHead>
            <TableHead>Date Given</TableHead>
            <TableHead>Weight</TableHead>
            <TableHead>Height</TableHead>
            <TableHead>Temp</TableHead>
            <TableHead>Source Visit</TableHead>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm">
          {rows.map((row) => (
            <tr key={row.vaccineName} className="transition-colors hover:bg-slate-50/80">
              <TableCell strong>{row.vaccineName}</TableCell>
              <TableCell>{row.entry ? formatDate(row.dateGiven, "Not recorded") : "Not recorded"}</TableCell>
              <TableCell>{formatMeasurement(row.weight, "kg")}</TableCell>
              <TableCell>{formatMeasurement(row.height, "cm")}</TableCell>
              <TableCell>{formatMeasurement(row.temperature, "C")}</TableCell>
              <TableCell>
                {row.record ? (
                  <SourceVisitLink record={row.record} basePath={basePath} />
                ) : (
                  "Not recorded"
                )}
              </TableCell>
            </tr>
          ))}
        </tbody>
      </ResponsiveTable>

      <div className="border-t border-slate-100 px-6 py-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Exclusive Breastfeeding Monitoring
        </p>
        {breastfeedingMonths.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {breastfeedingMonths.map((month) => (
              <span
                key={month}
                className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-[#B91C1C]"
              >
                {month}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-400">
            No breastfeeding monitoring recorded yet.
          </p>
        )}
      </div>
    </div>
  );
}

function MaternalHistory({ records, basePath }) {
  return (
    <ResponsiveTable minWidth="min-w-[1120px]">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <TableHead>Visit Date</TableHead>
          <TableHead>AOG</TableHead>
          <TableHead>BP</TableHead>
          <TableHead>Weight</TableHead>
          <TableHead>Findings / Notes</TableHead>
          <TableHead>Supplements</TableHead>
          <TableHead>Next Visit</TableHead>
          <TableHead>Source Visit</TableHead>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 text-sm">
        {records.map((record) => {
          const maternalData = record.maternalData || record.maternal_data || {};
          return (
            <tr key={getRecordId(record)} className="transition-colors hover:bg-slate-50/80">
              <TableCell>{formatDate(getRecordDateValue(record), "Not recorded")}</TableCell>
              <TableCell>{getRecordValue(maternalData, ["aog", "ageOfGestation", "age_of_gestation"], record.aog || "") || "Not recorded"}</TableCell>
              <TableCell>{formatBp(record)}</TableCell>
              <TableCell>{formatMeasurement(record.weight, "kg")}</TableCell>
              <TableCell>{getNotes(record)}</TableCell>
              <TableCell>{formatSupplements(record)}</TableCell>
              <TableCell>{formatDate(getFollowUpDate(record), "Not recorded")}</TableCell>
              <TableCell><SourceVisitLink record={record} basePath={basePath} /></TableCell>
            </tr>
          );
        })}
      </tbody>
    </ResponsiveTable>
  );
}

function FamilyPlanningHistory({ records, basePath }) {
  return (
    <ResponsiveTable minWidth="min-w-[1120px]">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <TableHead>Visit Date</TableHead>
          <TableHead>Client Type</TableHead>
          <TableHead>Method Used / Accepted</TableHead>
          <TableHead>Concern</TableHead>
          <TableHead>Action Taken</TableHead>
          <TableHead>Next Appointment</TableHead>
          <TableHead>Source Visit</TableHead>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 text-sm">
        {records.map((record) => {
          const data = record.familyPlanningData || record.family_planning_data || {};
          return (
            <tr key={getRecordId(record)} className="transition-colors hover:bg-slate-50/80">
              <TableCell>{formatDate(getRecordDateValue(record), "Not recorded")}</TableCell>
              <TableCell>{getRecordValue(data, ["clientType", "client_type"], "Not recorded")}</TableCell>
              <TableCell>{getRecordValue(data, ["methodUsed", "method_used"], "Not recorded")}</TableCell>
              <TableCell>{getRecordValue(data, ["concern", "findings"], "Not recorded")}</TableCell>
              <TableCell>{getRecordValue(data, ["actionTaken", "action_taken", "adviceGiven", "advice_given"], "Not recorded")}</TableCell>
              <TableCell>{formatDate(getRecordValue(data, ["nextAppointmentDate", "next_appointment_date"], ""), "Not recorded")}</TableCell>
              <TableCell><SourceVisitLink record={record} basePath={basePath} /></TableCell>
            </tr>
          );
        })}
      </tbody>
    </ResponsiveTable>
  );
}

function NcdHistory({ records, basePath }) {
  return (
    <ResponsiveTable minWidth="min-w-[1040px]">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <TableHead>Visit Date</TableHead>
          <TableHead>BP</TableHead>
          <TableHead>Blood Sugar</TableHead>
          <TableHead>Weight</TableHead>
          <TableHead>Findings</TableHead>
          <TableHead>Medication / Action</TableHead>
          <TableHead>Next Follow-up</TableHead>
          <TableHead>Source Visit</TableHead>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 text-sm">
        {records.map((record) => (
          <tr key={getRecordId(record)} className="transition-colors hover:bg-slate-50/80">
            <TableCell>{formatDate(getRecordDateValue(record), "Not recorded")}</TableCell>
            <TableCell>{formatBp(record)}</TableCell>
            <TableCell>{getRecordValue(record, ["bloodSugar", "blood_sugar", "rbs", "fbs"], "Not recorded")}</TableCell>
            <TableCell>{formatMeasurement(record.weight, "kg")}</TableCell>
            <TableCell>{getNotes(record)}</TableCell>
            <TableCell>{getActionTaken(record)}</TableCell>
            <TableCell>{formatDate(getFollowUpDate(record), "Not recorded")}</TableCell>
            <TableCell><SourceVisitLink record={record} basePath={basePath} /></TableCell>
          </tr>
        ))}
      </tbody>
    </ResponsiveTable>
  );
}

function TbHistory({ records, basePath }) {
  return (
    <ResponsiveTable minWidth="min-w-[980px]">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <TableHead>Visit Date</TableHead>
          <TableHead>Phase / Category</TableHead>
          <TableHead>Symptoms</TableHead>
          <TableHead>Medication / Action</TableHead>
          <TableHead>Remarks</TableHead>
          <TableHead>Next Follow-up</TableHead>
          <TableHead>Source Visit</TableHead>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 text-sm">
        {records.map((record) => (
          <tr key={getRecordId(record)} className="transition-colors hover:bg-slate-50/80">
            <TableCell>{formatDate(getRecordDateValue(record), "Not recorded")}</TableCell>
            <TableCell>{getRecordValue(record, ["phase", "category"], getRecordClassificationText(record) || "Not recorded")}</TableCell>
            <TableCell>{getRecordValue(record, ["symptoms", "chiefComplaint", "chief_complaint"], "Not recorded")}</TableCell>
            <TableCell>{getActionTaken(record)}</TableCell>
            <TableCell>{getNotes(record)}</TableCell>
            <TableCell>{formatDate(getFollowUpDate(record), "Not recorded")}</TableCell>
            <TableCell><SourceVisitLink record={record} basePath={basePath} /></TableCell>
          </tr>
        ))}
      </tbody>
    </ResponsiveTable>
  );
}

function ResponsiveTable({ minWidth, children }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${minWidth} border-collapse text-left`}>
        {children}
      </table>
    </div>
  );
}

function TableHead({ children }) {
  return <th className="whitespace-nowrap px-6 py-3">{children}</th>;
}

function TableCell({ children, strong = false }) {
  return (
    <td
      className={`whitespace-nowrap px-6 py-4 ${
        strong ? "font-bold text-[#0F172A]" : "font-medium text-slate-600"
      }`}
    >
      {children}
    </td>
  );
}

function SourceVisitLink({ record, basePath }) {
  const recordId = getRecordId(record);
  const label = [
    formatDate(getRecordDateValue(record), "Visit"),
    formatDisplayTime(getRecordTimeValue(record), ""),
  ]
    .filter(Boolean)
    .join(" / ");

  if (!recordId) return formatDisplayValue(label, "Not recorded");

  return (
    <Link
      to={`${basePath}/health-records/${recordId}`}
      className="font-semibold text-[#B91C1C] underline-offset-2 transition hover:text-[#7F1D1D] hover:underline"
    >
      {label || `Record #${recordId}`}
    </Link>
  );
}

function compileEpiRows(records) {
  const allEntries = records.flatMap((record) =>
    getEpiVaccineEntries(record).map((entry) => ({
      ...entry,
      record,
      dateGiven: entry.dateGiven || getRecordDateValue(record),
      weight: entry.weight || record.weight || "",
      height: entry.height || record.height || "",
      temperature: entry.temperature || record.temperature || record.temp || "",
    })),
  );

  return EPI_VACCINE_ROWS.map((vaccineName) => {
    const matchingEntries = allEntries
      .filter((entry) => normalizeVaccineName(entry.vaccineName) === vaccineName)
      .sort((a, b) => getTime(a.dateGiven) - getTime(b.dateGiven));
    const entry = matchingEntries[0] || null;

    return {
      vaccineName,
      entry,
      record: entry?.record || null,
      dateGiven: entry?.dateGiven || "",
      weight: entry?.weight || "",
      height: entry?.height || "",
      temperature: entry?.temperature || "",
    };
  });
}

function compileBreastfeedingMonths(records) {
  return Array.from(
    new Set(
      records.flatMap((record) =>
        getConfirmedBreastfeedingMonths(getEpiBreastfeedingMonitoring(record)),
      ),
    ),
  );
}

function getTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
}

function formatMeasurement(value, unit) {
  const clean = String(value || "").trim();
  if (!clean) return "Not recorded";
  return clean.toLowerCase().includes(unit.toLowerCase())
    ? clean
    : `${clean} ${unit}`;
}

function formatBp(record = {}) {
  const vitalSigns = record.vitalSigns || record.vital_signs || {};
  const vitalObject =
    vitalSigns && typeof vitalSigns === "object" ? vitalSigns : {};
  const systolic =
    record.systolicBp ||
    record.systolic_bp ||
    vitalObject.systolicBp ||
    vitalObject.systolic_bp;
  const diastolic =
    record.diastolicBp ||
    record.diastolic_bp ||
    vitalObject.diastolicBp ||
    vitalObject.diastolic_bp;

  if (systolic && diastolic) return `${systolic}/${diastolic}`;
  return "Not recorded";
}

function formatSupplements(record = {}) {
  const maternalData = record.maternalData || record.maternal_data || {};
  const supplements =
    record.supplementsGiven ||
    record.supplements_given ||
    maternalData.supplementsGiven ||
    maternalData.supplements_given ||
    [];

  if (!Array.isArray(supplements) || supplements.length === 0) {
    return "Not recorded";
  }

  return supplements
    .map((item = {}) =>
      [
        item.supplement_name || item.supplementName || item.supplement_type,
        item.quantity,
        item.unit,
      ]
        .filter(Boolean)
        .join(" "),
    )
    .filter(Boolean)
    .join("; ");
}

function getNotes(record = {}) {
  return formatDisplayValue(
    record.findings ||
      record.notes ||
      record.consultationNotes ||
      record.consultation_notes ||
      record.monitoringNotes ||
      record.monitoring_notes ||
      record.medicalHistory ||
      record.medical_history,
    "Not recorded",
  );
}

function getActionTaken(record = {}) {
  return formatDisplayValue(
    record.initialActionsTaken ||
      record.initial_actions_taken ||
      record.treatmentNotes ||
      record.treatment_notes ||
      record.medication ||
      record.actionTaken ||
      record.action_taken,
    "Not recorded",
  );
}

function getFollowUpDate(record = {}) {
  const monitoringData = record.monitoringData || record.monitoring_data || {};
  return (
    record.followUpDate ||
    record.follow_up_date ||
    record.nextAppointmentDate ||
    record.next_appointment_date ||
    monitoringData.followUpDate ||
    monitoringData.follow_up_date ||
    ""
  );
}

