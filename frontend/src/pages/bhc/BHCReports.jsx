import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useParams } from "react-router";
import {
  Baby,
  ClipboardList,
  FileHeart,
  FileText,
  HeartPulse,
  Printer,
  SlidersHorizontal,
  Stethoscope,
  UsersRound,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ActiveFilterChips,
  CommonFilterPopover,
  SoftLoadingArea,
} from "../../components/common";
import { getFollowUpTasks } from "../../services/followUpTaskService";
import { getHealthRecords } from "../../services/healthRecordService";
import { getPatientDetailsListByRole } from "../../services/patientService";
import { getReferrals } from "../../services/referrals";
import {
  formatDate,
  formatDisplayValue,
  formatPatientName,
} from "../../utils/formatters";
import {
  createActiveFilterChips,
  isDateInPreset,
} from "../../utils/filterUtils";
import {
  EPI_VACCINE_ROWS,
  getEpiVaccineEntries,
  getRecordDateValue,
  getRecordId,
  getServiceTypeLabel,
  isEpiRecord,
  isFamilyPlanningRecord,
  isMaternalRecord,
  isNcdRecord,
  normalizeVaccineName,
} from "../../utils/healthRecordPrograms";
import { queryKeys } from "../../utils/queryKeys";

const REPORT_TYPES = [
  { key: "referrals", slug: "referrals", label: "Referral Reports" },
  { key: "family_planning", slug: "family-planning", label: "Family Planning" },
  { key: "epi", slug: "epi-target-client-list", label: "EPI Target Client List" },
  { key: "morbidity", slug: "morbidity", label: "Morbidity / Notifiable Diseases" },
  { key: "followups", slug: "follow-ups", label: "Follow-ups / Monitoring" },
  { key: "ncd", slug: "ncd", label: "NCD Monitoring" },
  { key: "maternal", slug: "maternal", label: "Maternal / Prenatal" },
];

const EMPTY_FILTERS = {
  dateRange: "all",
  dateFrom: "",
  dateTo: "",
  barangay: "",
  serviceType: "",
  status: "",
  ageRange: "",
  sex: "",
  urgency: "",
  receivingFacility: "",
  clientType: "",
  methodUsed: "",
  ageMonths: "",
  vaccineStatus: "",
  conditionType: "",
  aogRange: "",
  disease: "",
  notifiableStatus: "",
};

export default function BHCReports() {
  const { reportSlug = "referrals" } = useParams();
  const currentReport = REPORT_TYPES.find((report) => report.slug === reportSlug);
  const selectedReport = currentReport?.key || "referrals";
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);

  const { data: patients = [], isLoading: patientsLoading } = useQuery({
    queryKey: queryKeys.patients("bhc"),
    queryFn: () => getPatientDetailsListByRole("bhc"),
  });
  const { data: records = [], isLoading: recordsLoading } = useQuery({
    queryKey: queryKeys.healthRecords("bhc"),
    queryFn: () => getHealthRecords("bhc"),
  });
  const { data: referrals = [], isLoading: referralsLoading } = useQuery({
    queryKey: queryKeys.referrals("bhc"),
    queryFn: () => getReferrals(),
  });
  const { data: followUps = [], isLoading: followUpsLoading } = useQuery({
    queryKey: queryKeys.followUpTasks("bhc"),
    queryFn: () => getFollowUpTasks(),
    staleTime: 30_000,
  });

  const safePatients = useMemo(
    () => (Array.isArray(patients) ? patients : []),
    [patients],
  );
  const safeRecords = useMemo(
    () => (Array.isArray(records) ? records : []),
    [records],
  );
  const safeReferrals = useMemo(
    () => (Array.isArray(referrals) ? referrals : []),
    [referrals],
  );
  const safeFollowUps = useMemo(
    () => (Array.isArray(followUps) ? followUps : []),
    [followUps],
  );
  const patientMap = useMemo(
    () =>
      new Map(
        safePatients.map((patient) => [
          String(patient.id || patient.patientId || ""),
          patient,
        ]),
      ),
    [safePatients],
  );
  const barangayOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...safePatients.map((patient) => patient.barangay),
            ...safeReferrals.map((referral) => referral.barangay),
          ].filter(Boolean),
        ),
      ).sort(),
    [safePatients, safeReferrals],
  );
  const receivingFacilities = useMemo(
    () =>
      Array.from(
        new Set(
          safeReferrals
            .map(
              (referral) =>
                referral.receivingFacility ||
                referral.destinationFacility ||
                referral.ruralHealthUnit?.name,
            )
            .filter(Boolean),
        ),
      ).sort(),
    [safeReferrals],
  );

  const reportFields = getReportFilterFields(
    selectedReport,
    barangayOptions,
    receivingFacilities,
  );
  const activeFilters = createActiveFilterChips(filters, reportFields);
  const loading =
    patientsLoading || recordsLoading || referralsLoading || followUpsLoading;
  const reportLabel = currentReport?.label || "Reports";

  useEffect(() => {
    setFilters(EMPTY_FILTERS);
    setDraftFilters(EMPTY_FILTERS);
    setFilterOpen(false);
  }, [selectedReport]);

  function openFilters() {
    setDraftFilters(filters);
    setFilterOpen(true);
  }

  function applyFilters() {
    setFilters(draftFilters);
    setFilterOpen(false);
  }

  function resetFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
  }

  function removeFilter(key) {
    if (key === "dateRange") {
      setFilters((current) => ({
        ...current,
        dateRange: "all",
        dateFrom: "",
        dateTo: "",
      }));
      return;
    }

    setFilters((current) => ({ ...current, [key]: "" }));
  }

  function printSelectedReport() {
    window.print();
  }

  if (!currentReport) return <Navigate to="/bhc/reports/referrals" replace />;

  return (
    <DashboardLayout role="bhc" title="Reports">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #selected-report, #selected-report * { visibility: visible !important; }
          #selected-report { position: absolute; inset: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="space-y-4">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#0F172A]">{reportLabel}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Generate and review this AKAY report from current records.
            </p>
          </div>
          <div className="no-print relative flex flex-wrap gap-2">
            <HeaderAction
              icon={<SlidersHorizontal size={14} />}
              label="Filters"
              count={activeFilters.length}
              onClick={openFilters}
            />
            <HeaderAction
              icon={<FileText size={14} />}
              label="Export PDF"
              onClick={printSelectedReport}
            />
            <HeaderAction
              icon={<Printer size={14} />}
              label="Print"
              onClick={printSelectedReport}
            />
            <CommonFilterPopover
              open={filterOpen}
              title="Filters"
              subtitle={`Narrow the ${reportLabel.toLowerCase()} report.`}
              filters={draftFilters}
              config={reportFields}
              onChange={setDraftFilters}
              onApply={applyFilters}
              onReset={resetFilters}
              onClose={() => setFilterOpen(false)}
            />
          </div>
        </header>

        <ActiveFilterChips
          filters={activeFilters}
          onRemove={removeFilter}
          onClearAll={resetFilters}
        />

        <SoftLoadingArea
          isLoading={loading}
          message={`Loading ${reportLabel.toLowerCase()}...`}
          scope="area"
          minHeight="min-h-[460px]"
        >
          <main id="selected-report" className="space-y-4">
            <ReportTitle title={reportLabel} />
            <SelectedReport
              type={selectedReport}
              filters={filters}
              patients={safePatients}
              records={safeRecords}
              referrals={safeReferrals}
              followUps={safeFollowUps}
              patientMap={patientMap}
            />
          </main>
        </SoftLoadingArea>
      </div>

    </DashboardLayout>
  );
}

function SelectedReport(props) {
  switch (props.type) {
    case "family_planning":
      return <FamilyPlanningReportView {...props} />;
    case "epi":
      return <EpiTargetClientListReportView {...props} />;
    case "morbidity":
      return <MorbidityReportView {...props} />;
    case "followups":
      return <FollowUpReportView {...props} />;
    case "ncd":
      return <NcdReportView {...props} />;
    case "maternal":
      return <MaternalReportView {...props} />;
    default:
      return <ReferralReportView {...props} />;
  }
}

function ReferralReportView({ referrals, filters }) {
  const rows = referrals.filter((referral) => {
    const date = getReferralDate(referral);
    const facility =
      referral.receivingFacility ||
      referral.destinationFacility ||
      referral.ruralHealthUnit?.name ||
      "";
    return (
      matchesDateRange(date, filters) &&
      matchesValue(referral.barangay, filters.barangay) &&
      matchesValue(referral.status, filters.status) &&
      matchesValue(
        referral.urgencyLevel || referral.priority,
        filters.urgency,
      ) &&
      matchesValue(facility, filters.receivingFacility)
    );
  });
  const completed = rows.filter((row) =>
    ["completed", "done"].includes(normalizeText(row.status)),
  ).length;
  const noShow = rows.filter((row) =>
    normalizeText(row.status).includes("no show"),
  ).length;

  return (
    <>
      <SummaryGrid>
        <SummaryCard label="Total Referrals" value={rows.length} icon={<ClipboardList size={16} />} />
        <SummaryCard label="Completed" value={completed} tone="emerald" icon={<FileHeart size={16} />} />
        <SummaryCard label="No Show" value={noShow} tone="amber" icon={<UsersRound size={16} />} />
        <SummaryCard label="Active" value={Math.max(rows.length - completed - noShow, 0)} icon={<HeartPulse size={16} />} />
      </SummaryGrid>
      <ReportTable
        columns={["Tracking ID", "Date", "Patient", "Barangay", "Status", "Urgency", "Receiving Facility"]}
        rows={rows.map((referral) => [
          referral.trackingId || referral.id,
          formatDate(getReferralDate(referral), "Not recorded"),
          referral.patientName || formatPatientName(referral.patient, "Unnamed Patient"),
          referral.barangay || "Not recorded",
          referral.status || "Pending",
          referral.urgencyLevel || referral.priority || "Normal",
          referral.receivingFacility ||
            referral.destinationFacility ||
            referral.ruralHealthUnit?.name ||
            "Not recorded",
        ])}
        emptyTitle="No referral records"
        emptyMessage="No referrals match the selected filters."
      />
    </>
  );
}

function FamilyPlanningReportView({ records, filters, patientMap }) {
  const rows = records
    .filter(isFamilyPlanningRecord)
    .map((record) => normalizeProgramRecord(record, patientMap))
    .filter((record) => {
      const data = record.familyPlanningData;
      return (
        matchesDateRange(record.date, filters) &&
        matchesValue(record.barangay, filters.barangay) &&
        matchesValue(data.clientType || data.client_type, filters.clientType) &&
        matchesValue(data.methodUsed || data.method_used, filters.methodUsed) &&
        matchesAgeRange(record.age, filters.ageRange)
      );
    });
  const methods = new Set(
    rows
      .map(
        (row) =>
          row.familyPlanningData.methodUsed ||
          row.familyPlanningData.method_used,
      )
      .filter(Boolean),
  ).size;
  const newClients = rows.filter((row) =>
    normalizeText(
      row.familyPlanningData.clientType ||
        row.familyPlanningData.client_type,
    ).includes("new"),
  ).length;

  return (
    <>
      <SummaryGrid>
        <SummaryCard label="FP Visits" value={rows.length} icon={<UsersRound size={16} />} />
        <SummaryCard label="Methods Used" value={methods} icon={<ClipboardList size={16} />} />
        <SummaryCard label="New Clients" value={newClients} tone="emerald" icon={<FileHeart size={16} />} />
      </SummaryGrid>
      <ReportTable
        columns={["Date", "Patient", "Barangay", "Client Type", "Method Used", "Age", "Next Appointment"]}
        rows={rows.map((row) => {
          const data = row.familyPlanningData;
          return [
            formatDate(row.date, "Not recorded"),
            row.patientName,
            row.barangay || "Not recorded",
            data.clientType || data.client_type || "Not recorded",
            data.methodUsed || data.method_used || "Not recorded",
            row.age || "Not recorded",
            formatDate(
              data.nextAppointmentDate || data.next_appointment_date,
              "Not recorded",
            ),
          ];
        })}
        emptyTitle="No Family Planning records"
        emptyMessage="No Family Planning records match the selected filters."
      />
    </>
  );
}

function EpiTargetClientListReportView({
  patients,
  records,
  filters,
}) {
  const epiByPatient = useMemo(() => {
    const map = new Map();
    records.filter(isEpiRecord).forEach((record) => {
      const patientId = String(
        record.patientId || record.patient_id || record.patient?.id || "",
      );
      if (!map.has(patientId)) map.set(patientId, []);
      map.get(patientId).push(record);
    });
    return map;
  }, [records]);

  const rows = patients
    .map((patient) => buildEpiTargetRow(patient, epiByPatient))
    .filter((row) => row.ageMonths >= 0 && row.ageMonths <= 12)
    .filter(
      (row) =>
        matchesDateRange(row.registrationDate, filters) &&
        matchesValue(row.barangay, filters.barangay) &&
        (!filters.ageMonths ||
          row.ageMonths === Number(filters.ageMonths)) &&
        matchesValue(row.sex, filters.sex) &&
        matchesValue(row.status, filters.vaccineStatus),
    );
  const completed = rows.filter((row) => row.status === "Completed").length;
  const due = rows.filter((row) => row.status === "Due").length;
  const missed = rows.filter((row) => row.status === "Missed").length;

  return (
    <>
      <SummaryGrid>
        <SummaryCard label="Target Clients" value={rows.length} icon={<Baby size={16} />} />
        <SummaryCard label="Completed" value={completed} tone="emerald" icon={<FileHeart size={16} />} />
        <SummaryCard label="Due" value={due} icon={<ClipboardList size={16} />} />
        <SummaryCard label="Missed" value={missed} tone="amber" icon={<UsersRound size={16} />} />
      </SummaryGrid>
      <ReportTable
        minWidth="min-w-[1700px]"
        columns={[
          "No.",
          "Date of Registration",
          "Family Serial Number",
          "Name of Child",
          "Date of Birth",
          "Age in Months",
          "Sex",
          "Name of Mother",
          "Complete Address",
          "BCG",
          "HEPA B",
          "OPV",
          "PENTA",
          "PCV",
          "IPV",
          "MCV",
          "Status",
        ]}
        rows={rows.map((row, index) => [
          index + 1,
          formatDate(row.registrationDate, "Not recorded"),
          row.familySerialNumber || "Not recorded",
          row.name,
          formatDate(row.birthDate, "Not recorded"),
          row.ageMonths,
          row.sex || "Not recorded",
          row.motherName || "Not recorded",
          row.address || "Not recorded",
          row.vaccines.BCG,
          row.vaccines["HEPA B"],
          row.vaccines.OPV,
          row.vaccines.PENTA,
          row.vaccines.PCV,
          row.vaccines.IPV,
          row.vaccines.MCV,
          row.status,
        ])}
        emptyTitle="No EPI target clients"
        emptyMessage="Registered children up to 12 months old will appear here."
      />
    </>
  );
}

function MorbidityReportView({ records, filters, patientMap }) {
  const rows = records
    .map((record) => normalizeProgramRecord(record, patientMap))
    .filter(
      (record) =>
        matchesDateRange(record.date, filters) &&
        matchesValue(record.barangay, filters.barangay) &&
        matchesDisease(record.raw, filters.disease) &&
        matchesNotifiableStatus(record.raw, filters.notifiableStatus),
    );
  const conditions = new Set(
    rows
      .map((row) => row.raw.diagnosis || row.raw.chiefComplaint)
      .filter(Boolean),
  ).size;

  return (
    <>
      <SummaryGrid>
        <SummaryCard label="Recorded Visits" value={rows.length} icon={<Stethoscope size={16} />} />
        <SummaryCard label="Conditions" value={conditions} icon={<ClipboardList size={16} />} />
      </SummaryGrid>
      <ReportTable
        columns={["Record ID", "Date", "Patient", "Barangay", "Service Type", "Diagnosis / Condition"]}
        rows={rows.map((row) => [
          `#${getRecordId(row.raw)}`,
          formatDate(row.date, "Not recorded"),
          row.patientName,
          row.barangay || "Not recorded",
          getServiceTypeLabel(row.raw),
          row.raw.diagnosis ||
            row.raw.chiefComplaint ||
            row.raw.chief_complaint ||
            "Not recorded",
        ])}
        emptyTitle="No morbidity records"
        emptyMessage="No health records match the selected filters."
      />
    </>
  );
}

function matchesDisease(record, disease) {
  if (!disease) return true;
  return recordContains(record, disease);
}

function matchesNotifiableStatus(record, status) {
  if (!status) return true;
  const normalizedStatus = normalizeText(record.notifiableStatus);
  const notifiable =
    record.notifiable ||
    record.isNotifiable ||
    record.is_notifiable ||
    (normalizedStatus.includes("notifiable") &&
      !normalizedStatus.includes("non notifiable"));

  return status === "Notifiable" ? notifiable : !notifiable;
}

function FollowUpReportView({ followUps, filters }) {
  const rows = followUps
    .map((task) => ({
      ...task,
      effectiveState: getEffectiveFollowUpState(task),
    }))
    .filter(
      (task) =>
        matchesDateRange(task.dueDate, filters) &&
        matchesValue(task.patient?.barangay, filters.barangay) &&
        matchesValue(getServiceTypeLabel(task.healthRecord), filters.serviceType) &&
        matchesValue(
          formatFollowUpState(task.effectiveState),
          filters.status,
        ),
    );

  return (
    <>
      <SummaryGrid>
        <SummaryCard label="Total Tasks" value={rows.length} icon={<ClipboardList size={16} />} />
        <SummaryCard label="Pending" value={rows.filter((row) => ["upcoming", "rescheduled"].includes(row.effectiveState)).length} icon={<HeartPulse size={16} />} />
        <SummaryCard label="Due Today" value={rows.filter((row) => row.effectiveState === "due_today").length} tone="amber" icon={<UsersRound size={16} />} />
        <SummaryCard label="Completed" value={rows.filter((row) => row.effectiveState === "fulfilled").length} tone="emerald" icon={<FileHeart size={16} />} />
      </SummaryGrid>
      <ReportTable
        columns={["Patient", "Barangay", "Service Type", "Next Follow-up Date", "Status"]}
        rows={rows.map((task) => [
          task.patientName || formatPatientName(task.patient, "Unnamed Patient"),
          task.patient?.barangay || "Not recorded",
          getServiceTypeLabel(task.healthRecord),
          formatDate(task.dueDate, "Not recorded"),
          formatFollowUpState(task.effectiveState),
        ])}
        emptyTitle="No follow-up tasks"
        emptyMessage="No follow-up tasks match the selected filters."
      />
    </>
  );
}

function NcdReportView({ records, filters, patientMap }) {
  const rows = records
    .filter(isNcdRecord)
    .map((record) => normalizeProgramRecord(record, patientMap))
    .filter(
      (record) =>
        matchesDateRange(record.date, filters) &&
        matchesValue(record.barangay, filters.barangay) &&
        matchesCondition(record.raw, filters.conditionType) &&
        matchesValue(record.raw.status, filters.status),
    );

  return (
    <>
      <SummaryGrid>
        <SummaryCard label="NCD Visits" value={rows.length} icon={<HeartPulse size={16} />} />
        <SummaryCard label="Hypertension" value={rows.filter((row) => recordContains(row.raw, "hypertension")).length} icon={<FileHeart size={16} />} />
        <SummaryCard label="Diabetes" value={rows.filter((row) => recordContains(row.raw, "diabetes")).length} tone="amber" icon={<ClipboardList size={16} />} />
      </SummaryGrid>
      <ReportTable
        columns={["Record ID", "Date", "Patient", "Barangay", "Condition", "BP", "Status"]}
        rows={rows.map((row) => [
          `#${getRecordId(row.raw)}`,
          formatDate(row.date, "Not recorded"),
          row.patientName,
          row.barangay || "Not recorded",
          inferCondition(row.raw),
          formatBloodPressure(row.raw),
          row.raw.status || "Not recorded",
        ])}
        emptyTitle="No NCD monitoring records"
        emptyMessage="No NCD records match the selected filters."
      />
    </>
  );
}

function MaternalReportView({ records, filters, patientMap }) {
  const rows = records
    .filter(isMaternalRecord)
    .map((record) => normalizeProgramRecord(record, patientMap))
    .filter((record) => {
      const maternal = record.raw.maternalData || record.raw.maternal_data || {};
      return (
        matchesDateRange(record.date, filters) &&
        matchesValue(record.barangay, filters.barangay) &&
        matchesAog(maternal.aog || record.raw.aog, filters.aogRange) &&
        matchesValue(record.raw.status, filters.status)
      );
    });

  return (
    <>
      <SummaryGrid>
        <SummaryCard label="Prenatal Visits" value={rows.length} icon={<FileHeart size={16} />} />
        <SummaryCard label="Patients" value={new Set(rows.map((row) => row.patientId)).size} icon={<UsersRound size={16} />} />
      </SummaryGrid>
      <ReportTable
        columns={["Record ID", "Visit Date", "Patient", "Barangay", "AOG", "BP", "Weight", "Next Visit"]}
        rows={rows.map((row) => {
          const maternal = row.raw.maternalData || row.raw.maternal_data || {};
          return [
            `#${getRecordId(row.raw)}`,
            formatDate(row.date, "Not recorded"),
            row.patientName,
            row.barangay || "Not recorded",
            maternal.aog || row.raw.aog || "Not recorded",
            formatBloodPressure(row.raw),
            row.raw.weight || "Not recorded",
            formatDate(
              row.raw.followUpDate || row.raw.follow_up_date,
              "Not recorded",
            ),
          ];
        })}
        emptyTitle="No maternal records"
        emptyMessage="No maternal or prenatal records match the selected filters."
      />
    </>
  );
}

function ReportTable({
  columns,
  rows,
  emptyTitle,
  emptyMessage,
  minWidth = "min-w-[900px]",
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className={`w-full text-left ${minWidth}`}>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {columns.map((column) => (
                <th key={column} className="whitespace-nowrap px-4 py-3">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-16 text-center">
                  <FileText className="mx-auto text-slate-300" size={28} />
                  <p className="mt-3 font-semibold text-slate-600">
                    {emptyTitle}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{emptyMessage}</p>
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr key={`${row[0]}-${rowIndex}`} className="hover:bg-slate-50/70">
                  {row.map((value, columnIndex) => (
                    <td
                      key={`${rowIndex}-${columnIndex}`}
                      className={`px-4 py-3.5 ${
                        columnIndex === 0
                          ? "font-semibold text-[#0F172A]"
                          : "text-slate-600"
                      }`}
                    >
                      {formatDisplayValue(value, "Not recorded")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummaryGrid({ children }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

function SummaryCard({ label, value, icon, tone = "red" }) {
  const tones = {
    red: "bg-red-50 text-[#B91C1C]",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[#0F172A]">
            {value}
          </p>
        </div>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone] || tones.red}`}>
          {icon}
        </span>
      </div>
    </div>
  );
}

function ReportTitle({ title }) {
  return (
    <div>
      <h2 className="text-base font-bold text-[#0F172A]">{title}</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Generated from current AKAY patient and health service records.
      </p>
    </div>
  );
}

function HeaderAction({ icon, label, count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C]"
    >
      {icon}
      {label}
      {count > 0 && (
        <span className="rounded-full bg-[#B91C1C] px-1.5 py-0.5 text-[9px] text-white">
          {count}
        </span>
      )}
    </button>
  );
}

function getReportFilterFields(type, barangays, facilities) {
  const dateField = {
    key: "dateRange",
    label: type === "epi" ? "Registration Date Range" : "Date Range",
    type: "datePresets",
    resetValue: "all",
    presets: [
      { value: "all", label: "All dates" },
      { value: "today", label: "Today" },
      { value: "this_week", label: "This week" },
      { value: "this_month", label: "This month" },
      { value: "custom", label: "Custom date" },
    ],
  };
  const barangay = {
    key: "barangay",
    label: "Barangay",
    type: "select",
    resetValue: "",
    placeholder: "All Barangays",
    options: barangays,
  };
  const serviceType = {
    key: "serviceType",
    label: "Service Type",
    type: "select",
    resetValue: "",
    placeholder: "All Service Types",
    options: [
      "General Consultation",
      "Child Health / EPI",
      "Maternal / Prenatal",
      "Family Planning",
      "NCD Monitoring",
      "TB DOTS / TB Monitoring",
    ],
  };
  const status = (options) => ({
    key: "status",
    label: "Status",
    type: "select",
    resetValue: "",
    placeholder: "All Statuses",
    options,
  });

  switch (type) {
    case "referrals":
      return [
        dateField,
        barangay,
        status(["Pending", "Received", "Completed", "No Show", "Cancelled"]),
        { key: "urgency", label: "Urgency", type: "select", resetValue: "", placeholder: "All Urgency", options: ["Non-Urgent", "Normal", "Urgent", "Emergency"] },
        { key: "receivingFacility", label: "Receiving Facility", type: "select", resetValue: "", placeholder: "All Facilities", options: facilities },
      ];
    case "family_planning":
      return [
        dateField,
        barangay,
        { key: "clientType", label: "Client Type", type: "text", placeholder: "e.g. New Acceptor" },
        { key: "methodUsed", label: "Method Used", type: "text", placeholder: "e.g. Pills" },
        { key: "ageRange", label: "Age Range", type: "select", resetValue: "", placeholder: "All Ages", options: ["15-19", "20-49", "50+"] },
      ];
    case "epi":
      return [
        dateField,
        barangay,
        { key: "ageMonths", label: "Age in Months", type: "number", min: 0, max: 12 },
        { key: "sex", label: "Sex", type: "select", resetValue: "", placeholder: "All Sexes", options: ["Male", "Female"] },
        { key: "vaccineStatus", label: "Vaccine Status", type: "select", resetValue: "", placeholder: "All Statuses", options: ["Due", "Completed", "Missed"] },
      ];
    case "morbidity":
      return [
        dateField,
        barangay,
        { key: "disease", label: "Disease / Diagnosis", type: "text", placeholder: "Search diagnosis" },
        { key: "notifiableStatus", label: "Notifiable Status", type: "select", resetValue: "", placeholder: "All Records", options: ["Notifiable", "Non-notifiable"] },
      ];
    case "followups":
      return [
        dateField,
        barangay,
        serviceType,
        status(["Pending", "Due Today", "No Show", "Completed", "Cancelled"]),
      ];
    case "ncd":
      return [
        dateField,
        barangay,
        { key: "conditionType", label: "Condition Type", type: "select", resetValue: "", placeholder: "All Conditions", options: ["Hypertension", "Diabetes", "Other"] },
        status(["Pending", "Active", "Completed"]),
      ];
    case "maternal":
      return [
        dateField,
        barangay,
        { key: "aogRange", label: "AOG Range", type: "select", resetValue: "", placeholder: "All AOG Ranges", options: ["0-13", "14-27", "28-42"] },
        status(["Active", "Completed"]),
      ];
    default:
      return [dateField, barangay, serviceType, status(["Active", "Completed"])];
  }
}

function normalizeProgramRecord(record, patientMap) {
  const patientId = String(
    record.patientId || record.patient_id || record.patient?.id || "",
  );
  const patient =
    record.patient && typeof record.patient === "object"
      ? record.patient
      : patientMap.get(patientId) || {};
  return {
    raw: record,
    patientId,
    patientName: formatPatientName(
      record.patientName || patient,
      "Unnamed Patient",
    ),
    age: Number(patient.age || record.age || 0) || "",
    barangay: patient.barangay || record.barangay || "",
    date: getRecordDateValue(record),
    familyPlanningData:
      record.familyPlanningData || record.family_planning_data || {},
  };
}

function buildEpiTargetRow(patient, epiByPatient) {
  const patientId = String(patient.id || patient.patientId || "");
  const records = epiByPatient.get(patientId) || [];
  const entries = records.flatMap(getEpiVaccineEntries);
  const vaccines = {
    BCG: getVaccineGroupValue(entries, ["BCG"]),
    "HEPA B": getVaccineGroupValue(entries, ["HEPA B"]),
    OPV: getVaccineGroupValue(entries, ["OPV 1", "OPV 2", "OPV 3"]),
    PENTA: getVaccineGroupValue(entries, ["PENTA 1", "PENTA 2", "PENTA 3"]),
    PCV: getVaccineGroupValue(entries, ["PCV 1", "PCV 2", "PCV 3"]),
    IPV: getVaccineGroupValue(entries, ["IPV 1", "IPV 2"]),
    MCV: getVaccineGroupValue(entries, ["MCV 1", "MCV 2"]),
  };
  const recordedNames = new Set(
    entries.map((entry) => normalizeVaccineName(entry.vaccineName)),
  );
  const completed = EPI_VACCINE_ROWS.every((name) => recordedNames.has(name));
  const birthDate =
    patient.birthDate ||
    patient.birthdate ||
    patient.dateOfBirth ||
    patient.date_of_birth ||
    "";
  const ageMonths = calculateAgeInMonths(birthDate);
  const status = completed
    ? "Completed"
    : entries.length === 0 && ageMonths > 2
      ? "Missed"
      : "Due";

  return {
    registrationDate:
      patient.dateRegistered ||
      patient.date_registered ||
      patient.createdAt ||
      patient.created_at ||
      "",
    familySerialNumber:
      patient.familySerialNumber || patient.family_serial_number || "",
    name: formatPatientName(patient, "Unnamed Child"),
    birthDate,
    ageMonths,
    sex: patient.sex || "",
    motherName: patient.motherName || patient.mother_name || "",
    address: [
      patient.streetAddress || patient.street_address || patient.address,
      patient.purokArea || patient.purok_area,
      patient.barangay,
      patient.municipality,
    ]
      .filter(Boolean)
      .join(", "),
    barangay: patient.barangay || "",
    vaccines,
    status,
  };
}

function getVaccineGroupValue(entries, names) {
  const matching = entries.filter((entry) =>
    names.includes(normalizeVaccineName(entry.vaccineName)),
  );
  if (!matching.length) return "Not recorded";
  return matching
    .map((entry) => formatDate(entry.dateGiven, "Given"))
    .join(", ");
}

function calculateAgeInMonths(value) {
  if (!value) return -1;
  const birth = new Date(value);
  if (Number.isNaN(birth.getTime())) return -1;
  const today = new Date();
  let months =
    (today.getFullYear() - birth.getFullYear()) * 12 +
    today.getMonth() -
    birth.getMonth();
  if (today.getDate() < birth.getDate()) months -= 1;
  return Math.max(months, 0);
}

function matchesDateRange(value, filters) {
  return isDateInPreset(value, filters.dateRange, {
    from: filters.dateFrom,
    to: filters.dateTo,
  });
}

function matchesValue(value, filter) {
  if (!filter) return true;
  return normalizeText(value) === normalizeText(filter);
}

function matchesAgeRange(age, range) {
  if (!range) return true;
  const value = Number(age);
  if (range === "15-19") return value >= 15 && value <= 19;
  if (range === "20-49") return value >= 20 && value <= 49;
  return value >= 50;
}

function matchesCondition(record, condition) {
  if (!condition) return true;
  if (condition === "Other") {
    return !recordContains(record, "hypertension") && !recordContains(record, "diabetes");
  }
  return recordContains(record, condition);
}

function matchesAog(value, range) {
  if (!range) return true;
  const weeks = Number(String(value || "").match(/\d+/)?.[0]);
  if (Number.isNaN(weeks)) return false;
  const [from, to] = range.split("-").map(Number);
  return weeks >= from && weeks <= to;
}

function recordContains(record, term) {
  return normalizeText(
    [
      record.category,
      record.recordType,
      record.diagnosis,
      record.chiefComplaint,
      record.consultationNotes,
    ]
      .filter(Boolean)
      .join(" "),
  ).includes(normalizeText(term));
}

function inferCondition(record) {
  if (recordContains(record, "hypertension")) return "Hypertension";
  if (recordContains(record, "diabetes")) return "Diabetes";
  return record.diagnosis || "Other";
}

function formatBloodPressure(record) {
  const systolic = record.systolicBp || record.systolic_bp;
  const diastolic = record.diastolicBp || record.diastolic_bp;
  return systolic || diastolic
    ? `${systolic || "N/A"}/${diastolic || "N/A"}`
    : "Not recorded";
}

function getReferralDate(referral) {
  return (
    referral.dateOfReferral ||
    referral.date_of_referral ||
    referral.referralDate ||
    referral.createdAt ||
    referral.created_at ||
    ""
  );
}

function getEffectiveFollowUpState(task) {
  if (task.state === "fulfilled") return "fulfilled";
  if (task.state === "no_show") return "no_show";
  if (["cancelled", "canceled"].includes(task.state)) return "cancelled";
  const dueDate = normalizeDate(task.dueDate);
  const today = normalizeDate(new Date());
  if (!dueDate) return "upcoming";
  if (dueDate === today) return "due_today";
  if (dueDate < today) return "no_show";
  if (task.state === "rescheduled") return "rescheduled";
  return "upcoming";
}

function formatFollowUpState(state) {
  const labels = {
    upcoming: "Pending",
    rescheduled: "Pending",
    due_today: "Due Today",
    no_show: "No Show",
    fulfilled: "Completed",
    cancelled: "Cancelled",
  };
  return labels[state] || "Pending";
}

function normalizeDate(value) {
  if (!value) return "";
  if (value instanceof Date) {
    const copy = new Date(value);
    copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
    return copy.toISOString().slice(0, 10);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}
