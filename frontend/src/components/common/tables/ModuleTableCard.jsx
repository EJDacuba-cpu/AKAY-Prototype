import { RefreshCw } from "lucide-react";
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
  return (
    <div
      className="anim-fade-up relative z-0 overflow-visible rounded-xl border border-[#E5E7EB] bg-white shadow-sm shadow-black/[0.02]"
      style={stagger(delay)}
    >
      <style>
        {`
          @keyframes akayTableRefresh {
            0% { transform: translateX(-110%); }
            100% { transform: translateX(310%); }
          }
          .akay-table-refresh-bar {
            animation: akayTableRefresh 1.15s ease-in-out infinite;
          }
        `}
      </style>
      <div className="flex items-center justify-between border-b border-[#F1F5F9] px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[#0F172A]">{title}</h2>
            <span className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] px-2 py-1 text-[10px] font-semibold text-[#64748B]">
              {count}
            </span>
            {refreshing && (
              <RefreshCw
                size={13}
                className="animate-spin text-[#B91C1C]"
                aria-label="Refreshing data"
              />
            )}
          </div>
          <p className="mt-1 text-xs text-[#9CA3AF]">{subtitle}</p>
        </div>
      </div>

      {refreshing && (
        <div className="h-[3px] overflow-hidden bg-red-50">
          <div className="akay-table-refresh-bar h-full w-1/3 rounded-r-full bg-[#B91C1C]" />
        </div>
      )}

      <div className="w-full overflow-x-auto overflow-y-visible scroll-smooth px-1 pb-2 transition-all duration-300 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border [&::-webkit-scrollbar-thumb]:border-[#F8FAFC] [&::-webkit-scrollbar-thumb]:bg-[#D6DEE8] hover:[&::-webkit-scrollbar-thumb]:bg-[#B8C4D3] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[#F8FAFC]">
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
