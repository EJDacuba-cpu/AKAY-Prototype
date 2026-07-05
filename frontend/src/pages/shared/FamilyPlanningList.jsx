import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye, FileText } from "lucide-react";

import {
  DataTableEmptyState,
  ModuleTableCard,
  SoftLoadingArea,
  TablePagination,
} from "../../components/common";
import { getFamilyPlanningHealthRecords } from "../../services/healthRecordService";
import {
  formatDate,
  formatDisplayValue,
  formatPatientName,
} from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";

const ITEMS_PER_PAGE = 8;

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
  const [currentPage, setCurrentPage] = useState(1);

  const {
    data: recordsData = [],
    isLoading,
    isFetching,
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
  const refreshing = isFetching && records.length > 0;

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

  const totalPages = Math.ceil(filteredRecords.length / ITEMS_PER_PAGE);
  const paginatedRecords = filteredRecords.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );
  const methodSummary = useMemo(
    () => buildMethodSummary(filteredRecords),
    [filteredRecords],
  );
  const purokSummary = useMemo(
    () => buildPurokSummary(filteredRecords),
    [filteredRecords],
  );

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [reportFilters]);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-[#0F172A]">
          Family Planning Reports
        </h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#64748B]">
          Target Client List and summaries generated from saved Family Planning
          health records.
        </p>
      </div>

      <SoftLoadingArea
        isLoading={loading}
        message="Loading family planning report..."
        scope="area"
        className="space-y-4"
      >
        {!loading && (
          <>
            <ModuleTableCard
              title="Family Planning TCL Table"
              count={filteredRecords.length}
              showCount
              subtitle="Target Client List generated from Family Planning health records."
              minWidth="min-w-[1500px]"
              refreshing={refreshing}
              footer={
                <TablePagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              }
            >
              <thead className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">No.</th>
                  <th className="whitespace-nowrap px-4 py-3">Date Registered</th>
                  <th className="whitespace-nowrap px-4 py-3">Family Serial No.</th>
                  <th className="whitespace-nowrap px-4 py-3">Patient Name</th>
                  <th className="whitespace-nowrap px-4 py-3">Complete Address</th>
                  <th className="whitespace-nowrap px-4 py-3">Age</th>
                  <th className="whitespace-nowrap px-4 py-3">Sex</th>
                  <th className="whitespace-nowrap px-4 py-3">Purok / Area</th>
                  <th className="whitespace-nowrap px-4 py-3">NHTS Status</th>
                  <th className="whitespace-nowrap px-4 py-3">Client Type</th>
                  <th className="whitespace-nowrap px-4 py-3">Method Used / Accepted</th>
                  <th className="whitespace-nowrap px-4 py-3">Previous Method</th>
                  <th className="whitespace-nowrap px-4 py-3">Source</th>
                  <th className="whitespace-nowrap px-4 py-3">Next Appointment Date</th>
                  <th className="whitespace-nowrap px-4 py-3">Remarks / Action</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right">View Health Record</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {paginatedRecords.length === 0 ? (
                  <DataTableEmptyState
                    colSpan={16}
                    icon={<FileText size={20} className="text-[#94A3B8]" />}
                    title="No Family Planning Records"
                    description="Saved Family Planning health records will appear here."
                  />
                ) : (
                  paginatedRecords.map((record, index) => (
                    <tr key={record.id} className="hover:bg-[#FAFBFD]">
                      <td className="px-4 py-3.5 text-[13px] text-[#64748B]">
                        {(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#64748B]">
                        {formatDate(record.dateRegistered, "Not recorded")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#64748B]">
                        {record.familySerialNumber || "Not recorded"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[13px] font-semibold text-[#111827]">
                        {record.patientName}
                      </td>
                      <td className="px-4 py-3.5 text-[13px] text-[#64748B]">
                        <span className="line-clamp-2 max-w-[240px]">
                          {record.completeAddress || "Not recorded"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#64748B]">
                        {record.age || "Not recorded"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#64748B]">
                        {record.sex || "Not recorded"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#64748B]">
                        {record.purokArea || "\u2014"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#64748B]">
                        {record.nhtsStatus || "Not recorded"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#64748B]">
                        {record.clientType}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[13px] font-semibold text-[#334155]">
                        {record.methodUsed}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#64748B]">
                        {record.previousMethod}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#64748B]">
                        {record.source}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#64748B]">
                        {formatDate(record.nextAppointmentDate, "Not recorded")}
                      </td>
                      <td className="px-4 py-3.5 text-[13px] text-[#64748B]">
                        <span className="line-clamp-2 max-w-[220px]">
                          {record.remarks}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right">
                        <Link
                          to={`${basePath}/health-records/${record.id}`}
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#FECACA] bg-white px-3 text-[11px] font-semibold text-[#B91C1C] transition-colors hover:bg-[#FEF2F2]"
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
      </SoftLoadingArea>
    </section>
  );
}

function SummaryTable({ title, columns, rows }) {
  return (
    <ModuleTableCard
      title={title}
      subtitle="Generated from filtered Family Planning records."
      minWidth="min-w-[780px]"
      minHeight="min-h-[320px]"
      bodyMinHeight="min-h-[220px]"
    >
      <thead className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        <tr>
          {columns.map((column) => (
            <th key={column} className="whitespace-nowrap px-4 py-3">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-[#F3F4F6]">
        {rows.length === 0 ? (
          <DataTableEmptyState
            colSpan={columns.length}
            title="No summary data"
            description="Filtered records will generate summary rows here."
          />
        ) : (
          rows.map((row, rowIndex) => (
            <tr key={`${title}-${rowIndex}`} className="hover:bg-[#FAFBFD]">
              {row.map((value, cellIndex) => (
                <td
                  key={`${title}-${rowIndex}-${cellIndex}`}
                  className={`whitespace-nowrap px-4 py-3.5 text-[13px] ${
                    cellIndex === 0
                      ? "font-semibold text-[#334155]"
                      : "text-[#64748B]"
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
