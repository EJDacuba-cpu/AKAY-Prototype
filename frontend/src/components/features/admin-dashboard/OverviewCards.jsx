import { Boxes, CalendarClock, ClipboardList, Users } from "lucide-react";
import { Link } from "react-router";

import { referralTrend } from "../../../utils/adminDashboard";

const num = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export default function OverviewCards({ referrals, followUps, patients, medicines }) {
  const referral = referrals || {};
  const followUp = followUps || {};
  const patient = patients || {};
  const medicine = medicines || {};

  const trend = referralTrend(referral.total, referral.previous_total);
  const priorityPending = num(referral.priority_pending);
  const overdue = num(followUp.overdue);
  const rhuLow = num(medicine.rhu_low_stock);
  const bhcLow = num(medicine.bhc_low_stock);
  const barangaysAffected = num(medicine.bhc_barangays_affected);

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Card
        to="/admin/reports"
        title="Referrals"
        icon={<ClipboardList size={17} />}
        value={num(referral.total)}
      >
        <p className="text-[11px] font-semibold text-slate-600">in period · {trend.label}</p>
        <p className="mt-1 text-[11px] text-[#64748B]">
          Of these: {num(referral.completed)} completed · {num(referral.no_show)} no-show
        </p>
        <p className="text-[11px] text-[#64748B]">
          Pending now: {num(referral.pending)}
          {priorityPending > 0 && ` (${priorityPending} priority)`}
        </p>
      </Card>

      <Card
        title="Follow-ups overdue"
        icon={<CalendarClock size={17} />}
        value={overdue}
        warn={overdue > 0}
      >
        <p className="text-[11px] text-[#64748B]">No-show in period: {num(followUp.no_show)}</p>
      </Card>

      <Card title="Patients" icon={<Users size={17} />} value={num(patient.total)}>
        <p className="text-[11px] text-[#64748B]">+{num(patient.new)} new in period</p>
      </Card>

      <Card
        title="Low stock medicines"
        icon={<Boxes size={17} />}
        warn={rhuLow > 0 || bhcLow > 0}
      >
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">RHU</p>
            <p className="text-2xl font-bold tracking-tight text-[#0F172A]">{rhuLow}</p>
            <p className="text-[11px] text-[#64748B]">low stock</p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">BHCs</p>
            <p className="text-2xl font-bold tracking-tight text-[#0F172A]">{bhcLow}</p>
            <p className="text-[11px] text-[#64748B]">
              low stock · {barangaysAffected} {barangaysAffected === 1 ? "barangay" : "barangays"}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Card({ to, title, icon, value, warn = false, children }) {
  const border = warn ? "border-t-amber-400" : "border-t-[#B91C1C]";
  const iconStyle = warn ? "bg-amber-50 text-amber-700" : "bg-red-50/60 text-[#B91C1C]";
  const hover = to ? "transition-transform duration-200 ease-out hover:scale-[1.02] hover:shadow-md" : "";
  const className = `block min-w-0 rounded-xl border border-[#E8ECF0] border-t-2 bg-white p-4 shadow-sm sm:p-5 ${border} ${hover}`;

  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
          {title}
        </p>
        <div className={`shrink-0 rounded-lg p-2 ${iconStyle}`} aria-hidden="true">
          {icon}
        </div>
      </div>

      {value !== undefined && (
        <p className="mt-3 text-2xl font-bold tracking-tight text-[#0F172A]">{value}</p>
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
