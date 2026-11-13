import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import ModalShell from "../../../common/modals/ModalShell";
import { Button } from "../../../ui/button";
import { Input } from "../../../ui/input";
import useAccess from "../../../../hooks/useAccess";
import { getPatientLaboratoryTests, saveLaboratoryAddendum } from "../../../../services/laboratoryService";
import { formatShortDate } from "../../../../utils/patientProfile";
import {
  LABORATORY_STATUSES,
  filterPatientLaboratoryTests,
  laboratoryErrors,
  laboratorySummary,
  sortPatientLaboratoryTests,
} from "../../../../utils/laboratoryTests";
import { LaboratoryFields } from "../../health-records/LaboratoryEvidence";
import searchIcon from "../../../../assets/figma/search.svg";

const STATUS_FILTERS = ["All", ...LABORATORY_STATUSES];

function resultPreview(entry, max = 120) {
  const text = String(entry?.result || "").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function sourceLabel(entry) {
  const facility = String(entry.facilityName || "").trim();
  const visit = entry.visitDate ? formatShortDate(entry.visitDate) : "";
  const service = String(entry.serviceType || "").trim();
  return [facility, visit, service].filter(Boolean).join(" · ");
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

  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
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
  const visible = useMemo(
    () => filterPatientLaboratoryTests(entries, { status: statusFilter, search }),
    [entries, statusFilter, search],
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
    setEditing({ ...entry });
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
    const errors = laboratoryErrors([editing]);
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
        <h3 id="patient-laboratory-title" className="text-base font-bold text-[#111827]">
          Laboratory &amp; Diagnostic Tests
        </h3>
        <p className="mt-1 text-xs text-neutral-500">
          Tests from this patient&apos;s accessible BHC and RHU consultations
        </p>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter laboratory status" className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((option) => (
            <Button
              key={option}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={statusFilter === option}
              onClick={() => setStatusFilter(option)}
              className={`h-8 rounded-lg border px-2 text-xs ${statusFilter === option ? "border-neutral-500 bg-neutral-50 text-[#111827]" : "border-neutral-200 bg-white text-neutral-500"}`}
            >
              {option}{option === "All" ? ` (${entries.length})` : ""}
            </Button>
          ))}
        </div>
        <label className="relative block w-full max-w-64">
          <span className="sr-only">Search laboratory tests</span>
          <img src={searchIcon} alt="" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search laboratory tests"
            className="h-8 rounded-lg border-neutral-200 pl-9 text-xs shadow-none"
          />
        </label>
      </div>

      {query.isError ? (
        <p role="alert" className="rounded-lg border border-alert-100 bg-alert-50 px-4 py-6 text-sm text-alert-700">
          Could not load laboratory tests.{" "}
          <Button type="button" variant="link" size="sm" onClick={() => query.refetch()} className="h-auto p-0 text-alert-700 underline">
            Retry
          </Button>
        </p>
      ) : query.isPending ? (
        <p role="status" className="border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-500">
          Loading laboratory tests...
        </p>
      ) : visible.length === 0 ? (
        <p className="border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-500">
          {entries.length === 0
            ? "No laboratory or diagnostic tests recorded for this patient."
            : "No laboratory tests match this search or filter."}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden border border-neutral-200 bg-white">
          {visible.map((entry) => {
            const key = String(entry.recordId || entry.id);
            const open = expandedId === key;
            const clinicalDate = entry.examinationDate || entry.collectionDate || "";
            const preview = resultPreview(entry);
            return (
              <li key={key} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    aria-expanded={open}
                    onClick={() => setExpandedId(open ? null : key)}
                  >
                    <p className="text-[13px] font-semibold text-ink-800">{entry.testName || "Unnamed test"}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {entry.resultStatus || "Requested"}
                      {clinicalDate ? ` · ${formatShortDate(clinicalDate)}` : ""}
                      {sourceLabel(entry) ? ` · ${sourceLabel(entry)}` : ""}
                    </p>
                    {preview ? (
                      <p className="mt-1 line-clamp-2 text-xs text-neutral-600 whitespace-pre-wrap break-words">{preview}</p>
                    ) : null}
                  </button>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <Button type="button" variant="secondary" size="compact" className="rounded-none" onClick={() => openView(entry)}>
                      View Result
                    </Button>
                    {entry.canAddendum ? (
                      <Button type="button" variant="secondary" size="compact" className="rounded-none" onClick={() => openEditor(entry)}>
                        {entry.resultStatus === "Result Available" ? "Add Addendum" : "Add Result / Addendum"}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {open ? (
                  <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3 text-xs text-neutral-600">
                    <p className="whitespace-pre-wrap break-words">{laboratorySummary(entry)}</p>
                    {entry.addenda?.length > 0 ? (
                      <details>
                        <summary className="cursor-pointer font-medium">
                          Original result and {entry.addenda.length} addendum(s)
                        </summary>
                        <p className="mt-2 whitespace-pre-wrap break-words">
                          Original: {laboratorySummary(entry.original || {})}
                        </p>
                        {entry.addenda.map((item) => (
                          <div key={item.id} className="mt-2 border-l-2 border-neutral-200 pl-3">
                            <p>
                              {item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}
                              {item.createdBy ? ` · Staff #${item.createdBy}` : ""}
                              {item.reason ? ` · ${item.reason}` : ""}
                            </p>
                            <p className="whitespace-pre-wrap break-words">{laboratorySummary(item.data || {})}</p>
                          </div>
                        ))}
                      </details>
                    ) : null}
                  </div>
                ) : null}
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
            <LaboratoryFields
              entry={editing}
              prefix="laboratoryTests.0"
              errors={fieldErrors}
              disabled={busy}
              onChange={setEditing}
            />
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
