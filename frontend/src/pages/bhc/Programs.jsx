import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HeartHandshake } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { ConnectionErrorState, SoftLoadingArea } from "../../components/common";
import ProgramCard from "../../components/features/programs/ProgramCard";
import { PROGRAM_STATUS_TABS } from "../../components/features/programs/programStatusStyles";
import { getPublishedPrograms } from "../../services/communityProgramService";
import { isConnectionError } from "../../services/apiClient";
import { queryKeys } from "../../utils/queryKeys";

/** Underlined tab strip, same visual language as the patient profile's ProfileTabs. */
function StatusTabs({ tabs, activeTab, onSelect }) {
  return (
    <div
      role="tablist"
      aria-label="Program status"
      className="mb-4 overflow-x-auto rounded-card border border-[#E5E7EB] bg-white shadow-card"
    >
      <nav className="flex">
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(tab.key)}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-xs font-semibold transition-colors duration-150 ${
                active
                  ? "border-[#B91C1C] text-[#B91C1C]"
                  : "border-transparent text-slate-400 hover:border-slate-300 hover:text-slate-600"
              }`}
            >
              {tab.label}
              {tab.count ? ` (${tab.count})` : ""}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * BHC Programs: the facility roster of Community Programs published by the
 * RHU to this BHC. Care Tracking (Maternal / FP / EPI / TB) stays on each
 * patient's own profile - this page is purely about explicit community
 * program participation, grouped by the program's own lifecycle status.
 */
export default function Programs() {
  const [activeTab, setActiveTab] = useState("Ongoing");

  const {
    data: programs = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.communityPrograms(),
    queryFn: getPublishedPrograms,
    staleTime: 30_000,
  });

  const tabs = useMemo(
    () =>
      PROGRAM_STATUS_TABS.map((tab) => ({
        ...tab,
        count: programs.filter((program) => tab.statuses.includes(program.status)).length,
      })),
    [programs],
  );

  const visiblePrograms = programs.filter((program) => {
    const tab = PROGRAM_STATUS_TABS.find((item) => item.key === activeTab);
    return tab ? tab.statuses.includes(program.status) : true;
  });

  return (
    <DashboardLayout role="bhc" title="Programs">
      <div className="px-4 py-4 pb-8 font-sans sm:px-6 [&_h1]:font-sans! [&_h2]:font-sans! [&_h3]:font-sans!">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-gray-900">Community Programs</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Programs and activities published to this BHC by the RHU.
          </p>
        </div>

        {error ? (
          <ConnectionErrorState
            fullPage
            onRetry={refetch}
            retrying={isFetching}
            variant={isConnectionError(error) ? "offline" : "error"}
          />
        ) : (
          <>
            <StatusTabs tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} />

            {isLoading ? (
              <SoftLoadingArea isLoading message="Loading programs..." minHeight="min-h-[240px]">
                <div className="min-h-[240px]" />
              </SoftLoadingArea>
            ) : visiblePrograms.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-[#E5E7EB] bg-white py-16 text-center shadow-card">
                <HeartHandshake size={28} className="text-gray-300" aria-hidden="true" />
                <p className="text-sm text-gray-500">No {activeTab.toLowerCase()} programs right now.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visiblePrograms.map((program) => (
                  <ProgramCard key={program.id} program={program} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
