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

export default function AdminDashboard() {
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
      action: "New BHC user account created",
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

  const doctorAvailability = [
    {
      doctor: "Dr. Maria Santos",
      specialization: "Maternal Care",
      status: "Available",
    },
    {
      doctor: "Dr. Jose Cruz",
      specialization: "Pediatrics",
      status: "On Duty",
    },
    {
      doctor: "Dr. Ana Reyes",
      specialization: "General Consultation",
      status: "Fully Booked",
    },
  ];

  return (
    <DashboardLayout role="admin" title="Admin Dashboard">
      <div className="mb-8">
        <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
          MHO / Admin Dashboard
        </h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Monitor users, referrals, RHU activity, doctor availability, medicine
          alerts, and system activity.
        </p>
      </div>

      <div className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total System Users"
          value="38"
          icon={<Users size={17} />}
          color="navy"
        />
        <StatCard
          title="Total Referrals"
          value="124"
          icon={<ClipboardList size={17} />}
          color="blue"
        />
        <StatCard
          title="Patients Monitoring"
          value="18"
          icon={<HeartPulse size={17} />}
          color="amber"
        />
        <StatCard
          title="Medicine Alerts"
          value="3"
          icon={<AlertTriangle size={17} />}
          color="red"
        />
      </div>

      <div className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <QuickCard
          title="User Management"
          description="Create and manage BHC, RHU, and admin accounts."
          icon={<UserCheck size={20} />}
          href="/admin/users"
        />

        <QuickCard
          title="Doctor Management"
          description="Manage doctor profiles, specialization, and expertise."
          icon={<Stethoscope size={20} />}
          href="/admin/doctors"
        />

        <QuickCard
          title="Reports"
          description="View referral, barangay, RHU, and monitoring reports."
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
                <h2 className="text-sm font-semibold text-[#0B2E59]">
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
                            className="h-full rounded-full bg-[#0B2E59]"
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
                <h2 className="text-sm font-semibold text-[#0B2E59]">
                  Recent System Activities
                </h2>
                <p className="mt-1 text-xs text-[#9CA3AF]">
                  Latest system events for monitoring and accountability.
                </p>
              </div>

              <Link
                to="/admin/audit-logs"
                className="text-xs font-semibold text-[#0B2E59] hover:underline"
              >
                View Logs
              </Link>
            </div>

            <div className="divide-y divide-[#F3F4F6]">
              {recentActivities.map((activity) => (
                <div
                  key={`${activity.action}-${activity.time}`}
                  className="flex items-start gap-4 px-6 py-4 hover:bg-[#F9FAFB]"
                >
                  <div className="mt-0.5 rounded-lg bg-[#0B2E59]/[0.06] p-2 text-[#0B2E59]">
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
                    <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
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
              <div className="rounded-xl bg-[#0B2E59]/[0.06] p-3 text-[#0B2E59]">
                <Stethoscope size={20} />
              </div>

              <div>
                <h2 className="text-sm font-semibold text-[#0B2E59]">
                  Doctor Availability
                </h2>
                <p className="text-xs text-[#9CA3AF]">
                  Current RHU doctor status.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {doctorAvailability.map((doctor) => (
                <div
                  key={doctor.doctor}
                  className="rounded-lg border border-[#E8ECF0] bg-[#F8FAFC] p-4"
                >
                  <p className="text-sm font-semibold text-[#0B2E59]">
                    {doctor.doctor}
                  </p>
                  <p className="mt-1 text-xs text-[#6B7280]">
                    {doctor.specialization}
                  </p>
                  <div className="mt-3">
                    <DoctorStatusBadge status={doctor.status} />
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
                <h2 className="text-sm font-semibold text-[#0B2E59]">
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

          <section className="rounded-xl border border-blue-100 bg-blue-50 p-5">
            <p className="text-xs leading-relaxed text-[#4B5563]">
              <span className="font-semibold text-[#0B2E59]">Note:</span> The
              MHO/Admin dashboard is for system oversight. Admin can monitor
              activities and manage accounts, but medical actions remain under
              RHU personnel.
            </p>
          </section>
        </aside>
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
        <div className="rounded-xl bg-[#0B2E59]/[0.06] p-3 text-[#0B2E59] transition-colors group-hover:bg-[#0B2E59] group-hover:text-white">
          {icon}
        </div>

        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[#0B2E59]">{title}</h2>
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
    navy: "border-t-[#0B2E59] text-[#0B2E59] bg-blue-50",
    blue: "border-t-blue-500 text-blue-700 bg-blue-50",
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

      <p className="mt-4 text-2xl font-bold tracking-tight text-[#0B2E59]">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span className="inline-block whitespace-nowrap rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
      {status}
    </span>
  );
}

function DoctorStatusBadge({ status }) {
  const map = {
    Available: "bg-emerald-50 text-emerald-700",
    "On Duty": "bg-blue-50 text-blue-700",
    "Fully Booked": "bg-amber-50 text-amber-700",
    "On Leave": "bg-red-50 text-red-700",
  };

  return (
    <span
      className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold ${
        map[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

function InventoryAlert({ item, status }) {
  const color =
    status === "Unavailable"
      ? "bg-red-50 text-red-700"
      : "bg-amber-50 text-amber-700";

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[#F8FAFC] px-3 py-2">
      <p className="min-w-0 truncate text-xs font-semibold text-[#4B5563]">
        {item}
      </p>

      <span
        className={`flex-shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold ${color}`}
      >
        {status}
      </span>
    </div>
  );
}

