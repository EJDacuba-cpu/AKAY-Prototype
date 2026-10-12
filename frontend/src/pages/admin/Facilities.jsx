import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
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

  // Each tab has its own filters, so switching starts from a clean list.
  function changeType(tab) {
    setType(tab);
    setFilters(DEFAULT_FACILITY_FILTERS);
  }

  return (
    <DashboardLayout role="admin" title="Facilities">
      <PageStateWrapper
        isLoading={isLoading}
        isError={Boolean(loadError)}
        isFetching={isFetching}
        hasData={bhcs.length > 0 || rhus.length > 0}
        error={loadError}
        onRetry={() => refetch()}
        loadingMessage="Loading facilities..."
      >
        <div className="mx-auto w-full max-w-[1500px] space-y-5">
          <p className="text-sm text-slate-500">
            Manage facilities and approved referral destinations. Nurse work access is managed
            separately in Staff Assignments.
          </p>

          {isFetching && (
            <div className="flex justify-end">
              <RefreshingIndicator label="Updating facilities..." />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {FACILITY_TYPES.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => changeType(tab)}
                className={`rounded-lg px-5 py-2 text-sm ${
                  type === tab ? "bg-[#B91C1C] text-white" : "bg-white text-slate-600"
                }`}
              >
                {tab.toUpperCase()} Facilities
              </button>
            ))}
          </div>

          <ListToolbar
            key={type}
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
            actions={
              <button
                type="button"
                onClick={() => setEditing({ facility: null })}
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-4 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#991B1B]"
              >
                <Plus size={14} strokeWidth={2.5} />
                Add {typeLabel}
              </button>
            }
          />

          {filteredItems.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
              {items.length === 0
                ? `No ${typeLabel} facilities yet.`
                : `No ${typeLabel} facilities match the current filters.`}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleFacilities.map((facility) => (
                <article
                  key={facility.id}
                  className="rounded-xl border border-slate-200 bg-white p-5"
                >
                  <div className="flex justify-between gap-3">
                    <h2 className="font-bold">{facility.name}</h2>
                    <span className="text-xs text-slate-500">{facility.status}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {facility.address || "No address recorded"}
                  </p>
                  {type === "bhc" && (
                    <dl className="mt-4 space-y-2 text-sm">
                      <div>
                        <dt className="text-xs text-slate-500">Default receiving RHU</dt>
                        <dd>{facility.rural_health_unit?.name || "Not configured"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Approved alternatives</dt>
                        <dd>
                          {(facility.alternative_rhus || []).map((rhu) => rhu.name).join(", ") ||
                            "None"}
                        </dd>
                      </div>
                    </dl>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditing({ facility })}
                    className="mt-4 text-sm font-semibold text-red-700"
                  >
                    Edit Facility
                  </button>
                </article>
              ))}
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
