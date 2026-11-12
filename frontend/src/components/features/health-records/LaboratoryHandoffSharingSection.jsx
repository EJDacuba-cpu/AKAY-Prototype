import { useMemo, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import ModalShell from "../../common/modals/ModalShell";
import { Button } from "../../ui/button";
import useAccess from "../../../hooks/useAccess";
import {
  getLaboratoryHandoffs,
  getPatientLaboratoryTests,
  shareLaboratoryEvidence,
} from "../../../services/laboratoryService";
import { LaboratoryEvidencePicker } from "./LaboratoryEvidence";

const SHAREABLE_STATUSES = ["pending_review", "linkage_needed", "accepted_awaiting_first_visit", "monitoring_active"];

/**
 * Restores RHU "Update Shared Evidence" for active monitoring handoffs from
 * Care & Programs (patient-wide labs) without remounting Health Record Details.
 */
export default function LaboratoryHandoffSharingSection({ patientId, recordIds = [] }) {
  const access = useAccess();
  const client = useQueryClient();
  const canShare = access.can("consultations.finalize");
  const uniqueRecordIds = useMemo(
    () => [...new Set((recordIds || []).map((id) => Number(id) || id).filter(Boolean))],
    [recordIds],
  );

  const history = useQuery({
    queryKey: ["patient-laboratory-tests", String(patientId)],
    queryFn: () => getPatientLaboratoryTests(patientId),
    enabled: Boolean(patientId && canShare),
  });

  const handoffQueries = useQueries({
    queries: uniqueRecordIds.map((recordId) => ({
      queryKey: ["record-laboratory-handoffs", String(recordId)],
      queryFn: () => getLaboratoryHandoffs(recordId),
      enabled: Boolean(canShare && recordId),
    })),
  });

  const [sharing, setSharing] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handoffs = useMemo(() => {
    const rows = [];
    for (const query of handoffQueries) {
      for (const handoff of query.data || []) {
        if (SHAREABLE_STATUSES.includes(handoff.status)) rows.push(handoff);
      }
    }
    const seen = new Set();
    return rows.filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
  }, [handoffQueries]);

  if (!canShare || uniqueRecordIds.length === 0) return null;
  if (handoffs.length === 0 && !handoffQueries.some((query) => query.isPending)) return null;

  async function refreshHandoffs() {
    await Promise.all(handoffQueries.map((query) => query.refetch()));
    await client.invalidateQueries({ queryKey: ["patient-laboratory-tests"] });
    await history.refetch();
  }

  async function saveSharing() {
    if (!sharing || busy) return;
    if (!reason.trim()) {
      setError("Enter a reason for this sharing update.");
      return;
    }
    if (!sharing.confirmed) {
      setError("Confirm the evidence sharing update.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await shareLaboratoryEvidence(sharing.id, sharing.selected, reason.trim(), sharing.sharingRevision);
      setSharing(null);
      setReason("");
      await refreshHandoffs();
    } catch (failure) {
      setError(failure.message || "Unable to update shared laboratory evidence.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-2 border border-neutral-200 bg-white p-4" data-testid="laboratory-handoff-sharing">
      <h4 className="text-xs font-semibold text-ink-900">BHC monitoring evidence sharing</h4>
      <p className="text-xs text-neutral-500">
        Addenda and new attachments remain private until explicitly shared with an active monitoring handoff.
      </p>
      {handoffQueries.some((query) => query.isPending) ? (
        <p role="status" className="text-xs text-neutral-500">Loading monitoring handoffs…</p>
      ) : null}
      {handoffs.map((handoff) => (
        <div key={handoff.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600">
          <span>
            {handoff.condition || "Condition"} → {handoff.receivingBhc || "BHC"} · {(handoff.evidence || []).length} shared
          </span>
          <Button
            type="button"
            variant="secondary"
            size="compact"
            disabled={history.isPending || history.isError || busy}
            onClick={() => {
              setSharing({
                ...handoff,
                selected: (handoff.evidence || []).map((entry) => ({
                  reference: `record:${entry.recordId}`,
                  version: entry.version,
                  attachmentIds: (entry.attachments || []).map((file) => file.id).filter(Boolean),
                })),
                confirmed: false,
              });
              setReason("");
              setError("");
            }}
          >
            Update Shared Evidence
          </Button>
        </div>
      ))}

      {sharing ? (
        <ModalShell open title="Update Shared Laboratory Evidence" size="wide" onClose={() => { if (!busy) setSharing(null); }}>
          <div className="space-y-4">
            <p className="text-xs text-neutral-500">
              The finalized clinical assessment and previously recorded results remain preserved. Only the selected tests are shared with this handoff.
            </p>
            <LaboratoryEvidencePicker
              options={(history.data || []).map((entry) => ({ ...entry, reference: `record:${entry.recordId}` }))}
              selected={sharing.selected}
              confirmed={sharing.confirmed}
              disabled={busy}
              loading={history.isFetching}
              loadError={history.isError}
              onRefresh={async () => {
                await history.refetch();
                await refreshHandoffs();
                const refreshed = handoffQueries.flatMap((query) => query.data || []);
                setSharing((current) => {
                  if (!current) return null;
                  const latest = refreshed.find((row) => row.id === current.id);
                  return {
                    ...current,
                    sharingRevision: latest?.sharingRevision ?? current.sharingRevision,
                    confirmed: false,
                  };
                });
              }}
              onChange={(selected, confirmed) => setSharing({ ...sharing, selected, confirmed })}
            />
            {sharing.selected.length === 0 ? (
              <label className="flex gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={sharing.confirmed}
                  onChange={(event) => setSharing({ ...sharing, confirmed: event.target.checked })}
                />
                I confirm withdrawing all shared laboratory evidence from this handoff.
              </label>
            ) : null}
            <label className="block text-xs font-medium text-neutral-700">
              Reason *
              <textarea
                rows={2}
                value={reason}
                maxLength={2000}
                disabled={busy}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm"
              />
            </label>
            {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setSharing(null)}>Cancel</Button>
              <Button type="button" variant="brand" disabled={busy} onClick={saveSharing}>
                {busy ? "Saving…" : "Confirm Sharing Update"}
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
