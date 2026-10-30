import { KeyRound, Mail, UserMinus, UserX } from "lucide-react";
import { Link } from "react-router";

export default function OverviewCards({ personnel, pendingResetRequests, pendingInvitations }) {
  const cards = [
    { title: "Inactive Personnel", value: personnel.inactive, icon: UserX, description: "Inactive BHC and RHU accounts" },
    { title: "Unassigned Personnel", value: personnel.unassigned, icon: UserMinus, description: "No valid active home facility", warn: personnel.unassigned > 0 },
    { title: "Pending Reset Requests", value: pendingResetRequests, icon: KeyRound, description: "Awaiting MHO action", warn: pendingResetRequests > 0, to: "/admin/password-reset-requests" },
    { title: "Pending Invitations", value: pendingInvitations, icon: Mail, description: "Awaiting recipient completion", to: "/admin/password-reset-requests?tab=invites" },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ title, value, icon: Icon, description, warn, to }) => (
        <Card key={title} title={title} value={value} icon={<Icon size={17} />} warn={warn} to={to}>
          <p className="text-[11px] text-neutral-600">{description}</p>
        </Card>
      ))}
    </div>
  );
}

function Card({ to, title, icon, value, warn = false, children }) {
  const border = warn ? "border-t-amber-400" : "border-t-[#B91C1C]";
  const iconStyle = warn ? "bg-amber-50 text-amber-700" : "bg-red-50/60 text-[#B91C1C]";
  const hover = to ? "transition-colors hover:border-neutral-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700" : "";
  const className = `block h-full min-w-0 rounded-xl border border-[#E8ECF0] border-t-2 bg-white p-3 shadow-sm sm:p-4 ${border} ${hover}`;

  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
          {title}
        </p>
        <div className={`shrink-0 rounded-lg p-1.5 ${iconStyle}`} aria-hidden="true">
          {icon}
        </div>
      </div>

      {value !== undefined && (
        <p className="mt-2 text-2xl font-bold tracking-tight text-[#0F172A]">{value}</p>
      )}

      <div className="mt-1">{children}</div>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
