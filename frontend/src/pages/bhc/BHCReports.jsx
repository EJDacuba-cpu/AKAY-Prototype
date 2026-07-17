import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
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
  PageStateWrapper,
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
  getEpiVaccineEntries,
  getHypertensionDiabeticData,
  getRecordDateValue,
  getRecordId,
  getServiceTypeLabel,
  formatServiceType,
  formatHypertensionDiabeticClientStatus,
  formatHypertensionDiabeticCondition,
  isEpiRecord,
  isFamilyPlanningRecord,
  isMaternalRecord,
  isNcdRecord,
  normalizeVaccineName,
} from "../../utils/healthRecordPrograms";
import { queryKeys } from "../../utils/queryKeys";

const REPORT_TYPES = [
  {
    key: "referrals",
    slug: "referrals",
    label: "Referral Reports",
    description: "Referral activity, status, and receiving facility tracking.",
  },
  {
    key: "followups",
    slug: "follow-ups",
    label: "Follow-ups / Monitoring",
    description: "Scheduled return visits and monitoring outcomes.",
  },
  {
    key: "epi",
    slug: "epi-target-client-list",
    label: "EPI Target Client List",
    description:
      "Generated from registered child patients, Child Health / EPI records, and follow-up schedules.",
  },
  {
    key: "morbidity",
    slug: "morbidity",
    label: "Morbidity / Notifiable Diseases",
    description: "Diagnosis and notifiable condition reporting from health records.",
  },
  {
    key: "community_surveillance",
    slug: "community-based-surveillance",
    label: "Community-Based Surveillance",
    description: "Disease-specific surveillance lists generated from marked health records.",
  },
  {
    key: "family_planning",
    slug: "family-planning",
    label: "Family Planning",
    description: "Family planning visits, methods, and client classifications.",
  },
  {
    key: "ncd",
    slug: "ncd",
    label: "Hypertension and Diabetic Club Monitoring Sheet",
    description: "Hypertension and Diabetic Club Monitoring Sheet.",
  },
  {
    key: "maternal",
    slug: "maternal",
    label: "Maternal / Prenatal",
    description: "Prenatal visits, pregnancy details, and maternal follow-ups.",
  },
];

const DEFAULT_REPORT_SLUG = "epi-target-client-list";
const EMPTY_MARK = "\u2014";
const CHECK_MARK = "\u2713";
const EPI_FLAT_VACCINE_COLUMNS = [
  "OPV 1",
  "OPV 2",
  "OPV 3",
  "PENTA 1",
  "PENTA 2",
  "PENTA 3",
  "PCV 1",
  "PCV 2",
  "PCV 3",
  "IPV 1",
  "IPV 2",
  "MCV 1",
  "MCV 2",
];
const EPI_CHILD_VACCINE_COLUMNS = [
  "BCG",
  "HEPA B",
  ...EPI_FLAT_VACCINE_COLUMNS,
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
  vaccine: "",
  vaccineStatus: "",
  conditionType: "",
  aogRange: "",
  disease: "",
  notifiableStatus: "",
  surveillanceList: "hfmd",
};

export default function BHCReports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSlug = normalizeReportSlug(searchParams.get("type"));
  const currentReport =
    REPORT_TYPES.find((report) => report.slug === selectedSlug) ||
    REPORT_TYPES.find((report) => report.slug === DEFAULT_REPORT_SLUG);
  const selectedReport = currentReport?.key || "epi";
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);

  const {
    data: patients = [],
    isLoading: patientsLoading,
    isFetching: patientsFetching,
    error: patientsError,
    refetch: refetchPatients,
  } = useQuery({
    queryKey: queryKeys.patients("bhc"),
    queryFn: () => getPatientDetailsListByRole("bhc", { per_page: 500 }),
    retry: false,
  });
  const {
    data: records = [],
    isLoading: recordsLoading,
    isFetching: recordsFetching,
    error: recordsError,
    refetch: refetchRecords,
  } = useQuery({
    queryKey: queryKeys.healthRecords("bhc"),
    queryFn: () => getHealthRecords("bhc", { per_page: 500 }),
    retry: false,
  });
  const {
    data: referrals = [],
    isLoading: referralsLoading,
    isFetching: referralsFetching,
    error: referralsError,
    refetch: refetchReferrals,
  } = useQuery({
    queryKey: queryKeys.referrals("bhc"),
    queryFn: () => getReferrals(),
    retry: false,
  });
  const {
    data: followUps = [],
    isLoading: followUpsLoading,
    isFetching: followUpsFetching,
    error: followUpsError,
    refetch: refetchFollowUps,
  } = useQuery({
    queryKey: queryKeys.followUpTasks("bhc"),
    queryFn: () => getFollowUpTasks(),
    staleTime: 30_000,
    retry: false,
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
  const loadError =
    patientsError || recordsError || referralsError || followUpsError || null;
  const refreshing =
    !loading &&
    (patientsFetching || recordsFetching || referralsFetching || followUpsFetching);
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

  function selectReport(slug) {
    setSearchParams({ type: slug });
  }

  function retryReports() {
    refetchPatients();
    refetchRecords();
    refetchReferrals();
    refetchFollowUps();
  }

  return (
    <DashboardLayout role="bhc" title="Reports">
      <style>{`
        @page { size: landscape; margin: 10mm; }
        @media print {
          body * { visibility: hidden !important; }
          #selected-report, #selected-report * { visibility: visible !important; }
          #selected-report { position: absolute; inset: 0; width: 100%; padding: 0 !important; box-shadow: none !important; border: 0 !important; }
          #selected-report table { font-size: 9px; }
          #selected-report th, #selected-report td { padding: 5px 6px !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <PageStateWrapper
        isLoading={loading}
        isError={Boolean(loadError)}
        isFetching={refreshing}
        hasData={false}
        error={loadError}
        onRetry={retryReports}
        loadingMessage={`Loading ${reportLabel.toLowerCase()}...`}
      >
        <div className="space-y-5">
          <header>
            <div>
              <h1 className="text-xl font-bold text-[#0F172A]">Reports</h1>
              <p className="mt-1 text-sm text-slate-500">
                Reports Center for BHC records, monitoring, and official printable lists.
              </p>
            </div>
          </header>

          <div className="no-print flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <label className="w-full max-w-sm">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Report Type
              </span>
              <select
                value={currentReport.slug}
                onChange={(event) => selectReport(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0F172A] shadow-sm outline-none transition focus:border-[#FCA5A5] focus:ring-2 focus:ring-[#B91C1C]/10"
              >
                {REPORT_TYPES.map((report) => (
                  <option key={report.slug} value={report.slug}>
                    {report.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="relative flex flex-wrap gap-2">
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
          </div>

          <ActiveFilterChips
            filters={activeFilters}
            onRemove={removeFilter}
            onClearAll={resetFilters}
          />

          {refreshing && (
            <div className="no-print rounded-lg border border-red-100 bg-red-50/60 px-3 py-2 text-[11px] font-semibold text-[#B91C1C]">
              Refreshing records...
            </div>
          )}

          <main id="selected-report" className="space-y-4 rounded-xl bg-white">
            <PrintReportHeader title={reportLabel} filters={activeFilters} />
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
        </div>
      </PageStateWrapper>

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
    case "community_surveillance":
      return <CommunitySurveillanceReportView {...props} />;
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

function normalizeReportSlug(value) {
  const raw = String(value || DEFAULT_REPORT_SLUG)
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  const aliases = {
    epi: "epi-target-client-list",
    immunization: "epi-target-client-list",
    "child-health": "epi-target-client-list",
    "family-planning": "family-planning",
    family_planning: "family-planning",
    followups: "follow-ups",
    "follow-up": "follow-ups",
    "follow-up-monitoring": "follow-ups",
    "morbidity-notifiable": "morbidity",
    surveillance: "community-based-surveillance",
    "community-surveillance": "community-based-surveillance",
    "community-based-surveillance": "community-based-surveillance",
    hfmd: "community-based-surveillance",
    "ncd-monitoring": "ncd",
    "hypertension-diabetic-monitoring": "ncd",
    "hypertension-and-diabetic-monitoring": "ncd",
    "maternal-prenatal": "maternal",
  };

  return aliases[raw] || raw || DEFAULT_REPORT_SLUG;
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
  followUps,
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
  const followUpsByPatient = useMemo(() => {
    const map = new Map();
    followUps
      .filter(isEpiFollowUpTask)
      .forEach((task) => {
        const patientId = String(task.patientId || task.patient?.id || "");
        if (!patientId) return;
        if (!map.has(patientId)) map.set(patientId, []);
        map.get(patientId).push({
          ...task,
          effectiveState: getEffectiveFollowUpState(task),
        });
      });
    return map;
  }, [followUps]);
  const maternalByPatient = useMemo(() => {
    const map = new Map();
    records.filter(isMaternalRecord).forEach((record) => {
      const patientId = String(
        record.patientId || record.patient_id || record.patient?.id || "",
      );
      if (!patientId) return;
      if (!map.has(patientId)) map.set(patientId, []);
      map.get(patientId).push(record);
    });
    return map;
  }, [records]);

  const rows = patients
    .map((patient) =>
      buildEpiTargetRow(patient, epiByPatient, followUpsByPatient, maternalByPatient),
    )
    .filter(isEpiTargetClient)
    .filter(
      (row) =>
        matchesDateRange(row.registrationDate, filters) &&
        matchesValue(row.barangay, filters.barangay) &&
        matchesStatusFilter(row.status, filters.status) &&
        matchesAgeMonthsRange(row.ageMonths, filters.ageMonths) &&
        matchesVaccineFilter(row, filters.vaccine),
    );
  const completed = rows.filter((row) => row.status === "Completed").length;
  const due = rows.filter((row) =>
    ["Due Today", "Pending"].includes(row.status),
  ).length;
  const noShow = rows.filter((row) => row.status === "No Show").length;

return (
  <>
    <div className="no-print">
      <SummaryGrid>
        <SummaryCard label="Target Clients" value={rows.length} icon={<Baby size={16} />} />
        <SummaryCard label="Completed" value={completed} tone="emerald" icon={<FileHeart size={16} />} />
        <SummaryCard label="Due" value={due} icon={<ClipboardList size={16} />} />
        <SummaryCard label="No Show" value={noShow} tone="amber" icon={<UsersRound size={16} />} />
      </SummaryGrid>
    </div>
    <EpiTargetClientTable rows={rows} />
  </>
);
}

function MorbidityReportView({ records, filters, patientMap }) {
  const rows = records
    .filter(isMorbidityReportRecord)
    .map((record) => normalizeMorbidityLogRow(record, patientMap))
    .filter(
      (record) =>
        matchesDateRange(record.date, filters) &&
        matchesValue(record.barangay, filters.barangay) &&
        matchesDisease(record.raw, filters.disease) &&
        matchesNotifiableStatus(record.raw, filters.notifiableStatus),
    );
  const conditions = new Set(
    rows
      .map((row) => row.diagnosis)
      .filter(Boolean),
  ).size;
  const notifiable = rows.filter(
    (row) => row.morbidityReportingStatus === "notifiable",
  ).length;

  return (
    <>
      <SummaryGrid>
        <SummaryCard label="Recorded Visits" value={rows.length} icon={<Stethoscope size={16} />} />
        <SummaryCard label="Conditions" value={conditions} icon={<ClipboardList size={16} />} />
        <SummaryCard label="Notifiable" value={notifiable} tone="amber" icon={<FileHeart size={16} />} />
      </SummaryGrid>
      <MorbidityDailyLogTable rows={rows} />
    </>
  );
}

function CommunitySurveillanceReportView({ records, filters, patientMap }) {
  const selectedList = filters.surveillanceList || "hfmd";
  const rows = records
    .filter((record) => isCommunitySurveillanceRecord(record, selectedList))
    .filter(
      (record) =>
        matchesDateRange(getRecordDateValue(record), filters) &&
        matchesValue(getRecordBarangay(record, patientMap), filters.barangay),
    )
    .map((record, index) =>
      normalizeCommunitySurveillanceRow(record, patientMap, index + 1),
    );

  return (
    <>
      <SummaryGrid>
        <SummaryCard label="HFMD Cases" value={rows.length} icon={<ClipboardList size={16} />} />
        <SummaryCard
          label="Areas / Sitios"
          value={new Set(rows.map((row) => row.areaSitio).filter(Boolean)).size}
          icon={<UsersRound size={16} />}
        />
        <SummaryCard
          label="This Week"
          value={rows.filter((row) => isDateInPreset(row.date, "this_week")).length}
          tone="amber"
          icon={<FileHeart size={16} />}
        />
        <SummaryCard
          label="Included"
          value={rows.length}
          tone="emerald"
          icon={<Stethoscope size={16} />}
        />
      </SummaryGrid>
      <CommunitySurveillanceTable rows={rows} />
    </>
  );
}

function matchesDisease(record, disease) {
  if (!disease) return true;
  return recordContains(record, disease);
}

function matchesNotifiableStatus(record, status) {
  if (!status) return true;
  const notifiable = getMorbidityReportingStatus(record) === "notifiable";

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
    .map((record, index) =>
      normalizeHypertensionDiabeticReportRow(record, patientMap, index + 1),
    )
    .filter(
      (row) =>
        matchesDateRange(row.date, filters) &&
        matchesValue(row.barangay, filters.barangay) &&
        matchesCondition(row.conditionType, filters.conditionType) &&
        matchesValue(row.status, filters.status),
    );
  const hpnCount = rows.filter((row) => row.conditionType === "hpn").length;
  const dmCount = rows.filter((row) => row.conditionType === "dm").length;
  const bothCount = rows.filter((row) => row.conditionType === "both").length;

  return (
    <>
      <SummaryGrid>
        <SummaryCard label="Target Clients" value={rows.length} icon={<HeartPulse size={16} />} />
        <SummaryCard label="HPN" value={hpnCount} icon={<FileHeart size={16} />} />
        <SummaryCard label="DM" value={dmCount} tone="amber" icon={<ClipboardList size={16} />} />
        <SummaryCard label="BOTH" value={bothCount} tone="emerald" icon={<UsersRound size={16} />} />
      </SummaryGrid>
      <ReportTable
        columns={[
          "No.",
          "Name",
          "Address",
          "Age",
          "BP",
          "FBS",
          "HPN / DM / BOTH",
          "Old / New",
          "Date of Last Consultation",
          "Date of Follow-up Check-up",
        ]}
        rows={rows.map((row, index) => [
          index + 1,
          row.patientName,
          row.address || EMPTY_MARK,
          row.age || EMPTY_MARK,
          row.bp || EMPTY_MARK,
          row.fbs || EMPTY_MARK,
          formatHypertensionDiabeticCondition(row.conditionType) || EMPTY_MARK,
          formatHypertensionDiabeticClientStatus(row.clientStatus) || EMPTY_MARK,
          formatDate(row.dateOfLastConsultation, EMPTY_MARK),
          formatDate(row.followUpDate, EMPTY_MARK),
        ])}
        emptyTitle="No Hypertension / Diabetic Monitoring records"
        emptyMessage="No hypertension or diabetic monitoring records match the selected filters."
        minWidth="min-w-[1180px]"
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



function EpiTargetClientTable({ rows }) {
  const baseHeaders = [
    "No.",
    "Date of Registration",
    "Family Serial Number",
    "Name of Child",
    "Date of Birth",
    "Age in Months",
    "Sex",
    "Name of Mother",
    "Complete Address",
  ];
  const totalColumns = baseHeaders.length + 6;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1900px] text-left">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <tr className="border-b border-slate-200">
              {baseHeaders.map((header) => (
                <th key={header} rowSpan={2} className="whitespace-nowrap border-r border-slate-200 px-3 py-3 align-middle">
                  {header}
                </th>
              ))}
              <th colSpan={2} className="border-r border-slate-200 px-3 py-3 text-center">
                Children Protected at Birth (CPAB)
              </th>
              <th colSpan={2} className="border-r border-slate-200 px-3 py-3 text-center">
                BCG Immunization
              </th>
              <th colSpan={2} className="border-r border-slate-200 px-3 py-3 text-center">
                Hepa B Immunization
              </th>
            </tr>
            <tr className="border-b border-slate-200">
              <th className="w-44 border-r border-slate-200 px-3 py-2 align-top">
                Td2 given to mother a month prior to delivery
              </th>
              <th className="w-48 border-r border-slate-200 px-3 py-2 align-top">
                Td3 to Td5 / Td1 to Td5 given to mother anytime prior to delivery
              </th>
              <th className="w-36 border-r border-slate-200 px-3 py-2 align-top">
                Within 24 hours
              </th>
              <th className="w-48 border-r border-slate-200 px-3 py-2 align-top">
                24 hours to 11 months and 29 days
              </th>
              <th className="w-40 border-r border-slate-200 px-3 py-2 align-top">
                Within 24 hours after birth
              </th>
              <th className="w-40 border-r border-slate-200 px-3 py-2 align-top">
                More than 24 hours up to 14 days
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={totalColumns} className="px-6 py-16 text-center">
                  <FileText className="mx-auto text-slate-300" size={28} />
                  <p className="mt-3 font-semibold text-slate-600">
                    No records found for this report.
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Try adjusting filters or adding related health records.
                  </p>
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={`${row.patientId}-${index}`} className="hover:bg-slate-50/70">
                  {[
                    index + 1,
                    formatDate(row.registrationDate, "Not recorded"),
                    row.familySerialNumber || "Not recorded",
                    row.name,
                    formatDate(row.birthDate, "Not recorded"),
                    row.ageMonths,
                    row.sex || "Not recorded",
                    row.motherName || "Not recorded",
                    row.address || "Not recorded",
                    row.cpab.td2,
                    row.cpab.td3ToTd5,
                    row.groupedVaccines.bcgWithin24,
                    row.groupedVaccines.bcgAfter24Hours,
                    row.groupedVaccines.hepaBWithin24,
                    row.groupedVaccines.hepaBAfter24Hours,
                  ].map((value, columnIndex) => (
                    <td
                      key={`${row.patientId}-${columnIndex}`}
                      className={`border-r border-slate-100 px-3 py-3 align-top ${
                        columnIndex === 0
                          ? "font-semibold text-[#0F172A]"
                          : "text-slate-600"
                      }`}
                    >
                      {formatDisplayValue(value, EMPTY_MARK)}
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

function MorbidityDailyLogTable({ rows }) {
  const columns = [
    "Date",
    "Name",
    "Address / CP#",
    "Age",
    "Sex",
    "Birthday",
    "Signs & Symptoms",
    "Diagnosis",
    "Medication and Treatment",
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3 text-center">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0F172A]">
          Daily Log Sheet
        </p>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
          Morbidity-Notifiable Diseases Record
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1500px] text-left">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <tr className="border-b border-slate-200">
              {columns.map((column) => (
                <th key={column} className="whitespace-nowrap border-r border-slate-200 px-3 py-3 align-top">
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
                    No morbidity records
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    No included morbidity or notifiable disease records match the selected filters.
                  </p>
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={`${row.patientId || row.name}-${row.date}-${index}`} className="hover:bg-slate-50/70">
                  {[
                    formatDate(row.date, EMPTY_MARK),
                    row.name,
                    row.addressContact,
                    row.age,
                    row.sex,
                    formatDate(row.birthday, EMPTY_MARK),
                    row.signsSymptoms,
                    row.diagnosis,
                    row.medicationTreatment,
                  ].map((value, columnIndex) => (
                    <td
                      key={`${index}-${columnIndex}`}
                      className={`border-r border-slate-100 px-3 py-3 align-top ${
                        columnIndex === 1
                          ? "font-semibold text-[#0F172A]"
                          : "text-slate-600"
                      }`}
                    >
                      {formatDisplayValue(value, EMPTY_MARK)}
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

function CommunitySurveillanceTable({ rows }) {
  const columns = [
    "Week",
    "Date",
    "No.",
    "Name of Child",
    "Age",
    "Birthday",
    "Area / Sitio",
    "Signs and Symptoms",
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3 text-center">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0F172A]">
          Community-Based Surveillance
        </p>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
          List of Hand, Foot, and Mouth Disease Cases
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px] text-left">
          <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <tr className="border-b border-slate-200">
              {columns.map((column) => (
                <th key={column} className="whitespace-nowrap border-r border-slate-200 px-3 py-3 align-top">
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
                    No HFMD surveillance cases
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    No notifiable records marked for the HFMD surveillance list match the selected filters.
                  </p>
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={`${row.patientId || row.name}-${row.date}-${index}`} className="hover:bg-slate-50/70">
                  {[
                    row.week,
                    formatDate(row.date, EMPTY_MARK),
                    row.number,
                    row.name,
                    row.age,
                    formatDate(row.birthday, EMPTY_MARK),
                    row.areaSitio,
                    row.signsSymptoms,
                  ].map((value, columnIndex) => (
                    <td
                      key={`${index}-${columnIndex}`}
                      className={`border-r border-slate-100 px-3 py-3 align-top ${
                        columnIndex === 3
                          ? "font-semibold text-[#0F172A]"
                          : "text-slate-600"
                      }`}
                    >
                      {formatDisplayValue(value, EMPTY_MARK)}
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

function PrintReportHeader({ title, filters }) {
  return (
    <div className="hidden print:block">
      <h1 className="text-base font-bold text-[#0F172A]">{title}</h1>
      <p className="mt-1 text-[11px] text-slate-600">
        Generated {new Date().toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </p>
      <p className="mt-1 text-[11px] text-slate-500">
        Filters:{" "}
        {filters.length
          ? filters.map((filter) => filter.label).join("; ")
          : "All records"}
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
      "Hypertension / Diabetic Monitoring",
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
        { key: "status", label: "Status", type: "select", resetValue: "", placeholder: "All Statuses", options: ["Completed", "Due", "No Show", "Pending"] },
        { key: "ageMonths", label: "Age Range in Months", type: "text", placeholder: "e.g. 0-12" },
        { key: "vaccine", label: "Vaccine", type: "select", resetValue: "", placeholder: "All vaccines", options: EPI_CHILD_VACCINE_COLUMNS },
      ];
    case "morbidity":
      return [
        dateField,
        barangay,
        { key: "disease", label: "Disease / Diagnosis", type: "text", placeholder: "Search diagnosis" },
        { key: "notifiableStatus", label: "Notifiable Status", type: "select", resetValue: "", placeholder: "All Records", options: ["Notifiable", "Non-notifiable"] },
      ];
    case "community_surveillance":
      return [
        dateField,
        barangay,
        {
          key: "surveillanceList",
          label: "Surveillance List",
          type: "select",
          resetValue: "hfmd",
          options: [
            { value: "hfmd", label: "Hand, Foot, and Mouth Disease" },
          ],
        },
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
        { key: "conditionType", label: "Condition Type", type: "select", resetValue: "", placeholder: "All Conditions", options: ["HPN", "DM", "BOTH"] },
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

function normalizeHypertensionDiabeticReportRow(record, patientMap, number) {
  const normalized = normalizeProgramRecord(record, patientMap);
  const patient =
    record.patient && typeof record.patient === "object"
      ? record.patient
      : patientMap.get(normalized.patientId) || {};
  const data = getHypertensionDiabeticData(record);
  const birthday = getPatientBirthDate(patient, record);

  return {
    ...normalized,
    number,
    patientName: normalized.patientName,
    address: firstFilledValue(
      patient.address,
      patient.completeAddress,
      patient.complete_address,
      record.patientAddress,
      record.patient_address,
      normalized.barangay,
    ),
    age: getPatientAge(patient, record, birthday),
    bp: data.bp,
    fbs: data.fbs,
    conditionType: data.conditionType,
    clientStatus: data.clientStatus,
    dateOfLastConsultation: data.dateOfLastConsultation,
    followUpDate:
      record.followUpDate ||
      record.follow_up_date ||
      record.monitoringData?.followUpDate ||
      record.monitoring_data?.followUpDate ||
      record.monitoring_data?.follow_up_date ||
      "",
    status: record.status || record.followUpStatus || record.follow_up_status || "",
  };
}

function normalizeMorbidityLogRow(record, patientMap) {
  const normalized = normalizeProgramRecord(record, patientMap);
  const patient =
    record.patient && typeof record.patient === "object"
      ? record.patient
      : patientMap.get(normalized.patientId) || {};
  const birthday = getPatientBirthDate(patient, record);

  return {
    ...normalized,
    name: normalized.patientName,
    addressContact: formatAddressContact(patient, record),
    age: getPatientAge(patient, record, birthday),
    sex: getPatientSex(patient, record),
    birthday,
    signsSymptoms: getMorbiditySignsSymptoms(record),
    diagnosis: getMorbidityDiagnosis(record),
    medicationTreatment: getMorbidityMedicationTreatment(record),
    morbidityReportingStatus: getMorbidityReportingStatus(record),
  };
}

function normalizeCommunitySurveillanceRow(record, patientMap, number) {
  const normalized = normalizeMorbidityLogRow(record, patientMap);
  const patient =
    record.patient && typeof record.patient === "object"
      ? record.patient
      : patientMap.get(normalized.patientId) || {};

  return {
    ...normalized,
    number,
    week: getWeekNumber(normalized.date),
    name: normalized.patientName,
    age: formatPatientAgeAtDate(normalized.birthday, normalized.date),
    areaSitio: getPatientAreaSitio(patient, record),
  };
}

function isMorbidityReportRecord(record = {}) {
  return ["morbidity", "notifiable"].includes(
    getMorbidityReportingStatus(record),
  );
}

function isCommunitySurveillanceRecord(record = {}, surveillanceList = "hfmd") {
  if (surveillanceList !== "hfmd") return false;
  return getHfmdSurveillance(record) || getSurveillanceCategory(record) === "hfmd";
}

function getMorbidityReportingStatus(record = {}) {
  const monitoringData = record.monitoringData || record.monitoring_data || {};
  const explicitStatus = normalizeMorbidityStatus(
    firstFilledValue(
      record.morbidityReportingStatus,
      record.morbidity_reporting_status,
      monitoringData.morbidityReportingStatus,
      monitoringData.morbidity_reporting_status,
    ),
  );

  if (explicitStatus) return explicitStatus;

  const included = toReportBoolean(
    firstFilledValue(
      record.includeInMorbidityReport,
      record.include_in_morbidity_report,
      monitoringData.includeInMorbidityReport,
      monitoringData.include_in_morbidity_report,
    ),
  );

  if (!included) return "not_included";

  const notifiable = toReportBoolean(
    firstFilledValue(
      record.isNotifiableDisease,
      record.is_notifiable_disease,
      record.isNotifiable,
      record.is_notifiable,
      record.notifiable,
      monitoringData.isNotifiableDisease,
      monitoringData.is_notifiable_disease,
    ),
  );

  return notifiable ? "notifiable" : "morbidity";
}

function getSurveillanceCategory(record = {}) {
  const monitoringData = record.monitoringData || record.monitoring_data || {};
  return normalizeSurveillanceCategory(
    firstFilledValue(
      record.surveillanceCategory,
      record.surveillance_category,
      record.diseaseSurveillanceCategory,
      record.disease_surveillance_category,
      record.diseaseCategory,
      record.disease_category,
      monitoringData.surveillanceCategory,
      monitoringData.surveillance_category,
      monitoringData.diseaseSurveillanceCategory,
      monitoringData.disease_surveillance_category,
      monitoringData.diseaseCategory,
      monitoringData.disease_category,
    ),
  );
}

function getHfmdSurveillance(record = {}) {
  const monitoringData = record.monitoringData || record.monitoring_data || {};
  const explicit = firstFilledValue(
    record.hfmdSurveillance,
    record.hfmd_surveillance,
    monitoringData.hfmdSurveillance,
    monitoringData.hfmd_surveillance,
  );

  if (explicit !== "") return toReportBoolean(explicit);
  return getSurveillanceCategory(record) === "hfmd";
}

function normalizeSurveillanceCategory(value = "") {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  if (
    normalized === "hfmd" ||
    normalized.includes("hand, foot") ||
    normalized.includes("hand foot") ||
    normalized.includes("mouth disease")
  ) {
    return "hfmd";
  }
  if (normalized === "other") return "other";
  return normalized;
}

function normalizeMorbidityStatus(value) {
  const normalized = normalizeText(value).replace(/\s+/g, "_");
  return ["not_included", "morbidity", "notifiable"].includes(normalized)
    ? normalized
    : "";
}

function toReportBoolean(value) {
  const normalized = normalizeText(value);
  return value === true || ["true", "yes", "1"].includes(normalized);
}

function getWeekNumber(value) {
  const date = parseDateOnly(value);
  if (!date) return EMPTY_MARK;
  const start = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((date - start) / 86400000) + 1;
  return Math.ceil((dayOfYear + start.getDay()) / 7);
}

function getPatientBirthDate(patient = {}, record = {}) {
  return firstFilledValue(
    patient.birthDate,
    patient.birthdate,
    patient.dateOfBirth,
    patient.date_of_birth,
    record.patientBirthDate,
    record.patient_birth_date,
    record.birthDate,
    record.birthdate,
    record.dateOfBirth,
    record.date_of_birth,
  );
}

function getPatientAreaSitio(patient = {}, record = {}) {
  return firstFilledValue(
    patient.purokArea,
    patient.purok_area,
    patient.purok,
    patient.sitio,
    patient.area,
    record.purokArea,
    record.purok_area,
    record.purok,
    record.sitio,
    record.area,
    patient.address,
    record.patientAddress,
    record.patient_address,
    patient.barangay,
    record.barangay,
  );
}

function getRecordBarangay(record = {}, patientMap = new Map()) {
  const patientId = String(
    record.patientId || record.patient_id || record.patient?.id || "",
  );
  const patient =
    record.patient && typeof record.patient === "object"
      ? record.patient
      : patientMap.get(patientId) || {};

  return firstFilledValue(patient.barangay, record.barangay);
}

function getPatientAge(patient = {}, record = {}, birthday = "") {
  return (
    calculateAgeYears(birthday) ||
    firstFilledValue(
      patient.age,
      record.patientAge,
      record.patient_age,
      record.age,
    )
  );
}

function formatPatientAgeAtDate(birthdate, referenceDate) {
  const birth = parseDateOnly(birthdate);
  const reference = parseDateOnly(referenceDate);
  if (!birth || !reference || reference < birth) return EMPTY_MARK;

  const ageInDays = daysBetween(birth, reference);
  if (ageInDays < 30) {
    return `${ageInDays} ${ageInDays === 1 ? "day" : "days"}`;
  }

  let months =
    (reference.getFullYear() - birth.getFullYear()) * 12 +
    (reference.getMonth() - birth.getMonth());
  if (reference.getDate() < birth.getDate()) months -= 1;

  if (months < 12) {
    const safeMonths = Math.max(months, 1);
    return `${safeMonths} ${safeMonths === 1 ? "month" : "months"}`;
  }

  let years = reference.getFullYear() - birth.getFullYear();
  const birthdayThisYear = new Date(
    reference.getFullYear(),
    birth.getMonth(),
    birth.getDate(),
  );
  if (reference < birthdayThisYear) years -= 1;

  return years >= 0
    ? `${years} ${years === 1 ? "year" : "years"}`
    : EMPTY_MARK;
}

function getPatientSex(patient = {}, record = {}) {
  return firstFilledValue(patient.sex, patient.gender, record.sex, record.gender);
}

function formatAddressContact(patient = {}, record = {}) {
  const address = firstFilledValue(
    patient.completeAddress,
    patient.complete_address,
    patient.address,
    record.patientAddress,
    record.patient_address,
    record.address,
    [
      patient.streetAddress || patient.street_address,
      patient.purokArea || patient.purok_area,
      patient.barangay || record.barangay,
      patient.municipality || patient.city,
    ]
      .filter(Boolean)
      .join(", "),
  );
  const contact = firstFilledValue(
    patient.contactNumber,
    patient.contact_number,
    patient.mobileNumber,
    patient.mobile_number,
    patient.phone,
    record.contactNumber,
    record.contact_number,
    record.phone,
  );

  return [address, contact].filter(Boolean).join(" / ");
}

function getMorbiditySignsSymptoms(record = {}) {
  return firstFilledValue(
    record.summaryOfPresentIllness,
    record.summary_of_present_illness,
    record.signsSymptoms,
    record.signs_symptoms,
    record.assessmentFindings,
    record.assessment_findings,
    record.physicalExamination,
    record.physical_examination,
    record.chiefComplaint,
    record.chief_complaint,
  );
}

function getMorbidityDiagnosis(record = {}) {
  return firstFilledValue(
    record.diagnosis,
    record.initialDiagnosis,
    record.initial_diagnosis,
    record.condition,
  );
}

function getMorbidityMedicationTreatment(record = {}) {
  const treatment = firstFilledValue(
    record.medication,
    record.treatment,
    record.treatmentAdvice,
    record.treatment_advice,
    record.initialActionsTaken,
    record.initial_actions_taken,
  );
  const dispensed = formatDispensedMedicinesForReport(record);

  return [treatment, dispensed ? `Medicines: ${dispensed}` : ""]
    .filter(Boolean)
    .join(" ");
}

function formatDispensedMedicinesForReport(record = {}) {
  const medicines =
    record.dispensedMedicines ||
    record.dispensed_medicines ||
    record.healthRecordMedicines ||
    record.health_record_medicines ||
    [];

  if (!Array.isArray(medicines) || medicines.length === 0) return "";

  return medicines
    .map((item = {}) => {
      const name = firstFilledValue(
        item.medicineName,
        item.medicine_name_snapshot,
        item.medicineNameSnapshot,
        item.name,
      );
      const quantity = firstFilledValue(item.quantity, item.qty);
      const unit = firstFilledValue(item.unit, item.unit_snapshot);

      return [name, [quantity, unit].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(" x ");
    })
    .filter(Boolean)
    .join("; ");
}

function calculateAgeYears(value) {
  if (!value) return "";
  const birth = new Date(value);
  if (Number.isNaN(birth.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const birthdayThisYear = new Date(
    today.getFullYear(),
    birth.getMonth(),
    birth.getDate(),
  );
  if (today < birthdayThisYear) age -= 1;
  return age >= 0 ? age : "";
}

function firstFilledValue(...values) {
  return values.find(
    (value) => value !== undefined && value !== null && String(value).trim() !== "",
  ) || "";
}

function buildEpiTargetRow(patient, epiByPatient, followUpsByPatient, maternalByPatient) {
  const patientId = String(patient.id || patient.patientId || "");
  const records = epiByPatient.get(patientId) || [];
  const entries = records.flatMap(getEpiVaccineEntries);
  const vaccines = Object.fromEntries(
    EPI_CHILD_VACCINE_COLUMNS.map((vaccineName) => [
      vaccineName,
      getVaccineValue(entries, vaccineName),
    ]),
  );
  const recordedNames = new Set(
    entries.map((entry) => normalizeVaccineName(entry.vaccineName)),
  );
  const completed = EPI_CHILD_VACCINE_COLUMNS.every((name) =>
    recordedNames.has(name),
  );
  const birthDate =
    patient.birthDate ||
    patient.birthdate ||
    patient.dateOfBirth ||
    patient.date_of_birth ||
    "";
  const birthTime = patient.birthTime || patient.birth_time || "";
  const motherPatientId = String(
    patient.motherPatientId ||
      patient.mother_patient_id ||
      patient.motherPatient?.id ||
      patient.mother_patient?.id ||
      patient.mother?.id ||
      "",
  );
  const cpab = motherPatientId
    ? buildCpabValues(maternalByPatient.get(motherPatientId) || [], birthDate)
    : emptyCpabValues();
  const groupedVaccines = buildGroupedBirthDoseValues(entries, birthDate, birthTime);
  const ageMonths = calculateAgeInMonths(birthDate);
  const followUpTasks = (followUpsByPatient.get(patientId) || []).sort(
    (a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")),
  );
  const activeFollowUp =
    followUpTasks.find((task) =>
      ["due_today", "no_show", "upcoming", "rescheduled"].includes(task.effectiveState),
    ) ||
    followUpTasks.at(-1) ||
    null;
  const status = completed
    ? "Completed"
    : activeFollowUp
      ? formatFollowUpState(activeFollowUp.effectiveState, true)
      : entries.length > 0
        ? "Pending"
        : "Pending";
  const remarks = buildEpiRemarks(records, activeFollowUp, groupedVaccines.remarks);

  return {
    patientId,
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
    motherName:
      patient.motherName ||
      patient.mother_name ||
      formatPatientName(patient.motherPatient || patient.mother_patient || patient.mother, ""),
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
    cpab,
    groupedVaccines,
    nextScheduleDate: activeFollowUp?.dueDate || "",
    status,
    remarks,
    hasEpiRecord: records.length > 0,
    registrationType: patient.registrationType || patient.registration_type || "",
  };
}

function getVaccineValue(entries, vaccineName) {
  const matching = entries.filter(
    (entry) => normalizeVaccineName(entry.vaccineName) === vaccineName,
  );
  if (!matching.length) return EMPTY_MARK;

  return matching
    .map((entry) => {
      const status = normalizeText(entry.status || entry.result || entry.remarks);
      if (status.includes("defer")) return "Deferred";
      if (status.includes("no show")) return "No Show";
      return formatDate(entry.dateGiven, "Given");
    })
    .join(", ");
}

function buildGroupedBirthDoseValues(entries, birthDate, birthTime = "") {
  const grouped = {
    bcgWithin24: EMPTY_MARK,
    bcgAfter24Hours: EMPTY_MARK,
    hepaBWithin24: EMPTY_MARK,
    hepaBAfter24Hours: EMPTY_MARK,
    remarks: [],
  };

  splitBirthDoseEntries(entries, "BCG", birthDate, birthTime, "bcg").forEach((result) => {
    if (result.bucket === "within24") grouped.bcgWithin24 = result.value;
    if (result.bucket === "after24") grouped.bcgAfter24Hours = result.value;
    if (result.bucket === "outside") grouped.remarks.push(`BCG: ${result.value}`);
  });

  splitBirthDoseEntries(entries, "HEPA B", birthDate, birthTime, "hepaB").forEach((result) => {
    if (result.bucket === "within24") grouped.hepaBWithin24 = result.value;
    if (result.bucket === "after24") grouped.hepaBAfter24Hours = result.value;
    if (result.bucket === "outside") grouped.remarks.push(`Hepa B: ${result.value}`);
  });

  return grouped;
}

function splitBirthDoseEntries(entries, vaccineName, birthDate, birthTime, vaccineType) {
  return entries
    .filter((entry) => normalizeVaccineName(entry.vaccineName) === vaccineName)
    .map((entry) => {
      const value = formatVaccineEntryValue(entry);
      const birth = parseDateOnly(birthDate);
      const given = parseDateOnly(entry.dateGiven);
      if (!birth || !given) return { bucket: "outside", value };

      const days = daysBetween(birth, given);
      if (days < 0) return { bucket: "outside", value };
      if (isWithin24HoursOfBirth(birthDate, birthTime, entry.dateGiven)) {
        return { bucket: "within24", value };
      }
      if (vaccineType === "hepaB" && days <= 14) return { bucket: "after24", value };
      if (vaccineType === "bcg" && isWithinMonthsAndDays(birth, given, 11, 29)) {
        return { bucket: "after24", value };
      }
      return { bucket: "outside", value };
    });
}

function formatVaccineEntryValue(entry) {
  const status = normalizeText(entry.status || entry.result || entry.remarks);
  if (status.includes("defer")) return "Deferred";
  if (status.includes("no show")) return "No Show";
  return formatDate(entry.dateGiven, "Given");
}

function buildCpabValues(maternalRecords, childBirthDate) {
  const birth = parseDateOnly(childBirthDate);
  if (!birth || !maternalRecords.length) {
    return emptyCpabValues();
  }

  const doses = collectMaternalTdDoses(maternalRecords)
    .filter((dose) => dose.date && dose.date <= birth)
    .sort((a, b) => a.dose - b.dose || b.date - a.date);
  const dose2 = doses.find((dose) => dose.dose === 2);
  const higherDose = doses
    .filter((dose) => dose.dose >= 3 && dose.dose <= 5)
    .sort((a, b) => b.dose - a.dose || b.date - a.date)[0];

  return {
    td2: dose2 ? `${CHECK_MARK} ${dose2.label}` : EMPTY_MARK,
    td3ToTd5: higherDose ? `${CHECK_MARK} ${higherDose.label}` : EMPTY_MARK,
  };
}

function emptyCpabValues() {
  return { td2: EMPTY_MARK, td3ToTd5: EMPTY_MARK };
}

function collectMaternalTdDoses(records) {
  return records.flatMap((record) => {
    const maternal = normalizeObject(record.maternalData || record.maternal_data);
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

    return [1, 2, 3, 4, 5]
      .map((dose) => {
        const match = getTdDoseMatch(sourceObjects, dose);
        return {
          dose,
          date: parseDateOnly(match?.value),
          label: `${match?.prefix || "TT"}${dose}`,
        };
      })
      .filter((dose) => dose.date);
  });
}

function getTdDoseMatch(sourceObjects, dose) {
  const keys = buildTdDoseKeys(dose);
  const normalizedKeys = new Map(
    keys.map((item) => [normalizeTdDoseKey(item.key), item.prefix]),
  );

  for (const source of sourceObjects) {
    for (const { key, prefix } of keys) {
      const value = source?.[key];
      if (value) return { value, prefix };
    }

    for (const [key, value] of Object.entries(source || {})) {
      const prefix = normalizedKeys.get(normalizeTdDoseKey(key));
      if (value && prefix) {
        return { value, prefix };
      }
    }
  }

  return null;
}

function buildTdDoseKeys(dose) {
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
    ...tdKeys.map((key) => ({ key, prefix: "TD" })),
    ...sharedKeys.map((key) => ({ key, prefix: "TT" })),
  ];
}

function normalizeTdDoseKey(key) {
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

function isWithin24HoursOfBirth(birthDate, birthTime, givenDate) {
  const birth = parseDateTime(birthDate, birthTime);
  const given = parseDateTime(givenDate, "");
  const birthDay = parseDateOnly(birthDate);
  const givenDay = parseDateOnly(givenDate);

  if (!birthDay || !givenDay) return false;
  if (!hasTimeValue(givenDate) && daysBetween(birthDay, givenDay) === 0) {
    return true;
  }
  if (!birth || !given) return daysBetween(birthDay, givenDay) === 0;

  const hours = (given.getTime() - birth.getTime()) / (60 * 60 * 1000);
  return hours >= 0 && hours <= 24;
}

function parseDateTime(dateValue, timeValue = "") {
  if (!dateValue) return null;
  const datePart = String(dateValue).slice(0, 10);
  const timeMatch =
    String(dateValue).match(/T(\d{2}:\d{2})/) ||
    String(timeValue).match(/(\d{1,2}:\d{2})/);
  const timePart = timeMatch?.[1] || "00:00";
  const date = new Date(`${datePart}T${timePart}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hasTimeValue(value) {
  return /T\d{2}:\d{2}|\b\d{1,2}:\d{2}\b/.test(String(value || ""));
}

function isWithinMonthsAndDays(start, end, months, days) {
  const limit = new Date(start);
  limit.setMonth(limit.getMonth() + months);
  limit.setDate(limit.getDate() + days);
  return end <= limit;
}

function parseDateOnly(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(start, end) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / dayMs);
}

function isEpiTargetClient(row) {
  if (row.hasEpiRecord) return true;
  if (row.ageMonths < 0) return false;
  const type = normalizeText(row.registrationType);
  return type.includes("child") || type.includes("epi") || row.ageMonths <= 59;
}

function isEpiFollowUpTask(task = {}) {
  const serviceType = formatServiceType(
    task.healthRecord?.category ||
      task.healthRecord?.patientClassification ||
      task.healthRecord?.recordType ||
      task.category ||
      "",
    "",
  );
  return serviceType === "Child Health / EPI";
}

function matchesStatusFilter(status, filter) {
  if (!filter) return true;
  if (filter === "Due") return ["Due Today", "Pending"].includes(status);
  return status === filter;
}

function matchesAgeMonthsRange(ageMonths, filter) {
  if (!filter) return true;
  const value = Number(ageMonths);
  if (Number.isNaN(value)) return false;
  const [fromRaw, toRaw] = String(filter).split("-").map((part) => part.trim());
  const from = Number(fromRaw);
  const to = Number(toRaw ?? fromRaw);
  if (Number.isNaN(from)) return true;
  if (Number.isNaN(to)) return value === from;
  return value >= from && value <= to;
}

function matchesVaccineFilter(row, vaccine) {
  if (!vaccine) return true;
  return row.vaccines?.[vaccine] && row.vaccines[vaccine] !== EMPTY_MARK;
}

function buildEpiRemarks(records, followUpTask, groupedRemarks = []) {
  const recordRemarks = records
    .flatMap((record) => [
      record.remarks,
      record.notes,
      record.consultationNotes,
      record.consultation_notes,
    ])
    .filter(Boolean);
  const followUpRemarks = followUpTask?.notes ? [followUpTask.notes] : [];
  const state = followUpTask?.effectiveState;
  const stateRemark =
    state === "no_show"
      ? "No Show"
      : state === "rescheduled"
        ? "Rescheduled"
        : "";

  return [
    ...new Set([
      stateRemark,
      ...groupedRemarks,
      ...followUpRemarks,
      ...recordRemarks,
    ].filter(Boolean)),
  ].join("; ");
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

function matchesCondition(value, condition) {
  if (!condition) return true;
  const normalizedValue = normalizeText(value);
  const normalizedCondition = normalizeText(condition);
  if (normalizedCondition === "hpn") return normalizedValue === "hpn";
  if (normalizedCondition === "dm") return normalizedValue === "dm";
  if (normalizedCondition === "both") return normalizedValue === "both";
  return normalizedValue === normalizedCondition;
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
      record.initialDiagnosis,
      record.initial_diagnosis,
      record.chiefComplaint,
      record.chief_complaint,
      record.summaryOfPresentIllness,
      record.summary_of_present_illness,
      record.signsSymptoms,
      record.signs_symptoms,
      record.medication,
      record.treatment,
      record.initialActionsTaken,
      record.initial_actions_taken,
      record.consultationNotes,
      formatDispensedMedicinesForReport(record),
    ]
      .filter(Boolean)
      .join(" "),
  ).includes(normalizeText(term));
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

function formatFollowUpState(state, epiLabel = false) {
  const labels = {
    upcoming: "Pending",
    rescheduled: "Pending",
    due_today: "Due Today",
    no_show: "No Show",
    fulfilled: "Completed",
    cancelled: "Cancelled",
  };
  const value = labels[state] || "Pending";
  if (!epiLabel) return value;
  if (value === "Pending") return "Pending";
  return value;
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
