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
  buildChildCareTclRows,
  filterChildCareTclRows,
  tclDisplayValue,
} from "../../../utils/childCareTcl";
import { formatDate } from "../../../utils/formatters";
import {
  buildProfileReturnState,
  BHC_PATIENT_PROFILE_PATH,
  RHU_PATIENT_PROFILE_PATH,
} from "../../../utils/profileNavigation";
import { resetKeyOf, TABLE_PAGE_SIZE } from "../../../utils/tablePaging";

const CPAB_FILTERS = [
  { value: "all", label: "All CPAB statuses" },
  { value: "protected", label: "Protected" },
  { value: "not_assessed", label: "Not assessed" },
];

function patientProfilePath(role, patientId) {
  const pattern = role === "rhu" ? RHU_PATIENT_PROFILE_PATH : BHC_PATIENT_PROFILE_PATH;
  return pattern.replace(":patientId", encodeURIComponent(patientId));
}

export default function ChildCareTclSection({
  role = "bhc",
  records = [],
  patients = [],
  period,
}) {
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [cpabFilter, setCpabFilter] = useState("all");

  const rows = useMemo(
    () =>
      buildChildCareTclRows({
        records: Array.isArray(records) ? records : [],
        patients: Array.isArray(patients) ? patients : [],
        period,
      }),
    [records, patients, period],
  );

  const filteredRows = useMemo(
    () => filterChildCareTclRows(rows, { search, cpabFilter }),
    [rows, search, cpabFilter],
  );

  const {
    page: currentPage,
    setPage: setCurrentPage,
    totalPages,
    pageRows,
  } = usePagedRows(
    filteredRows,
    resetKeyOf(period?.start, period?.end, search, cpabFilter),
    TABLE_PAGE_SIZE,
  );

  const profileState = buildProfileReturnState(location);
  const hasFilters = Boolean(search.trim()) || cpabFilter !== "all";

  return (
    <section className="no-print space-y-3" aria-label="Child Care Target Client List">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold tracking-tight text-ink-800">
            Child Care TCL — Immunization View
          </h2>
          <p className="mt-1 text-[12px] text-neutral-600">
            Registered infants in {period?.label || "this period"} · dose totals stay in the
            summary above
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search child, FSN, or mother"
            label="Search Child Care TCL"
            className="w-full sm:min-w-[240px] sm:max-w-xs"
          />
          <label className="flex w-full flex-col gap-1 sm:w-[200px]">
            <span className="sr-only">CPAB filter</span>
            <select
              value={cpabFilter}
              onChange={(event) => setCpabFilter(event.target.value)}
              aria-label="Filter by CPAB status"
              className="h-9 w-full rounded-full border border-neutral-200 bg-white px-3 text-[12px] font-medium text-ink-800 outline-none focus:border-ink-400 focus:ring-2 focus:ring-ink-400/30"
            >
              {CPAB_FILTERS.map((option) => (
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
        minWidth="min-w-[1120px]"
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
            <th className="px-4">Name of Child / Family Folder No.</th>
            <th className="px-3">Date of Registration</th>
            <th className="px-3">Date of Birth / Age &amp; Sex</th>
            <th className="px-3">Complete Name of Mother</th>
            <th className="px-3">CPAB (TT/Td)</th>
            <th className="px-3">BCG</th>
            <th className="px-3">Hepatitis B</th>
            <th className="px-3 text-right">View</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {pageRows.length === 0 ? (
            <DataTableEmptyState
              colSpan={8}
              icon={<Users size={20} className="text-neutral-400" />}
              title={rows.length === 0 ? "No eligible children" : "No matching children"}
              description={
                rows.length === 0
                  ? "Registered infants for this facility will appear here."
                  : hasFilters
                    ? "Clear search or CPAB filter to see all eligible children."
                    : "No matching children in this list."
              }
            />
          ) : (
            pageRows.map((row) => {
              const ageSex = [tclDisplayValue(row.ageLabel, "—"), tclDisplayValue(row.sex, "—")].join(
                " / ",
              );
              const cpabTitle = [row.cpabLabel, row.cpabEvidence].filter(Boolean).join(" · ");

              return (
                <tr key={row.key} className="h-14 transition-colors hover:bg-neutral-50">
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
                  <td className="whitespace-nowrap px-3">
                    <p className="text-[13px] font-semibold text-ink-800">
                      {formatDate(row.dateOfBirth, "Not recorded")}
                    </p>
                    <p className="text-[11px] text-neutral-500">{ageSex}</p>
                  </td>
                  <td className="max-w-[180px] px-3 text-[13px] text-neutral-600">
                    <span className="block truncate" title={tclDisplayValue(row.motherName)}>
                      {tclDisplayValue(row.motherName)}
                    </span>
                  </td>
                  <td className="max-w-[180px] px-3 text-[13px] text-neutral-600" title={cpabTitle}>
                    <p className="truncate font-semibold text-ink-800">{row.cpabLabel}</p>
                    {row.cpabEvidence ? (
                      <p className="truncate text-[11px] text-neutral-500">{row.cpabEvidence}</p>
                    ) : null}
                  </td>
                  <td className="max-w-[160px] px-3 text-[13px] text-neutral-600">
                    <span className="block truncate" title={tclDisplayValue(row.bcgDisplay)}>
                      {tclDisplayValue(row.bcgDisplay)}
                    </span>
                  </td>
                  <td className="max-w-[160px] px-3 text-[13px] text-neutral-600">
                    <span className="block truncate" title={tclDisplayValue(row.hepaBDisplay)}>
                      {tclDisplayValue(row.hepaBDisplay)}
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
