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
      className="anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white shadow-sm shadow-black/[0.02]"
      style={stagger(delay)}
    >
      {/* Header */}
      <div className="border-b border-[#F3F4F6] px-5 pt-5 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#1A1A1A]">
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

      {/* Shortcuts */}
      <div className="divide-y divide-[#F5F5F5] p-2">
        <WorkflowShortcut
          href="/bhc/patients/add"
          icon={<UserPlus size={16} />}
          label="Register"
          title="New Patient Visit"
          description="Create profile for first-time patient"
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
          title="Create Referral"
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
      className="group flex items-center gap-3.5 rounded-xl px-3 py-3 transition-all duration-200 hover:bg-[#FEF2F2]/60 active:scale-[0.99]"
    >
      {/* Icon — always subtle red, scales on hover */}
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#FAFAFA] text-[#9CA3AF] transition-all duration-200 group-hover:bg-red-50 group-hover:text-[#B91C1C] group-hover:shadow-sm group-hover:shadow-red-100">
        {icon}
      </div>

      {/* Content */}
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

      {/* Label pill — red accent */}
      <span className="flex-shrink-0 rounded-md bg-[#FAFAFA] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#BFBFBF] transition-all duration-200 group-hover:bg-red-50 group-hover:text-[#991B1B]">
        {label}
      </span>

      {/* Arrow — appears on hover */}
      <ArrowRight
        size={14}
        className="flex-shrink-0 text-transparent transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[#B91C1C]"
      />
    </Link>
  );
}
