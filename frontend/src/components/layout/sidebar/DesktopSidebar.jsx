import {
  ChevronDown,
  ChevronRight,
  Lock,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Link } from "react-router";
import { useEffect, useState } from "react";
import LogoMark, { LogoWordmark } from "./LogoMark";
import { RESTRICTED_MESSAGE } from "../../common/access/RestrictedArea";
import {
  FOCUS_RING,
  LOCKED_NAV_ITEM_CLASS,
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
      className={`font-sans antialiased fixed left-0 top-0 z-50 hidden h-dvh max-h-dvh flex-col overflow-visible bg-[var(--color-shell)] transition-[width] duration-300 ease-in-out md:flex ${
        expanded ? "w-60" : "w-[72px]"
      }`}
    >
      <div
        className={`flex h-16 shrink-0 items-center ${
          expanded ? "gap-3 pl-5 pr-3" : "justify-center px-0"
        }`}
      >
        {!expanded && (
          <button
            type="button"
            onClick={() => {
              hideCollapsedLabel();
              onToggle();
            }}
            aria-label={toggleLabel}
            {...tooltipHandlers(toggleLabel)}
            className={`group relative flex h-10 w-10 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-900/[0.05] hover:text-neutral-900 focus-visible:bg-neutral-900/[0.05] ${FOCUS_RING}`}
          >
            <span className="flex transition-opacity duration-150 ease-out group-hover:opacity-0 group-focus-visible:opacity-0 motion-reduce:transition-none">
              <LogoMark />
            </span>
            <ToggleIcon
              size={18}
              aria-hidden="true"
              className="absolute opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
            />
          </button>
        )}

        {expanded && (
          <>
            <div className="flex min-w-0 flex-1 items-center">
              <LogoWordmark />
            </div>

            <button
              type="button"
              onClick={onToggle}
              aria-label={toggleLabel}
              title={toggleLabel}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-900/[0.05] hover:text-neutral-900 ${FOCUS_RING}`}
            >
              <ToggleIcon size={16} />
            </button>
          </>
        )}
      </div>

      <nav className="akay-sidebar-scroll min-h-0 flex-1 overflow-y-auto overflow-x-visible px-3 pb-3 pt-1">
        {menuSections.map((section, sectionIndex) => (
          <div key={section.section} className={expanded ? "mb-5" : "mb-2"}>
            {expanded ? (
              <p className={`mb-1.5 ${SECTION_LABEL_CLASS}`}>{section.section}</p>
            ) : (
              sectionIndex > 0 && (
                <div className="mx-2 mb-2 border-t border-neutral-200" aria-hidden="true" />
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

                if (item.locked) {
                  return (
                    <span
                      key={`${section.section}-${item.label}`}
                      role="link"
                      aria-disabled="true"
                      tabIndex={0}
                      aria-label={`${item.label}: ${RESTRICTED_MESSAGE}`}
                      title={expanded ? RESTRICTED_MESSAGE : undefined}
                      {...tooltipHandlers(`${item.label} · Not permitted`)}
                      className={`${LOCKED_NAV_ITEM_CLASS} ${itemLayout}`}
                    >
                      {content}
                      {expanded && <Lock size={13} className="ml-auto shrink-0" aria-hidden="true" />}
                    </span>
                  );
                }

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
                        <div className="ml-[19px] space-y-0.5 border-l border-neutral-200 pl-1.5 pt-0.5">
                          {item.children.map((child) => {
                            const childActive = isMenuActive(child.path);
                            return (
                              <Link
                                key={child.path}
                                to={child.path}
                                className={childLinkClass(childActive)}
                              >
                                {childActive && (
                                  <span className="absolute -left-[7px] top-1.5 bottom-1.5 w-0.5 rounded-full bg-brand-600" />
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

      <div className="shrink-0 p-3 pt-2">
        {expanded && (
          <div className="mb-1.5 rounded-xl border border-neutral-200/80 bg-white px-2.5 py-2 shadow-xs">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-neutral-900">
                {user.name}
              </p>
              <p className="truncate text-[11px] text-neutral-500">
                {[user.roleLabel || user.position, user.facility].filter(Boolean).join(" · ")}
              </p>
            </div>
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
          <span className="block whitespace-nowrap rounded-md bg-neutral-900 px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg">
            {hoverLabel.label}
          </span>
        </div>
      )}
    </aside>
  );
}
