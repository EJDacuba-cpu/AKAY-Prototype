import {
  ActionMenu,
  ConnectionErrorState,
  FixedTable,
  SearchField,
  SegmentedFilter,
  SoftLoadingArea,
  TablePagination,
} from "../../common";
import { STATUS_OPTIONS } from "../../../utils/accessRequestStatus";
import { actionLabel, menuSections } from "../../../utils/accountAccess";
import { roleFor } from "../../../utils/staffRoles";
import AccessStatusBadge from "./AccessStatusBadge";
import usePagedRows from "../../../hooks/usePagedRows";

export const DEFAULT_FILTERS = { search: "", status: "all" };

const STATUS_SEGMENTS = [{ value: "all", label: "All" }, ...STATUS_OPTIONS];

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50";

/**
 * The shared list for both Password & Invites tabs: a toolbar (search and a status switch), then one card holding the
 * desktop table or the mobile rows. Statuses come from `statusOf` (accessRequestStatus.js) and the row's reason is
 * printed under the status chip, since it says what the admin can do next. Each row's single ⋯ menu is
 * `menuFor(row)`, a list of `ActionMenu` entries (every row has the menu; unavailable controls are greyed). A list
 * with no rows keeps the column heads and says what will appear there.
 */
export default function AccessRequestTable({
  rows,
  columns,
  statusOf,
  menuFor,
  emptyMessage,
  emptyHint,
  loading = false,
  error = "",
  onRetry,
  filters,
  onFiltersChange,
  searchPlaceholder,
  searchLabel,
}) {
  const { page, setPage, totalPages, pageRows } = usePagedRows(rows, filters);
  const narrowed = Boolean(filters.search) || filters.status !== "all";

  return (
    <div className="space-y-4">
      {/* Outside the loading area, so search and the status switch stay usable while a tab loads. */}
      <AccessToolbar
        filters={filters}
        onFiltersChange={onFiltersChange}
        searchPlaceholder={searchPlaceholder}
        searchLabel={searchLabel}
      />

      <SoftLoadingArea skeleton="table" bodyOnly isLoading={loading} message="Loading..." scope="area">
        {!loading && (
          <div>
            {rows.length === 0 && error ? (
              // The server's message is shown as a toast; this keeps a way to try again on the page.
              <ConnectionErrorState variant="error" onRetry={onRetry} />
            ) : (
              <div className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
                <div className="hidden md:block">
                  <FixedTable minWidth="min-w-[920px]">
                    <TableHead columns={columns} />
                    <tbody className="divide-y divide-neutral-100">
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={columns.length + 2} className="px-6 py-0">
                            <EmptyBody
                              className="min-h-[300px]"
                              message={emptyMessage}
                              hint={emptyHint}
                              narrowed={narrowed}
                              onClear={() => onFiltersChange(DEFAULT_FILTERS)}
                            />
                          </td>
                        </tr>
                      ) : (
                        pageRows.map((row) => (
                          <tr key={row.id} className="transition-colors hover:bg-neutral-50">
                            {columns.map((column) => (
                              <td key={column.key} className={`px-4 ${column.className || "text-neutral-600"}`}>
                                {column.render(row)}
                              </td>
                            ))}
                            <td className="px-4">
                              <StatusCell status={statusOf(row)} />
                            </td>
                            <td className="px-4 text-right">
                              <RowActions row={row} menuFor={menuFor} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </FixedTable>
                </div>

                <div className="divide-y divide-neutral-100 md:hidden">
                  {rows.length === 0 ? (
                    <EmptyBody
                      className="min-h-[240px] px-6 py-10"
                      message={emptyMessage}
                      hint={emptyHint}
                      narrowed={narrowed}
                      onClear={() => onFiltersChange(DEFAULT_FILTERS)}
                    />
                  ) : (
                    pageRows.map((row) => (
                      <RowCard key={row.id} row={row} columns={columns} statusOf={statusOf} menuFor={menuFor} />
                    ))
                  )}
                </div>

                {rows.length > 0 && (
                  <div className="mt-auto border-t border-neutral-100">
                    <TablePagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </SoftLoadingArea>
    </div>
  );
}

const NOT_AVAILABLE = "Not available for this status.";

/**
 * The menu entries for a row: every control of the tab in groups (a thin divider between groups), greyed (and not
 * clickable) when the row's status does not allow it. `onPick(action)` runs when an active control is chosen.
 */
export function menuEntries(kind, statusActions, onPick) {
  return menuSections(kind, statusActions).flatMap((section, index) => [
    ...(index > 0 ? [{ divider: true }] : []),
    ...section.items.map(({ action, enabled }) => ({
      label: actionLabel(kind, action),
      onClick: () => onPick(action),
      disabled: !enabled,
      title: NOT_AVAILABLE,
    })),
  ]);
}

/** Account (name over email), Role, Facility and a date: the columns both tabs share (spec F3). `dateLabel` names the date ("Requested", "Sent"). */
export function accessColumns({ rolesData, dateOf, dateLabel = "Date" }) {
  return [
    {
      key: "account",
      label: "Account",
      className: "text-neutral-900",
      render: (row) => (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[13px] font-semibold text-neutral-900">{accountName(row)}</p>
          <p className="mt-0.5 truncate text-[12px] font-normal text-neutral-500">{row.email || row.user?.email || ""}</p>
        </div>
      ),
    },
    { key: "role", label: "Role", className: "text-neutral-700", render: (row) => roleLabel(rolesData, row.user) },
    { key: "facility", label: "Facility", className: "max-w-[220px] truncate text-neutral-600", render: (row) => row.user?.facility || "No facility assigned" },
    { key: "date", label: dateLabel, className: "tabular-nums text-neutral-500", render: (row) => formatDateTime(dateOf(row)) },
  ];
}

export function accountName(row) {
  return row.user?.name || "Unknown account";
}

/** The staff role label ("Midwife"); title-cases the key when the roles could not be loaded. */
export function roleLabel(rolesData, user) {
  if (user?.staff_role) {
    return roleFor(rolesData, user.staff_role)?.label || titleCase(user.staff_role);
  }
  if (user?.role === "admin") return "Municipal Health Officer";
  return "Not recorded";
}

export function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function titleCase(key) {
  return String(key)
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

/** Search on the left, the status switch beside it. Both write to the same filters the table already reads. */
function AccessToolbar({ filters, onFiltersChange, searchPlaceholder, searchLabel = "Search" }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <SearchField
        value={filters.search}
        onChange={(value) => onFiltersChange({ search: value })}
        placeholder={searchPlaceholder}
        label={searchLabel}
        className="sm:max-w-[340px]"
      />
      <SegmentedFilter
        label="Filter by status"
        options={STATUS_SEGMENTS}
        value={filters.status}
        onChange={(value) => onFiltersChange({ status: value })}
      />
    </div>
  );
}

function TableHead({ columns }) {
  return (
    <thead className="border-b border-neutral-200 bg-neutral-50 text-[12px] font-medium text-neutral-500">
      <tr>
        {columns.map((column) => (
          <th key={column.key} scope="col" className="px-4">{column.label}</th>
        ))}
        <th scope="col" className="px-4">Status</th>
        <th scope="col" className="px-4 text-right"><span className="sr-only">Actions</span></th>
      </tr>
    </thead>
  );
}

/** The chip, with the reason (what happens next, or when it expires) quietly beneath it. */
function StatusCell({ status }) {
  return (
    <div className="leading-tight">
      <AccessStatusBadge {...status} />
      {status.reason && <p className="mt-1 truncate text-[12px] text-neutral-500">{status.reason}</p>}
    </div>
  );
}

function EmptyBody({ message, hint, narrowed, onClear, className = "" }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${className}`}>
      <p className="text-[14px] font-semibold text-neutral-900">
        {narrowed ? "Nothing matches your search" : message}
      </p>
      <p className="mt-1 max-w-sm text-[13px] text-neutral-500">
        {narrowed ? "Try a different name or email, or look at every status." : hint}
      </p>
      {narrowed && (
        <button
          type="button"
          onClick={onClear}
          className={`mt-4 h-8 rounded-md border border-neutral-200 bg-white px-3 text-[13px] font-medium text-neutral-800 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50 ${FOCUS_RING}`}
        >
          Clear search and status
        </button>
      )}
    </div>
  );
}

function RowCard({ row, columns, statusOf, menuFor }) {
  const [account, ...rest] = columns;
  const status = statusOf(row);
  return (
    <div className="space-y-3 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">{account.render(row)}</div>
        <RowActions row={row} menuFor={menuFor} />
      </div>
      <StatusCell status={status} />
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
        {rest.map((column) => (
          <div key={column.key} className="contents">
            <dt className="text-neutral-500">{column.label}</dt>
            <dd className="truncate text-neutral-700">{column.render(row)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function RowActions({ row, menuFor }) {
  return (
    <div className="flex items-center justify-end">
      <ActionMenu showHeader={false} title={accountName(row)} actions={menuFor(row)} />
    </div>
  );
}
