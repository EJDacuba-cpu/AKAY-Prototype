import { Link } from "react-router";

export default function FullSidebarNav({ menuSections, isMenuActive, onNavigate }) {
  return (
    <nav className="akay-sidebar-scroll flex-1 overflow-y-auto px-3 py-4">
      {menuSections.map((section) => (
        <div key={section.section} className="mb-5">
          <p className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[0.18em] text-[#9CA3AF]">
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
