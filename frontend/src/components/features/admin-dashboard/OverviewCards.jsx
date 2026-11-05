import { KeyRound, Mail, UserCheck, Users } from "lucide-react";
import { Link } from "react-router";

export default function OverviewCards({
  totalAccounts,
  activeAccounts,
  pendingInvitations,
  pendingResetRequests,
}) {
  const cards = [
    {
      title: "Total Accounts",
      value: totalAccounts,
      icon: Users,
      description: "All registered system accounts",
      to: "/admin/users",
    },
    {
      title: "Active Accounts",
      value: activeAccounts,
      icon: UserCheck,
      description: "Accounts currently marked active",
      to: "/admin/users",
    },
    {
      title: "Pending Invitations",
      value: pendingInvitations,
      icon: Mail,
      description: "Awaiting recipient account setup",
      warn: pendingInvitations > 0,
      to: "/admin/account-invites",
    },
    {
      title: "Pending Reset Requests",
      value: pendingResetRequests,
      icon: KeyRound,
      description: "Awaiting MHO action",
      warn: pendingResetRequests > 0,
      to: "/admin/password-reset-requests",
    },
  ];

  return (
    <div className="grid h-full grid-cols-1 gap-3 sm:grid-cols-2">
      {cards.map(({ title, value, icon: Icon, description, warn, to }) => (
        <KpiCard
          key={title}
          title={title}
          value={value}
          icon={Icon}
          description={description}
          warn={warn}
          to={to}
        />
      ))}
    </div>
  );
}

function KpiCard({ title, icon: Icon, value, description, warn = false, to }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="bhc-kpi-label text-[10px] font-bold uppercase tracking-wider text-neutral-400">
          {title}
        </p>
        <span
          className={`bhc-kpi-icon flex size-9 shrink-0 items-center justify-center rounded-lg ${
            warn ? "bg-amber-50 text-amber-700" : "bg-neutral-100 text-ink-700"
          }`}
        >
          <Icon size={16} />
        </span>
      </div>
      {value !== undefined && (
        <p className="bhc-kpi-value mt-3 text-2xl font-bold tabular-nums text-neutral-900">
          {value}
        </p>
      )}
      <p className="bhc-kpi-description mt-1 text-xs text-neutral-500">{description}</p>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="bhc-dashboard-kpi block rounded-card border border-neutral-200 bg-white p-4 shadow-card hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      >
        {body}
      </Link>
    );
  }

  return (
    <article className="bhc-dashboard-kpi rounded-card border border-neutral-200 bg-white p-4 shadow-card">
      {body}
    </article>
  );
}
