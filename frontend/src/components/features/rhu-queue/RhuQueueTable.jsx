import { useState } from "react";
import { Link } from "react-router";
import { Plus } from "lucide-react";

import {
  ActionMenu,
  ConnectionErrorState,
  FixedTable,
  RefreshingIndicator,
  SearchField,
  SegmentedFilter,
  SoftLoadingArea,
  TablePagination,
} from "../../common";
import { Button } from "../../ui/button";
import usePagedRows from "../../../hooks/usePagedRows";
import { filterQueueRows } from "../../../utils/rhuQueueView";
import { errorStateVariant } from "../../../utils/errorStateVariant";

const SOURCE_OPTIONS = [
  { value: "all", label: "All sources" },
  { value: "referral", label: "Referred" },
  { value: "walk_in", label: "Walk-in" },
];

const CHIP_TONES = {
  info: { chip: "border-info-100 bg-info-50 text-info-700", dot: "bg-info-500" },
  neutral: { chip: "border-neutral-200 bg-neutral-50 text-neutral-700", dot: "bg-neutral-400" },
};

const DEFAULT_FILTERS = { search: "", source: "all" };

/**
 * Today's Queue for the RHU: who is waiting, where they came from and since when.
 * `rows` are display rows from `queueRows()`. Start / Resume / Close arrive with Phase 5; until then the
 * row menu only opens the patient record.
 */
export default function RhuQueueTable({
  rows,
  loading = false,
  error = false,
  queryError,
  onRetry,
  isRefreshing = false,
  canCheckIn = false,
  onCheckIn,
}) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const visibleRows = filterQueueRows(rows, filters);
  const { page, setPage, totalPages, pageRows } = usePagedRows(visibleRows, filters);
  const narrowed = filters.search.trim() !== "" || filters.source !== "all";

  if (error && rows.length === 0) {
    return <ConnectionErrorState onRetry={onRetry} retrying={isRefreshing} variant={errorStateVariant(queryError)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchField
            value={filters.search}
            onChange={(search) => setFilters((current) => ({ ...current, search }))}
            placeholder="Search patient name"
            label="Search today's queue"
            className="sm:w-[300px]"
          />
          <SegmentedFilter
            label="Filter by source"
            options={SOURCE_OPTIONS}
            value={filters.source}
            onChange={(source) => setFilters((current) => ({ ...current, source }))}
          />
        </div>
        <div className="flex items-center gap-3">
          {isRefreshing && <RefreshingIndicator label="Updating queue..." />}
          {canCheckIn && (
            <Button type="button" variant="brand" onClick={onCheckIn}>
              <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
              Check in walk-in
            </Button>
          )}
        </div>
      </div>

      <SoftLoadingArea skeleton="table" bodyOnly isLoading={loading} message="Loading today's queue..." scope="area">
        {!loading && (
          <div className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
            <FixedTable minWidth="min-w-[860px]">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-[12px] font-medium text-neutral-500">
                <tr>
                  <th scope="col" className="w-12 px-4">#</th>
                  <th scope="col" className="px-4">Patient</th>
                  <th scope="col" className="px-4">Source</th>
                  <th scope="col" className="px-4">Arrived</th>
                  <th scope="col" className="px-4">Visit progress</th>
                  <th scope="col" className="px-4 text-right"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-0">
                      <EmptyBody narrowed={narrowed} onClear={() => setFilters(DEFAULT_FILTERS)} />
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => <QueueRowView key={row.id} row={row} />)
                )}
              </tbody>
            </FixedTable>
            {visibleRows.length > 0 && (
              <div className="mt-auto border-t border-neutral-100">
                <TablePagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
              </div>
            )}
          </div>
        )}
      </SoftLoadingArea>
    </div>
  );
}

function QueueRowView({ row }) {
  const tone = CHIP_TONES[row.status.tone] ?? CHIP_TONES.neutral;
  return (
    <tr className="transition-colors hover:bg-neutral-50">
      <td className="px-4 tabular-nums text-neutral-500">{row.number}</td>
      <td className="px-4">
        <div className="min-w-0 leading-tight">
          <Link
            to={`/rhu/patients/${row.patientId}`}
            className="block truncate text-[13px] font-semibold text-neutral-900 hover:underline"
          >
            {row.name}
          </Link>
          {row.ageSex && <p className="mt-0.5 truncate text-[12px] text-neutral-500">{row.ageSex}</p>}
        </div>
      </td>
      <td className="px-4">
        <div className="leading-tight">
          <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
              row.source === "referral" ? CHIP_TONES.info.chip : CHIP_TONES.neutral.chip
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${row.source === "referral" ? CHIP_TONES.info.dot : CHIP_TONES.neutral.dot}`}
            />
            {row.sourceLabel}
          </span>
          {row.fromLabel && <p className="mt-1 truncate text-[12px] text-neutral-500">{row.fromLabel}</p>}
        </div>
      </td>
      <td className="px-4">
        <div className="leading-tight">
          <p className="text-[13px] tabular-nums text-neutral-900">{row.arrivedTime}</p>
          <p className={`mt-0.5 truncate text-[12px] ${row.carriedOver ? "font-semibold text-warning-700" : "text-neutral-500"}`}>
            {row.arrivalNote}
          </p>
        </div>
      </td>
      <td className="px-4">
        <span
          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone.chip}`}
        >
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
          {row.status.label}
        </span>
      </td>
      <td className="px-4 text-right">
        <ActionMenu
          showHeader={false}
          title={row.name}
          triggerLabel={`Actions for ${row.name}`}
          actions={[{ label: "Open patient record", to: `/rhu/patients/${row.patientId}` }]}
        />
      </td>
    </tr>
  );
}

function EmptyBody({ narrowed, onClear }) {
  return (
    <div className="flex min-h-[var(--akay-empty-h,260px)] flex-col items-center justify-center text-center">
      <p className="text-[14px] font-semibold text-neutral-900">
        {narrowed ? "Nothing matches your search" : "No patients in today's queue"}
      </p>
      <p className="mt-1 max-w-sm text-[13px] text-neutral-500">
        {narrowed
          ? "Try a different name, or look at every source."
          : "Referred patients appear here once their arrival is confirmed. Check in a walk-in to add one."}
      </p>
      {narrowed && (
        <button
          type="button"
          onClick={onClear}
          className="mt-4 h-8 rounded-full border border-neutral-200 bg-white px-3 text-[13px] font-medium text-neutral-800 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50"
        >
          Clear search and source
        </button>
      )}
    </div>
  );
}
