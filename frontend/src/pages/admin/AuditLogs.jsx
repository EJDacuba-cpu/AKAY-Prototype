import {
  Activity,
  ClipboardList,
  Filter,
  Search,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";

export default function AuditLogs() {
  const logs = [
    {
      id: "LOG-001",
      action: "User account created",
      module: "User Management",
      performedBy: "Admin MHO",
      role: "Admin",
      details: "Created BHC account for Pitpitan Health Center.",
      dateTime: "May 14, 2026 · 9:20 AM",
      level: "Account",
    },
    {
      id: "LOG-002",
      action: "Referral submitted",
      module: "Referrals",
      performedBy: "Lorna Reyes",
      role: "BHC",
      details: "Submitted referral AKY-2026-002 for Maria Rosa.",
      dateTime: "May 14, 2026 · 10:30 AM",
      level: "Referral",
    },
    {
      id: "LOG-003",
      action: "Patient checked-in",
      module: "Incoming Referrals",
      performedBy: "Joshua Pio",
      role: "RHU",
      details: "Updated referral AKY-2026-002 status to Received.",
      dateTime: "May 14, 2026 · 11:05 AM",
      level: "Status Update",
    },
    {
      id: "LOG-004",
      action: "RHU feedback submitted",
      module: "Feedback / Return Slip",
      performedBy: "RHU Staff",
      role: "RHU",
      details: "Submitted feedback for referral AKY-2026-002.",
      dateTime: "May 14, 2026 · 11:40 AM",
      level: "Feedback",
    },
    {
      id: "LOG-005",
      action: "Medicine availability updated",
      module: "Medicine Management",
      performedBy: "RHU Inventory Staff",
      role: "RHU",
      details: "Updated Amoxicillin status to Low Stock.",
      dateTime: "May 14, 2026 · 1:15 PM",
      level: "Inventory",
    },
    {
      id: "LOG-006",
      action: "Account deactivated",
      module: "User Management",
      performedBy: "Admin MHO",
      role: "Admin",
      details: "Deactivated inactive BHC staff account.",
      dateTime: "May 14, 2026 · 2:00 PM",
      level: "Security",
    },
  ];

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
            <option>User Management</option>
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
              System Activity Logs
            </h2>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Records of significant user and system activities.
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
              {logs.map((log) => (
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

function StatCard({ title, value, icon, color = "navy" }) {
  const map = {
    navy: "border-t-[#B91C1C] text-[#0F172A] bg-red-50/60",
    blue: "border-t-slate-400 text-slate-700 bg-slate-50",
    amber: "border-t-amber-400 text-amber-700 bg-amber-50",
    red: "border-t-red-400 text-red-700 bg-red-50",
  };

  const selected = map[color] || map.navy;
  const parts = selected.split(" ");
  const border = parts[0];
  const iconStyle = parts.slice(1).join(" ");

  return (
    <div
      className={`rounded-xl border border-[#E8ECF0] border-t-2 bg-white p-5 ${border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
          {title}
        </p>

        <div className={`flex-shrink-0 rounded-lg p-2 ${iconStyle}`}>
          {icon}
        </div>
      </div>

      <p className="mt-4 text-2xl font-bold tracking-tight text-[#0F172A]">
        {value}
      </p>
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
