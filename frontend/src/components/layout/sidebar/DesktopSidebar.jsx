import { LogOut } from "lucide-react";
import { Link } from "react-router";
import { useState } from "react";
import LogoMark from "./LogoMark";

export default function DesktopSidebar({
  expanded,
  menuSections,
  user,
  isMenuActive,
  onToggle,
  onLogout,
}) {
  const [hoverLabel, setHoverLabel] = useState(null);

  function showCollapsedLabel(event, label) {
    if (expanded) return;

    const rect = event.currentTarget.getBoundingClientRect();
    setHoverLabel({
      label,
      top: rect.top + rect.height / 2,
    });
  }

  function hideCollapsedLabel() {
    setHoverLabel(null);
  }

  return (
    <aside
      className={`fixed left-0 top-0 z-50 hidden h-dvh max-h-dvh flex-col overflow-visible border-r border-[#E5E7EB] bg-white shadow-[0_18px_50px_-42px_rgba(15,23,42,0.35)] transition-[width] duration-300 ease-in-out md:flex ${
        expanded ? "w-60" : "w-[72px]"
      }`}
    >
      <div
        className={`flex h-[72px] shrink-0 items-center border-b border-[#F1F5F9] bg-white transition-all duration-300 ease-in-out ${
          expanded ? "px-4" : "justify-center px-0"
        }`}
      >
        <LogoMark
          onClick={onToggle}
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          ariaLabel={expanded ? "Collapse sidebar" : "Expand sidebar"}
        />

        <div
          className={`min-w-0 flex-1 overflow-hidden transition-all duration-300 ease-in-out ${
            expanded
              ? "ml-3 max-w-[158px] opacity-100 delay-100"
              : "ml-0 max-w-0 opacity-0"
          }`}
        >
          <p className="text-[15px] font-black tracking-tight text-[#B91C1C]">
            AKAY
          </p>
          <p className="mt-0.5 whitespace-nowrap text-[8px] font-semibold uppercase tracking-[0.16em] text-[#94A3B8]">
            Community EHR System
          </p>
        </div>
      </div>

      <nav className="akay-sidebar-scroll min-h-0 flex-1 overflow-y-auto overflow-x-visible px-3 py-3">
        {menuSections.map((section) => (
          <div key={section.section} className="mb-5">
            <p
              className={`mb-2 overflow-hidden whitespace-nowrap px-2 text-[9px] font-bold uppercase tracking-[0.18em] text-[#A7B0BE] transition-all duration-300 ease-in-out ${
                expanded ? "max-h-6 opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              {section.section}
            </p>

            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isMenuActive(item.path);

                return (
                  <Link
                    key={`${section.section}-${item.label}`}
                    to={item.path}
                    aria-label={item.label}
                    onMouseEnter={(event) =>
                      showCollapsedLabel(event, item.label)
                    }
                    onMouseLeave={hideCollapsedLabel}
                    onFocus={(event) => showCollapsedLabel(event, item.label)}
                    onBlur={hideCollapsedLabel}
                    className={`group relative flex h-10 w-full items-center rounded-xl transition-all duration-200 ${
                      expanded ? "px-3" : "justify-center px-0"
                    } ${
                      active
                        ? "text-[#B91C1C]"
                        : `text-[#64748B] hover:text-[#B91C1C] ${
                            expanded ? "hover:bg-[#F8FAFC]" : ""
                          }`
                    }`}
                  >
                    {active && (
                      <span className="absolute left-0 top-2.5 h-5 w-0.5 rounded-r-full bg-[#B91C1C]" />
                    )}

                    <Icon
                      size={18}
                      strokeWidth={active ? 2.25 : 1.9}
                      className="shrink-0 transition-colors duration-200"
                    />

                    <span
                      className={`ml-3 overflow-hidden whitespace-nowrap text-[13px] font-semibold transition-all duration-300 ease-in-out ${
                        expanded
                          ? "max-w-[150px] opacity-100 delay-75"
                          : "max-w-0 opacity-0"
                      }`}
                    >
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-[#F1F5F9] p-2.5">
        {expanded && (
          <div className="mb-2 overflow-hidden rounded-xl bg-[#F8FAFC] px-2.5 py-2 ring-1 ring-[#E5E7EB] transition-all duration-300 ease-in-out">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-bold text-[#0F172A]">
                {user.name}
              </p>
              <p className="mt-0.5 truncate text-[10px] font-medium text-[#64748B]">
                {user.facility}
              </p>
              <p className="truncate text-[10px] font-medium text-[#94A3B8]">
                {user.roleLabel || user.position}
              </p>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onLogout}
          aria-label="Sign out"
          onMouseEnter={(event) => showCollapsedLabel(event, "Sign out")}
          onMouseLeave={hideCollapsedLabel}
          onFocus={(event) => showCollapsedLabel(event, "Sign out")}
          onBlur={hideCollapsedLabel}
          className={`flex h-9 w-full items-center rounded-xl text-[#B91C1C] transition hover:bg-[#FEF2F2] ${
            expanded ? "gap-2 px-3" : "justify-center px-0"
          }`}
        >
          <LogOut size={17} className="shrink-0" />

          <span
            className={`overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-300 ease-in-out ${
              expanded
                ? "max-w-[100px] opacity-100 delay-75"
                : "max-w-0 opacity-0"
            }`}
          >
            Sign out
          </span>
        </button>
      </div>

      {!expanded && hoverLabel && (
        <div
          className="pointer-events-none fixed left-[84px] z-[70] flex -translate-y-1/2 translate-x-0 items-center opacity-100 transition-all duration-150 ease-out"
          style={{ top: hoverLabel.top }}
          role="tooltip"
        >
          <span className="h-2.5 w-2.5 rotate-45 rounded-[2px] border-b border-l border-[#E5E7EB] bg-white shadow-sm" />
          <span className="-ml-1 whitespace-nowrap rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#0F172A] shadow-xl shadow-slate-900/10">
            {hoverLabel.label}
          </span>
        </div>
      )}
    </aside>
  );
}
