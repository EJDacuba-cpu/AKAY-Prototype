import { useState } from "react";

export default function RecordTabs({ tabs = [], defaultTabId, className = "" }) {
  const initialId = tabs.some((tab) => tab.id === defaultTabId)
    ? defaultTabId
    : tabs[0]?.id;
  const [activeTabId, setActiveTabId] = useState(initialId);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0];

  return (
    <>
      <div
        className={`print:hidden overflow-hidden rounded-card border border-[#E5E7EB] bg-white shadow-card ${className}`}
      >
        <div className="border-b border-slate-200 px-2 sm:px-4">
          <nav className="-mb-px flex overflow-x-auto" role="tablist">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = tab.id === activeTabId;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-selected={active}
                  aria-controls={`tabpanel-${tab.id}`}
                  onClick={() => setActiveTabId(tab.id)}
                  className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
                    active
                      ? "border-[#B91C1C] text-[#B91C1C]"
                      : "border-transparent text-slate-400 hover:border-slate-300 hover:text-slate-600"
                  }`}
                >
                  {Icon && <Icon size={14} />}
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
        <div
          role="tabpanel"
          id={`tabpanel-${activeTab?.id}`}
          aria-labelledby={`tab-${activeTab?.id}`}
          className="p-5 sm:p-6"
        >
          {activeTab?.content}
        </div>
      </div>

      {/* Flattened, all-tabs rendering — print only */}
      <div className={`hidden print:block ${className}`}>
        <div className="flex flex-col gap-4">
          {tabs.map((tab) => (
            <div key={tab.id} className="break-inside-avoid-page">
              <h3 className="mb-2 border-b border-slate-300 pb-1 text-[13px] font-bold text-black">
                {tab.label}
              </h3>
              <div className="text-[12px] leading-relaxed text-black">
                {tab.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
