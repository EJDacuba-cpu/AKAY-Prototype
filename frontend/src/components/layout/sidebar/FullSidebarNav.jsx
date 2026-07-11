import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronRight } from "lucide-react";

export default function FullSidebarNav({ menuSections, isMenuActive, onNavigate }) {
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => {
    setExpandedGroups((current) => {
      const next = { ...current };
      let changed = false;
      menuSections.forEach((section) => {
        section.items.forEach((item) => {
          if (item.children?.length && isMenuActive(item.path) && !next[item.path]) {
            next[item.path] = true;
            changed = true;
          }
        });
      });
      return changed ? next : current;
    });
  }, [isMenuActive, menuSections]);

  return (
    <nav className="akay-sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
      {menuSections.map((section) => (
        <div key={section.section} className="mb-5">
          <p className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[0.18em] text-[#9CA3AF]">
            {section.section}
          </p>

          <div className="space-y-1">
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = isMenuActive(item.path);
              const hasChildren = item.children?.length > 0;
              const expanded = active || expandedGroups[item.path];

              if (hasChildren) {
                return (
                  <div key={`${section.section}-${item.label}`} className="space-y-1">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedGroups((current) => ({
                          ...current,
                          [item.path]: !expanded,
                        }))
                      }
                      className={`group relative flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[12px] font-semibold transition-all duration-200 ${
                        active
                          ? "text-[#B91C1C]"
                          : "text-[#4B5563] hover:bg-[#F8FAFC] hover:text-[#B91C1C]"
                      }`}
                      aria-expanded={expanded}
                    >
                      {active && (
                        <span className="absolute left-0 top-1.5 h-7 w-1 rounded-r-full bg-[#B91C1C]" />
                      )}

                      <Icon
                        size={17}
                        strokeWidth={active ? 2.3 : 1.9}
                        className="shrink-0 transition-transform duration-200 group-hover:scale-105"
                      />

                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {expanded ? (
                        <ChevronDown size={14} className="shrink-0" />
                      ) : (
                        <ChevronRight size={14} className="shrink-0" />
                      )}
                    </button>

                    {expanded && (
                      <div className="space-y-1 pl-8">
                        {item.children.map((child) => {
                          const childActive = isMenuActive(child.path);
                          return (
                            <Link
                              key={child.path}
                              to={child.path}
                              onClick={onNavigate}
                              className={`block rounded-lg px-3 py-2 text-[11px] font-semibold transition ${
                                childActive
                                  ? "bg-red-50 text-[#B91C1C]"
                                  : "text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#B91C1C]"
                              }`}
                            >
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={`${section.section}-${item.label}`}
                  to={item.path}
                  onClick={onNavigate}
                  className={`group relative flex h-10 items-center gap-2.5 rounded-lg px-3 text-[12px] font-semibold transition-all duration-200 ${
                active
                  ? "text-[#B91C1C]"
                  : "text-[#4B5563] hover:bg-[#F8FAFC] hover:text-[#B91C1C]"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1.5 h-7 w-1 rounded-r-full bg-[#B91C1C]" />
                  )}

                  <Icon
                    size={17}
                    strokeWidth={active ? 2.3 : 1.9}
                    className="shrink-0 transition-transform duration-200 group-hover:scale-105"
                  />

                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
