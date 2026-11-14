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
  buildNutritionTclRows,
  filterNutritionTclRows,
  tclDisplayValue,
} from "../../../utils/nutritionTcl";
import {
  buildProfileReturnState,
  BHC_PATIENT_PROFILE_PATH,
  RHU_PATIENT_PROFILE_PATH,
} from "../../../utils/profileNavigation";
import { resetKeyOf, TABLE_PAGE_SIZE } from "../../../utils/tablePaging";

function patientProfilePath(role, patientId) {
  const pattern = role === "rhu" ? RHU_PATIENT_PROFILE_PATH : BHC_PATIENT_PROFILE_PATH;
  return pattern.replace(":patientId", encodeURIComponent(patientId));
}

/**
 * Nutrition Target Client List for Reports → TCL → Nutrition (BHC and RHU).
 * Approved columns only: Patient, Age/Sex, vitals, BMI, classification, View.
 */
export default function NutritionTclSection({
  role = "bhc",
  records = [],
  patients = [],
  period,
  ageGroup = "all",
}) {
  const location = useLocation();
  const [search, setSearch] = useState("");

  const rows = useMemo(
    () =>
      buildNutritionTclRows({
        records: Array.isArray(records) ? records : [],
        patients: Array.isArray(patients) ? patients : [],
        period,
        ageGroup,
      }),
    [records, patients, period, ageGroup],
  );

  const filteredRows = useMemo(
    () => filterNutritionTclRows(rows, { search }),
    [rows, search],
  );

  const {
    page: currentPage,
    setPage: setCurrentPage,
    totalPages,
    pageRows,
  } = usePagedRows(
    filteredRows,
    resetKeyOf(period?.start, period?.end, search, ageGroup),
    TABLE_PAGE_SIZE,
  );

  const profileState = buildProfileReturnState(location);
  const hasFilters = Boolean(search.trim());

  return (
    <section className="no-print space-y-3" aria-label="Nutrition Target Client List">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold tracking-tight text-ink-800">
            Nutrition TCL
          </h2>
          <p className="mt-1 text-[12px] text-neutral-600">
            Enrolled Nutrition Care clients with an assessment in {period?.label || "this period"}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search patient name or ID"
            label="Search Nutrition TCL"
            className="w-full sm:min-w-[240px] sm:max-w-xs"
          />
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
            <th className="px-4">Patient</th>
            <th className="px-3">Age / Sex</th>
            <th className="px-3">Weight (kg)</th>
            <th className="px-3">Height / Length (cm)</th>
            <th className="px-3">BMI / Indicator</th>
            <th className="px-3">Nutrition Classification</th>
            <th className="px-3 text-right">View</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {pageRows.length === 0 ? (
            <DataTableEmptyState
              colSpan={7}
              icon={<Users size={20} className="text-neutral-400" />}
              title={rows.length === 0 ? "No Nutrition clients" : "No matching clients"}
              description={
                rows.length === 0
                  ? "Enrolled Nutrition Care clients with an assessment in this reporting period will appear here."
                  : hasFilters
                    ? "Clear search to see all Nutrition clients in this period."
                    : "No matching clients in this period."
              }
            />
          ) : (
            pageRows.map((row) => {
              const ageSex = [
                tclDisplayValue(row.ageLabel),
                tclDisplayValue(row.sex),
              ].join(" / ");

              return (
                <tr key={row.key} className="h-14 transition-colors hover:bg-neutral-50">
                  <td className="max-w-[220px] px-4">
                    <p className="truncate text-[13px] font-semibold text-ink-800" title={row.patientName}>
                      {row.patientName}
                    </p>
                    {row.patientIdentifier ? (
                      <p
                        className="truncate text-[11px] tabular-nums text-neutral-500"
                        title={row.patientIdentifier}
                      >
                        {row.patientIdentifier}
                      </p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 text-[13px] font-semibold text-ink-800">
                    {ageSex}
                  </td>
                  <td className="whitespace-nowrap px-3 text-[13px] tabular-nums text-neutral-600">
                    {tclDisplayValue(row.weightDisplay)}
                  </td>
                  <td className="whitespace-nowrap px-3 text-[13px] tabular-nums text-neutral-600">
                    {tclDisplayValue(row.heightDisplay)}
                  </td>
                  <td className="whitespace-nowrap px-3 text-[13px] tabular-nums font-semibold text-ink-800">
                    {tclDisplayValue(row.bmiDisplay)}
                  </td>
                  <td className="max-w-[160px] px-3 text-[13px] text-neutral-600">
                    <span className="block truncate" title={tclDisplayValue(row.classification)}>
                      {tclDisplayValue(row.classification)}
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
