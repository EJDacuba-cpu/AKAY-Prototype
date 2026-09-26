import {
  ChevronDown,
  ChevronRight,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Link } from "react-router";
import { useEffect, useState } from "react";
import LogoMark from "./LogoMark";
import {
  FOCUS_RING,
  SECTION_LABEL_CLASS,
  SIGN_OUT_CLASS,
  childLinkClass,
  navItemClass,
} from "./sidebarStyles";

export default function DesktopSidebar({
  expanded,
  menuSections,
  user,
  isMenuActive,
  onToggle,
  onLogout,
}) {
  const [hoverLabel, setHoverLabel] = useState(null);
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

  const tooltipHandlers = (label) => ({
    onMouseEnter: (event) => showCollapsedLabel(event, label),
    onMouseLeave: hideCollapsedLabel,
    onFocus: (event) => showCollapsedLabel(event, label),
    onBlur: hideCollapsedLabel,
  });

  const toggleLabel = expanded ? "Collapse sidebar" : "Expand sidebar";
  const ToggleIcon = expanded ? PanelLeftClose : PanelLeftOpen;
  const itemLayout = expanded ? "gap-2.5 pl-2.5 pr-3" : "justify-center pl-0 pr-0";
  const labelReveal = (maxWidth) =>
    `overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out ${
      expanded ? `${maxWidth} opacity-100 delay-75` : "max-w-0 opacity-0"
    }`;

  return (
    <aside
      className={`font-sans antialiased fixed left-0 top-0 z-50 hidden h-dvh max-h-dvh flex-col overflow-visible border-r border-gray-200 bg-white transition-[width] duration-300 ease-in-out md:flex ${
        expanded ? "w-60" : "w-[72px]"
      }`}
    >
      <div
        className={`flex h-[62px] shrink-0 items-center border-b border-gray-200 bg-white ${
          expanded ? "gap-3 px-4" : "justify-center px-0"
        }`}
      >
        <LogoMark />

        {expanded && (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold leading-tight tracking-tight text-red-700">
                AKAY
              </p>
              <p className="mt-0.5 whitespace-nowrap text-[9px] font-semibold uppercase leading-tight tracking-wider text-gray-500">
                Community EHR System
              </p>
            </div>

            <button
              type="button"
              onClick={onToggle}
              aria-label={toggleLabel}
              title={toggleLabel}
              className={`flex h-8 w-8 shrink-0 items-center justify-center text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
            >
              <ToggleIcon size={16} />
            </button>
          </>
        )}
      </div>

      {!expanded && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={toggleLabel}
          {...tooltipHandlers(toggleLabel)}
          className={`flex h-9 w-full shrink-0 items-center justify-center border-b border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 ${FOCUS_RING}`}
        >
          <ToggleIcon size={16} />
        </button>
      )}

      <nav className="akay-sidebar-scroll min-h-0 flex-1 overflow-y-auto overflow-x-visible px-3 py-3">
        {menuSections.map((section, sectionIndex) => (
          <div key={section.section} className={expanded ? "mb-4" : "mb-2"}>
            {expanded ? (
              <p className={`mb-1.5 ${SECTION_LABEL_CLASS}`}>{section.section}</p>
            ) : (
              sectionIndex > 0 && (
                <div className="mx-1 mb-2 border-t border-gray-200" aria-hidden="true" />
              )
            )}

            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isMenuActive(item.path);
                const hasChildren = item.children?.length > 0;
                const groupExpanded = active || expandedGroups[item.path];

                const content = (
                  <>
                    <Icon
                      size={16}
                      strokeWidth={active ? 2.25 : 1.9}
                      className="shrink-0"
                    />
                    <span
                      className={`min-w-0 text-left ${
                        hasChildren ? "flex-1" : ""
                      } ${labelReveal("max-w-[130px]")}`}
                    >
                      {item.label}
                    </span>
                  </>
                );

                if (hasChildren) {
                  return (
                    <div key={`${section.section}-${item.label}`} className="space-y-0.5">
                      <button
                        type="button"
                        aria-label={item.label}
                        aria-expanded={groupExpanded}
                        onClick={() =>
                          setExpandedGroups((current) => ({
                            ...current,
                            [item.path]: !groupExpanded,
                          }))
                        }
                        {...tooltipHandlers(item.label)}
                        className={`${navItemClass(active)} ${itemLayout}`}
                      >
                        {content}
                        {expanded &&
                          (groupExpanded ? (
                            <ChevronDown size={14} className="shrink-0" />
                          ) : (
                            <ChevronRight size={14} className="shrink-0" />
                          ))}
                      </button>

                      {expanded && groupExpanded && (
                        <div className="ml-[22px] space-y-0.5 border-l border-gray-200">
                          {item.children.map((child) => {
                            const childActive = isMenuActive(child.path);
                            return (
                              <Link
                                key={child.path}
                                to={child.path}
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
                    aria-label={item.label}
                    {...tooltipHandlers(item.label)}
                    className={`${navItemClass(active)} ${itemLayout}`}
                  >
                    {content}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-gray-200 p-2.5">
        {expanded && (
          <div className="mb-2 border border-gray-200 bg-gray-50 px-2.5 py-2">
            <p className="truncate text-[12px] font-semibold text-gray-900">
              {user.name}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-gray-500">
              {user.facility}
            </p>
            <p className="truncate text-[11px] text-gray-500">
              {user.roleLabel || user.position}
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={onLogout}
          aria-label="Sign out"
          {...tooltipHandlers("Sign out")}
          className={SIGN_OUT_CLASS}
        >
          <LogOut size={14} className="shrink-0" />
          {expanded && <span className="whitespace-nowrap">Sign out</span>}
        </button>
      </div>

      {!expanded && hoverLabel && (
        <div
          className="pointer-events-none fixed left-[80px] z-[70] -translate-y-1/2"
          style={{ top: hoverLabel.top }}
          role="tooltip"
        >
          <span className="block whitespace-nowrap bg-gray-900 px-2.5 py-1.5 text-[11px] font-semibold text-white">
            {hoverLabel.label}
          </span>
        </div>
      )}
    </aside>
  );
}
