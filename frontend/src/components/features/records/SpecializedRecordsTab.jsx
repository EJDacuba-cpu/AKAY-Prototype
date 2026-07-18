import { Link } from "react-router";
import { Baby, ClipboardList, HeartPulse, UsersRound } from "lucide-react";

import {
  formatDisplayTime,
  getConfirmedBreastfeedingMonths,
  getEpiBreastfeedingMonitoring,
  getHypertensionDiabeticData,
  getRecordClassificationText,
  getRecordDateValue,
  getRecordId,
  getRecordTimeValue,
  getRecordValue,
  formatHypertensionDiabeticClientStatus,
  formatHypertensionDiabeticCondition,
  isEpiRecord,
  isFamilyPlanningRecord,
  isMaternalRecord,
  isNcdRecord,
  isTbRecord,
} from "../../../utils/healthRecordPrograms";
import {
  REQUIRED_EPI_ITEMS,
  compileEpiHistory,
  formatEpiDate,
} from "../../../utils/epiTracking";
import { formatDate, formatDisplayValue } from "../../../utils/formatters";

const EMPTY_MARK = "Not recorded";
const SOURCE_EMPTY_MARK = "\u2014";
const TT_TD_DOSES = [1, 2, 3, 4, 5];

export default function SpecializedRecordsTab({
  records = [],
  patient = null,
  basePath = "/bhc",
}) {
  const ownRecords = records.filter((record) =>
    isOwnPatientRecord(record, patient),
  );
  const isFemale = isFemalePatient(patient);
  const epiRecords = ownRecords.filter(isEpiRecord);
  const maternalRecords = isFemale ? ownRecords.filter(isMaternalRecord) : [];
  const fpRecords = ownRecords.filter(isFamilyPlanningRecord);
  const ncdRecords = ownRecords.filter(isNcdRecord);
  const tbRecords = ownRecords.filter(isTbRecord);
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
        No specialized records recorded for this patient yet.
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
          title="Hypertension / Diabetic Monitoring History"
          subtitle="Compiled BP, FBS, HPN/DM status, treatment, and follow-up visits."
        >
          <NcdHistory records={ncdRecords} />
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

function SpecializedSubsection({ title, subtitle, children }) {
  return (
    <div className="border-t border-slate-100 first:border-t-0">
      <div className="px-6 py-4">
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[#0F172A]">
          {title}
        </h3>
        {subtitle && (
          <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function isFemalePatient(patient = {}) {
  const normalized = String(patient?.sex || patient?.gender || "")
    .trim()
    .toLowerCase();
  return normalized === "female" || normalized === "f";
}

function isOwnPatientRecord(record = {}, patient = {}) {
  const patientId = String(
    patient?.id || patient?.patientId || patient?.patient_id || "",
  );
  const recordPatientId = String(
    record.patientId ||
      record.patient_id ||
      record.patient?.id ||
      record.patient?.patientId ||
      record.patient?.patient_id ||
      "",
  );

  if (!patientId || !recordPatientId) return true;
  return patientId === recordPatientId;
}

function EpiHistory({ records, basePath }) {
  const rows = compileEpiRows(records);
  const breastfeedingMonths = compileBreastfeedingMonths(records);
  const remainingRows = rows.filter((row) => row.status !== "Given");
  const complete = remainingRows.length === 0;

  return (
    <div>
      <div className="border-b border-slate-100 px-6 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              EPI Status
            </p>
            <p
              className={`mt-1 text-sm font-bold ${
                complete ? "text-emerald-700" : "text-[#B91C1C]"
              }`}
            >
              {complete ? "Complete" : "Incomplete"}
            </p>
          </div>
          {!complete && (
            <p className="max-w-xl text-xs leading-relaxed text-slate-500">
              Remaining vaccines/services:{" "}
              <span className="font-semibold text-[#0F172A]">
                {remainingRows.map((row) => row.vaccineName).join(", ")}
              </span>
            </p>
          )}
        </div>
      </div>

      <ResponsiveTable minWidth="min-w-[760px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <TableHead>Vaccine / Service</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date Given</TableHead>
            <TableHead>Source Visit</TableHead>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm">
          {rows.map((row) => (
            <tr key={row.vaccineName} className="transition-colors hover:bg-slate-50/80">
              <TableCell strong>{row.vaccineName}</TableCell>
              <TableCell>
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    row.status === "Given"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {row.status}
                </span>
              </TableCell>
              <TableCell>{row.dateGiven ? formatEpiDate(row.dateGiven) : SOURCE_EMPTY_MARK}</TableCell>
              <TableCell>
                {row.record ? (
                  <SourceVisitLink
                    record={row.record}
                    basePath={basePath}
                    label={row.sourceVisitLabel}
                  />
                ) : (
                  SOURCE_EMPTY_MARK
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
    <div>
      <SpecializedSubsection
        title="Prenatal Visit History"
        subtitle="Compiled from this patient's own Maternal / Prenatal visits."
      >
        {records.length > 0 ? (
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
                const maternalData = getMaternalData(record);
                return (
                  <tr key={getRecordId(record)} className="transition-colors hover:bg-slate-50/80">
                    <TableCell>{formatDate(getRecordDateValue(record), EMPTY_MARK)}</TableCell>
                    <TableCell>{getRecordValue(maternalData, ["aog", "ageOfGestation", "age_of_gestation"], record.aog || "") || EMPTY_MARK}</TableCell>
                    <TableCell>{formatBp(record)}</TableCell>
                    <TableCell>{formatMeasurement(record.weight, "kg")}</TableCell>
                    <TableCell>{getNotes(record)}</TableCell>
                    <TableCell>{formatSupplements(record)}</TableCell>
                    <TableCell>{formatDate(getFollowUpDate(record), EMPTY_MARK)}</TableCell>
                    <TableCell><SourceVisitLink record={record} basePath={basePath} label="View" /></TableCell>
                  </tr>
                );
              })}
            </tbody>
          </ResponsiveTable>
        ) : (
          <SectionEmptyState text="No maternal/prenatal history recorded for this patient." />
        )}
      </SpecializedSubsection>

      <SpecializedSubsection
        title="TT / Td History"
        subtitle="Compiled TT/Td doses recorded across this patient's Maternal / Prenatal visits."
      >
        <TtTdHistory records={records} basePath={basePath} />
      </SpecializedSubsection>
    </div>
  );
}

function TtTdHistory({ records, basePath }) {
  const rows = compileTtTdRows(records);
  const hasRecordedDose = rows.some((row) => row.dateGiven);

  return (
    <div>
      <ResponsiveTable minWidth="min-w-[620px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <TableHead>Dose</TableHead>
            <TableHead>Date Given</TableHead>
            <TableHead>Source Visit</TableHead>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm">
          {rows.map((row) => (
            <tr key={row.dose} className="transition-colors hover:bg-slate-50/80">
              <TableCell strong>{row.label}</TableCell>
              <TableCell>{row.dateGiven ? formatDate(row.dateGiven, EMPTY_MARK) : EMPTY_MARK}</TableCell>
              <TableCell>
                {row.record ? (
                  <SourceVisitLink record={row.record} basePath={basePath} label="View" />
                ) : (
                  SOURCE_EMPTY_MARK
                )}
              </TableCell>
            </tr>
          ))}
        </tbody>
      </ResponsiveTable>
      {!hasRecordedDose && (
        <p className="border-t border-slate-100 px-6 py-4 text-sm text-slate-400">
          No TT/Td dose recorded for this patient.
        </p>
      )}
    </div>
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
              <TableCell>{formatDate(getRecordDateValue(record), EMPTY_MARK)}</TableCell>
              <TableCell>{getRecordValue(data, ["clientType", "client_type"], EMPTY_MARK)}</TableCell>
              <TableCell>{getRecordValue(data, ["methodUsed", "method_used"], EMPTY_MARK)}</TableCell>
              <TableCell>{getRecordValue(data, ["concern", "findings"], EMPTY_MARK)}</TableCell>
              <TableCell>{getRecordValue(data, ["actionTaken", "action_taken", "adviceGiven", "advice_given"], EMPTY_MARK)}</TableCell>
              <TableCell>{formatDate(getRecordValue(data, ["nextAppointmentDate", "next_appointment_date"], ""), EMPTY_MARK)}</TableCell>
              <TableCell><SourceVisitLink record={record} basePath={basePath} /></TableCell>
            </tr>
          );
        })}
      </tbody>
    </ResponsiveTable>
  );
}

function NcdHistory({ records }) {
  return (
    <ResponsiveTable minWidth="min-w-[1040px]">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <TableHead>Visit Date</TableHead>
          <TableHead>BP</TableHead>
          <TableHead>FBS</TableHead>
          <TableHead>Condition</TableHead>
          <TableHead>Client Status</TableHead>
          <TableHead>Next Follow-up</TableHead>
          <TableHead>Remarks / Action Taken</TableHead>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 text-sm">
        {records.map((record) => {
          const data = getHypertensionDiabeticData(record);
          return (
            <tr key={getRecordId(record)} className="transition-colors hover:bg-slate-50/80">
              <TableCell>{formatDate(getRecordDateValue(record), EMPTY_MARK)}</TableCell>
              <TableCell>{data.bp || formatBp(record)}</TableCell>
              <TableCell>{data.fbs || EMPTY_MARK}</TableCell>
              <TableCell>{formatHypertensionDiabeticCondition(data.conditionType) || EMPTY_MARK}</TableCell>
              <TableCell>{formatHypertensionDiabeticClientStatus(data.clientStatus) || EMPTY_MARK}</TableCell>
              <TableCell>{formatDate(getFollowUpDate(record), EMPTY_MARK)}</TableCell>
              <TableCell>{data.treatmentActionTaken || getActionTaken(record)}</TableCell>
            </tr>
          );
        })}
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
            <TableCell>{formatDate(getRecordDateValue(record), EMPTY_MARK)}</TableCell>
            <TableCell>{getRecordValue(record, ["phase", "category"], getRecordClassificationText(record) || EMPTY_MARK)}</TableCell>
            <TableCell>{getRecordValue(record, ["symptoms", "chiefComplaint", "chief_complaint"], EMPTY_MARK)}</TableCell>
            <TableCell>{getActionTaken(record)}</TableCell>
            <TableCell>{getNotes(record)}</TableCell>
            <TableCell>{formatDate(getFollowUpDate(record), EMPTY_MARK)}</TableCell>
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

function SourceVisitLink({ record, basePath, label: explicitLabel }) {
  const recordId = getRecordId(record);
  const label = [
    formatDate(getRecordDateValue(record), "Visit"),
    formatDisplayTime(getRecordTimeValue(record), ""),
  ]
    .filter(Boolean)
    .join(" / ");

  if (!recordId) return formatDisplayValue(label, SOURCE_EMPTY_MARK);

  return (
    <Link
      to={`${basePath}/health-records/${recordId}`}
      className="font-semibold text-[#B91C1C] underline-offset-2 transition hover:text-[#7F1D1D] hover:underline"
    >
      {explicitLabel || label || `Record #${recordId}`}
    </Link>
  );
}

function compileEpiRows(records) {
  const historyByCode = compileEpiHistory(records);

  return REQUIRED_EPI_ITEMS.map((item) => {
    const entry = historyByCode.get(item.code) || null;
    return {
      vaccineName: item.label,
      status: entry ? "Given" : "Pending",
      entry,
      record: entry?.record || null,
      dateGiven: entry?.dateGiven || "",
      sourceVisitLabel: entry?.record
        ? `Record #${getRecordId(entry.record)}`
        : SOURCE_EMPTY_MARK,
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
  if (!clean) return EMPTY_MARK;
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
  return EMPTY_MARK;
}

function formatSupplements(record = {}) {
  const maternalData = getMaternalData(record);
  const supplements =
    record.supplementsGiven ||
    record.supplements_given ||
    maternalData.supplementsGiven ||
    maternalData.supplements_given ||
    [];

  if (!Array.isArray(supplements) || supplements.length === 0) {
    return EMPTY_MARK;
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

function getMaternalData(record = {}) {
  return normalizeObject(record.maternalData || record.maternal_data);
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
    EMPTY_MARK,
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
    EMPTY_MARK,
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

function compileTtTdRows(records = []) {
  const recordedDoses = records.flatMap((record) =>
    TT_TD_DOSES.map((dose) => {
      const match = findTtTdDoseMatch(record, dose);
      if (!match?.value) return null;
      const dateGiven = resolveTtTdDateValue(match.value, record);
      if (!dateGiven) return null;

      return {
        dose,
        dateGiven,
        record,
        time: getTime(dateGiven) || getTime(getRecordDateValue(record)),
      };
    }).filter(Boolean),
  );

  return TT_TD_DOSES.map((dose) => {
    const bestMatch =
      recordedDoses
        .filter((item) => item.dose === dose)
        .sort((a, b) => a.time - b.time)[0] || null;

    return {
      dose,
      label: `TT${dose} / Td${dose}`,
      dateGiven: bestMatch?.dateGiven || "",
      record: bestMatch?.record || null,
    };
  });
}

function findTtTdDoseMatch(record = {}, dose) {
  const maternal = getMaternalData(record);
  const sourceObjects = [
    normalizeObject(maternal.tetanusToxoidStatus),
    normalizeObject(maternal.tetanus_toxoid_status),
    normalizeObject(maternal.tetanusToxoid),
    normalizeObject(maternal.tetanus_toxoid),
    normalizeObject(maternal.ttStatus),
    normalizeObject(maternal.tt_status),
    normalizeObject(maternal.tdStatus),
    normalizeObject(maternal.td_status),
    normalizeObject(record.tetanusToxoidStatus),
    normalizeObject(record.tetanus_toxoid_status),
    maternal,
    normalizeObject(record),
  ];
  const keys = buildTtTdDoseKeys(dose);
  const normalizedKeys = new Map(
    keys.map((item) => [normalizeRecordKey(item.key), item.prefix]),
  );

  for (const source of sourceObjects) {
    for (const { key, prefix } of keys) {
      const value = source?.[key];
      if (value) return { value, prefix };
    }

    for (const [key, value] of Object.entries(source || {})) {
      const prefix = normalizedKeys.get(normalizeRecordKey(key));
      if (value && prefix) return { value, prefix };
    }
  }

  return null;
}

function resolveTtTdDateValue(value, record = {}) {
  if (value === true) return getRecordDateValue(record);
  const normalized = String(value || "").trim().toLowerCase();

  if (["true", "yes", "y", "given", "recorded", "done"].includes(normalized)) {
    return getRecordDateValue(record);
  }

  return value;
}

function buildTtTdDoseKeys(dose) {
  const ttKeys = [
    `tt${dose}`,
    `TT${dose}`,
    `tt${dose}Date`,
    `tt${dose}_date`,
    `TT${dose}Date`,
    `tt${dose}DateDone`,
    `tt${dose}_date_done`,
    `tt${dose}DateGiven`,
    `tt${dose}_date_given`,
    `tetanusToxoid${dose}`,
    `tetanus_toxoid_${dose}`,
    `tetanusToxoidStatus${dose}`,
    `tetanus_toxoid_status_${dose}`,
  ];
  const tdKeys = [
    `td${dose}`,
    `TD${dose}`,
    `td${dose}Date`,
    `td${dose}_date`,
    `TD${dose}Date`,
    `td${dose}DateDone`,
    `td${dose}_date_done`,
    `td${dose}DateGiven`,
    `td${dose}_date_given`,
  ];
  const sharedKeys = [
    `TDTT${dose}`,
    `tdtt${dose}`,
    `tdtt${dose}Date`,
    `tdtt${dose}_date`,
    `tdtt${dose}DateDone`,
    `tdtt${dose}_date_done`,
    `tdtt${dose}DateGiven`,
    `tdtt${dose}_date_given`,
    `tetanus${dose}`,
    `tetanus_${dose}`,
    `tetanusDose${dose}`,
    `tetanus_dose_${dose}`,
  ];

  return [
    ...ttKeys.map((key) => ({ key, prefix: "TT" })),
    ...tdKeys.map((key) => ({ key, prefix: "Td" })),
    ...sharedKeys.map((key) => ({ key, prefix: "TT" })),
  ];
}

function normalizeRecordKey(key) {
  return String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeObject(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function SectionEmptyState({ text }) {
  return (
    <div className="border-t border-slate-100 px-6 py-8 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}
