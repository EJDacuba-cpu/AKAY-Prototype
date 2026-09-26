import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  SECTION_LABEL_CLASS,
  childLinkClass,
  navItemClass,
} from "./sidebarStyles";

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
        <div key={section.section} className="mb-4">
          <p className={`mb-1.5 ${SECTION_LABEL_CLASS}`}>{section.section}</p>

          <div className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = isMenuActive(item.path);
              const hasChildren = item.children?.length > 0;
              const expanded = active || expandedGroups[item.path];

              if (hasChildren) {
                return (
                  <div key={`${section.section}-${item.label}`} className="space-y-0.5">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() =>
                        setExpandedGroups((current) => ({
                          ...current,
                          [item.path]: !expanded,
                        }))
                      }
                      className={`${navItemClass(active)} gap-2.5 pl-2.5 pr-3 text-left`}
                    >
                      <Icon
                        size={16}
                        strokeWidth={active ? 2.25 : 1.9}
                        className="shrink-0"
                      />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {expanded ? (
                        <ChevronDown size={14} className="shrink-0" />
                      ) : (
                        <ChevronRight size={14} className="shrink-0" />
                      )}
                    </button>

                    {expanded && (
                      <div className="ml-[22px] space-y-0.5 border-l border-gray-200">
                        {item.children.map((child) => {
                          const childActive = isMenuActive(child.path);
                          return (
                            <Link
                              key={child.path}
                              to={child.path}
                              onClick={onNavigate}
                              className={childLinkClass(childActive)}
                            >
                              {childActive && (
                                <span className="absolute -left-px top-0 h-full w-0.5 bg-red-600" />
                              )}
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
                  className={`${navItemClass(active)} gap-2.5 pl-2.5 pr-3`}
                >
                  <Icon
                    size={16}
                    strokeWidth={active ? 2.25 : 1.9}
                    className="shrink-0"
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
