import { useState } from "react";
import { KeyRound, Search, ShieldCheck } from "lucide-react";
import {
  ActionMenu,
  ListToolbar,
  ModalButton,
  ModalShell,
  SoftLoadingArea,
  TablePagination,
} from "../../common";
import { STATUS_OPTIONS } from "../../../utils/accessRequestStatus";
import { roleFor } from "../../../utils/staffRoles";
import { formatDisplayValue } from "../../../utils/formatters";
import AccessStatusBadge from "./AccessStatusBadge";

export const DEFAULT_FILTERS = { search: "", status: "all" };

const FILTER_OPTIONS = [{ value: "all", label: "All statuses" }, ...STATUS_OPTIONS];

const ACTION_LABELS = {
  approve: "Approve",
  decline: "Decline",
  resend: "Resend link",
  copy: "Copy link",
  editEmail: "Edit email",
  temporaryPassword: "Generate temporary password",
};

/**
 * The shared list for both Password & Invites tabs: toolbar, summary cards, desktop table,
 * mobile cards and the View details modal. Statuses and row actions come from `statusOf`
 * (accessRequestStatus.js); every row has a single ⋯ menu holding View details and the row's actions.
 */
export default function AccessRequestTable({
  rows,
  columns,
  statusOf,
  onAction,
  emptyMessage,
  loading = false,
  error = "",
  busyId = null,
  filters,
  onFiltersChange,
  searchPlaceholder,
  needsAction,
  linkExpiry,
  heading,
  description,
  detailTitle,
  detailsOf = () => [],
}) {
  const [selected, setSelected] = useState(null);

  const activeFilters = [
    filters.status !== "all" && {
      key: "status",
      label: FILTER_OPTIONS.find((option) => option.value === filters.status)?.label || filters.status,
    },
  ].filter(Boolean);

  const actionProps = { statusOf, onAction, busyId, onView: setSelected };

  return (
    <SoftLoadingArea isLoading={loading} message="Loading..." scope="area">
      {!loading && (
        <>
          <ListToolbar
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

          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <SummaryCard label="Needs action" value={needsAction ?? rows.filter((row) => statusOf(row).status === "pending").length} />
            <SummaryCard label="Showing" value={rows.length} />
            <SummaryCard label="Links expire in" value={linkExpiry} text />
          </div>

          <div className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#F1F5F9] px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-[#0F172A]">{heading}</h2>
                <p className="mt-1 text-xs text-[#9CA3AF]">{description}</p>
              </div>
              <ShieldCheck size={18} className="text-[#B91C1C]" />
            </div>

            {error && (
              <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-[#B91C1C]">
                {error}
              </div>
            )}

            <div className="hidden flex-1 overflow-x-auto md:block">
              <table className="w-full min-w-[980px] text-left text-[13px]">
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
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length + 2} className="px-6 py-0 text-center">
                        <EmptyState message={emptyMessage} tall />
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
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
                          <RowActions row={row} {...actionProps} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-[#F3F4F6] md:hidden">
              {rows.length === 0 ? (
                <EmptyState message={emptyMessage} />
              ) : (
                rows.map((row) => (
                  <RowCard key={row.id} row={row} columns={columns} {...actionProps} />
                ))
              )}
            </div>

            <div className="mt-auto">
              <TablePagination currentPage={1} totalPages={1} />
            </div>
          </div>
        </>
      )}

      {selected && (
        <DetailsModal
          row={selected}
          title={detailTitle}
          status={statusOf(selected)}
          details={detailsOf(selected)}
          onClose={() => setSelected(null)}
        />
      )}
    </SoftLoadingArea>
  );
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

function SummaryCard({ label, value, text = false }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">{label}</p>
      <p className={`mt-1 font-bold text-[#0F172A] ${text ? "text-sm" : "text-xl"}`}>{value}</p>
    </div>
  );
}

function EmptyState({ message, tall = false }) {
  return (
    <div className={`flex flex-col items-center justify-center px-4 ${tall ? "min-h-[260px]" : "py-12"}`}>
      <Search size={22} className="mb-2 text-[#CBD5E1]" />
      <p className="text-sm font-semibold text-[#64748B]">{message}</p>
    </div>
  );
}

function RowCard({ row, columns, ...actionProps }) {
  const [account, email, ...rest] = columns;
  return (
    <div className="space-y-3 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[#0F172A]">{account.render(row)}</p>
          <p className="mt-0.5 truncate text-xs text-[#64748B]">{email.render(row)}</p>
        </div>
        <AccessStatusBadge {...actionProps.statusOf(row)} />
      </div>
      <div className="grid gap-2 text-xs text-[#64748B]">
        {rest.map((column) => (
          <span key={column.key} className="truncate">{column.render(row)}</span>
        ))}
      </div>
      <RowActions row={row} {...actionProps} />
    </div>
  );
}

function RowActions({ row, statusOf, onAction, busyId, onView }) {
  const { actions } = statusOf(row);
  const busy = busyId === row.id;

  return (
    <div className="flex items-center justify-end">
      <ActionMenu
        title={accountName(row)}
        subtitle={row.email || row.user?.email}
        actions={[
          { label: "View details", onClick: () => onView(row) },
          ...actions.map((action) => ({
            label: ACTION_LABELS[action],
            onClick: () => {
              if (!busy) onAction(action, row);
            },
          })),
        ]}
      />
    </div>
  );
}

function DetailsModal({ row, title, status, details, onClose }) {
  return (
    <ModalShell
      open
      title={title}
      subtitle={accountName(row)}
      icon={<KeyRound size={14} />}
      size="md"
      onClose={onClose}
      footer={
        <ModalButton variant="primary" onClick={onClose}>
          Close
        </ModalButton>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#F1F5F9] bg-[#FAFBFC] px-3 py-2.5">
        <AccessStatusBadge {...status} />
        <span className="text-sm font-semibold text-[#0F172A]">{status.reason}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {details.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[#F1F5F9] bg-[#FAFBFC] px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">{label}</p>
            <p className="mt-1 break-words text-sm font-semibold text-[#0F172A]">
              {formatDisplayValue(value, "Not recorded")}
            </p>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}
