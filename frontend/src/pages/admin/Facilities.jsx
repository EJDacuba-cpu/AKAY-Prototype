import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Hospital, House, Pencil, Plus, Route, Search } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { Button } from "../../components/ui/button";
import { ListToolbar, LoadMoreButton, PageStateWrapper, RefreshingIndicator } from "../../components/common";
import FacilityFormModal from "../../components/features/facilities/FacilityFormModal";
import { apiRequest, unwrapList } from "../../services/apiClient";
import useLoadMore from "../../hooks/useLoadMore";
import {
  ALL_ALTERNATIVES,
  ALL_RHUS,
  ALL_STATUS,
  DEFAULT_FACILITY_FILTERS,
  NO_ALTERNATIVES,
  WITH_ALTERNATIVES,
  facilityFilterChips,
  filterFacilities,
} from "../../utils/facilityFilters";
import { queryKeys } from "../../utils/queryKeys";
import { FACILITIES_LOAD_BATCH, resetKeyOf } from "../../utils/tablePaging";

const FACILITY_TYPES = ["bhc", "rhu"];

/** Status as a pill with a leading dot. Active is green, anything else (Inactive) is red, per the chip rules in DESIGN.md. */
function StatusPill({ status }) {
  const active = String(status).toLowerCase() === "active";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-red-500"}`} />
      {status}
    </span>
  );
}

async function loadFacilities() {
  const [bhcs, rhus] = await Promise.all([
    apiRequest("/barangay-health-centers"),
    apiRequest("/rural-health-units"),
  ]);

  return { bhcs: unwrapList(bhcs), rhus: unwrapList(rhus) };
}

export default function Facilities() {
  const queryClient = useQueryClient();
  const [type, setType] = useState("bhc");
  const [filters, setFilters] = useState(DEFAULT_FACILITY_FILTERS);
  // `null` = closed, `{ facility: null }` = adding, `{ facility }` = editing.
  const [editing, setEditing] = useState(null);
  const {
    data: facilities = { bhcs: [], rhus: [] },
    isLoading,
    isFetching,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.adminFacilities(),
    queryFn: loadFacilities,
    retry: false,
  });
  const { bhcs, rhus } = facilities;
  const items = type === "bhc" ? bhcs : rhus;
  const typeLabel = type.toUpperCase();
  const filteredItems = useMemo(() => filterFacilities(items, filters, type), [items, filters, type]);
  const {
    visibleItems: visibleFacilities,
    hasMore: hasMoreFacilities,
    loadMore: loadMoreFacilities,
  } = useLoadMore(filteredItems, FACILITIES_LOAD_BATCH, resetKeyOf(type, filters));

  const activeFilters = facilityFilterChips(filters, type);
  const activeFilterCount = activeFilters.filter((chip) => chip.key !== "search").length;
  const toolbarFilters = [
    { key: "status", type: "select", label: "Status", value: filters.status, options: [ALL_STATUS, "Active", "Inactive"] },
    ...(type === "bhc"
      ? [
          { key: "rhu", type: "select", label: "Default RHU", value: filters.rhu, options: [ALL_RHUS, ...rhus.map((rhu) => rhu.name)] },
          { key: "alternatives", type: "select", label: "Alternatives", value: filters.alternatives, options: [ALL_ALTERNATIVES, WITH_ALTERNATIVES, NO_ALTERNATIVES] },
        ]
      : []),
  ];

  // The filters differ per tab, so switching clears them. The search text stays, so the same term works on both tabs.
  function changeType(tab) {
    setType(tab);
    setFilters({ ...DEFAULT_FACILITY_FILTERS, search: filters.search });
  }

  const typeTabs = (
    <div role="group" aria-label="Facility type" className="inline-flex max-w-full gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-xs">
      {FACILITY_TYPES.map((tab) => (
        <button
          key={tab}
          type="button"
          aria-pressed={type === tab}
          onClick={() => changeType(tab)}
          className={`inline-flex h-8 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink-400/50 sm:px-4 ${
            type === tab ? "bg-red-700 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          {tab.toUpperCase()}<span className="hidden sm:inline"> Facilities</span>
          <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${type === tab ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"}`}>
            {tab === "bhc" ? bhcs.length : rhus.length}
          </span>
        </button>
      ))}
    </div>
  );
  const emptyState = (
    <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9]">
        {items.length === 0 ? (
          type === "bhc" ? <House size={20} className="text-[#94A3B8]" /> : <Hospital size={20} className="text-[#94A3B8]" />
        ) : (
          <Search size={20} className="text-[#94A3B8]" />
        )}
      </div>
      <p className="text-[13px] font-semibold text-[#334155]">
        {items.length === 0
          ? `No ${typeLabel} facilities yet.`
          : `No ${typeLabel} facilities match the current filters.`}
      </p>
      <p className="mt-1 max-w-sm text-[11.5px] text-[#94A3B8]">
        {items.length === 0 ? `Tap Add ${typeLabel} to start.` : "Try adjusting your search or filters."}
      </p>
    </div>
  );

  return (
    <DashboardLayout role="admin" title="Facilities">
      <PageStateWrapper skeleton="facilities"
        isLoading={isLoading}
        isError={Boolean(loadError)}
        isFetching={isFetching}
        hasData={bhcs.length > 0 || rhus.length > 0}
        error={loadError}
        onRetry={() => refetch()}
        loadingMessage="Loading facilities..."
      >
        <div className="mx-auto w-full max-w-[1500px] space-y-5">
          <p className="max-w-3xl text-sm text-slate-600">
            Manage facilities and approved referral destinations. Nurse work access is managed
            separately in Staff Assignments.
          </p>

          {isFetching && (
            <div className="flex justify-end">
              <RefreshingIndicator label="Updating facilities..." />
            </div>
          )}

          <ListToolbar
            heading={typeTabs}
            searchValue={filters.search}
            onSearchChange={(value) => setFilters((prev) => ({ ...prev, search: value }))}
            searchPlaceholder="Search name, barangay, or address..."
            filters={toolbarFilters}
            activeFilterCount={activeFilterCount}
            activeFilters={activeFilters}
            onApplyFilters={(next) => setFilters((prev) => ({ ...prev, ...next }))}
            onClearFilters={() => setFilters(DEFAULT_FACILITY_FILTERS)}
            onRemoveFilter={(key) => setFilters((prev) => ({ ...prev, [key]: DEFAULT_FACILITY_FILTERS[key] }))}
            filterDescription="Narrow the facilities list."
            primaryActionLabel={`Add ${typeLabel}`}
            primaryActionIcon={<Plus size={14} strokeWidth={2.5} />}
            onPrimaryAction={() => setEditing({ facility: null })}
          />

          {filteredItems.length === 0 ? emptyState : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visibleFacilities.map((facility) => {
                const alternatives = (facility.alternative_rhus || []).map((rhu) => rhu.name);
                const inbound = type === "rhu" ? bhcs.filter((bhc) => bhc.rural_health_unit?.name === facility.name).length : 0;
                return (
                  <article key={facility.id} className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300">
                    <header className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="break-words text-sm font-semibold leading-snug text-slate-900">{facility.name}</h2>
                        <p className="mt-0.5 break-words text-[13px] text-slate-600">{facility.address || "No address recorded"}</p>
                      </div>
                      <StatusPill status={facility.status} />
                    </header>

                    {type === "bhc" ? (
                      <div className="rounded-lg border border-dashed border-slate-300 p-3">
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          <Route size={13} aria-hidden="true" />
                          Refers to
                        </p>
                        <p className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-slate-900">
                          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-red-600" />
                          <span className="min-w-0 break-words">{facility.rural_health_unit?.name || "Not configured"}</span>
                        </p>
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {alternatives.length === 0 ? (
                            <span className="text-xs text-slate-500">No approved alternatives</span>
                          ) : (
                            alternatives.map((name) => (
                              <span key={name} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700">{name}</span>
                            ))
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-300 p-3">
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          <Route size={13} aria-hidden="true" />
                          Receives from
                        </p>
                        <p className="mt-1.5 text-sm font-semibold text-slate-900">
                          {inbound} {inbound === 1 ? "barangay health center" : "barangay health centers"}
                          <span className="font-normal text-slate-600"> as default</span>
                        </p>
                      </div>
                    )}

                    <div className="mt-auto flex justify-end">
                      <Button type="button" variant="secondary" size="compact" onClick={() => setEditing({ facility })}>
                        <Pencil size={13} aria-hidden="true" />
                        Edit Facility
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {hasMoreFacilities && (
            <div className="flex justify-center">
              <LoadMoreButton label="Load more facilities" onClick={loadMoreFacilities} />
            </div>
          )}
        </div>
      </PageStateWrapper>

      {editing && (
        <FacilityFormModal
          type={type}
          facility={editing.facility}
          rhus={rhus}
          onSaved={() => queryClient.invalidateQueries({ queryKey: queryKeys.adminFacilities() })}
          onClose={() => setEditing(null)}
        />
      )}
    </DashboardLayout>
  );
}
