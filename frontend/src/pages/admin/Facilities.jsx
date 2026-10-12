import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { PageStateWrapper, RefreshingIndicator } from "../../components/common";
import FacilityFormModal from "../../components/features/facilities/FacilityFormModal";
import { apiRequest, unwrapList } from "../../services/apiClient";
import { queryKeys } from "../../utils/queryKeys";

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
                onClick={() => setType(tab)}
                className={`rounded-lg px-5 py-2 text-sm ${
                  type === tab ? "bg-[#B91C1C] text-white" : "bg-white text-slate-600"
                }`}
              >
                {tab.toUpperCase()} Facilities
              </button>
            ))}
            <button
              type="button"
              onClick={() => setEditing({ facility: null })}
              className="ml-auto rounded-lg border border-red-200 bg-white px-4 py-2 text-sm text-red-700"
            >
              + Add {typeLabel}
            </button>
          </div>

          {items.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
              No {typeLabel} facilities yet.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((facility) => (
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
