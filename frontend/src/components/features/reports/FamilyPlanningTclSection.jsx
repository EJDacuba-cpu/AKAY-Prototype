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
import { FP_CLIENT_TYPE_OPTIONS } from "../../../utils/familyPlanning";
import {
  buildFamilyPlanningTclRows,
  filterFamilyPlanningTclRows,
  tclDisplayValue,
} from "../../../utils/familyPlanningTcl";
import { formatDate } from "../../../utils/formatters";
import {
  buildProfileReturnState,
  BHC_PATIENT_PROFILE_PATH,
  RHU_PATIENT_PROFILE_PATH,
} from "../../../utils/profileNavigation";
import { resetKeyOf, TABLE_PAGE_SIZE } from "../../../utils/tablePaging";

const CLIENT_TYPE_FILTERS = [
  { value: "all", label: "All client types" },
  ...FP_CLIENT_TYPE_OPTIONS.map((option) => ({
    value: option.split("—")[0].trim().toLowerCase(),
    label: option,
  })),
  { value: "unknown", label: "Not recorded" },
];

function patientProfilePath(role, patientId) {
  const pattern = role === "rhu" ? RHU_PATIENT_PROFILE_PATH : BHC_PATIENT_PROFILE_PATH;
  return pattern.replace(":patientId", encodeURIComponent(patientId));
}

export default function FamilyPlanningTclSection({
  role = "bhc",
  records = [],
  patients = [],
  period,
}) {
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [clientType, setClientType] = useState("all");

  const rows = useMemo(
    () =>
      buildFamilyPlanningTclRows({
        records: Array.isArray(records) ? records : [],
        patients: Array.isArray(patients) ? patients : [],
        period,
      }),
    [records, patients, period],
  );

  const filteredRows = useMemo(
    () => filterFamilyPlanningTclRows(rows, { search, clientType }),
    [rows, search, clientType],
  );

  const {
    page: currentPage,
    setPage: setCurrentPage,
    totalPages,
    pageRows,
  } = usePagedRows(
    filteredRows,
    resetKeyOf(period?.start, period?.end, search, clientType),
    TABLE_PAGE_SIZE,
  );

  const profileState = buildProfileReturnState(location);
  const hasFilters = Boolean(search.trim()) || clientType !== "all";

  return (
    <section className="no-print space-y-3" aria-label="Family Planning Target Client List">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold tracking-tight text-ink-800">
            Family Planning TCL
          </h2>
          <p className="mt-1 text-[12px] text-neutral-600">
            Unique clients in {period?.label || "this period"} · FP Services stay in the
            summary above
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search name, FSN, or method"
            label="Search Family Planning TCL"
            className="w-full sm:min-w-[240px] sm:max-w-xs"
          />
          <label className="flex w-full flex-col gap-1 sm:w-[200px]">
            <span className="sr-only">Client type</span>
            <select
              value={clientType}
              onChange={(event) => setClientType(event.target.value)}
              aria-label="Filter by client type"
              className="h-9 w-full rounded-full border border-neutral-200 bg-white px-3 text-[12px] font-medium text-ink-800 outline-none focus:border-ink-400 focus:ring-2 focus:ring-ink-400/30"
            >
              {CLIENT_TYPE_FILTERS.map((option) => (
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
        minWidth="min-w-[1080px]"
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
            <th className="px-4">Complete Name / Family Folder No.</th>
            <th className="px-3">Date of Registration</th>
            <th className="px-3">Age / Date of Birth</th>
            <th className="px-3">SE Status</th>
            <th className="px-3">Type of Client</th>
            <th className="px-3">Method Used / Accepted</th>
            <th className="px-3">Previous Method</th>
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
                  ? "No Family Planning clients"
                  : "No matching clients"
              }
              description={
                rows.length === 0
                  ? "Clients with an FP visit in this reporting period will appear here."
                  : hasFilters
                    ? "Clear search or client type to see all clients in this period."
                    : "No matching clients in this period."
              }
            />
          ) : (
            pageRows.map((row) => {
              const ageDobTitle = [
                row.age ? `Age ${row.age}` : "Age not recorded",
                row.dateOfBirth
                  ? formatDate(row.dateOfBirth, "Not recorded")
                  : "DOB not recorded",
              ].join(" · ");

              return (
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
                  <td className="whitespace-nowrap px-3" title={ageDobTitle}>
                    <p className="text-[13px] font-semibold text-ink-800">
                      {tclDisplayValue(row.age)}
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      {formatDate(row.dateOfBirth, "Not recorded")}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 text-[13px] text-neutral-600">
                    {tclDisplayValue(row.seStatus)}
                  </td>
                  <td className="max-w-[160px] px-3 text-[13px] text-neutral-600">
                    <span className="block truncate" title={tclDisplayValue(row.clientType)}>
                      {tclDisplayValue(row.clientType)}
                    </span>
                  </td>
                  <td className="max-w-[180px] px-3 text-[13px] font-semibold text-ink-800">
                    <span className="block truncate" title={tclDisplayValue(row.methodUsed)}>
                      {tclDisplayValue(row.methodUsed)}
                    </span>
                  </td>
                  <td className="max-w-[180px] px-3 text-[13px] text-neutral-600">
                    <span className="block truncate" title={tclDisplayValue(row.previousMethod)}>
                      {tclDisplayValue(row.previousMethod)}
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
              );
            })
          )}
        </tbody>
      </ModuleTableCard>
    </section>
  );
}
