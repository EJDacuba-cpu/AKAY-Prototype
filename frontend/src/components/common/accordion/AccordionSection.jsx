import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export default function AccordionSection({
  id,
  title,
  icon,
  preview,
  badge,
  defaultOpen = false,
  isOpen: isOpenProp,
  onToggle,
  children,
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = isOpenProp !== undefined;
  const isOpen = isControlled ? isOpenProp : uncontrolledOpen;

  function handleToggle() {
    if (isControlled) {
      onToggle?.(id, !isOpen);
    } else {
      setUncontrolledOpen((prev) => !prev);
    }
  }

  return (
    <section className="overflow-hidden rounded-card border border-[#E5E7EB] bg-white shadow-card">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50/60"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-[#64748B]" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-[#64748B]" />
        )}

        {icon && <span className="shrink-0 text-[#B91C1C]">{icon}</span>}

        <span className="text-sm font-semibold text-[#0F172A]">{title}</span>

        {badge && (
          <span className="shrink-0 rounded-md border border-[#E5E7EB] bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-semibold text-[#64748B]">
            {badge}
          </span>
        )}

        {!isOpen && preview && (
          <span className="ml-auto min-w-0 truncate pl-3 text-xs text-[#9CA3AF]">
            {preview}
          </span>
        )}
      </button>

      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-slate-100 p-5 sm:p-6">{children}</div>
        </div>
      </div>
    </section>
  );
}
