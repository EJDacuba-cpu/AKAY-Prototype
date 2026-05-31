import {
  ArrowRight,
  ClipboardList,
  FileText,
  Search,
  UserPlus,
  Stethoscope,
} from "lucide-react";

import { Link } from "react-router";

import { stagger } from "../../../utils/animation";

export default function WorkflowPanel({ delay = 0 }) {
  return (
    <section
      className="anim-fade-up rounded-xl border border-[#E5E7EB] bg-white shadow-sm"
      style={stagger(delay)}
    >
      <div className="border-b border-[#F3F4F6] px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#0F172A]">
              Quick Actions
            </h2>
            <p className="mt-0.5 text-[11px] text-[#9CA3AF]">
              Common tasks for BHC personnel
            </p>
          </div>

          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50">
            <Stethoscope size={13} className="text-[#B91C1C]" />
          </div>
        </div>
      </div>

      <div className="divide-y divide-[#F5F5F5] p-2">
        <WorkflowShortcut
          href="/bhc/patients/add"
          icon={<UserPlus size={16} />}
          label="Register"
          title="New Patient Visit"
          description="Add profile for first-time patient"
        />

        <WorkflowShortcut
          href="/bhc/health-records/add"
          icon={<FileText size={16} />}
          label="Consult"
          title="Existing Patient Visit"
          description="Record consultation or monitoring"
        />

        <WorkflowShortcut
          href="/bhc/referrals"
          icon={<ClipboardList size={16} />}
          label="Refer"
          title="Submit Referral"
          description="Send official BHC-to-RHU referral"
        />

        <WorkflowShortcut
          href="/bhc/referrals"
          icon={<Search size={16} />}
          label="Review"
          title="Follow-up Required"
          description="Check referrals waiting for RHU updates"
        />
      </div>
    </section>
  );
}

function WorkflowShortcut({ href, icon, label, title, description }) {
  return (
    <Link
      to={href}
      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 hover:bg-[#FEF2F2]/70 active:scale-[0.99]"
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#FAFAFA] text-[#9CA3AF] transition-all duration-200 group-hover:bg-red-50 group-hover:text-[#B91C1C] group-hover:shadow-sm">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-[#1F2937] group-hover:text-[#1A1A1A]">
            {title}
          </p>
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-[#BFBFBF] group-hover:text-[#9CA3AF]">
          {description}
        </p>
      </div>

      <span className="flex-shrink-0 rounded-md bg-[#FAFAFA] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#BFBFBF] transition-all duration-200 group-hover:bg-red-50 group-hover:text-[#991B1B]">
        {label}
      </span>

      <ArrowRight
        size={14}
        className="flex-shrink-0 text-transparent transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[#B91C1C]"
      />
    </Link>
  );
}
