import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { ConfirmationModal, SearchField } from "../../common";
import { Button } from "../../ui/button";
import { getRhuPatientById } from "../../../services/patientService";
import { checkInExistingPatient, searchPatientsForCheckIn } from "../../../services/rhuVisitService";
import { formatAgeSex, isSearchable, walkInKeyFor } from "../../../utils/rhuQueueView";
import { queryKeys } from "../../../utils/queryKeys";

const SEARCH_DELAY_MS = 300;

/** Identity from GET /patients/:id, in the same shape as a check-in search row. */
function toCheckInRow(patient) {
  return {
    id: patient?.id ?? "",
    full_name: patient?.full_name || patient?.fullName || patient?.name || "",
    birthdate: patient?.birthdate || "",
    barangay: patient?.barangay || "",
    age: patient?.age ?? "",
    sex: patient?.sex || "",
    philhealth_number: patient?.philhealth_number || patient?.philHealthNumber || "",
    contact_number: patient?.contact_number || patient?.contactNumber || "",
    active_visit_id: patient?.active_visit_id ?? null,
  };
}

/**
 * Search existing patients and check one into today's queue.
 * Shared by the Walk-in Check-in page.
 */
export default function WalkInCheckInPanel({
  selectedPatientId = null,
  onClearedSelection,
  onCheckedIn,
}) {
  const client = useQueryClient();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState({ loading: false, error: "" });
  const [savingId, setSavingId] = useState(null);
  const [pending, setPending] = useState(null);
  const [selected, setSelected] = useState(null);
  const [selectedError, setSelectedError] = useState("");
  // One key per patient: a retry for the same patient is recognised, another patient never inherits it.
  const walkIn = useRef(null);
  const [reloads, setReloads] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    if (!selectedPatientId) {
      setSelected(null);
      setSelectedError("");
      return undefined;
    }
    let cancelled = false;
    setSelected(null);
    setSelectedError("");
    (async () => {
      try {
        const patient = await getRhuPatientById(selectedPatientId);
        if (!cancelled) setSelected(toCheckInRow(patient));
      } catch {
        if (!cancelled) setSelectedError("Unable to load the registered patient.");
      }
    })();
    return () => { cancelled = true; };
  }, [selectedPatientId]);

  useEffect(() => {
    const request = ++latest.current;
    if (!isSearchable(query)) {
      setResults([]);
      setStatus({ loading: false, error: "" });
      return undefined;
    }
    setStatus({ loading: true, error: "" });
    const timer = setTimeout(async () => {
      try {
        const found = await searchPatientsForCheckIn(query.trim());
        // A slower, older answer must never replace a newer one.
        if (request !== latest.current) return;
        setResults(found);
        setStatus({ loading: false, error: "" });
      } catch (error) {
        if (request !== latest.current) return;
        setResults([]);
        setStatus({ loading: false, error: error.message || "Unable to search patients." });
      }
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, reloads]);

  // Swallow Escape on the confirm so it never closes a parent shell behind it.
  useEffect(() => {
    if (!pending) return undefined;
    function onKeyDown(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (savingId === null) setPending(null);
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [pending, savingId]);

  function markInQueue(patientId, visitId) {
    const apply = (row) => (
      String(row.id) === String(patientId) ? { ...row, active_visit_id: visitId ?? true } : row
    );
    setResults((rows) => rows.map(apply));
    setSelected((current) => (current ? apply(current) : current));
  }

  async function checkIn(patient) {
    setSavingId(patient.id);
    try {
      walkIn.current = walkInKeyFor(walkIn.current, String(patient.id));
      const visit = await checkInExistingPatient(patient.id, walkIn.current.key);
      toast.success(`${patient.full_name} added to today's queue.`);
      walkIn.current = null;
      markInQueue(patient.id, visit?.id ?? true);
      await client.invalidateQueries({ queryKey: queryKeys.rhuVisits() });
      onCheckedIn?.();
    } catch (error) {
      if (error?.code === "VISIT_ALREADY_ACTIVE") {
        // Another desk was faster; the outcome is the one we wanted. Show the truth instead of an error.
        markInQueue(patient.id, true);
        await client.invalidateQueries({ queryKey: queryKeys.rhuVisits() });
        setReloads((count) => count + 1);
      } else {
        toast.error(error.message || "Unable to check this patient in.");
      }
    } finally {
      setSavingId(null);
    }
  }

  async function confirmPending() {
    if (!pending || savingId !== null) return;
    await checkIn(pending);
    setPending(null);
  }

  const busy = savingId !== null || pending !== null;

  return (
    <div className="space-y-4">
      {selectedPatientId ? (
        <section
          aria-label="Selected patient"
          className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm shadow-black/[0.02]"
        >
          {selectedError ? (
            <p role="alert" className="px-3.5 py-5 text-center text-[13px] text-danger sm:px-4">{selectedError}</p>
          ) : selected ? (
            <ul>
              <ResultRow patient={selected} saving={savingId === selected.id} busy={busy} onCheckIn={() => setPending(selected)} />
            </ul>
          ) : (
            <p role="status" className="px-3.5 py-5 text-center text-[13px] text-neutral-500 sm:px-4">Loading patient...</p>
          )}
          {onClearedSelection ? (
            <div className="flex justify-end border-t border-neutral-100 px-3.5 py-2 sm:px-4">
              <Button type="button" variant="ghost" size="compact" disabled={busy} onClick={onClearedSelection}>
                Clear selected patient
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm shadow-black/[0.02]">
        <div className="border-b border-neutral-100 px-3.5 py-3 sm:px-4">
          <h2 className="text-sm font-semibold text-ink-800">Find a Patient</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Search existing records before registering a new patient.
          </p>
        </div>
        <div className="space-y-3 px-3.5 py-3 sm:px-4">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Name, PhilHealth number or contact number"
            label="Search patients to check in"
            className="max-w-xl"
          />
          <div aria-live="polite">
            {status.error ? (
              <p role="alert" className="py-5 text-center text-[13px] text-danger">{status.error}</p>
            ) : !isSearchable(query) ? (
              <p className="py-5 text-center text-[13px] text-neutral-500">
                Type at least two characters to search this RHU's patients.
              </p>
            ) : status.loading ? (
              <p role="status" className="py-5 text-center text-[13px] text-neutral-500">Searching...</p>
            ) : results.length === 0 ? (
              <p className="py-5 text-center text-[13px] text-neutral-500">
                No matching patient. Use Register New Patient above if they are new.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200">
                {results.map((patient) => (
                  <ResultRow
                    key={patient.id}
                    patient={patient}
                    saving={savingId === patient.id}
                    busy={busy}
                    onCheckIn={() => setPending(patient)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {pending ? createPortal(
        <ConfirmationModal
          open
          title="Check in this patient?"
          description={`Check in ${pending.full_name} to today's queue.`}
          confirmText="Check in"
          cancelText="Cancel"
          tone="plain"
          loading={savingId !== null}
          loadingText="Checking in..."
          onConfirm={confirmPending}
          onCancel={() => { if (savingId === null) setPending(null); }}
        />,
        document.body,
      ) : null}
    </div>
  );
}

function ResultRow({ patient, saving, busy, onCheckIn }) {
  const details = [
    formatAgeSex(patient),
    patient.birthdate,
    patient.philhealth_number,
    patient.contact_number,
    patient.barangay,
  ].filter(Boolean).join(" · ");
  return (
    <li className="flex min-h-14 items-center justify-between gap-3 px-3 py-2 sm:px-3.5">
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[13px] font-semibold text-neutral-900">{patient.full_name}</p>
        {details ? <p className="mt-0.5 truncate text-[12px] text-neutral-500">{details}</p> : null}
      </div>
      {patient.active_visit_id ? (
        <span className="shrink-0 text-[12px] font-medium text-neutral-600">Already in today's queue</span>
      ) : (
        <Button type="button" variant="secondary" size="compact" disabled={busy} onClick={onCheckIn}>
          {saving ? "Checking in..." : "Check in"}
        </Button>
      )}
    </li>
  );
}
