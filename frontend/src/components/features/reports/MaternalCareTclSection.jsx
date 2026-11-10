import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import { Eye, Users } from "lucide-react";

import {
  DataTableEmptyState,
  ModuleTableCard,
  SearchField,
  TablePagination,
} from "../../common";
import usePagedRows from "../../../hooks/usePagedRows";
import {
  buildMaternalCareTclRows,
  filterMaternalCareTclRows,
  tclDisplayValue,
} from "../../../utils/maternalCareTcl";
import { formatDate } from "../../../utils/formatters";
import {
  buildProfileReturnState,
  BHC_PATIENT_PROFILE_PATH,
  RHU_PATIENT_PROFILE_PATH,
} from "../../../utils/profileNavigation";
import { resetKeyOf, TABLE_PAGE_SIZE } from "../../../utils/tablePaging";

const TT_TD_FILTERS = [
  { value: "all", label: "All TT / Td" },
  { value: "tt", label: "With TT" },
  { value: "td", label: "With Td" },
  { value: "none", label: "Not recorded" },
];

function patientProfilePath(role, patientId) {
  const pattern = role === "rhu" ? RHU_PATIENT_PROFILE_PATH : BHC_PATIENT_PROFILE_PATH;
  return pattern.replace(":patientId", encodeURIComponent(patientId));
}

export default function MaternalCareTclSection({
  role = "bhc",
  records = [],
  patients = [],
  period,
}) {
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [ttTdFilter, setTtTdFilter] = useState("all");

  const rows = useMemo(
    () =>
      buildMaternalCareTclRows({
        records: Array.isArray(records) ? records : [],
        patients: Array.isArray(patients) ? patients : [],
        period,
      }),
    [records, patients, period],
  );

  const filteredRows = useMemo(
    () => filterMaternalCareTclRows(rows, { search, ttTdFilter }),
    [rows, search, ttTdFilter],
  );

  const {
    page: currentPage,
    setPage: setCurrentPage,
    totalPages,
    pageRows,
  } = usePagedRows(
    filteredRows,
    resetKeyOf(period?.start, period?.end, search, ttTdFilter),
    TABLE_PAGE_SIZE,
  );

  const profileState = buildProfileReturnState(location);
  const hasFilters = Boolean(search.trim()) || ttTdFilter !== "all";

  return (
    <section className="no-print space-y-3" aria-label="Maternal Care Target Client List">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold tracking-tight text-ink-800">
            Maternal Care TCL
          </h2>
          <p className="mt-1 text-[12px] text-neutral-600">
            Clients with a maternal visit in {period?.label || "this period"} · totals stay in
            the summary above
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search name or FSN"
            label="Search Maternal Care TCL"
            className="w-full sm:min-w-[240px] sm:max-w-xs"
          />
          <label className="flex w-full flex-col gap-1 sm:w-[180px]">
            <span className="sr-only">TT / Td filter</span>
            <select
              value={ttTdFilter}
              onChange={(event) => setTtTdFilter(event.target.value)}
              aria-label="Filter by TT or Td"
              className="h-9 w-full rounded-full border border-neutral-200 bg-white px-3 text-[12px] font-medium text-ink-800 outline-none focus:border-ink-400 focus:ring-2 focus:ring-ink-400/30"
            >
              {TT_TD_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <ModuleTableCard
        title="Target Client List"
        count={filteredRows.length}
        showCount
        minWidth="min-w-[1100px]"
        fixedRows
        pageSize={TABLE_PAGE_SIZE}
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
            <th className="px-4">Patient Name / FSN</th>
            <th className="px-3">Date of Registration</th>
            <th className="px-3">Age</th>
            <th className="px-3">Gravida / Para</th>
            <th className="px-3">LMP</th>
            <th className="px-3">EDC</th>
            <th className="px-3">TT / Td</th>
            <th className="px-3 text-right">View</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {pageRows.length === 0 ? (
            <DataTableEmptyState
              colSpan={8}
              icon={<Users size={20} className="text-neutral-400" />}
              title={
                rows.length === 0
                  ? "No Maternal Care clients"
                  : "No matching clients"
              }
              description={
                rows.length === 0
                  ? "Clients with a maternal visit in this reporting period will appear here."
                  : hasFilters
                    ? "Clear search or TT/Td filter to see all clients in this period."
                    : "No matching clients in this period."
              }
            />
          ) : (
            pageRows.map((row) => (
              <tr
                key={row.key}
                className="h-14 transition-colors hover:bg-neutral-50"
              >
                <td className="max-w-[220px] px-4">
                  <p className="truncate text-[13px] font-semibold text-ink-800" title={row.patientName}>
                    {row.patientName}
                  </p>
                  <p
                    className="truncate text-[11px] tabular-nums text-neutral-500"
                    title={tclDisplayValue(row.familySerialNumber)}
                  >
                    {tclDisplayValue(row.familySerialNumber)}
                  </p>
                </td>
                <td className="whitespace-nowrap px-3 text-[13px] text-neutral-600">
                  {formatDate(row.dateRegistered, "Not recorded")}
                </td>
                <td className="whitespace-nowrap px-3 text-[13px] font-semibold text-ink-800">
                  {tclDisplayValue(row.age)}
                </td>
                <td className="whitespace-nowrap px-3 text-[13px] text-neutral-600">
                  {tclDisplayValue(row.gravidaPara)}
                </td>
                <td className="whitespace-nowrap px-3 text-[13px] text-neutral-600">
                  {formatDate(row.lmp, "Not recorded")}
                </td>
                <td className="whitespace-nowrap px-3 text-[13px] text-neutral-600">
                  {formatDate(row.edc, "Not recorded")}
                </td>
                <td className="max-w-[140px] px-3 text-[13px] font-semibold text-ink-800">
                  <span className="block truncate" title={tclDisplayValue(row.ttTd)}>
                    {tclDisplayValue(row.ttTd)}
                  </span>
                </td>
                <td className="px-3 text-right">
                  {row.canViewPatient ? (
                    <Link
                      to={patientProfilePath(role, row.patientId)}
                      state={profileState}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 text-[11px] font-semibold text-brand-700 transition-colors hover:bg-brand-50"
                    >
                      <Eye size={13} />
                      View
                    </Link>
                  ) : (
                    <span className="inline-flex h-8 items-center px-3 text-[11px] font-semibold text-neutral-400">
                      Unavailable
                    </span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </ModuleTableCard>
    </section>
  );
}
