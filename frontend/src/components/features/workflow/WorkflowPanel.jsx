import {
  ArrowRight,
  ClipboardList,
  FileText,
  Search,
  UserPlus,
} from "lucide-react";

import { Link } from "react-router";

import { stagger } from "../../../utils/animation";
export default function WorkflowPanel({ delay = 0 }) {
  return (
    <section
      className="anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-5 shadow-sm shadow-black/[0.02]"
      style={stagger(delay)}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#0B2E59]">
            BHC Workflow Shortcuts
          </h2>

          <p className="mt-1 text-xs text-[#9CA3AF]">
            Common tasks for BHC personnel.
          </p>
        </div>

        <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
          Today
        </span>
      </div>

      <div className="space-y-3">
        <WorkflowShortcut
          href="/bhc/patients/add"
          icon={<UserPlus size={17} />}
          label="New Patient Visit"
          title="Register Patient"
          description="Create profile for first-time patient."
          color="navy"
        />

        <WorkflowShortcut
          href="/bhc/health-records/add"
          icon={<FileText size={17} />}
          label="Existing Patient Visit"
          title="Add Health Record"
          description="Record consultation or monitoring."
          color="blue"
        />

        <WorkflowShortcut
          href="/bhc/referrals/create"
          icon={<ClipboardList size={17} />}
          label="Needs RHU Service"
          title="Create Referral"
          description="Send official BHC-to-RHU referral."
          color="amber"
        />

        <WorkflowShortcut
          href="/bhc/referrals"
          icon={<Search size={17} />}
          label="Follow-up Required"
          title="Review Pending"
          description="Check referrals waiting for RHU updates."
          color="slate"
        />
      </div>
    </section>
  );
}

function WorkflowShortcut({
  href,
  icon,
  label,
  title,
  description,
  color = "navy",
}) {
  const map = {
    navy: {
      iconBg: "#EFF6FF",
      iconColor: "#2563EB",
      labelBg: "#EFF6FF",
      labelColor: "#2563EB",
    },

    blue: {
      iconBg: "#EFF6FF",
      iconColor: "#2563EB",
      labelBg: "#EFF6FF",
      labelColor: "#2563EB",
    },

    amber: {
      iconBg: "#FFFBEB",
      iconColor: "#D97706",
      labelBg: "#FFFBEB",
      labelColor: "#D97706",
    },

    slate: {
      iconBg: "#F8FAFC",
      iconColor: "#64748B",
      labelBg: "#F8FAFC",
      labelColor: "#64748B",
    },
  };

  const c = map[color] || map.navy;

  return (
    <Link
      to={href}
      className="group block rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D1D5DB] hover:bg-white hover:shadow-md active:scale-[0.98]"
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
          style={{
            backgroundColor: c.iconBg,
            color: c.iconColor,
          }}
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span
              className="rounded-md px-2 py-0.5 text-[9px] font-bold"
              style={{
                backgroundColor: c.labelBg,
                color: c.labelColor,
              }}
            >
              {label}
            </span>

            <ArrowRight
              size={13}
              className="flex-shrink-0 text-[#0B2E59] transition-transform group-hover:translate-x-1"
            />
          </div>

          <p className="text-xs font-bold text-[#0B2E59]">{title}</p>

          <p className="mt-1 text-[11px] leading-relaxed text-[#6B7280]">
            {description}
          </p>
        </div>
      </div>
    </Link>
  );
}



