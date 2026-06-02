import {
  Filter,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { apiRequest, unwrapList } from "../../services/apiClient";

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    apiRequest("/audit-logs")
      .then((response) =>
        setLogs(
          unwrapList(response).map((log) => ({
            id: `LOG-${String(log.id).padStart(3, "0")}`,
            action: log.action,
            module: log.module,
            performedBy: log.user?.name || "System",
            role: log.user?.role === "bhw" ? "BHC" : log.user?.role === "rhu_staff" ? "RHU" : "Admin",
            details: log.description || "",
            dateTime: log.created_at || "",
            level: log.module,
          })),
        ),
      )
      .catch(() => setLogs([]));
  }, []);

  return (
    <DashboardLayout role="admin" title="Audit Logs">
      <div className="mb-6 rounded-xl border border-[#E8ECF0] bg-white p-5">
        <div className="grid gap-4 xl:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Search Logs
            </label>
            <div className="flex items-center rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3">
              <Search size={14} className="text-[#BCC3CD]" />
              <input
                className="h-9 flex-1 border-0 bg-transparent px-2 text-sm outline-none"
                placeholder="Search action, user, or module..."
              />
            </div>
          </div>

          <FilterSelect label="Module">
            <option>All Modules</option>
            <option>Account Directory</option>
            <option>Referrals</option>
            <option>Incoming Referrals</option>
            <option>Feedback / Return Slip</option>
            <option>Medicine Management</option>
          </FilterSelect>

          <FilterSelect label="Role">
            <option>All Roles</option>
            <option>Admin</option>
            <option>BHC</option>
            <option>RHU</option>
          </FilterSelect>

          <FilterSelect label="Log Type">
            <option>All Types</option>
            <option>Account</option>
            <option>Referral</option>
            <option>Status Update</option>
            <option>Feedback</option>
            <option>Inventory</option>
            <option>Security</option>
          </FilterSelect>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
        <div className="flex items-center justify-between border-b border-[#E8ECF0] px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[#0F172A]">
              Activity Logs
            </h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Records of significant account, referral, and RHU feedback actions.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-md bg-[#F3F4F6] px-2 py-1 text-[10px] font-semibold text-[#6B7280]">
            <Filter size={12} />
            {logs.length} logs
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left">
            <thead>
              <tr className="bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                <th className="px-6 py-3">Log ID</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">Performed By</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3">Date / Time</th>
                <th className="px-4 py-3">Type</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F3F4F6]">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-sm text-[#9CA3AF]">
                    No audit logs found.
                  </td>
                </tr>
              ) : logs.map((log) => (
                <tr
                  key={log.id}
                  className="transition-colors hover:bg-[#F9FAFB]"
                >
                  <td className="whitespace-nowrap px-6 py-3.5">
                    <span className="rounded-md bg-[#F3F4F6] px-2 py-1 font-mono text-xs font-medium text-[#0F172A]">
                      {log.id}
                    </span>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-sm font-semibold text-[#1A1A1A]">
                    {log.action}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#6B7280]">
                    {log.module}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#6B7280]">
                    {log.performedBy}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5">
                    <RoleBadge role={log.role} />
                  </td>

                  <td className="px-4 py-3.5 text-sm text-[#6B7280]">
                    {log.details}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5 text-sm text-[#9CA3AF]">
                    {log.dateTime}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3.5">
                    <TypeBadge type={log.level} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}

function FilterSelect({ label, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </label>
      <select className="h-9 w-full rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 text-sm outline-none">
        {children}
      </select>
    </div>
  );
}

function RoleBadge({ role }) {
  const map = {
    Admin: "bg-purple-50 text-purple-700",
    BHC: "bg-red-50 text-red-700",
    RHU: "bg-emerald-50 text-emerald-700",
  };

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold ${
        map[role] || "bg-slate-100 text-slate-600"
      }`}
    >
      {role}
    </span>
  );
}

function TypeBadge({ type }) {
  const map = {
    Account: "bg-purple-50 text-purple-700",
    Referral: "bg-red-50 text-red-700",
    "Status Update": "bg-amber-50 text-amber-700",
    Feedback: "bg-emerald-50 text-emerald-700",
    Inventory: "bg-orange-50 text-orange-700",
    Security: "bg-red-50 text-red-700",
  };

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-semibold ${
        map[type] || "bg-slate-100 text-slate-600"
      }`}
    >
      {type}
    </span>
  );
}
