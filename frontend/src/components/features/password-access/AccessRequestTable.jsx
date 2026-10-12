import { Search } from "lucide-react";
import {
  ActionMenu,
  FixedTable,
  ListToolbar,
  SoftLoadingArea,
  TablePagination,
} from "../../common";
import { STATUS_OPTIONS } from "../../../utils/accessRequestStatus";
import { actionLabel, menuSections } from "../../../utils/accountAccess";
import { roleFor } from "../../../utils/staffRoles";
import AccessStatusBadge from "./AccessStatusBadge";
import usePagedRows from "../../../hooks/usePagedRows";

export const DEFAULT_FILTERS = { search: "", status: "all" };

const FILTER_OPTIONS = [{ value: "all", label: "All statuses" }, ...STATUS_OPTIONS];

/**
 * The shared list for both Password & Invites tabs: toolbar (the page's tabs go in `toolbarHeading`),
 * desktop table and mobile cards. Statuses come from `statusOf` (accessRequestStatus.js); each row's single ⋯ menu
 * is `menuFor(row)`, a list of `ActionMenu` entries (empty means the row has no menu). A list with no rows shows a
 * centered message instead of the card, as Facilities does.
 */
export default function AccessRequestTable({
  rows,
  columns,
  statusOf,
  menuFor,
  emptyMessage,
  loading = false,
  error = "",
  filters,
  onFiltersChange,
  searchPlaceholder,
  toolbarHeading,
}) {
  const { page, setPage, totalPages, pageRows } = usePagedRows(rows, filters);

  const activeFilters = [
    filters.status !== "all" && {
      key: "status",
      label: FILTER_OPTIONS.find((option) => option.value === filters.status)?.label || filters.status,
    },
  ].filter(Boolean);
  const narrowed = Boolean(filters.search) || filters.status !== "all";

  return (
    <div className="space-y-5">
      {/* Outside the loading area, so the tabs stay on screen (and focusable) while a tab loads. */}
      <ListToolbar
        heading={toolbarHeading}
        searchValue={filters.search}
        onSearchChange={(value) => onFiltersChange({ search: value })}
        searchPlaceholder={searchPlaceholder}
        filters={[{ key: "status", label: "Status", value: filters.status, options: FILTER_OPTIONS }]}
        activeFilterCount={activeFilters.length}
        activeFilters={activeFilters}
        onApplyFilters={onFiltersChange}
        onClearFilters={() => onFiltersChange(DEFAULT_FILTERS)}
        onRemoveFilter={(key) => onFiltersChange({ [key]: key === "status" ? "all" : "" })}
      />

      <SoftLoadingArea isLoading={loading} message="Loading..." scope="area">
        {!loading && (
        <div className="space-y-5">
          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-[#B91C1C]">
              {error}
            </div>
          )}

          {rows.length === 0 ? (
            <EmptyState message={emptyMessage} narrowed={narrowed} />
          ) : (
            <div className="flex flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
              <div className="hidden md:block">
                <FixedTable minWidth="min-w-[980px]">
                  <thead className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                    <tr>
                      {columns.map((column) => (
                        <th key={column.key} className="px-4 py-3">{column.label}</th>
                      ))}
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F3F4F6]">
                    {pageRows.map((row) => (
                      <tr key={row.id} className="hover:bg-[#FAFBFD]">
                        {columns.map((column) => (
                          <td key={column.key} className={`px-4 py-3.5 ${column.className || "text-[#64748B]"}`}>
                            {column.render(row)}
                          </td>
                        ))}
                        <td className="px-4 py-3.5">
                          <AccessStatusBadge {...statusOf(row)} />
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <RowActions row={row} menuFor={menuFor} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </FixedTable>
              </div>

              <div className="divide-y divide-[#F3F4F6] md:hidden">
                {pageRows.map((row) => (
                  <RowCard key={row.id} row={row} columns={columns} statusOf={statusOf} menuFor={menuFor} />
                ))}
              </div>

              <div className="mt-auto">
                <TablePagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
              </div>
            </div>
          )}
        </div>
        )}
      </SoftLoadingArea>
    </div>
  );
}

/**
 * The menu entries for a row: its allowed controls in groups. A group label ("Other ways to sign in") is drawn
 * only when the menu has more than one group. `onPick(action)` runs when a control is chosen.
 */
export function menuEntries(kind, statusActions, onPick) {
  const sections = menuSections(statusActions);
  return sections.flatMap((section) => [
    ...(section.label && sections.length > 1 ? [{ section: section.label }] : []),
    ...section.actions.map((action) => ({ label: actionLabel(kind, action), onClick: () => onPick(action) })),
  ]);
}

/** Account, Email, Role, Facility and Date: the columns both tabs share (spec F3). */
export function accessColumns({ rolesData, dateOf }) {
  return [
    { key: "account", label: "Account", className: "font-semibold text-[#111827]", render: accountName },
    { key: "email", label: "Email", render: (row) => row.email || row.user?.email || "" },
    { key: "role", label: "Role", className: "text-[#334155]", render: (row) => roleLabel(rolesData, row.user) },
    { key: "facility", label: "Facility", className: "max-w-[220px] truncate text-[#64748B]", render: (row) => row.user?.facility || "No facility assigned" },
    { key: "date", label: "Date", render: (row) => formatDateTime(dateOf(row)) },
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

function EmptyState({ message, narrowed }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9]">
        <Search size={20} className="text-[#94A3B8]" />
      </div>
      <p className="text-[13px] font-semibold text-[#334155]">{message}</p>
      {narrowed && (
        <p className="mt-1 max-w-sm text-[11.5px] text-[#94A3B8]">Try adjusting your search or filters.</p>
      )}
    </div>
  );
}

function RowCard({ row, columns, statusOf, menuFor }) {
  const [account, email, ...rest] = columns;
  return (
    <div className="space-y-3 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[#0F172A]">{account.render(row)}</p>
          <p className="mt-0.5 truncate text-xs text-[#64748B]">{email.render(row)}</p>
        </div>
        <AccessStatusBadge {...statusOf(row)} />
      </div>
      <div className="grid gap-2 text-xs text-[#64748B]">
        {rest.map((column) => (
          <span key={column.key} className="truncate">{column.render(row)}</span>
        ))}
      </div>
      <RowActions row={row} menuFor={menuFor} />
    </div>
  );
}

function RowActions({ row, menuFor }) {
  const actions = menuFor(row);
  if (!actions.length) return null;

  return (
    <div className="flex items-center justify-end">
      <ActionMenu title={accountName(row)} subtitle={row.email || row.user?.email} actions={actions} />
    </div>
  );
}
