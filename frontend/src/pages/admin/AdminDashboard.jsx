import {
  useEffect,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Boxes,
  ChartNoAxesCombined,
  ClipboardList,
  FileClock,
  HeartPulse,
  Stethoscope,
  UserCheck,
  UserRoundPlus,
  Users,
  UsersRound,
} from "lucide-react";

import { Link } from "react-router";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { PageStateWrapper } from "../../components/common";
import {
  getDoctorAvailability,
  listenDoctorAvailabilityUpdates,
} from "../../services/doctorAvailability";
import {
  loadAdminAccounts,
} from "../../services/adminAccountsService";
import { apiRequest, unwrapList } from "../../services/apiClient";
import { loadMedicineAvailability } from "../../services/medicineService";
import { getCurrentUser } from "../../utils/auth";
import { formatDisplayValue, formatUserName } from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";

export default function AdminDashboard() {
  const [now, setNow] = useState(() => new Date());
  const [doctorAvailability, setDoctorAvailability] = useState(() =>
    getDoctorAvailability(),
  );
  const {
    data: dashboardData = { accounts: [], auditLogs: [], medicineItems: [] },
    isLoading,
    isFetching,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.dashboardSummary("admin"),
    queryFn: async () => {
      const [accounts, logsResponse, medicineItems] = await Promise.all([
        loadAdminAccounts(),
        apiRequest("/audit-logs"),
        loadMedicineAvailability(),
      ]);

      return {
        accounts,
        auditLogs: unwrapList(logsResponse),
        medicineItems,
      };
    },
    retry: false,
  });
  const accounts = dashboardData.accounts;
  const auditLogs = dashboardData.auditLogs;
  const medicineItems = dashboardData.medicineItems;
  const hasDashboardData =
    accounts.length > 0 || auditLogs.length > 0 || medicineItems.length > 0;

  useEffect(() => {
    return listenDoctorAvailabilityUpdates(setDoctorAvailability);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);

    return () => window.clearInterval(timer);
  }, []);

  const activeAccounts = accounts.filter(
    (account) => account.status === "Active",
  ).length;
  const inactiveAccounts = accounts.filter(
    (account) => account.status === "Inactive",
  ).length;
  const bhcUsers = accounts.filter((account) => account.role === "BHC").length;
  const rhuUsers = accounts.filter((account) => account.role === "RHU").length;
  const userName = getDashboardFirstName("MHO");

const recentActivities = auditLogs.slice(0, 4).map((log, index) => ({
  id:
    log.id ??
    log.audit_log_id ??
    log.auditLogId ??
    `${log.created_at || log.createdAt || "activity"}-${index}`,
  action: formatDisplayValue(
    log.description || log.action,
    "System activity",
  ),
  user: formatUserName(
    log.user || log.createdBy || log.created_by || log.user_name,
    "System",
  ),
  time: formatRelativeTime(log.created_at || log.createdAt),
  type: formatDisplayValue(log.module, "Activity"),
}));

  const barangaySummary = [];
  const inventoryAlerts = medicineItems
    .filter((item) =>
      ["Low Stock", "Unavailable", "Expired"].includes(
        item.availabilityStatus || item.status,
      ),
    )
    .slice(0, 3);

  return (
    <DashboardLayout role="admin" title="Dashboard">
      <PageStateWrapper
        isLoading={isLoading}
        isError={Boolean(loadError)}
        isFetching={isFetching}
        hasData={hasDashboardData}
        error={loadError}
        onRetry={() => refetch()}
        loadingMessage="Loading dashboard..."
      >
      <div className="mx-auto w-full max-w-[1500px] space-y-4">
        {isFetching && hasDashboardData && (
          <div className="rounded-lg border border-red-100 bg-red-50/60 px-3 py-2 text-[11px] font-semibold text-[#B91C1C]">
            Refreshing records...
          </div>
        )}
<section className="anim-fade-up  p-5 ">
  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#B91C1C]">
        Admin Dashboard
      </p>

      <h1 className="mt-2 text-2xl font-black tracking-tight text-[#0F172A] md:text-3xl">
        {getGreeting(now)}, {userName}
      </h1>

      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#64748B]">
        Manage user accounts, role and facility assignments, account status,
        and accountability records for AKAY.
      </p>
    </div>

<div className="shrink-0 text-left lg:text-right">
    
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#94A3B8]">
          Today
        </p>

        <p className="mt-1 text-sm font-bold text-[#0F172A]">
          {formatDashboardDate(now)}
        </p>

        <p className="mt-1 text-xs font-semibold text-[#64748B]">
          {formatDashboardTime(now)}
        </p>
    
    </div>
  </div>
</section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard
          title="Total Users"
          value={accounts.length}
          icon={<Users size={17} />}
          color="navy"
        />
        <StatCard
          title="Active Accounts"
          value={activeAccounts}
          icon={<UserCheck size={17} />}
          color="green"
        />
        <StatCard
          title="Inactive Accounts"
          value={inactiveAccounts}
          icon={<AlertTriangle size={17} />}
          color="slate"
        />
        <StatCard
          title="BHC Users"
          value={bhcUsers}
          icon={<HeartPulse size={17} />}
          color="amber"
        />
        <StatCard
          title="RHU Users"
          value={rhuUsers}
          icon={<ClipboardList size={17} />}
          color="blue"
        />
      </div>



      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
            <div className="flex items-center justify-between border-b border-[#E8ECF0] px-6 py-4">
              <div>
                <h2 className="text-sm font-semibold text-[#0F172A]">
                  Barangay Referral Summary
                </h2>
                <p className="mt-1 text-xs text-[#9CA3AF]">
                  Overview of referral and monitoring activity per barangay.
                </p>
              </div>

              <span className="rounded-md bg-[#F3F4F6] px-2 py-1 text-[10px] font-semibold text-[#6B7280]">
                14 barangays
              </span>
            </div>

            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                    <th className="px-6 py-3">Barangay</th>
                    <th className="px-4 py-3">Referrals</th>
                    <th className="px-4 py-3">Monitoring</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Distribution</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#F3F4F6]">
                  {barangaySummary.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-8 text-center text-sm text-[#9CA3AF]"
                      >
                        No barangay referral activity yet.
                      </td>
                    </tr>
                  ) : barangaySummary.map((item) => (
                    <tr key={item.barangay} className="hover:bg-[#F9FAFB]">
                      <td className="px-6 py-3.5 text-sm font-semibold text-[#1A1A1A]">
                        {item.barangay}
                      </td>

                      <td className="px-4 py-3.5 text-sm text-[#6B7280]">
                        {item.referrals}
                      </td>

                      <td className="px-4 py-3.5 text-sm text-[#6B7280]">
                        {item.monitoring}
                      </td>

                      <td className="px-4 py-3.5">
                        <StatusBadge status={item.status} />
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-[#E8ECF0]">
                          <div
                            className="h-full rounded-full bg-[#B91C1C]"
                            style={{ width: `${item.referrals * 7}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
            <div className="flex items-center justify-between border-b border-[#E8ECF0] px-6 py-4">
              <div>
                <h2 className="text-sm font-semibold text-[#0F172A]">
                  Recent Account Activity
                </h2>
                <p className="mt-1 text-xs text-[#9CA3AF]">
                  Latest account and referral actions for MHO review.
                </p>
              </div>

              <Link
                to="/admin/audit-logs"
                className="text-xs font-semibold text-[#B91C1C] hover:text-[#7F1D1D] hover:underline"
              >
                View Audit Logs
              </Link>
            </div>

            <div className="divide-y divide-[#F3F4F6]">
       {recentActivities.length === 0 ? (
  <div className="px-6 py-8 text-center text-sm text-[#9CA3AF]">
    No audit activity yet.
  </div>
) : recentActivities.map((activity, index) => (
  <div
    key={activity.id ?? `${activity.action}-${activity.time}-${index}`}
    className="flex items-start gap-4 px-6 py-4 hover:bg-[#F9FAFB]"
  >
                  <div className="mt-0.5 rounded-lg bg-[#FEF2F2] p-2 text-[#B91C1C]">
                    <Activity size={15} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#1A1A1A]">
                      {activity.action}
                    </p>
                    <p className="mt-1 text-xs text-[#6B7280]">
                      {activity.user}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                      {activity.type}
                    </span>
                    <p className="mt-1 text-[10px] text-[#9CA3AF]">
                      {activity.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
  <div className="mb-5">
    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#B91C1C]">
      Quick Actions
    </p>
  </div>

  <div className="space-y-3">
    <QuickAction
      title="Add User Account"
      description="Register BHC or RHU staff access."
      icon={<UserRoundPlus size={17} />}
      href="/admin/users/add"
    />

    <QuickAction
      title="Account Directory"
      description="Update roles, facilities, and status."
      icon={<UsersRound size={17} />}
      href="/admin/users"
    />

    <QuickAction
      title="Reports"
      description="Open referral and account summaries."
      icon={<ChartNoAxesCombined size={17} />}
      href="/admin/reports"
    />

    <QuickAction
      title="Audit Logs"
      description="Review recorded system activity."
      icon={<FileClock size={17} />}
      href="/admin/audit-logs"
    />
  </div>
</section>

          <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-[#FEF2F2] p-3 text-[#B91C1C]">
                <Stethoscope size={20} />
              </div>

              <div>
                <h2 className="text-sm font-semibold text-[#0F172A]">
                  Doctor Availability
                </h2>
                <p className="text-xs text-[#9CA3AF]">
                  Current RHU doctor status.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {doctorAvailability.doctors.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#E8ECF0] bg-[#F8FAFC] p-4 text-xs text-[#9CA3AF]">
                  No doctor records encoded yet.
                </div>
              ) : doctorAvailability.doctors.map((doctor) => (
                <div
                  key={doctor.doctorId || doctor.id}
                  className="rounded-lg border border-[#E8ECF0] bg-[#F8FAFC] p-4"
                >
                  <p className="text-sm font-semibold text-[#0F172A]">
                    {formatUserName(
                      doctor.doctorName || doctor.name || doctor,
                      "Doctor",
                    )}
                  </p>
                  <p className="mt-1 text-xs text-[#6B7280]">
                    {formatDisplayValue(doctor.doctorType || doctor.role, "RHU Doctor")}
                  </p>
                  <div className="mt-3">
                    <DoctorStatusBadge
                      status={doctor.availabilityStatus || doctor.status}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-amber-50 p-3 text-amber-700">
                <Boxes size={20} />
              </div>

              <div>
                <h2 className="text-sm font-semibold text-[#0F172A]">
                  Inventory Alerts
                </h2>
                <p className="text-xs text-[#9CA3AF]">
                  Medicine and resource warnings.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {inventoryAlerts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#E8ECF0] bg-[#F8FAFC] p-4 text-xs text-[#9CA3AF]">
                  No inventory alerts yet.
                </div>
              ) : inventoryAlerts.map((item) => (
                <InventoryAlert
                  key={item.id || item.name}
                  item={item.name}
                  status={item.availabilityStatus || item.status}
                />
              ))}
            </div>
          </section>

 
        </aside>
      </div>
      </div>
      </PageStateWrapper>
    </DashboardLayout>
  );
}

function QuickAction({ title, description, icon, href }) {
  return (
    <Link
      to={href}
      className="group flex items-start gap-3 rounded-xl border border-[#E8ECF0] bg-[#F8FAFC] p-3 transition-all hover:border-[#FCA5A5] hover:bg-white hover:shadow-sm"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FEF2F2] text-[#B91C1C] transition-colors group-hover:bg-[#B91C1C] group-hover:text-white">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-[#0F172A]">
          {title}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-[#64748B]">
          {description}
        </p>
      </div>
    </Link>
  );
}

function StatCard({ title, value, icon, color = "navy" }) {
  const map = {
    navy: "border-t-[#B91C1C] text-[#0F172A] bg-red-50/60",
    blue: "border-t-slate-400 text-slate-700 bg-slate-50",
    slate: "border-t-slate-300 text-slate-700 bg-slate-50",
    amber: "border-t-amber-400 text-amber-700 bg-amber-50",
    green: "border-t-emerald-400 text-emerald-700 bg-emerald-50",
    red: "border-t-red-400 text-red-700 bg-red-50",
  };

  const selected = map[color] || map.navy;
  const parts = selected.split(" ");
  const border = parts[0];
  const iconStyle = parts.slice(1).join(" ");

  return (
    <div
      className={`rounded-xl border border-[#E8ECF0] border-t-2 bg-white p-5 shadow-sm transition-transform duration-200 ease-out hover:scale-[1.02] hover:shadow-md ${border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
          {title}
        </p>

        <div className={`shrink-0 rounded-lg p-2 ${iconStyle}`}>
          {icon}
        </div>
      </div>

      <p className="mt-4 text-2xl font-bold tracking-tight text-[#0F172A]">
        {value}
      </p>
    </div>
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
      className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        map[displayStatus] || map.Active
      }`}
    >
      {displayStatus}
    </span>
  );
}

function DoctorStatusBadge({ status }) {
  const displayStatus = formatDisplayValue(status, "Not Available");
  const map = {
    Available: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
    "On Duty": "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
    "Fully Booked": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    "On Leave": "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
  };

  return (
    <span
      className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        map[displayStatus] || "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]"
      }`}
    >
      {displayStatus}
    </span>
  );
}

function InventoryAlert({ item, status }) {
  const displayItem = formatDisplayValue(item, "Medicine item");
  const displayStatus = formatDisplayValue(status, "Low Stock");
  const color =
    displayStatus === "Unavailable"
      ? "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]"
      : "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]";

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[#F8FAFC] px-3 py-2">
      <p className="min-w-0 truncate text-xs font-semibold text-[#4B5563]">
        {displayItem}
      </p>

      <span
        className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${color}`}
      >
        {displayStatus}
      </span>
    </div>
  );
}

function getDashboardFirstName(fallback) {
  const user = getCurrentUser();
  const name =
    user?.fullName ||
    user?.full_name ||
    user?.name ||
    user?.displayName ||
    user?.profile?.name;

  return String(name || fallback)
    .trim()
    .split(/\s+/)[0];
}

function getGreeting(date) {
  const hour = date.getHours();

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatRelativeTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Recently";

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60_000));

  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatDashboardDate(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDashboardTime(date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

