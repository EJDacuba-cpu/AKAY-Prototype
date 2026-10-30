import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { SearchField } from "../../common";
import ModalShell from "../../common/modals/ModalShell";
import { Button } from "../../ui/button";
import { checkInExistingPatient, searchPatientsForCheckIn } from "../../../services/rhuVisitService";
import { formatAgeSex, isSearchable, walkInKeyFor } from "../../../utils/rhuQueueView";
import { queryKeys } from "../../../utils/queryKeys";

const SEARCH_DELAY_MS = 300;

/**
 * Check a walk-in into today's queue: search first so a returning patient keeps one record (D5), then
 * either check the match in or register a new patient. Mounted only while open, so every opening starts
 * clean with its own check-in key.
 */
export default function WalkInCheckInModal({ onClose, registerPath }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState({ loading: false, error: "" });
  const [savingId, setSavingId] = useState(null);
  // One key per patient: a retry for the same patient is recognised, another patient never inherits it.
  const walkIn = useRef(null);
  const [reloads, setReloads] = useState(0);
  const latest = useRef(0);

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

  async function checkIn(patient) {
    setSavingId(patient.id);
    try {
      walkIn.current = walkInKeyFor(walkIn.current, patient.id);
      await checkInExistingPatient(patient.id, walkIn.current.key);
      toast.success(`${patient.full_name} added to today's queue.`);
      walkIn.current = null;
      await client.invalidateQueries({ queryKey: queryKeys.rhuVisits() });
      onClose();
    } catch (error) {
      if (error?.code === "VISIT_ALREADY_ACTIVE") {
        // Another desk was faster; the outcome is the one we wanted. Show the truth instead of an error.
        await client.invalidateQueries({ queryKey: queryKeys.rhuVisits() });
        setReloads((count) => count + 1);
      } else {
        toast.error(error.message || "Unable to check this patient in.");
      }
    } finally {
      setSavingId(null);
    }
  }

  return (
    <ModalShell
      title="Check in walk-in patient"
      subtitle="Search first, so a returning patient keeps one record."
      size="lg"
      onClose={onClose}
      closeDisabled={savingId !== null}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={savingId !== null}>Cancel</Button>
          <Button type="button" variant="secondary" disabled={savingId !== null} onClick={() => navigate(registerPath)}>
            Register new patient
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Name, PhilHealth number or contact number"
          label="Search patients to check in"
        />
        <div aria-live="polite" className="min-h-[200px]">
          {status.error ? (
            <p role="alert" className="py-8 text-center text-[13px] text-danger">{status.error}</p>
          ) : !isSearchable(query) ? (
            <p className="py-8 text-center text-[13px] text-neutral-500">Type at least two characters to search this RHU's patients.</p>
          ) : status.loading ? (
            <p role="status" className="py-8 text-center text-[13px] text-neutral-500">Searching...</p>
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-neutral-500">No matching patient. Register them as a new patient.</p>
          ) : (
            <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
              {results.map((patient) => (
                <ResultRow key={patient.id} patient={patient} saving={savingId === patient.id} busy={savingId !== null} onCheckIn={() => checkIn(patient)} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

function ResultRow({ patient, saving, busy, onCheckIn }) {
  const details = [formatAgeSex(patient), patient.birthdate, patient.barangay].filter(Boolean).join(" · ");
  return (
    <li className="flex min-h-14 items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[13px] font-semibold text-neutral-900">{patient.full_name}</p>
        {details && <p className="mt-0.5 truncate text-[12px] text-neutral-500">{details}</p>}
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
