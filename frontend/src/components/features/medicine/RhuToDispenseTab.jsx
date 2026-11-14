import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { FixedTable, ModalButton, ModalFooter, ModalShell, PageStateWrapper, RefreshingIndicator, SearchField, TablePagination } from "../../common";
import { Button } from "../../ui/button";
import DispensedMedicinesSection from "./DispensedMedicinesSection";
import RhuPrescriptionReviewModal from "./RhuPrescriptionReviewModal";
import RhuServiceUsageReviewModal from "./RhuServiceUsageReviewModal";
import usePagedRows from "../../../hooks/usePagedRows";
import { getCurrentUser } from "../../../utils/auth";
import { queryKeys } from "../../../utils/queryKeys";
import { formatFacilityName } from "../../../utils/formatters";
import {
  confirmRhuServiceUsage,
  getRhuToDispense,
  dispenseHealthRecordMedicines,
  markRhuServiceUsageNeedsReview,
} from "../../../services/healthRecordService";
import { loadMedicineAvailability } from "../../../services/medicineService";

const SOURCE_FILTERS = [
  { id: "all", label: "All" },
  { id: "prescription", label: "Prescriptions" },
  { id: "service_usage", label: "Service Usage" },
];

function rowKind(row) {
  if (row?.kind === "service_usage" || row?.sourceType === "SERVICE_USAGE") return "service_usage";
  return "prescription";
}

function statusLabel(row) {
  const status = String(row?.status || "pending");
  if (status === "given") return "Given";
  if (status === "reconciled") return "Reconciled";
  if (status === "needs_review") return "Needs review";
  if (status === "unavailable") return "Unavailable";
  return "Pending";
}

export default function RhuToDispenseTab() {
  const user = getCurrentUser();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [review, setReview] = useState(null);
  const [usageReview, setUsageReview] = useState(null);
  const [dispense, setDispense] = useState(null);
  const [draft, setDraft] = useState([]);
  const [usageDraft, setUsageDraft] = useState([]);
  const [saving, setSaving] = useState(false);
  const listKey = queryKeys.toDispense("rhu");
  const inventoryKey = queryKeys.medicineAvailability("rhu", user);
  const queue = useQuery({ queryKey: listKey, queryFn: getRhuToDispense, retry: false });
  const catalogNeeded = Boolean(dispense || usageReview);
  const catalogQuery = useQuery({
    queryKey: inventoryKey,
    queryFn: loadMedicineAvailability,
    enabled: catalogNeeded,
    retry: false,
  });
  const ownRhuId = String(user?.ruralHealthUnitId || user?.rural_health_unit_id || user?.rhuId || user?.facilityId || "");
  const catalog = useMemo(
    () =>
      (Array.isArray(catalogQuery.data) ? catalogQuery.data : []).filter(
        (item) => ownRhuId && !item.barangayHealthCenterId && String(item.ruralHealthUnitId) === ownRhuId,
      ),
    [catalogQuery.data, ownRhuId],
  );
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (Array.isArray(queue.data) ? queue.data : []).filter((row) => {
      const kind = rowKind(row);
      if (sourceFilter === "prescription" && kind !== "prescription") return false;
      if (sourceFilter === "service_usage" && kind !== "service_usage") return false;
      if (!q) return true;
      const haystack = [
        row.patientName,
        row.itemSummary,
        row.prescriptionText,
        row.itemDescription,
        row.source,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [queue.data, search, sourceFilter]);
  const { page, setPage, totalPages, pageRows } = usePagedRows(rows, `${search}|${sourceFilter}`);
  const facility = formatFacilityName(user, "Rural Health Unit");

  async function confirmGiven() {
    if (!dispense || saving) return;
    const confirmed = (Array.isArray(draft) ? draft : []).filter((item) => item.confirmedGiven === true);
    if (confirmed.length === 0) {
      toast.error("Confirm at least one item given.");
      return;
    }
    try {
      setSaving(true);
      await dispenseHealthRecordMedicines(dispense.healthRecordId || dispense.id, confirmed);
      toast.success("Medicines confirmed given.");
      setDispense(null);
      setReview(null);
      setDraft([]);
      await Promise.all([
        client.invalidateQueries({ queryKey: listKey }),
        client.invalidateQueries({ queryKey: inventoryKey }),
      ]);
    } catch (error) {
      toast.error(error?.message || "Unable to confirm dispensing.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmUsage() {
    if (!usageReview || saving) return;
    const confirmed = (Array.isArray(usageDraft) ? usageDraft : []).filter((item) => item.confirmedGiven === true);
    if (confirmed.length !== 1) {
      toast.error("Select exactly one inventory item to reconcile this usage.");
      return;
    }
    const item = confirmed[0];
    try {
      setSaving(true);
      await confirmRhuServiceUsage(usageReview.usageId, item);
      toast.success("Stock usage confirmed.");
      setUsageReview(null);
      setUsageDraft([]);
      await Promise.all([
        client.invalidateQueries({ queryKey: listKey }),
        client.invalidateQueries({ queryKey: inventoryKey }),
      ]);
    } catch (error) {
      toast.error(error?.message || "Unable to confirm stock usage.");
    } finally {
      setSaving(false);
    }
  }

  async function markNeedsReview() {
    if (!usageReview || saving) return;
    try {
      setSaving(true);
      await markRhuServiceUsageNeedsReview(usageReview.usageId);
      toast.success("Marked for inventory review.");
      setUsageReview(null);
      setUsageDraft([]);
      await client.invalidateQueries({ queryKey: listKey });
    } catch (error) {
      toast.error(error?.message || "Unable to update usage status.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageStateWrapper
      skeleton="dispensing"
      skeletonOptions={{ footer: false, minWidth: 0 }}
      isLoading={queue.isPending}
      isError={queue.isError}
      isFetching={queue.isFetching}
      hasData={Array.isArray(queue.data)}
      error={queue.error}
      onRetry={() => queue.refetch()}
      loadingMessage="Loading prescriptions to dispense…"
    >
      <div className="space-y-4" aria-busy={queue.isFetching}>
        <div>
          <h1 className="text-[17px] font-bold tracking-tight text-ink-800">To Dispense</h1>
          <p className="mt-1 text-[13px] text-neutral-600">
            Review prescriptions and reconcile actual service items used.
          </p>
        </div>
        {queue.isFetching && <RefreshingIndicator label="Updating prescriptions..." />}
        {queue.isError && Array.isArray(queue.data) && (
          <p role="status" className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
            Couldn't refresh prescriptions. Showing the last list that loaded.
            <Button variant="link" size="compact" disabled={queue.isFetching} onClick={() => queue.refetch()}>Retry</Button>
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-neutral-200 bg-white p-0.5" role="group" aria-label="Source filter">
              {SOURCE_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={`rounded px-2.5 py-1 text-xs font-medium ${
                    sourceFilter === filter.id
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-600 hover:bg-neutral-50"
                  }`}
                  aria-pressed={sourceFilter === filter.id}
                  onClick={() => setSourceFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-neutral-600">{rows.length} of {(queue.data || []).length} items</p>
          </div>
          <div className="w-full sm:max-w-xs">
            <SearchField value={search} onChange={setSearch} placeholder="Search patient or item" label="Search patient or item" />
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <FixedTable minWidth="min-w-[860px]">
            <thead className="h-11 bg-neutral-100 text-[10px] font-bold uppercase tracking-wide text-neutral-600">
              <tr>
                <th className="px-4">Patient</th>
                <th className="px-3">Visit date</th>
                <th className="px-3">Source</th>
                <th className="px-3">Item / qty</th>
                <th className="px-3">Status</th>
                <th className="px-3 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ height: "var(--akay-empty-h)" }} className="px-4 text-center text-sm text-neutral-600">
                    No prescriptions or service usage to review.
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => {
                  const kind = rowKind(row);
                  return (
                    <tr key={row.id} className="h-14 transition-colors hover:bg-neutral-50">
                      <td className="px-4 font-medium text-ink-800">{row.patientName}</td>
                      <td className="px-3 text-neutral-600">{row.visitDate || "—"}</td>
                      <td className="px-3 text-neutral-700">{row.source || (kind === "service_usage" ? "Service usage" : "Prescription")}</td>
                      <td className="px-3 text-neutral-700">
                        <span className="line-clamp-2">
                          {row.itemSummary || row.prescriptionText || "—"}
                        </span>
                      </td>
                      <td className="px-3 text-neutral-700">{statusLabel(row)}</td>
                      <td className="px-3 text-right">
                        {kind === "service_usage" ? (
                          <Button
                            size="compact"
                            variant="secondary"
                            onClick={() => {
                              setUsageReview(row);
                              setUsageDraft([]);
                            }}
                          >
                            Review usage
                          </Button>
                        ) : (
                          <Button size="compact" variant="secondary" onClick={() => setReview(row)}>
                            Review prescription
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </FixedTable>
          <TablePagination currentPage={page} totalPages={totalPages} onPageChange={setPage} alwaysShow />
        </div>
      </div>
      <RhuPrescriptionReviewModal
        row={review}
        facility={facility}
        onClose={() => setReview(null)}
        onDispense={() => {
          setDispense(review);
          setDraft([]);
        }}
      />
      <RhuServiceUsageReviewModal
        row={usageReview}
        facility={facility}
        catalog={catalog}
        draft={usageDraft}
        onDraftChange={setUsageDraft}
        saving={saving}
        catalogLoading={catalogQuery.isLoading}
        catalogError={catalogQuery.error?.message || ""}
        onRetryCatalog={() => catalogQuery.refetch()}
        onClose={() => !saving && setUsageReview(null)}
        onConfirm={confirmUsage}
        onNeedsReview={markNeedsReview}
      />
      {dispense ? (
        <ModalShell
          open
          title="Dispense"
          subtitle={dispense.patientName}
          onClose={() => !saving && setDispense(null)}
          size="xl"
          footer={
            <ModalFooter>
              <ModalButton disabled={saving} onClick={() => setDispense(null)}>
                Cancel
              </ModalButton>
              <ModalButton variant="primary" disabled={saving} onClick={confirmGiven}>
                Confirm given
              </ModalButton>
            </ModalFooter>
          }
        >
          <DispensedMedicinesSection
            inventory={catalog}
            value={draft}
            onChange={setDraft}
            disabled={saving}
            loading={catalogQuery.isLoading}
            error={catalogQuery.error?.message || ""}
            onRetry={() => catalogQuery.refetch()}
            facilityLabel="RHU"
          />
        </ModalShell>
      ) : null}
    </PageStateWrapper>
  );
}
