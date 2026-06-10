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
      className="anim-fade-up overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm shadow-black/[0.02] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#FECACA] hover:shadow-md hover:shadow-black/[0.04]"
      style={stagger(delay)}
    >
      <div className="flex items-center justify-between gap-4 border-b border-[#F1F5F9] px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FEF2F2] text-[#B91C1C]">
              {icon}
            </div>

            <h2 className="text-sm font-bold text-[#0F172A]">{title}</h2>

            <span className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-bold text-[#64748B]">
              {count}
            </span>
          </div>

          <p className="mt-1 text-xs text-[#64748B]">{subtitle}</p>
        </div>

        <Link
          to={linkTo}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-1.5 text-[11px] font-bold text-[#B91C1C] transition-all duration-200 hover:bg-white active:scale-[0.96]"
        >
          View All
          <ArrowRight size={12} />
        </Link>
      </div>

      {children}
    </section>
  );
}



