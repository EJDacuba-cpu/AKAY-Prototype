import LockedPlaceholder from "../../../common/access/LockedPlaceholder";

/**
 * Underlined tab strip for the profile's main content: no box or background,
 * so it sits directly on the canvas above a thin rule, with a brand-red underline
 * on the active tab and a quiet count pill beside each label.
 */
export default function ProfileTabs({ tabs, activeTab, onSelect, aside }) {
  return (
    <div className="patient-profile-tabs mb-3 mt-1 flex shrink-0 items-center gap-2 shadow-[inset_0_-1px_0_var(--color-neutral-200)]">
      <div
        role="tablist"
        aria-label="Patient profile"
        className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
      >
        <nav className="flex gap-1">
          {tabs.map((tab) => {
            const active = tab.key === activeTab;
            const hasCount = tab.count !== undefined && tab.count !== null;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                id={`profile-tab-${tab.key}`}
                aria-selected={active}
                aria-controls={`profile-panel-${tab.key}`}
                onClick={() => onSelect(tab.key)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-2 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-400/50 ${
                  active
                    ? "border-brand-600 text-neutral-900"
                    : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-800"
                }`}
              >
                {tab.label}
                {hasCount && (
                  <span
                    className={`rounded-full px-1.5 py-px text-[11px] font-medium tabular-nums ${
                      active ? "bg-brand-50 text-brand-700" : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
      {aside ? <div className="shrink-0 pb-1.5">{aside}</div> : null}
    </div>
  );
}

// Same column geometry as PatientOverviewBoard, with static blocks only: no patient history is ever rendered.
export function LockedOverviewPlaceholder() {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 @5xl:grid-cols-[12rem_minmax(0,1fr)_16rem]">
      <LockedPlaceholder lines={4} className="order-2 min-h-72 @5xl:order-1" />
      <LockedPlaceholder lines={6} className="order-1 col-span-full min-h-[620px] @5xl:order-2 @5xl:col-span-1" />
      <LockedPlaceholder lines={5} className="order-3 min-h-72" />
    </div>
  );
}
