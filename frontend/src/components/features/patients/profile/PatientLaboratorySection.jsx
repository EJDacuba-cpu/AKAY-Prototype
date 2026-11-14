import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import ModalShell from "../../../common/modals/ModalShell";
import { Button } from "../../../ui/button";
import PlainStatusStamp from "../../../common/badges/PlainStatusStamp";
import ProfileCardsSkeleton from "./ProfileCardsSkeleton";
import useAccess from "../../../../hooks/useAccess";
import { getPatientLaboratoryTests, saveLaboratoryAddendum } from "../../../../services/laboratoryService";
import { formatShortDate } from "../../../../utils/patientProfile";
import {
  laboratoryErrors,
  laboratorySummary,
  sortPatientLaboratoryTests,
} from "../../../../utils/laboratoryTests";
import { bhcLaboratoryErrors } from "../../../../utils/bhcLaboratoryResults";
import { LaboratoryFields } from "../../health-records/LaboratoryEvidence";
import BhcLaboratoryFields from "../../health-records/BhcLaboratoryFields";


function resultPreview(entry, max = 120) {
  const text = String(entry?.result || "").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function sourceLabel(entry) {
  if (entry.sourceKind === "shared_monitoring") return "RHU (shared evidence)";
  const typed = String(entry.resultSource || "").trim();
  const facility = String(entry.facilityName || "").trim();
  const visit = entry.visitDate ? formatShortDate(entry.visitDate) : "";
  const service = String(entry.serviceType || "").trim();
  return [typed ? `Source: ${typed}` : "", facility, visit, service].filter(Boolean).join(" · ");
}

export default function PatientLaboratorySection({ patientId }) {
  const access = useAccess();
  const client = useQueryClient();
  const canRead = access.can("clinical.history");
  const query = useQuery({
    queryKey: ["patient-laboratory-tests", String(patientId)],
    queryFn: () => getPatientLaboratoryTests(patientId),
    enabled: Boolean(patientId && canRead),
    staleTime: 0,
  });

  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const entries = useMemo(
    () => sortPatientLaboratoryTests(Array.isArray(query.data) ? query.data : []),
    [query.data],
  );

  async function refresh() {
    await client.invalidateQueries({ queryKey: ["patient-laboratory-tests"] });
    await client.invalidateQueries({ queryKey: ["record-laboratory-tests"] });
    await query.refetch();
  }

  function openView(entry) {
    setViewing(entry);
    setError("");
  }

  function openEditor(entry) {
    setEditing(entry.facilityType === "BHC"
      ? { ...entry, resultSource: entry.resultSource || "", remarks: entry.remarks || "", resultStatus: "Result Available" }
      : { ...entry });
    setReason("");
    setError("");
    setFieldErrors({});
  }

  async function saveAddendum() {
    if (!editing || busy) return;
    if (!String(reason || "").trim()) {
      setError("Enter a reason for this laboratory result update.");
      return;
    }
    const errors = editing.facilityType === "BHC" ? bhcLaboratoryErrors([editing]) : laboratoryErrors([editing]);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    const healthRecordId = editing.healthRecordId || editing.health_record_id;
    if (!healthRecordId || !editing.recordId) {
      setError("Unable to locate the source laboratory record.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await saveLaboratoryAddendum(healthRecordId, editing, reason.trim());
      setEditing(null);
      setReason("");
      await refresh();
    } catch (failure) {
      setError(failure.message || "Unable to save laboratory result.");
    } finally {
      setBusy(false);
    }
  }

  if (!canRead) return null;

  return (
    <section aria-labelledby="patient-laboratory-title" className="mt-6">
      <div className="mb-3">
        <h3 id="patient-laboratory-title" className="text-[17px] font-bold text-ink-800">
          Laboratory &amp; Diagnostic Tests
        </h3>
        <p className="mt-1 text-xs text-neutral-500">
          Tests from this patient&apos;s accessible BHC and RHU consultations
        </p>
      </div>

      {query.isError ? (
        <div role="alert" className="care-tracking-empty flex flex-col items-center justify-center gap-3 rounded-xl border border-alert-100 bg-alert-50 p-5 text-center text-sm text-alert-700">
          <p>Could not load laboratory tests.</p>
          <Button type="button" variant="secondary" size="compact" onClick={() => query.refetch()}>Retry</Button>
        </div>
      ) : query.isPending ? (
        <ProfileCardsSkeleton label="Loading laboratory tests" />
      ) : entries.length === 0 ? (
        <p className="care-tracking-empty care-tracking-reveal flex items-center justify-center rounded-xl border border-neutral-200 bg-white p-5 text-center text-sm text-neutral-500">
          No laboratory or diagnostic tests recorded for this patient.
        </p>
      ) : (
        <ul className="care-tracking-grid care-tracking-reveal">
          {entries.map((entry) => {
            const key = String(entry.recordId || entry.id);
            const clinicalDate = entry.examinationDate || entry.collectionDate || "";
            const preview = resultPreview(entry);
            return (
              <li key={key} className="profile-record-card">
                <div className="profile-record-card__body" tabIndex={0} role="region" aria-label={(entry.testName || "Laboratory test") + " details"}>
                  <h4 className="text-sm font-semibold text-ink-800">{entry.testName || "Unnamed test"}</h4>
                  <div className="mt-2">
                    <PlainStatusStamp label={entry.resultStatus || "Requested"} tone={entry.resultStatus === "Result Available" ? "success" : entry.resultStatus === "Awaiting Result" ? "warning" : "info"} />
                  </div>
                  {clinicalDate ? <p className="mt-3 text-xs tabular-nums text-neutral-600">{formatShortDate(clinicalDate)}</p> : null}
                  {sourceLabel(entry) ? <p className="mt-2 text-xs leading-relaxed text-neutral-500">{sourceLabel(entry)}</p> : null}
                  {preview ? <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-neutral-700">{preview}</p> : null}
                </div>
                <div className="profile-record-card__footer">
                  <Button type="button" variant="secondary" size="compact" onClick={() => openView(entry)}>View Result</Button>
                  {entry.canAddendum ? (
                    <Button type="button" variant="secondary" size="compact" onClick={() => openEditor(entry)}>
                      {entry.resultStatus === "Result Available" ? "Add Addendum" : "Add Result / Addendum"}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {viewing ? (
        <ModalShell open title="Laboratory Result" size="wide" onClose={() => setViewing(null)}>
          <div className="space-y-3 text-sm text-neutral-800">
            <p className="text-xs text-neutral-500">{sourceLabel(viewing) || "Source consultation"}</p>
            <p className="whitespace-pre-wrap break-words">{laboratorySummary(viewing)}</p>
            {viewing.addenda?.length > 0 ? (
              <details className="text-xs text-neutral-600">
                <summary className="cursor-pointer font-medium">
                  Original result and {viewing.addenda.length} addendum(s)
                </summary>
                <p className="mt-2 whitespace-pre-wrap break-words">
                  Original: {laboratorySummary(viewing.original || {})}
                </p>
                {viewing.addenda.map((item) => (
                  <div key={item.id} className="mt-2 border-l-2 border-neutral-200 pl-3">
                    <p>
                      {item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}
                      {item.createdBy ? " ? Staff #" + item.createdBy : ""}
                      {item.reason ? ` · ${item.reason}` : ""}
                    </p>
                    <p className="whitespace-pre-wrap break-words">{laboratorySummary(item.data || {})}</p>
                  </div>
                ))}
              </details>
            ) : null}
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={() => setViewing(null)}>Close</Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {editing ? (
        <ModalShell open title="Laboratory Result Addendum" size="wide" onClose={() => { if (!busy) setEditing(null); }}>
          <div className="space-y-4">
            <p className="text-xs text-neutral-500">
              The finalized consultation snapshot stays preserved. This saves an authorized result addendum.
            </p>
            {editing.facilityType === "BHC" ? (
              <BhcLaboratoryFields
                entry={editing}
                prefix="laboratoryTests.0"
                errors={fieldErrors}
                disabled={busy}
                onChange={setEditing}
              />
            ) : (
              <LaboratoryFields
                entry={editing}
                prefix="laboratoryTests.0"
                errors={fieldErrors}
                disabled={busy}
                onChange={setEditing}
              />
            )}
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
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="button" variant="brand" disabled={busy} onClick={saveAddendum}>
                {busy ? "Saving…" : "Save Addendum"}
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </section>
  );
}
