import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, MoreHorizontal, Plus, UserCheck, UserX } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  ListToolbar,
  PageStateWrapper,
  TablePagination,
} from "../../components/common";
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

const FILTER_OPTIONS = {
  role: ["All Roles", "Admin", "BHC", "RHU"],
  status: ["All Status", "Active", "Inactive"],
};

export default function UserManagement() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    search: "",
    role: "All Roles",
    position: "All Positions",
    facility: "All Facilities",
    status: "All Status",
  });
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

  async function updateStatus(id, newStatus) {
    const updated = await updateAdminAccountStatus(id, newStatus);
    queryClient.setQueryData(queryKeys.adminAccounts(), (current = []) =>
      Array.isArray(current)
        ? current.map((user) => (user.id === String(id) ? updated : user))
        : current,
    );
  }

  useEffect(() => {
    function refreshUsers() {
      refetch();
    }

    window.addEventListener(ADMIN_ACCOUNTS_UPDATED_EVENT, refreshUsers);

    return () =>
      window.removeEventListener(ADMIN_ACCOUNTS_UPDATED_EVENT, refreshUsers);
  }, [refetch]);

  function removeFilter(key) {
    const defaults = {
      search: "",
      role: "All Roles",
      position: "All Positions",
      facility: "All Facilities",
      status: "All Status",
    };

    setFilters((prev) => ({ ...prev, [key]: defaults[key] }));
  }

  function clearAllFilters() {
    setFilters({
      search: "",
      role: "All Roles",
      position: "All Positions",
      facility: "All Facilities",
      status: "All Status",
    });
  }

  function applyToolbarFilters(nextFilters) {
    setFilters((prev) => ({
      ...prev,
      role: nextFilters.role,
      position: nextFilters.position,
      facility: nextFilters.facility,
      status: nextFilters.status,
    }));
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

  const toolbarFilters = [
    {
      key: "role",
      label: "Role",
      value: filters.role,
      options: FILTER_OPTIONS.role,
    },
    {
      key: "position",
      label: "Position",
      value: filters.position,
      options: positionOptions,
    },
    {
      key: "facility",
      label: "Facility",
      value: filters.facility,
      options: facilityOptions,
    },
    {
      key: "status",
      label: "Status",
      value: filters.status,
      options: FILTER_OPTIONS.status,
    },
  ];

  const activeFilters = [
    filters.role !== "All Roles" && { key: "role", label: filters.role },
    filters.position !== "All Positions" && {
      key: "position",
      label: filters.position,
    },
    filters.facility !== "All Facilities" && {
      key: "facility",
      label: filters.facility,
    },
    filters.status !== "All Status" && {
      key: "status",
      label: filters.status,
    },
  ].filter(Boolean);

  const activeFilterCount = activeFilters.filter(
    (filter) => filter.key !== "search",
  ).length;

  return (
    <DashboardLayout role="admin" title="Account Directory">
      <PageStateWrapper
        isLoading={isLoading}
        isError={Boolean(loadError)}
        isFetching={isFetching}
        hasData={users.length > 0}
        error={loadError}
        onRetry={() => refetch()}
        loadingMessage="Loading accounts..."
      >
      <div className="space-y-6">
        {isFetching && users.length > 0 && (
          <div className="rounded-lg border border-red-100 bg-red-50/60 px-3 py-2 text-[11px] font-semibold text-[#B91C1C]">
            Refreshing records...
          </div>
        )}
        <ListToolbar
          searchValue={filters.search}
          onSearchChange={(value) =>
            setFilters((prev) => ({ ...prev, search: value }))
          }
          searchPlaceholder="Search name, email, role, or facility..."
          filters={toolbarFilters}
          activeFilterCount={activeFilterCount}
          activeFilters={activeFilters}
          onApplyFilters={applyToolbarFilters}
          onClearFilters={clearAllFilters}
          onRemoveFilter={removeFilter}
          actions={
            <Link
              to="/admin/users/add"
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-4 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#991B1B]"
            >
              <Plus size={14} strokeWidth={2.5} />
              Add User Account
            </Link>
          }
        />

        <AccountsTable
          users={visibleUsers}
          onUpdateStatus={updateStatus}
        />
      </div>
      </PageStateWrapper>
    </DashboardLayout>
  );
}

function AccountsTable({ users, onUpdateStatus }) {
  return (
    <div className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
      <TableHeader
        title="Account Directory"
        description="MHO/Admin can manage account status and review role and facility assignments."
        count={users.length}
      />

      <div className="w-full flex-1 overflow-x-auto">
        <table className="w-full min-w-[980px] text-left">
          <thead>
            <tr className="bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              <th className="w-[120px] px-6 py-3">User ID</th>
              <th className="w-[260px] px-4 py-3">Account</th>
              <th className="w-[140px] px-4 py-3">Role</th>
              <th className="px-4 py-3">Facility</th>
              <th className="w-[120px] px-4 py-3">Status</th>
              <th className="w-[90px] px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#F3F4F6]">
            {users.length === 0 ? (
              <EmptyRow
                colSpan={6}
                message="No user accounts match the current filters."
              />
            ) : (
              users.map((user) => {
                const facilityName = getFacilityName(user);

                return (
                <tr
                  key={user.id}
                  className="transition-colors hover:bg-[#F9FAFB]"
                >
                  <td className="whitespace-nowrap px-6 py-3.5 align-middle">
                    <span className="rounded-md bg-[#F3F4F6] px-2 py-1 font-mono text-xs font-medium text-[#0F172A]">
                      {user.id}
                    </span>
                  </td>

                  <td className="px-4 py-3.5 align-middle">
                    <p className="truncate text-sm font-semibold text-[#111827]">
                      {getDisplayName(user)}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[#9CA3AF]">
                      {user.email || "No email recorded"}
                    </p>
                  </td>

                  <td className="px-4 py-3.5 align-middle">
                    <RoleBadge role={user.role} />
                  </td>

                  <td className="px-4 py-3.5 align-middle">
                    <p className="truncate text-sm text-[#6B7280]">
                      {facilityName}
                    </p>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 align-middle">
                    <StatusBadge status={user.status} />
                  </td>

                  <td className="whitespace-nowrap px-6 py-3.5 text-right align-middle">
                    <AccountActions
                      user={user}
                      onUpdateStatus={onUpdateStatus}
                    />
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-auto">
        <TablePagination currentPage={1} totalPages={1} />
      </div>
    </div>
  );
}

function TableHeader({ title, description, count }) {
  return (
    <div className="flex flex-col gap-2 border-b border-[#E8ECF0] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-[#0F172A]">{title}</h2>
        <p className="mt-1 text-xs text-[#9CA3AF]">{description}</p>
      </div>

      <div className="flex w-fit items-center gap-2 rounded-md bg-[#F3F4F6] px-2 py-1 text-[10px] font-semibold text-[#6B7280]">
        {count} account{count === 1 ? "" : "s"}
      </div>
    </div>
  );
}

function EmptyRow({ colSpan, message }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-6 py-0 text-center text-sm text-[#9CA3AF]"
      >
        <div className="flex min-h-[260px] items-center justify-center">
          {message}
        </div>
      </td>
    </tr>
  );
}

function AccountActions({ user, onUpdateStatus }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  function updatePosition() {
    if (!btnRef.current) return;

    const rect = btnRef.current.getBoundingClientRect();
    const menuWidth = 220;
    const menuHeight = 130;
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

    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [open]);

  const fullName = getDisplayName(user);
  const isActive = user.status === "Active";

  const menu =
    open &&
    createPortal(
      <div
        ref={menuRef}
        className="fixed z-[9999] w-56 origin-top-right overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-lg ring-1 ring-black/5 focus:outline-none"
        style={{
          top: position.top,
          left: position.left,
          minWidth: "210px",
        }}
      >
        <div className="py-1">
          <div className="border-b border-[#F3F4F6] px-4 py-2">
            <p className="truncate text-xs font-semibold text-[#111827]">
              {fullName}
            </p>
            <p className="font-mono text-[10px] text-[#9CA3AF]">{user.id}</p>
          </div>

          <Link
            to="/admin/password-reset-requests"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-[#4B5563] transition-colors hover:bg-[#F9FAFB] hover:text-[#111827]"
          >
            <KeyRound size={14} className="text-[#9CA3AF]" />
            Password Reset Requests
          </Link>

          <button
            type="button"
            onClick={() => {
              onUpdateStatus(user.id, isActive ? "Inactive" : "Active");
              setOpen(false);
            }}
            className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium transition-colors ${
              isActive
                ? "text-red-700 hover:bg-red-50"
                : "text-emerald-700 hover:bg-emerald-50"
            }`}
          >
            {isActive ? (
              <UserX size={14} className="text-red-400" />
            ) : (
              <UserCheck size={14} className="text-emerald-500" />
            )}
            {isActive ? "Deactivate" : "Activate"}
          </button>
        </div>
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
        className="flex h-8 w-8 items-center justify-center rounded-full text-[#9CA3AF] transition hover:bg-[#F3F4F6] hover:text-[#4B5563]"
        aria-label={`Open actions for ${fullName}`}
      >
        <MoreHorizontal size={16} />
      </button>

      {menu}
    </div>
  );
}

function RoleBadge({ role }) {
  const displayRole = formatDisplayValue(role, "Unassigned");
  const map = {
    Admin: "bg-purple-50 text-purple-700 border-purple-200",
    BHC: "bg-red-50 text-red-700 border-red-200",
    RHU: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        map[displayRole] || "border-slate-200 bg-slate-50 text-slate-600"
      }`}
    >
      {displayRole}
    </span>
  );
}

function StatusBadge({ status }) {
  const displayStatus = formatDisplayValue(status, "Active");
  const map = {
    Active: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
    Inactive: "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
        map[displayStatus] || "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]"
      }`}
    >
      {displayStatus}
    </span>
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
