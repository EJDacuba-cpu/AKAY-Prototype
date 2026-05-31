import {
  useEffect,
  useState,
} from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  ClipboardList,
  FileText,
  HeartPulse,
  ShieldCheck,
  Stethoscope,
  UserCheck,
  Users,
} from "lucide-react";
import { Link } from "react-router";
import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  getDoctorAvailability,
  listenDoctorAvailabilityUpdates,
} from "../../services/doctorAvailability";
import { getAdminAccounts } from "../../services/adminAccountsService";
import { getCurrentUser } from "../../utils/auth";

export default function AdminDashboard() {
  const [now, setNow] = useState(() => new Date());
  const [doctorAvailability, setDoctorAvailability] = useState(() =>
    getDoctorAvailability(),
  );

  useEffect(() => {
    return listenDoctorAvailabilityUpdates(setDoctorAvailability);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);

    return () => window.clearInterval(timer);
  }, []);

  const accounts = getAdminAccounts();
  const activeAccounts = accounts.filter(
    (account) => account.status === "Active",
  ).length;
  const inactiveAccounts = accounts.filter(
    (account) => account.status === "Inactive",
  ).length;
  const bhcUsers = accounts.filter((account) => account.role === "BHC").length;
  const rhuUsers = accounts.filter((account) => account.role === "RHU").length;
  const userName = getDashboardFirstName("MHO");

  const recentActivities = [
    {
      action: "New referral submitted",
      user: "Pitpitan Health Center",
      time: "10 minutes ago",
      type: "Referral",
    },
    {
      action: "RHU feedback submitted",
      user: "RHU Staff",
      time: "25 minutes ago",
      type: "Feedback",
    },
    {
      action: "Medicine availability updated",
      user: "RHU Inventory Staff",
      time: "1 hour ago",
      type: "Inventory",
    },
    {
      action: "New BHC user account added",
      user: "MHO Admin",
      time: "2 hours ago",
      type: "Account",
    },
  ];

  const barangaySummary = [
    { barangay: "Pitpitan", referrals: 12, monitoring: 3, status: "Active" },
    { barangay: "Taliptip", referrals: 9, monitoring: 2, status: "Active" },
    { barangay: "San Jose", referrals: 7, monitoring: 1, status: "Active" },
    { barangay: "Bagumbayan", referrals: 6, monitoring: 2, status: "Active" },
  ];

  return (
    <DashboardLayout role="admin" title="Dashboard">
      <div className="mx-auto w-full max-w-[1500px] space-y-4">
      <section className="anim-fade-up">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#B91C1C]">
              <span>{formatDashboardDate(now)}</span>
              <span className="h-1 w-1 rounded-full bg-[#FCA5A5]" />
              <span>{formatDashboardTime(now)}</span>
            </div>

            <h1 className="text-2xl font-black tracking-tight text-[#0F172A] md:text-3xl">
              {getGreeting(now)}, {userName}
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#64748B]">
              Manage user accounts, role and facility assignments, account
              status, and accountability records for AKAY.
            </p>
          </div>

          <Link
            to="/admin/users/add"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-4 text-xs font-bold text-white shadow-sm transition hover:bg-[#991B1B]"
          >
            <UserCheck size={14} />
            Add User Account
          </Link>
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

      <div className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <QuickCard
          title="Account Directory"
          description="Add and manage MHO, BHC, and RHU staff accounts."
          icon={<UserCheck size={20} />}
          href="/admin/users"
        />

        <QuickCard
          title="Doctor Availability"
          description="View RHU-managed doctor availability records."
          icon={<Stethoscope size={20} />}
          href="/rhu/doctor-schedule"
        />

        <QuickCard
          title="Reports"
          description="Review account, referral, facility, and activity reports."
          icon={<FileText size={20} />}
          href="/admin/reports"
        />

        <QuickCard
          title="Audit Logs"
          description="Track important system actions for accountability."
          icon={<ShieldCheck size={20} />}
          href="/admin/audit-logs"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
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
                  {barangaySummary.map((item) => (
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
              {recentActivities.map((activity) => (
                <div
                  key={`${activity.action}-${activity.time}`}
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
                    {doctor.doctorName || doctor.name}
                  </p>
                  <p className="mt-1 text-xs text-[#6B7280]">
                    {doctor.doctorType || doctor.role}
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
              <InventoryAlert item="Amoxicillin" status="Low Stock" />
              <InventoryAlert item="Tetanus Vaccine" status="Unavailable" />
              <InventoryAlert item="Syringe" status="Low Stock" />
            </div>
          </section>

          <section className="rounded-xl border border-red-100 bg-red-50/70 p-5">
            <p className="text-xs leading-relaxed text-[#4B5563]">
              <span className="font-semibold text-[#0F172A]">Note:</span> The
              MHO/Admin dashboard is for account management and system
              accountability. Medical referral actions remain under BHC and RHU
              personnel.
            </p>
          </section>
        </aside>
      </div>
      </div>
    </DashboardLayout>
  );
}

function QuickCard({ title, description, icon, href }) {
  return (
    <Link
      to={href}
      className="group rounded-xl border border-[#E8ECF0] bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-[#FEF2F2] p-3 text-[#B91C1C] transition-colors group-hover:bg-[#B91C1C] group-hover:text-white">
          {icon}
        </div>

        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[#0F172A]">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">
            {description}
          </p>
        </div>
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

function StatusBadge({ status }) {
  const map = {
    Active: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
    Inactive: "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
  };

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        map[status] || map.Active
      }`}
    >
      {status}
    </span>
  );
}

function DoctorStatusBadge({ status }) {
  const map = {
    Available: "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
    "On Duty": "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]",
    "Fully Booked": "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    "On Leave": "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
  };

  return (
    <span
      className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        map[status] || "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]"
      }`}
    >
      {status}
    </span>
  );
}

function InventoryAlert({ item, status }) {
  const color =
    status === "Unavailable"
      ? "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]"
      : "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]";

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[#F8FAFC] px-3 py-2">
      <p className="min-w-0 truncate text-xs font-semibold text-[#4B5563]">
        {item}
      </p>

      <span
        className={`flex-shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${color}`}
      >
        {status}
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

