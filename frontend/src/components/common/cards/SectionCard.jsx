import { ArrowRight } from "lucide-react";
import { Link } from "react-router";

import { stagger } from "../../../utils/animation";

export default function SectionCard({
  title,
  subtitle,
  count,
  linkTo,
  icon,
  children,
  delay = 0,
}) {
  return (
    <section
      className="anim-fade-up overflow-hidden rounded-2xl border border-[#E8ECF0] bg-white shadow-sm shadow-black/[0.02] transition-all duration-300 hover:shadow-lg hover:shadow-black/[0.03]"
      style={stagger(delay)}
    >
      <div className="flex items-center justify-between gap-4 border-b border-[#F3F4F6] px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
              {icon}
            </div>

            <h2 className="text-sm font-semibold text-[#0B2E59]">{title}</h2>

            <span className="rounded-lg bg-[#F3F4F6] px-2.5 py-1 text-[10px] font-semibold text-[#6B7280]">
              {count}
            </span>
          </div>

          <p className="mt-1 text-xs text-[#9CA3AF]">{subtitle}</p>
        </div>

        <Link
          to={linkTo}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-[#F3F4F6] px-3 py-1.5 text-[11px] font-semibold text-[#0B2E59] transition-all duration-200 hover:bg-[#EFF6FF] hover:text-[#2563EB] active:scale-[0.96]"
        >
          View All
          <ArrowRight size={12} />
        </Link>
      </div>

      {children}
    </section>
  );
}



