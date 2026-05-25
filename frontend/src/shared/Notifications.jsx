import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ClipboardList,
  FileText,
  ShieldCheck,
} from "lucide-react";
import DashboardLayout from "../components/layout/DashboardLayout";

const notificationsByRole = {
  bhc: [
    {
      id: "NOTIF-001",
      title: "Referral received by RHU",
      message: "Referral AKY-2026-002 for Maria Rosa was marked as Received.",
      type: "Referral Update",
      time: "10 minutes ago",
      status: "Unread",
      icon: ClipboardList,
    },
    {
      id: "NOTIF-002",
      title: "RHU feedback submitted",
      message: "Return slip feedback has been submitted for AKY-2026-001.",
      type: "Feedback",
      time: "30 minutes ago",
      status: "Unread",
      icon: FileText,
    },
    {
      id: "NOTIF-003",
      title: "Medicine availability updated",
      message: "Amoxicillin is now marked as Low Stock by RHU.",
      type: "Medicine",
      time: "1 hour ago",
      status: "Read",
      icon: AlertTriangle,
    },
  ],

  rhu: [
    {
      id: "NOTIF-001",
      title: "New incoming referral",
      message: "Pitpitan Health Center submitted referral AKY-2026-006.",
      type: "New Referral",
      time: "5 minutes ago",
      status: "Unread",
      icon: ClipboardList,
    },
    {
      id: "NOTIF-002",
      title: "Patient for monitoring",
      message: "Maria Rosa was marked as For Monitoring.",
      type: "Monitoring",
      time: "25 minutes ago",
      status: "Unread",
      icon: Activity,
    },
    {
      id: "NOTIF-003",
      title: "Medicine low stock",
      message: "Syringe inventory is currently Low Stock.",
      type: "Inventory",
      time: "1 hour ago",
      status: "Read",
      icon: AlertTriangle,
    },
  ],

  admin: [
    {
      id: "NOTIF-001",
      title: "User account created",
      message: "A new BHC user account was created by Admin MHO.",
      type: "Account",
      time: "15 minutes ago",
      status: "Unread",
      icon: ShieldCheck,
    },
    {
      id: "NOTIF-002",
      title: "RHU feedback submitted",
      message: "RHU submitted a feedback / return slip for AKY-2026-002.",
      type: "Feedback",
      time: "35 minutes ago",
      status: "Unread",
      icon: FileText,
    },
    {
      id: "NOTIF-003",
      title: "Medicine alert",
      message: "Tetanus Vaccine is currently marked as Unavailable.",
      type: "Inventory",
      time: "1 hour ago",
      status: "Read",
      icon: AlertTriangle,
    },
  ],
};

export default function Notifications({ role }) {
  const notifications = notificationsByRole[role] || [];

  const unreadCount = notifications.filter(
    (notification) => notification.status === "Unread",
  ).length;

  return (
    <DashboardLayout role={role} title="Notifications">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            View important updates, alerts, and system activities.
          </p>
        </div>

        <div className="rounded-lg border border-[#E8ECF0] bg-white px-4 py-2 text-xs font-semibold text-[#6B7280]">
          {unreadCount} unread
        </div>
      </div>

      <div className="mb-6 grid gap-5 md:grid-cols-3">
        <StatCard
          title="Total Notifications"
          value={notifications.length}
          icon={<Bell size={17} />}
          color="navy"
        />
        <StatCard
          title="Unread"
          value={unreadCount}
          icon={<Activity size={17} />}
          color="amber"
        />
        <StatCard
          title="Read"
          value={notifications.length - unreadCount}
          icon={<CheckCircle2 size={17} />}
          color="green"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E8ECF0] bg-white">
        <div className="border-b border-[#E8ECF0] px-6 py-4">
          <h2 className="text-sm font-semibold text-[#0B2E59]">
            Recent Notifications
          </h2>
          <p className="mt-1 text-xs text-[#9CA3AF]">
            Updates are based on your current role and system access.
          </p>
        </div>

        <div className="divide-y divide-[#F3F4F6]">
          {notifications.map((notification) => {
            const Icon = notification.icon;

            return (
              <div
                key={notification.id}
                className={`flex items-start gap-4 px-6 py-5 transition-colors hover:bg-[#F9FAFB] ${
                  notification.status === "Unread"
                    ? "bg-blue-50/30"
                    : "bg-white"
                }`}
              >
                <div className="mt-0.5 rounded-xl bg-[#0B2E59]/[0.06] p-3 text-[#0B2E59]">
                  <Icon size={18} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-[#0B2E59]">
                      {notification.title}
                    </h3>

                    <TypeBadge type={notification.type} />

                    {notification.status === "Unread" && (
                      <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
                        New
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-sm leading-relaxed text-[#6B7280]">
                    {notification.message}
                  </p>

                  <p className="mt-2 text-[10px] font-medium text-[#9CA3AF]">
                    {notification.time}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 px-5 py-4">
        <p className="text-xs leading-relaxed text-[#4B5563]">
          <span className="font-semibold text-[#0B2E59]">Note:</span>{" "}
          Notifications are role-based. BHC users receive referral and RHU
          feedback updates, RHU users receive incoming referral and inventory
          alerts, and Admin/MHO users receive system-level activity alerts.
        </p>
      </div>
    </DashboardLayout>
  );
}

function StatCard({ title, value, icon, color = "navy" }) {
  const map = {
    navy: "border-t-[#0B2E59] text-[#0B2E59] bg-blue-50",
    amber: "border-t-amber-400 text-amber-700 bg-amber-50",
    green: "border-t-emerald-400 text-emerald-700 bg-emerald-50",
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

function TypeBadge({ type }) {
  const map = {
    "Referral Update": "bg-blue-50 text-blue-700",
    "New Referral": "bg-blue-50 text-blue-700",
    Feedback: "bg-emerald-50 text-emerald-700",
    Medicine: "bg-amber-50 text-amber-700",
    Inventory: "bg-amber-50 text-amber-700",
    Monitoring: "bg-purple-50 text-purple-700",
    Account: "bg-slate-100 text-slate-600",
  };

  return (
    <span
      className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
        map[type] || "bg-slate-100 text-slate-600"
      }`}
    >
      {type}
    </span>
  );
}

