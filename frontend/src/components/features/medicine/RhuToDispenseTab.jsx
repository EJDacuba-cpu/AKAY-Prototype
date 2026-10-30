import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ModalButton, ModalFooter, ModalShell, PageStateWrapper, SearchField } from "../../common";
import { Button } from "../../ui/button";
import DispensedMedicinesSection from "./DispensedMedicinesSection";
import RhuPrescriptionReviewModal from "./RhuPrescriptionReviewModal";
import { getCurrentUser } from "../../../utils/auth";
import { queryKeys } from "../../../utils/queryKeys";
import { formatFacilityName } from "../../../utils/formatters";
import { getRhuToDispense, dispenseHealthRecordMedicines } from "../../../services/healthRecordService";
import { loadMedicineAvailability } from "../../../services/medicineService";

export default function RhuToDispenseTab() {
  const user = getCurrentUser();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [review, setReview] = useState(null);
  const [dispense, setDispense] = useState(null);
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);
  const listKey = queryKeys.toDispense("rhu");
  const inventoryKey = queryKeys.medicineAvailability("rhu", user);
  const queue = useQuery({ queryKey: listKey, queryFn: getRhuToDispense, retry: false });
  const catalogQuery = useQuery({
    queryKey: inventoryKey,
    queryFn: loadMedicineAvailability,
    enabled: Boolean(dispense),
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
    return (Array.isArray(queue.data) ? queue.data : []).filter(
      (row) => !q || String(row.patientName || "").toLowerCase().includes(q),
    );
  }, [queue.data, search]);
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
      await dispenseHealthRecordMedicines(dispense.id, confirmed);
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

  return (
    <PageStateWrapper
      skeleton="medicine"
      isLoading={queue.isLoading}
      isError={queue.isError}
      isFetching={queue.isFetching}
      hasData
      error={queue.error}
      onRetry={() => queue.refetch()}
      loadingMessage="Loading prescriptions to dispense…"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-neutral-600">{rows.length} of {(queue.data || []).length} visits</p>
          <div className="w-full sm:max-w-xs">
            <SearchField value={search} onChange={setSearch} placeholder="Search patient name" label="Search patients to dispense" />
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Patient</th>
                <th className="px-4 py-3 font-semibold">Visit date</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-neutral-600">
                    No prescriptions to dispense.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-neutral-100">
                    <td className="px-4 py-3 font-medium text-ink-800">{row.patientName}</td>
                    <td className="px-4 py-3 text-neutral-600">{row.visitDate || "—"}</td>
                    <td className="px-4 py-3 capitalize text-neutral-700">{row.status === "given" ? "Given" : "Pending"}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="compact" variant="secondary" onClick={() => setReview(row)}>
                        Review prescription
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
