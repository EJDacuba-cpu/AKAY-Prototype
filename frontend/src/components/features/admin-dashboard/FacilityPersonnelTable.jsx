import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Link } from "react-router";
import { sortBarangays } from "../../../utils/adminDashboard";
import PersonnelDetailsModal from "./PersonnelDetailsModal";
import TablePagination from "../../common/pagination/TablePagination";
import { clampPage, pageCount, sliceRows } from "../../../utils/tablePaging";

const CONFIG = {
  bhc: {
    title: "Barangay Health Centers",
    facilityLabel: "Barangay Health Center",
    empty: "No barangay health centers registered yet.",
    roles: [{ key: "midwife", label: "Midwife" }, { key: "encoder", label: "Encoder" }, { key: "bhw", label: "BHW" }],
  },
  rhu: {
    title: "Rural Health Unit Personnel",
    facilityLabel: "RHU Facility",
    empty: "No rural health units registered yet.",
    roles: [{ key: "intake_staff", label: "RHU Staff" }, { key: "doctor", label: "Doctor" }, { key: "nurse", label: "Nurse" }],
  },
};
const DEFAULT_SORT = { key: "name", direction: "asc" };
const DASHBOARD_PAGE_SIZE = 5;

export default function FacilityPersonnelTable({ rows = [], type = "bhc" }) {
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [selection, setSelection] = useState(null);
  const [page, setPage] = useState(1);
  const config = CONFIG[type];
  const sorted = useMemo(() => sortBarangays(rows, sort), [rows, sort]);
  const totalPages = pageCount(sorted.length, DASHBOARD_PAGE_SIZE);
  const currentPage = clampPage(page, totalPages);
  const visibleRows = sliceRows(sorted, currentPage, DASHBOARD_PAGE_SIZE);
  const columns = [{ key: "name", label: config.facilityLabel }, ...config.roles, { key: "total", label: "Total" }];
  const facility = rows.find((row) => row.id === selection?.facilityId);
  const hasOtherDesignations = rows.some((row) => row.total > config.roles.reduce((sum, role) => sum + row[role.key], 0));

  function handleSort(column) {
    setPage(1);
    setSort((current) => ({
      key: column.key,
      direction: current.key === column.key
        ? (current.direction === "asc" ? "desc" : "asc")
        : (column.key === "name" ? "asc" : "desc"),
    }));
  }

  const countButton = (row, role) => (
    <button
      type="button"
      aria-label={`View ${role.label} personnel at ${row.name}: ${row[role.key]}`}
      aria-haspopup="dialog"
      onClick={() => setSelection({ facilityId: row.id, role })}
      className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full px-2 font-semibold tabular-nums text-brand-700 underline decoration-brand-200 underline-offset-4 transition-colors hover:bg-brand-50 hover:decoration-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
    >
      {row[role.key]}
    </button>
  );

  return (
    <section
      aria-labelledby={`${type}-personnel-title`}
      className="@container min-w-0 rounded-xl border border-[#E8ECF0] bg-white p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={`${type}-personnel-title`} className="text-sm font-bold text-[var(--color-text)]">{config.title}</h2>
          <p className="mt-0.5 text-[11px] text-[var(--color-text-secondary)]">
            Active and inactive accounts. Select a count for details.
          </p>
        </div>
        {(sort.key !== "name" || sort.direction !== "asc") && (
          <button type="button" onClick={() => { setSort(DEFAULT_SORT); setPage(1); }} className="rounded-full text-xs font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
            Reset order
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-[#E8ECF0] px-4 py-4 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">{config.empty}</p>
          <Link to="/admin/facilities" className="mt-1 inline-block text-xs font-semibold text-brand-700 hover:underline">Manage facilities</Link>
        </div>
      ) : (
        <>
          <div className="mt-3 hidden @min-[400px]:block">
            <table className="w-full table-fixed border-collapse text-[13px]">
              <caption className="sr-only">{config.title}: personnel by designation</caption>
              <thead>
                <tr className="h-9 border-b border-[#E8ECF0] bg-[#F9FAFB]">
                  {columns.map((column) => {
                    const active = sort.key === column.key;
                    const Arrow = sort.direction === "asc" ? ArrowUp : ArrowDown;
                    return (
                      <th key={column.key} scope="col" aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined} className={`px-1.5 py-2 font-normal ${column.key === "name" ? "w-[40%] text-left" : "text-right"}`}>
                        <button type="button" onClick={() => handleSort(column)} className={`inline-flex items-center gap-1 rounded text-[10px] font-semibold uppercase tracking-widest hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 ${active ? "text-brand-700" : "text-[var(--color-text-secondary)]"}`}>
                          {column.label}
                          {active && <Arrow size={11} aria-hidden="true" />}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id} className="h-10 border-b border-[#F3F4F6] last:border-b-0 hover:bg-[#F9FAFB]">
                    <th scope="row" className="px-1.5 py-1 text-left font-semibold text-[var(--color-text)]">
                      <span className="block truncate" title={row.name}>{row.name}</span>
                    </th>
                    {config.roles.map((role) => <td key={role.key} className="px-1.5 py-1 text-right">{countButton(row, role)}</td>)}
                    <td className="px-1.5 py-1 text-right font-semibold tabular-nums text-[var(--color-text)]">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-3 divide-y divide-[#F3F4F6] @min-[400px]:hidden">
            {visibleRows.map((row) => (
              <li key={row.id} className="py-3 first:pt-0 last:pb-0">
                <h3 className="break-words text-sm font-semibold text-[var(--color-text)]">{row.name}</h3>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                  {config.roles.map((role) => (
                    <div key={role.key} className="flex items-center justify-between gap-2">
                      <dt className="text-xs text-[var(--color-text-secondary)]">{role.label}</dt>
                      <dd>{countButton(row, role)}</dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-xs font-semibold text-[var(--color-text)]">Total</dt>
                    <dd className="inline-flex min-h-8 min-w-8 items-center justify-center px-2 font-semibold tabular-nums text-[var(--color-text)]">{row.total}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}

      {totalPages > 1 && (
        <nav aria-label={`${config.title} pagination`} className="-mx-4 mt-3 [&>div]:flex-row [&>div]:flex-wrap [&>div]:items-center [&>div]:gap-2 [&>div]:py-2">
          <TablePagination currentPage={currentPage} totalPages={totalPages} onPageChange={setPage} />
        </nav>
      )}

      {hasOtherDesignations && (
        <p className="mt-3 text-[11px] text-[var(--color-text-secondary)]">
          Totals include other designations{type === "bhc" ? ", including nurses with current BHC duty assignments" : ""}. Each person is counted once per facility.
        </p>
      )}
      {type === "bhc" && (
        <div className="mt-3 text-right">
          <Link to="/admin/reports" className="text-xs font-semibold text-brand-700 hover:underline">View report</Link>
        </div>
      )}
      {facility && selection && (
        <PersonnelDetailsModal facility={facility} role={selection.role} onClose={() => setSelection(null)} />
      )}
    </section>
  );
}
