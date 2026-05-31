import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { KeyRound, MoreHorizontal, Plus, UserCheck, UserX } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import ListToolbar from "../../components/common/list/ListToolbar";
import {
  getAdminAccounts,
  updateAdminAccountStatus,
} from "../../services/adminAccountsService";
import { createRoleNotification } from "../../services/notificationService";

const FILTER_OPTIONS = {
  role: ["All Roles", "Admin", "BHC", "RHU"],
  position: [
    "All Positions",
    "Municipal Health Officer",
    "Acting Admin",
    "Barangay Health Worker",
    "Midwife",
    "BHC Staff",
    "RHU Staff",
    "Encoder",
    "Nurse",
    "Receiving Staff",
  ],
  facility: [
    "All Facilities",
    "Municipality of Bulakan",
    "Rural Health Unit Bulakan",
    "Barangay Health Centers",
  ],
  status: ["All Status", "Active", "Inactive"],
};

const ADMIN_ACCOUNTS_STORAGE_KEYS = [
  "akay_admin_accounts",
  "admin_accounts",
  "akay_users",
];

function persistAdminAccounts(accounts) {
  if (typeof window === "undefined") return;

  try {
    const existingKey = ADMIN_ACCOUNTS_STORAGE_KEYS.find((key) =>
      window.localStorage.getItem(key),
    );

    window.localStorage.setItem(
      existingKey || ADMIN_ACCOUNTS_STORAGE_KEYS[0],
      JSON.stringify(accounts),
    );
  } catch (error) {
    console.error("Failed to persist admin account password update:", error);
  }
}

export default function UserManagement() {
  const [users, setUsers] = useState(() => getAdminAccounts());
  const [noticeMessage, setNoticeMessage] = useState("");
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [filters, setFilters] = useState({
    search: "",
    role: "All Roles",
    position: "All Positions",
    facility: "All Facilities",
    status: "All Status",
  });

  function refreshUsers() {
    setUsers(getAdminAccounts());
  }

  function updateStatus(id, newStatus) {
    updateAdminAccountStatus(id, newStatus);
    refreshUsers();
  }

  function handleChangePassword(user, newPassword) {
    const updatedAt = new Date().toISOString();
    const updatedUsers = users.map((account) =>
      account.id === user.id
        ? {
            ...account,
            password: newPassword,
            passwordUpdatedAt: updatedAt,
            passwordManagedBy: "Admin/MHO",
          }
        : account,
    );

    persistAdminAccounts(updatedUsers);
    createRoleNotification("admin", {
      title: "Password updated",
      message: `Password was changed for ${getDisplayName(user)}.`,
      type: "account",
      referenceId: `${user.id}-password-${updatedAt}`,
      link: "/admin/users",
      sender: "Admin/MHO",
    });
    setUsers(updatedUsers);
    setPasswordTarget(null);
    setNoticeMessage(
      `Password updated by Admin/MHO for ${getDisplayName(user)}.`,
    );
  }

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
      const searchText = [
        user.id,
        user.fullName || user.name,
        user.email,
        user.role,
        user.position,
        user.facility,
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
        user.position === filters.position;
      const matchesFacility =
        filters.facility === "All Facilities" ||
        user.facility === filters.facility ||
        (filters.facility === "Barangay Health Centers" && user.role === "BHC");
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
      options: FILTER_OPTIONS.position,
    },
    {
      key: "facility",
      label: "Facility",
      value: filters.facility,
      options: FILTER_OPTIONS.facility,
    },
    {
      key: "status",
      label: "Status",
      value: filters.status,
      options: FILTER_OPTIONS.status,
    },
  ];

  const activeFilters = [
    filters.search && { key: "search", label: `Search: ${filters.search}` },
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

  const countLabel = "Accounts";

  return (
    <DashboardLayout role="admin" title="User & Personnel Management">
      <div className="space-y-6">
        <ListToolbar
          searchValue={filters.search}
          onSearchChange={(value) =>
            setFilters((prev) => ({ ...prev, search: value }))
          }
          searchPlaceholder="Search name, email, role, or facility..."
          chip={`● ${visibleUsers.length.toLocaleString()} ${countLabel}`}
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

        {noticeMessage && (
          <div className="rounded-xl border border-red-100 bg-red-50/70 px-4 py-3 text-xs font-medium leading-relaxed text-[#0F172A]">
            {noticeMessage}
          </div>
        )}

        <AccountsTable
          users={visibleUsers}
          onChangePassword={setPasswordTarget}
          onUpdateStatus={updateStatus}
        />

        {passwordTarget && (
          <ChangePasswordModal
            user={passwordTarget}
            onClose={() => setPasswordTarget(null)}
            onSubmit={(newPassword) =>
              handleChangePassword(passwordTarget, newPassword)
            }
          />
        )}
      </div>
    </DashboardLayout>
  );
}

function AccountsTable({ users, onChangePassword, onUpdateStatus }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
      <TableHeader
        title="User Accounts"
        description="MHO/Admin can update passwords, activate, and deactivate accounts."
        count={users.length}
      />

      <div className="w-full overflow-x-auto">
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
              users.map((user) => (
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
                      {user.facility || "-"}
                    </p>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 align-middle">
                    <StatusBadge status={user.status} />
                  </td>

                  <td className="whitespace-nowrap px-6 py-3.5 text-right align-middle">
                    <AccountActions
                      user={user}
                      onChangePassword={onChangePassword}
                      onUpdateStatus={onUpdateStatus}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
        {count} records
      </div>
    </div>
  );
}

function EmptyRow({ colSpan, message }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-6 py-12 text-center text-sm text-[#9CA3AF]"
      >
        {message}
      </td>
    </tr>
  );
}

// ... Rest of your code (AccountActions, ChangePasswordModal, RoleBadge, StatusBadge, getDisplayName) remains completely untouched
function AccountActions({ user, onChangePassword, onUpdateStatus }) {
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

          <button
            type="button"
            onClick={() => {
              onChangePassword(user);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-[#4B5563] transition-colors hover:bg-[#F9FAFB] hover:text-[#111827]"
          >
            <KeyRound size={14} className="text-[#9CA3AF]" />
            Change Password
          </button>

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

function ChangePasswordModal({ user, onClose, onSubmit }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const fullName = getDisplayName(user);

  function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (newPassword.trim().length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    onSubmit(newPassword);
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="border-b border-[#E5E7EB] px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
            Admin Password Update
          </p>
          <h2 className="mt-1 text-lg font-bold text-[#0F172A]">
            Change Password
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">
            Set a new account password for {fullName}. This action is handled by
            the Admin/MHO.
          </p>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm outline-none transition focus:border-[#B91C1C]/30 focus:bg-white focus:ring-4 focus:ring-[#B91C1C]/[0.08]"
              placeholder="Enter new password"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm outline-none transition focus:border-[#B91C1C]/30 focus:bg-white focus:ring-4 focus:ring-[#B91C1C]/[0.08]"
              placeholder="Re-enter new password"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#E5E7EB] bg-[#F9FAFB] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-xs font-semibold text-[#6B7280] transition hover:bg-[#F9FAFB]"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-[#B91C1C] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#991B1B]"
          >
            Save Password
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function RoleBadge({ role }) {
  const map = {
    Admin: "bg-purple-50 text-purple-700 border-purple-200",
    BHC: "bg-red-50 text-red-700 border-red-200",
    RHU: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        map[role] || "border-slate-200 bg-slate-50 text-slate-600"
      }`}
    >
      {role || "Unassigned"}
    </span>
  );
}

function StatusBadge({ status }) {
  const map = {
    Active: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
    Inactive: "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
        map[status] || "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]"
      }`}
    >
      {status || "Active"}
    </span>
  );
}

function getDisplayName(user) {
  return user?.fullName || user?.name || "User Account";
}
