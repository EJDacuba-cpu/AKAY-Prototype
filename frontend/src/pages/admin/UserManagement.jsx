import { roleLabel } from "../../utils/accountSetup";
import { getStaffRoles } from "../../services/staffRolesService";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, MoreHorizontal, Pencil, Plus, SlidersHorizontal, UserCheck, UserX, X } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import AccountDetailsModal from "../../components/features/accounts/AccountDetailsModal";
import EditAccountModal from "../../components/features/accounts/EditAccountModal";
import AccountStatusBadge from "../../components/features/accounts/AccountStatusBadge";
import {
  ConfirmationModal,
  FixedTable,
  PageStateWrapper,
  SearchField,
  SegmentedFilter,
  TablePagination,
} from "../../components/common";
import useNotification from "../../hooks/useNotification";
import { getCurrentUser } from "../../utils/auth";
import {
  ADMIN_ACCOUNTS_UPDATED_EVENT,
  loadAdminAccounts,
  updateAdminAccountStatus,
} from "../../services/adminAccountsService";
import {
  formatDisplayValue,
  formatFacilityName,
  formatUserName,
} from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";
import usePagedRows from "../../hooks/usePagedRows";

const DEFAULT_FILTERS = {
  search: "",
  role: "All Roles",
  position: "All Positions",
  facility: "All Facilities",
  status: "All Status",
};

const STATUS_SEGMENTS = [
  { value: "All Status", label: "All" },
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
];

const ROLE_SEGMENTS = [
  { value: "All Roles", label: "All" },
  { value: "Admin", label: "Admin" },
  { value: "BHC", label: "BHC" },
  { value: "RHU", label: "RHU" },
];

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50";
const SELECT_CLASS =
  "h-9 min-w-[200px] rounded-md border border-neutral-200 bg-white px-3 text-[13px] text-neutral-900 shadow-xs outline-none transition-colors hover:border-neutral-300 focus:border-ink-400 focus:ring-2 focus:ring-ink-400/30";

export default function UserManagement() {
  const queryClient = useQueryClient();
  const notify = useNotification();
  const [pendingStatus, setPendingStatus] = useState(null); // { user, next } awaiting confirmation
  const [savingStatus, setSavingStatus] = useState(false);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const currentUserId = String(getCurrentUser()?.id ?? "");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const {
    data: users = [],
    isLoading,
    isFetching,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.adminAccounts(),
    queryFn: loadAdminAccounts,
    retry: false,
  });
  // Role labels and defaults; until they load (or if they fail) the badge shows the raw role.
  const { data: rolesData = null } = useQuery({ queryKey: queryKeys.staffRoles(), queryFn: getStaffRoles, retry: false, staleTime: Infinity });

  async function updateStatus(id, newStatus) {
    const updated = await updateAdminAccountStatus(id, newStatus);
    queryClient.setQueryData(queryKeys.adminAccounts(), (current = []) =>
      Array.isArray(current)
        ? current.map((user) => (user.id === String(id) ? updated : user))
        : current,
    );
  }

  // Deactivating cuts off sign-in, so every status change is confirmed first and reports its result.
  async function confirmStatusChange() {
    if (!pendingStatus || savingStatus) return;
    const { user, next } = pendingStatus;
    setSavingStatus(true);
    try {
      await updateStatus(user.id, next);
      notify.success(
        next === "Active"
          ? `${getDisplayName(user)} can sign in again.`
          : `${getDisplayName(user)} was deactivated.`,
      );
      setPendingStatus(null);
    } catch (error) {
      notify.error(error?.message || "The account could not be updated. Try again.");
    } finally {
      setSavingStatus(false);
    }
  }

  const statusConfirm = pendingStatus
    ? statusConfirmCopy(pendingStatus.user, pendingStatus.next, rolesData)
    : null;

  useEffect(() => {
    function refreshUsers() {
      // loadAdminAccounts (this query's own fetch) announces the update too; refetching then would cancel the
      // fetch in flight and start another, forever.
      if (queryClient.isFetching({ queryKey: queryKeys.adminAccounts() })) return;
      refetch();
    }

    window.addEventListener(ADMIN_ACCOUNTS_UPDATED_EVENT, refreshUsers);

    return () =>
      window.removeEventListener(ADMIN_ACCOUNTS_UPDATED_EVENT, refreshUsers);
  }, [queryClient, refetch]);

  function updateFilters(changes) {
    setFilters((prev) => ({ ...prev, ...changes }));
  }

  const visibleUsers = useMemo(() => {
    const query = filters.search.trim().toLowerCase();

    return users.filter((user) => {
      const facilityName = getFacilityName(user);
      const position = formatDisplayValue(user.position, "Unassigned");
      const searchText = [
        user.id,
        getDisplayName(user),
        user.email,
        user.role,
        position,
        facilityName,
        user.accountRoleLabel,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !query || searchText.includes(query);
      const matchesRole =
        filters.role === "All Roles" || user.role === filters.role;
      const matchesPosition =
        filters.position === "All Positions" ||
        position === filters.position;
      const matchesFacility =
        filters.facility === "All Facilities" ||
        facilityName === filters.facility;
      const matchesStatus =
        filters.status === "All Status" || user.status === filters.status;

      return (
        matchesSearch &&
        matchesRole &&
        matchesPosition &&
        matchesFacility &&
        matchesStatus
      );
    });
  }, [filters, users]);

  const positionOptions = useMemo(
    () => [
      "All Positions",
      ...uniqueValues(
        users.map((user) => formatDisplayValue(user.position, "")),
      ),
    ],
    [users],
  );
  const facilityOptions = useMemo(
    () => ["All Facilities", ...uniqueValues(users.map(getFacilityName))],
    [users],
  );

  // Role and status are always on screen as switches; facility and position are the two that live under "More filters".
  const extraFilters = [
    filters.facility !== DEFAULT_FILTERS.facility && {
      key: "facility",
      label: `Facility: ${filters.facility === "-" ? "No facility" : filters.facility}`,
    },
    filters.position !== DEFAULT_FILTERS.position && { key: "position", label: `Position: ${filters.position}` },
  ].filter(Boolean);
  const narrowed =
    Boolean(filters.search.trim()) ||
    filters.role !== DEFAULT_FILTERS.role ||
    filters.status !== DEFAULT_FILTERS.status ||
    extraFilters.length > 0;
  const accountsWord = users.length === 1 ? "account" : "accounts";

  return (
    <DashboardLayout role="admin" title="Account Directory">
      <PageStateWrapper skeleton="table"
        isLoading={isLoading}
        isError={Boolean(loadError)}
        isFetching={isFetching}
        hasData={users.length > 0}
        error={loadError}
        onRetry={() => refetch()}
        loadingMessage="Loading accounts..."
      >
      <div className="mx-auto w-full max-w-[1500px] space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
          <SearchField
            value={filters.search}
            onChange={(value) => updateFilters({ search: value })}
            placeholder="Search name, email, role, or facility"
            label="Search accounts"
            className="sm:max-w-[320px]"
          />
          <SegmentedFilter
            label="Filter by status"
            options={STATUS_SEGMENTS}
            value={filters.status}
            onChange={(value) => updateFilters({ status: value })}
          />
          <SegmentedFilter
            label="Filter by account role"
            options={ROLE_SEGMENTS}
            value={filters.role}
            onChange={(value) => updateFilters({ role: value })}
          />
          <button
            type="button"
            onClick={() => setMoreFiltersOpen((open) => !open)}
            aria-expanded={moreFiltersOpen}
            aria-controls="more-account-filters"
            className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium shadow-xs transition-colors ${FOCUS_RING} ${
              moreFiltersOpen
                ? "border-neutral-300 bg-neutral-50 text-neutral-900"
                : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"
            }`}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            More filters
            {extraFilters.length > 0 && (
              <span className="rounded-full bg-ink-700 px-1.5 text-[11px] font-medium leading-4 text-white tabular-nums">
                {extraFilters.length}
              </span>
            )}
          </button>
          <Link
            to="/admin/users/add"
            className={`ml-auto inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-ink-700 px-4 text-[13px] font-medium text-white shadow-xs transition-colors hover:bg-ink-600 active:bg-ink-800 focus-visible:ring-offset-2 ${FOCUS_RING}`}
          >
            <Plus size={14} strokeWidth={2.25} aria-hidden="true" />
            Add user account
          </Link>
        </div>

        {moreFiltersOpen && (
          <div
            id="more-account-filters"
            className="flex flex-wrap items-end gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-card"
          >
            <label className="flex flex-col gap-1.5 text-[12px] font-medium text-neutral-600">
              Facility
              <select
                value={filters.facility}
                onChange={(event) => updateFilters({ facility: event.target.value })}
                className={SELECT_CLASS}
              >
                {facilityOptions.map((option) => (
                  <option key={option} value={option}>{option === "-" ? "No facility" : option}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[12px] font-medium text-neutral-600">
              Position
              <select
                value={filters.position}
                onChange={(event) => updateFilters({ position: event.target.value })}
                className={SELECT_CLASS}
              >
                {positionOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="flex min-h-6 flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-neutral-600">
          <span aria-live="polite">
            {narrowed
              ? `Showing ${visibleUsers.length} of ${users.length} ${accountsWord}`
              : `${users.length} ${accountsWord}`}
          </span>
          {extraFilters.map((filter) => (
            <span
              key={filter.key}
              className="inline-flex items-center gap-1 rounded-full bg-neutral-100 py-0.5 pl-2.5 pr-1 text-[12px] font-medium text-neutral-700"
            >
              {filter.label}
              <button
                type="button"
                onClick={() => updateFilters({ [filter.key]: DEFAULT_FILTERS[filter.key] })}
                aria-label={`Remove ${filter.label} filter`}
                className={`flex h-5 w-5 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-800 ${FOCUS_RING}`}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ))}
          {narrowed && (
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className={`rounded font-medium text-ink-700 underline-offset-2 hover:underline ${FOCUS_RING}`}
            >
              Clear filters
            </button>
          )}
          {isFetching && users.length > 0 && (
            <span role="status" className="ml-auto inline-flex items-center gap-2 text-[12px] text-neutral-500">
              <span
                aria-hidden="true"
                className="h-3 w-3 animate-spin rounded-full border-2 border-neutral-200 border-t-ink-500 motion-reduce:animate-none"
              />
              Updating accounts
            </span>
          )}
        </div>

        <AccountsTable
          users={visibleUsers}
          resetKey={filters}
          rolesData={rolesData}
          currentUserId={currentUserId}
          narrowed={narrowed}
          onClearFilters={() => setFilters(DEFAULT_FILTERS)}
          onRequestStatus={(user, next) => setPendingStatus({ user, next })}
        />
      </div>
      </PageStateWrapper>

      <ConfirmationModal
        open={Boolean(pendingStatus)}
        title={statusConfirm?.title}
        description={statusConfirm?.description}
        confirmText={statusConfirm?.confirmText}
        cancelText="Cancel"
        loading={savingStatus}
        loadingText="Saving..."
        onCancel={() => !savingStatus && setPendingStatus(null)}
        onConfirm={confirmStatusChange}
      />
    </DashboardLayout>
  );
}

function AccountsTable({ users, resetKey, rolesData, currentUserId, narrowed, onClearFilters, onRequestStatus }) {
  const { page, setPage, totalPages, pageRows } = usePagedRows(users, resetKey);
  const [detailsUser, setDetailsUser] = useState(null);
  const [editUser, setEditUser] = useState(null);

  const actionsFor = (user) => (
    <AccountActions
      user={user}
      currentUserId={currentUserId}
      onRequestStatus={onRequestStatus}
      onViewDetails={setDetailsUser}
      onEdit={setEditUser}
    />
  );

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
      <div className="hidden md:block">
        <FixedTable minWidth="min-w-[900px]">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[12px] font-medium text-neutral-500">
            <tr>
              {["Account", "Role & access", "Home facility", "Status"].map((label) => (
                <th key={label} scope="col" className="px-4">{label}</th>
              ))}
              <th scope="col" className="px-4 text-right"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-0">
                  <EmptyBody className="min-h-[300px]" narrowed={narrowed} onClear={onClearFilters} />
                </td>
              </tr>
            ) : (
              pageRows.map((user) => (
                <tr key={user.id} className="transition-colors hover:bg-neutral-50">
                  <td className="px-4">
                    <AccountCell user={user} />
                  </td>
                  <td className="px-4 text-neutral-700">
                    {formatDisplayValue(roleLabel(user, rolesData), "Unassigned")}
                  </td>
                  <td className="px-4 text-neutral-600">{getFacilityName(user)}</td>
                  <td className="px-4">
                    <AccountStatusBadge status={user.status} />
                  </td>
                  <td className="px-4 text-right">{actionsFor(user)}</td>
                </tr>
              ))
            )}
          </tbody>
        </FixedTable>
      </div>

      <div className="divide-y divide-neutral-100 md:hidden">
        {users.length === 0 ? (
          <EmptyBody className="min-h-[240px] px-6 py-10" narrowed={narrowed} onClear={onClearFilters} />
        ) : (
          pageRows.map((user) => (
            <article key={user.id} className="space-y-3 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <AccountCell user={user} />
                </div>
                {actionsFor(user)}
              </div>
              <AccountStatusBadge status={user.status} />
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
                {[
                  ["Role & access", formatDisplayValue(roleLabel(user, rolesData), "Unassigned")],
                  ["Home facility", getFacilityName(user)],
                  ["Contact", user.contact_number || "Not recorded"],
                ].map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-neutral-500">{label}</dt>
                    <dd className="truncate text-neutral-700">{value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))
        )}
      </div>

      {users.length > 0 && <TablePagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />}
      {detailsUser && <AccountDetailsModal accountId={detailsUser.id} account={detailsUser} rolesData={rolesData} onClose={() => setDetailsUser(null)} />}
      {editUser && <EditAccountModal accountId={editUser.id} account={editUser} onClose={() => setEditUser(null)} />}
    </div>
  );
}

/** Name over email, the same account cell as Password & Invites. */
function AccountCell({ user }) {
  return (
    <div className="min-w-0 leading-tight">
      <p className="truncate text-[13px] font-semibold text-neutral-900">{getDisplayName(user)}</p>
      <p className="mt-0.5 truncate text-[12px] font-normal text-neutral-500">{user.email}</p>
    </div>
  );
}

function EmptyBody({ narrowed, onClear, className = "" }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${className}`}>
      <p className="text-[14px] font-semibold text-neutral-900">
        {narrowed ? "Nothing matches your filters" : "No accounts yet"}
      </p>
      <p className="mt-1 max-w-sm text-[13px] text-neutral-500">
        {narrowed
          ? "Try a different search, or set status and role back to All."
          : "Accounts you add appear here."}
      </p>
      {narrowed && (
        <button
          type="button"
          onClick={onClear}
          className={`mt-4 h-8 rounded-md border border-neutral-200 bg-white px-3 text-[13px] font-medium text-neutral-800 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50 ${FOCUS_RING}`}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

/** Title, description and button for confirming a status change; names the person, their role and facility. */
function statusConfirmCopy(user, next, rolesData) {
  const name = getDisplayName(user);
  const facility = getFacilityName(user);
  const who = `${name} (${roleLabel(user, rolesData)}${facility === "-" ? "" : `, ${facility}`})`;

  if (next === "Active") {
    return {
      title: `Activate ${name}?`,
      description: `${who} will be able to sign in again.`,
      confirmText: "Activate account",
    };
  }
  return {
    title: `Deactivate ${name}?`,
    description: `${who} will be signed out and cannot sign in until you activate the account again. Their records are not deleted.`,
    confirmText: "Deactivate account",
  };
}

const MENU_ITEM =
  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:bg-neutral-100";

function AccountActions({ user, currentUserId, onRequestStatus, onViewDetails, onEdit }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  function updatePosition() {
    if (!btnRef.current) return;

    const rect = btnRef.current.getBoundingClientRect();
    const menuWidth = 224;
    const menuHeight = 152;
    const padding = 12;

    let top = rect.bottom + 8;
    let left = rect.right - menuWidth;

    if (left < padding) left = padding;
    if (left + menuWidth > window.innerWidth - padding) {
      left = window.innerWidth - menuWidth - padding;
    }
    if (top + menuHeight > window.innerHeight - padding) {
      top = rect.top - menuHeight - 8;
    }
    if (top < padding) top = padding;

    setPosition({ top, left });
  }

  // Closes on a click outside, scroll, resize, Escape or Tab, and hands focus back to the trigger for the keys.
  useEffect(() => {
    if (!open) return;

    function handleOutside(event) {
      if (
        btnRef.current?.contains(event.target) ||
        menuRef.current?.contains(event.target)
      ) {
        return;
      }

      setOpen(false);
    }

    function closeMenu() {
      setOpen(false);
    }

    function handleKey(event) {
      if (event.key !== "Escape" && event.key !== "Tab") return;
      setOpen(false);
      btnRef.current?.focus();
    }

    // preventScroll: the menu is fixed, and a scroll event would close it straight away.
    menuRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [open]);

  // Up and Down move between the menu's enabled items.
  function handleMenuKeyDown(event) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...menuRef.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    const at = items.indexOf(document.activeElement);
    const next = event.key === "ArrowDown" ? at + 1 : at - 1;
    items[(next + items.length) % items.length]?.focus({ preventScroll: true });
  }

  const fullName = getDisplayName(user);
  const isActive = user.status === "Active";
  // The backend does not stop an admin deactivating themselves, so the menu does.
  const isSelf = currentUserId !== "" && String(user.id) === currentUserId;
  const blockedSelf = isSelf && isActive;

  const menu =
    open &&
    createPortal(
      <div
        ref={menuRef}
        role="menu"
        aria-label={`Actions for ${fullName}`}
        onKeyDown={handleMenuKeyDown}
        className="fixed z-[9999] w-56 origin-top-right rounded-xl border border-neutral-200 bg-white p-1 shadow-lg"
        style={{
          top: position.top,
          left: position.left,
        }}
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onViewDetails(user);
            setOpen(false);
          }}
          className={`${MENU_ITEM} text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900`}
        >
          <Eye size={14} aria-hidden="true" className="text-neutral-400" />
          View details
        </button>

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onEdit(user);
            setOpen(false);
          }}
          className={`${MENU_ITEM} text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900`}
        >
          <Pencil size={14} aria-hidden="true" className="text-neutral-400" />
          Edit
        </button>

        <div role="separator" className="my-1 border-t border-neutral-100" />

        <button
          type="button"
          role="menuitem"
          disabled={blockedSelf}
          onClick={() => {
            onRequestStatus(user, isActive ? "Inactive" : "Active");
            setOpen(false);
          }}
          className={`${MENU_ITEM} disabled:cursor-not-allowed ${
            blockedSelf
              ? "text-neutral-500"
              : isActive
                ? "text-red-700 hover:bg-red-50"
                : "text-emerald-700 hover:bg-emerald-50"
          }`}
        >
          {isActive ? (
            <UserX size={14} aria-hidden="true" className={blockedSelf ? "text-neutral-400" : "text-red-500"} />
          ) : (
            <UserCheck size={14} aria-hidden="true" className="text-emerald-600" />
          )}
          <span className="min-w-0">
            {isActive ? "Deactivate" : "Activate"}
            {blockedSelf && (
              <span className="mt-0.5 block text-[12px] font-normal">You can't deactivate your own account.</span>
            )}
          </span>
        </button>
      </div>,
      document.body,
    );

  return (
    <div className="relative inline-block text-left">
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          if (!open) updatePosition();
          setOpen((current) => !current);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${FOCUS_RING} ${
          open
            ? "border-neutral-300 bg-neutral-50 text-neutral-800"
            : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-800"
        }`}
        aria-label={`Open actions for ${fullName}`}
      >
        <MoreHorizontal size={15} aria-hidden="true" />
      </button>

      {menu}
    </div>
  );
}

function getDisplayName(user) {
  return formatUserName(user, "User Account");
}

function getFacilityName(user) {
  return formatFacilityName(
    user?.facility ||
      user?.barangayHealthCenter ||
      user?.barangay_health_center ||
      user?.ruralHealthUnit ||
      user?.rural_health_unit,
    "-",
  );
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    String(a).localeCompare(String(b)),
  );
}
