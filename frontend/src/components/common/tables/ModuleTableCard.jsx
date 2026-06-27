import { stagger } from "../../../utils/animation";

export default function ModuleTableCard({
  title,
  count,
  subtitle,
  minWidth = "min-w-[900px]",
  children,
  footer,
  delay = 0,
  refreshing = false,
}) {
  void refreshing;

  return (
    <div
      className="anim-fade-up relative z-0 min-w-0 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm shadow-black/[0.02]"
      style={stagger(delay)}
    >
      <div className="flex items-center justify-between border-b border-[#F1F5F9] px-3.5 py-3 sm:px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-[#0F172A]">{title}</h2>
            <span className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] px-2 py-1 text-[10px] font-semibold text-[#64748B]">
              {count}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-[#9CA3AF]">{subtitle}</p>
        </div>
      </div>

      <div className="border-b border-[#F8FAFC] bg-[#FCFCFD] px-3.5 py-2 text-[10px] font-medium text-[#94A3B8] sm:hidden">
        Swipe sideways to view all columns.
      </div>

      <div className="w-full min-w-0 overflow-x-auto overflow-y-visible overscroll-x-contain scroll-smooth px-1 pb-2 transition-all duration-300 [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border [&::-webkit-scrollbar-thumb]:border-[#F8FAFC] [&::-webkit-scrollbar-thumb]:bg-[#D6DEE8] hover:[&::-webkit-scrollbar-thumb]:bg-[#B8C4D3] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[#F8FAFC]">
        <table
          className={`w-full ${minWidth} border-separate border-spacing-0 text-left`}
        >
          {children}
        </table>
      </div>

      {footer}
    </div>
  );
}
