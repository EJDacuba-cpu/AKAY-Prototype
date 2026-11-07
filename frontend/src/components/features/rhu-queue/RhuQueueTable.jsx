import { useState } from "react";
import { Link } from "react-router";

import {
  ActionMenu,
  ConnectionErrorState,
  FixedTable,
  PlainStatusStamp,
  RefreshingIndicator,
  SegmentedFilter,
  SoftLoadingArea,
  TablePagination,
} from "../../common";
import usePagedRows from "../../../hooks/usePagedRows";
import { filterQueueRows, queueRowActions } from "../../../utils/rhuQueueView";
import { errorStateVariant } from "../../../utils/errorStateVariant";
import { TABLE_PAGE_SIZE, resetKeyOf } from "../../../utils/tablePaging";

const SOURCE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "referral", label: "Referred" },
  { value: "walk_in", label: "Walk-in" },
];

/**
 * Today's Queue for the RHU: who is waiting, where they came from and since when.
 * `rows` are display rows from `queueRows()`. Start / Resume navigate to the RHU ITR workspace.
 * Page chrome (title, Check in, Search+Filter) lives on the workspace; this owns the sheet.
 */
export default function RhuQueueTable({
  rows,
  search = "",
  status = "all",
  loading = false,
  error = false,
  queryError,
  onRetry,
  isRefreshing = false,
  canViewQueue = true,
  canEncode = false,
  canFinalize = false,
  canClose = false,
  onClearFilters,
  onStart,
  onResume,
  onCloseVisit,
}) {
  const [source, setSource] = useState("all");
  // Primitive reset key — a fresh filters object each render would trip usePagedRows.
  const visibleRows = filterQueueRows(rows, { search, source, status });
  const { page, setPage, totalPages, pageRows } = usePagedRows(
    visibleRows,
    resetKeyOf(search, source, status),
  );
  const narrowed =
    search.trim() !== "" || source !== "all" || status !== "all";

  const loadFailed = error && rows.length === 0;
  const refreshFailed = error && rows.length > 0;

  if (!canViewQueue) {
    return (
      <div className="flex min-h-[var(--akay-empty-h,260px)] flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white px-6 text-center shadow-card">
        <p className="text-[14px] font-semibold text-neutral-900">Viewing today's queue needs Health Records access</p>
        <p className="mt-1 max-w-sm text-[13px] text-neutral-500">
          {canClose
            ? "To check patients in, use Walk-in Check-in under Patient Intake in the sidebar."
            : "Ask your administrator if you should see it."}
        </p>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
        <ConnectionErrorState onRetry={onRetry} retrying={isRefreshing} variant={errorStateVariant(queryError)} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {refreshFailed && (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-warning-100 bg-warning-50 px-3 py-2 text-[13px] text-warning-700">
          Couldn't refresh the queue. Showing the last list that loaded; other desks' check-ins may be missing.
          <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
            Retry
          </button>
        </p>
      )}

      <SoftLoadingArea skeleton="queue" bodyOnly isLoading={loading} message="Loading today's queue..." scope="area">
        {!loading && (
          <div className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-3.5 py-3 sm:px-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-ink-800">Queue</h2>
                <p className="mt-0.5 text-xs text-neutral-500">Checked-in visits for today</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isRefreshing && <RefreshingIndicator label="Updating queue..." />}
                <SegmentedFilter
                  label="Filter by patient entry"
                  options={SOURCE_OPTIONS}
                  value={source}
                  onChange={setSource}
                />
              </div>
            </div>

            <FixedTable minWidth="min-w-[860px]" pageSize={TABLE_PAGE_SIZE}>
              <thead className="h-11 bg-neutral-100 text-[10px] font-bold uppercase tracking-wide text-neutral-600">
                <tr>
                  <th scope="col" className="w-12 px-4">
                    #
                  </th>
                  <th scope="col" className="px-4">
                    Patient
                  </th>
                  <th scope="col" className="px-4">
                    Patient Entry
                  </th>
                  <th scope="col" className="px-4">
                    Arrived
                  </th>
                  <th scope="col" className="px-4">
                    Visit Progress
                  </th>
                  <th scope="col" className="px-4 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-0">
                      <EmptyBody
                        narrowed={narrowed}
                        onClear={() => {
                          setSource("all");
                          onClearFilters?.();
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => (
                    <QueueRowView
                      key={row.id}
                      row={row}
                      canEncode={canEncode}
                      canFinalize={canFinalize}
                      canClose={canClose}
                      onStart={onStart}
                      onResume={onResume}
                      onCloseVisit={onCloseVisit}
                    />
                  ))
                )}
              </tbody>
            </FixedTable>

            <div className="mt-auto border-t border-neutral-100">
              <TablePagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                alwaysShow
              />
            </div>
          </div>
        )}
      </SoftLoadingArea>
    </div>
  );
}

function QueueRowView({ row, canEncode, canFinalize, canClose, onStart, onResume, onCloseVisit }) {
  const entryTone = row.source === "referral" ? "info" : "neutral";
  const actions = queueRowActions(row, { canEncode, canFinalize, canClose }).map((item) => {
    if (item.action === "start") return { ...item, onClick: () => onStart?.(row) };
    if (item.action === "resume") return { ...item, onClick: () => onResume?.(row) };
    if (item.action === "close") return { ...item, onClick: () => onCloseVisit?.(row) };
    return item;
  });

  return (
    <tr className="h-14 transition-colors hover:bg-neutral-50">
      <td className="px-4 tabular-nums text-[13px] text-neutral-500">{row.number}</td>
      <td className="px-4">
        <div className="min-w-0 leading-tight">
          <Link
            to={`/rhu/patients/${row.patientId}`}
            className="block truncate text-[13px] font-semibold text-ink-800 hover:underline"
          >
            {row.name}
          </Link>
          {row.ageSex && <p className="mt-0.5 truncate text-[12px] text-neutral-500">{row.ageSex}</p>}
        </div>
      </td>
      <td className="px-4">
        <div className="min-w-0 leading-tight">
          <PlainStatusStamp label={row.sourceLabel} tone={entryTone} appearance="plain" />
          {row.fromLabel && (
            <p className="mt-0.5 truncate text-[12px] text-neutral-500" title={row.fromLabel}>
              {row.fromLabel}
            </p>
          )}
        </div>
      </td>
      <td className="px-4">
        <div className="leading-tight">
          <p className="text-[13px] tabular-nums text-ink-800">{row.arrivedTime}</p>
          <p
            className={`mt-0.5 truncate text-[12px] ${
              row.carriedOver ? "font-semibold text-warning-700" : "text-neutral-500"
            }`}
          >
            {row.arrivalNote}
          </p>
        </div>
      </td>
      <td className="px-4">
        <PlainStatusStamp label={row.status.label} tone={row.status.tone} appearance="plain" />
      </td>
      <td className="px-4 text-right">
        <ActionMenu
          showHeader={false}
          title={row.name}
          triggerLabel={`Actions for ${row.name}`}
          actions={actions}
        />
      </td>
    </tr>
  );
}

function EmptyBody({ narrowed, onClear }) {
  return (
    <div className="flex min-h-[var(--akay-empty-h,220px)] flex-col items-center justify-center text-center">
      <p className="text-[14px] font-semibold text-neutral-900">
        {narrowed ? "Nothing matches your search" : "No patients in today's queue"}
      </p>
      <p className="mt-1 max-w-sm text-[13px] text-neutral-500">
        {narrowed
          ? "Try a different name, or clear search and filters."
          : "Referred patients appear here once their arrival is confirmed. To add a walk-in, use Walk-in Check-in under Patient Intake in the sidebar."}
      </p>
      {narrowed && (
        <button
          type="button"
          onClick={onClear}
          className="mt-4 h-8 rounded-full border border-neutral-200 bg-white px-3 text-[13px] font-medium text-neutral-800 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50"
        >
          Clear search and filters
        </button>
      )}
    </div>
  );
}
