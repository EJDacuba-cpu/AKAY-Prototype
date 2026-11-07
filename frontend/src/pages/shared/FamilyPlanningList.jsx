import { useMemo } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye, FileText } from "lucide-react";

import {
  DataTableEmptyState,
  ModuleTableCard,
  PageStateWrapper,
  TablePagination,
} from "../../components/common";
import { getFamilyPlanningHealthRecords } from "../../services/healthRecordService";
import usePagedRows from "../../hooks/usePagedRows";
import {
  formatDate,
  formatDisplayValue,
  formatPatientName,
} from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";


function getFamilyPlanningData(record = {}) {
  return record.familyPlanningData || record.family_planning_data || {};
}

function getRecordId(record = {}) {
  return (
    record.id ||
    record.healthRecordId ||
    record.health_record_id ||
    record.recordId ||
    record.record_id ||
    ""
  );
}

function getPatient(record = {}) {
  return record.patient && typeof record.patient === "object"
    ? record.patient
    : {};
}

function getAge(record = {}) {
  const patient = getPatient(record);
  return Number(patient.age || record.age || 0) || "";
}

function getAddress(record = {}) {
  const patient = getPatient(record);
  return [
    patient.streetAddress || patient.street_address || record.streetAddress,
    patient.barangay || record.barangay,
    patient.municipality || record.municipality,
  ]
    .filter(Boolean)
    .join(", ");
}

function normalizeRecord(record = {}) {
  const data = getFamilyPlanningData(record);
  const patient = getPatient(record);
  const dateOfVisit =
    data.dateOfVisit ||
    data.date_of_visit ||
    record.dateOfVisit ||
    record.date_of_visit ||
    record.visitDate ||
    record.date ||
    record.dateRecorded ||
    record.date_recorded;

  return {
    ...record,
    id: getRecordId(record),
    dateRegistered: data.dateRegistered || data.date_registered || dateOfVisit,
    dateOfVisit,
    familySerialNumber: formatDisplayValue(
      patient.familySerialNumber ||
        patient.family_serial_number ||
        record.familySerialNumber ||
        record.family_serial_number,
      "",
    ),
    patientName: formatPatientName(
      record.patientName || record.patient || record,
      "Unnamed Patient",
    ),
    completeAddress: getAddress(record),
    age: getAge(record),
    sex: formatDisplayValue(patient.sex || record.sex, ""),
    barangay: formatDisplayValue(patient.barangay || record.barangay, ""),
    purokArea: formatDisplayValue(
      patient.purokArea ||
        patient.purok_area ||
        record.purokArea ||
        record.purok_area,
      "",
    ),
    nhtsStatus: formatDisplayValue(
      patient.nhtsStatus ||
        patient.nhts_status ||
        record.nhtsStatus ||
        record.nhts_status,
      "",
    ),
    bhw: formatDisplayValue(
      record.attendingStaff ||
        record.recordedBy ||
        record.createdBy ||
        record.created_by ||
        record.provider,
      "",
    ),
    clientType: formatDisplayValue(
      data.clientType || data.client_type,
      "Not recorded",
    ),
    methodUsed: formatDisplayValue(
      data.methodUsed || data.method_used,
      "Not recorded",
    ),
    previousMethod: formatDisplayValue(
      data.previousMethod || data.previous_method,
      "Not recorded",
    ),
    fpVisitType: formatDisplayValue(
      data.fpVisitType ||
        data.fp_visit_type ||
        data.visitType ||
        data.visit_type,
      "Not recorded",
    ),
    source: formatDisplayValue(data.source, "Not recorded"),
    nextAppointmentDate:
      data.nextAppointmentDate || data.next_appointment_date || "",
    remarks: formatDisplayValue(
      data.actionTaken ||
        data.action_taken ||
        data.remarks ||
        data.notes,
      "Not recorded",
    ),
  };
}

function normalizeDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function getAgeGroup(record) {
  const age = Number(record.age);
  if (age >= 15 && age <= 19) return "15-19";
  if (age >= 20 && age <= 49) return "20-49";
  return "other";
}

function isNhts(record) {
  return String(record.nhtsStatus || "").toLowerCase() === "nhts";
}

function buildMethodSummary(records) {
  const map = new Map();

  records.forEach((record) => {
    const method = record.methodUsed || "Not recorded";
    if (!map.has(method)) {
      map.set(method, {
        method,
        currentUsers: 0,
        newAcceptors: 0,
        otherAcceptors: 0,
        dropouts: 0,
        age15to19: 0,
        age20to49: 0,
        total: 0,
      });
    }

    const row = map.get(method);
    const clientType = String(record.clientType || "").toLowerCase();
    if (clientType.includes("current")) row.currentUsers += 1;
    else if (clientType.includes("new")) row.newAcceptors += 1;
    else if (clientType.includes("discontinued") || clientType.includes("dropout")) {
      row.dropouts += 1;
    } else row.otherAcceptors += 1;

    const ageGroup = getAgeGroup(record);
    if (ageGroup === "15-19") row.age15to19 += 1;
    if (ageGroup === "20-49") row.age20to49 += 1;
    row.total += 1;
  });

  return Array.from(map.values()).sort((a, b) => a.method.localeCompare(b.method));
}

function buildPurokSummary(records) {
  const map = new Map();

  records.forEach((record) => {
    const key = `${record.purokArea || "Not recorded"}|${record.bhw || "Not recorded"}`;
    if (!map.has(key)) {
      map.set(key, {
        purokArea: record.purokArea || "Not recorded",
        bhw: record.bhw || "Not recorded",
        age15Nhts: 0,
        age15NonNhts: 0,
        age20Nhts: 0,
        age20NonNhts: 0,
        total: 0,
      });
    }

    const row = map.get(key);
    const ageGroup = getAgeGroup(record);
    const nhts = isNhts(record);

    if (ageGroup === "15-19" && nhts) row.age15Nhts += 1;
    if (ageGroup === "15-19" && !nhts) row.age15NonNhts += 1;
    if (ageGroup === "20-49" && nhts) row.age20Nhts += 1;
    if (ageGroup === "20-49" && !nhts) row.age20NonNhts += 1;
    row.total += 1;
  });

  return Array.from(map.values()).sort((a, b) =>
    a.purokArea.localeCompare(b.purokArea),
  );
}

export function FamilyPlanningReportSection({
  role = "bhc",
  basePath = role === "rhu" ? "/rhu" : "/bhc",
  reportFilters = {},
}) {
  const {
    data: recordsData,
    isPending: isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.familyPlanningRecords(role),
    queryFn: async () => {
      const data = await getFamilyPlanningHealthRecords(role);
      return (Array.isArray(data) ? data : []).map(normalizeRecord).reverse();
    },
  });

  const records = useMemo(
    () => (Array.isArray(recordsData) ? recordsData : []),
    [recordsData],
  );
  const loading = isLoading && records.length === 0;
  const refreshing = isFetching && Array.isArray(recordsData);

  const filteredRecords = useMemo(() => {
    const searchLower = String(reportFilters.search || "").trim().toLowerCase();
    const categoryFilter =
      reportFilters.classification ||
      reportFilters.category ||
      "All Classifications";
    const barangayFilter = reportFilters.barangay || "All Barangays";
    const dateFilter = reportFilters.date || reportFilters.dateReferred || "";
    const categoryAllowsFamilyPlanning =
      String(categoryFilter).startsWith("All") ||
      categoryFilter === "Family Planning";

    return records.filter((record) => {
      const searchText = [
        record.patientName,
        record.familySerialNumber,
        record.completeAddress,
        record.barangay,
        record.purokArea,
        record.nhtsStatus,
        record.clientType,
        record.methodUsed,
        record.previousMethod,
        record.fpVisitType,
        record.source,
        record.remarks,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const recordDateValues = [
        normalizeDate(record.dateRegistered),
        normalizeDate(record.dateOfVisit),
        normalizeDate(record.nextAppointmentDate),
      ].filter(Boolean);

      return (
        categoryAllowsFamilyPlanning &&
        (!searchLower || searchText.includes(searchLower)) &&
        (!dateFilter || recordDateValues.includes(dateFilter)) &&
        (String(barangayFilter).startsWith("All") ||
          record.barangay === barangayFilter)
      );
    });
  }, [records, reportFilters]);

  // reportFilters defaults to a new {} each render, so key the page reset on its contents.
  const {
    page: currentPage,
    setPage: setCurrentPage,
    totalPages,
    pageRows: paginatedRecords,
    startIndex,
  } = usePagedRows(filteredRecords, JSON.stringify(reportFilters));
  const methodSummary = useMemo(
    () => buildMethodSummary(filteredRecords),
    [filteredRecords],
  );
  const purokSummary = useMemo(
    () => buildPurokSummary(filteredRecords),
    [filteredRecords],
  );

  return (
    <section className="space-y-4">
      <PageStateWrapper skeleton="tcl" skeletonOptions={{ columns: 16 }}
        isLoading={loading}
        isError={isError}
        isFetching={isFetching}
        hasData={Array.isArray(recordsData)}
        error={error}
        onRetry={() => refetch()}
        loadingMessage="Loading family planning report..."
      >
        <div className="space-y-4">
          <div>
            <h2 className="text-[17px] font-bold tracking-tight text-ink-800">
              Family Planning Reports
            </h2>
            <p className="mt-1 max-w-3xl text-[13px] text-neutral-600">
              Target Client List and summaries generated from saved Family Planning
              health records.
            </p>
          </div>

        {!loading && (
          <>
            <ModuleTableCard
              title="Family Planning TCL Table"
              count={filteredRecords.length}
              showCount
              subtitle="Target Client List generated from Family Planning health records."
              minWidth="min-w-[1500px]"
              fixedRows
              refreshing={refreshing}
              footer={
                <TablePagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              }
            >
              <thead className="h-11 bg-neutral-100 text-[10px] font-bold uppercase tracking-wide text-neutral-600">
                <tr>
                  <th className="px-4">No.</th>
                  <th className="px-3">Date Registered</th>
                  <th className="px-3">Family Serial No.</th>
                  <th className="px-3">Patient Name</th>
                  <th className="px-3">Complete Address</th>
                  <th className="px-3">Age</th>
                  <th className="px-3">Sex</th>
                  <th className="px-3">Purok / Area</th>
                  <th className="px-3">NHTS Status</th>
                  <th className="px-3">Client Type</th>
                  <th className="px-3">Method Used / Accepted</th>
                  <th className="px-3">Previous Method</th>
                  <th className="px-3">Source</th>
                  <th className="px-3">Next Appointment Date</th>
                  <th className="px-3">Remarks / Action</th>
                  <th className="px-3 text-right">View Health Record</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {paginatedRecords.length === 0 ? (
                  <DataTableEmptyState
                    colSpan={16}
                    icon={<FileText size={20} className="text-[#94A3B8]" />}
                    title="No Family Planning Records"
                    description="Saved Family Planning health records will appear here."
                  />
                ) : (
                  paginatedRecords.map((record, index) => (
                    <tr key={record.id} className="h-14 transition-colors hover:bg-neutral-50">
                      <td className="px-4 text-[13px] text-neutral-600">
                        {startIndex + index + 1}
                      </td>
                      <td className="px-3 text-[13px] text-neutral-600">
                        {formatDate(record.dateRegistered, "Not recorded")}
                      </td>
                      <td className="px-3 text-[13px] text-neutral-600">
                        {record.familySerialNumber || "Not recorded"}
                      </td>
                      <td className="px-3 text-[13px] font-semibold text-ink-800">
                        {record.patientName}
                      </td>
                      <td className="max-w-[240px] px-3 text-[13px] text-neutral-600">
                        <span className="truncate" title={record.completeAddress || "Not recorded"}>
                          {record.completeAddress || "Not recorded"}
                        </span>
                      </td>
                      <td className="px-3 text-[13px] text-neutral-600">
                        {record.age || "Not recorded"}
                      </td>
                      <td className="px-3 text-[13px] text-neutral-600">
                        {record.sex || "Not recorded"}
                      </td>
                      <td className="px-3 text-[13px] text-neutral-600">
                        {record.purokArea || "\u2014"}
                      </td>
                      <td className="px-3 text-[13px] text-neutral-600">
                        {record.nhtsStatus || "Not recorded"}
                      </td>
                      <td className="px-3 text-[13px] text-neutral-600">
                        {record.clientType}
                      </td>
                      <td className="px-3 text-[13px] font-semibold text-ink-800">
                        {record.methodUsed}
                      </td>
                      <td className="px-3 text-[13px] text-neutral-600">
                        {record.previousMethod}
                      </td>
                      <td className="px-3 text-[13px] text-neutral-600">
                        {record.source}
                      </td>
                      <td className="px-3 text-[13px] text-neutral-600">
                        {formatDate(record.nextAppointmentDate, "Not recorded")}
                      </td>
                      <td className="max-w-[220px] px-3 text-[13px] text-neutral-600">
                        <span className="truncate" title={record.remarks || undefined}>
                          {record.remarks}
                        </span>
                      </td>
                      <td className="px-3 text-right">
                        <Link
                          to={`${basePath}/health-records/${record.id}`}
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 text-[11px] font-semibold text-brand-700 transition-colors hover:bg-brand-50"
                        >
                          <Eye size={13} />
                          View Health Record
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </ModuleTableCard>

            <div className="grid gap-4 xl:grid-cols-2">
              <SummaryTable
                title="Monthly Method Summary"
                columns={[
                  "Method",
                  "Current Users",
                  "New Acceptors",
                  "Other Acceptors",
                  "Dropouts / Discontinued",
                  "15-19",
                  "20-49",
                  "Total",
                ]}
                rows={methodSummary.map((row) => [
                  row.method,
                  row.currentUsers,
                  row.newAcceptors,
                  row.otherAcceptors,
                  row.dropouts,
                  row.age15to19,
                  row.age20to49,
                  row.total,
                ])}
              />
              <SummaryTable
                title="Purok / BHW Summary"
                columns={[
                  "Purok / Area",
                  "BHW",
                  "15-19 NHTS",
                  "15-19 Non-NHTS",
                  "20-49 NHTS",
                  "20-49 Non-NHTS",
                  "Total",
                ]}
                rows={purokSummary.map((row) => [
                  row.purokArea,
                  row.bhw,
                  row.age15Nhts,
                  row.age15NonNhts,
                  row.age20Nhts,
                  row.age20NonNhts,
                  row.total,
                ])}
              />
            </div>
          </>
        )}
        </div>
      </PageStateWrapper>
    </section>
  );
}

function SummaryTable({ title, columns, rows }) {
  return (
    <ModuleTableCard
      title={title}
      subtitle="Generated from filtered Family Planning records."
      minWidth="min-w-[780px]"
      fixedRows
    >
      <thead className="h-11 bg-neutral-100 text-[10px] font-bold uppercase tracking-wide text-neutral-600">
        <tr>
          {columns.map((column) => (
            <th key={column} className="px-4">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-100">
        {rows.length === 0 ? (
          <DataTableEmptyState
            colSpan={columns.length}
            title="No summary data"
            description="Filtered records will generate summary rows here."
          />
        ) : (
          rows.map((row, rowIndex) => (
            <tr
              key={`${title}-${rowIndex}`}
              className="h-14 transition-colors hover:bg-neutral-50"
            >
              {row.map((value, cellIndex) => (
                <td
                  key={`${title}-${rowIndex}-${cellIndex}`}
                  className={`px-4 text-sm ${
                    cellIndex === 0
                      ? "font-semibold text-ink-800"
                      : "text-neutral-600"
                  }`}
                >
                  {value === "" || value === null || value === undefined
                    ? "Not recorded"
                    : value}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </ModuleTableCard>
  );
}

export default FamilyPlanningReportSection;
