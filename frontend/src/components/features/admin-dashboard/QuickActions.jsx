import {
  ChartNoAxesCombined,
  FileClock,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router";

export default function QuickActions() {
  return (
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
