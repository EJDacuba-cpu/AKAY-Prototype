import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import toast from "react-hot-toast";

import { SearchField } from "../../common";
import { Button } from "../../ui/button";
import useAccess from "../../../hooks/useAccess";
import { getRhuPatientById } from "../../../services/patientService";
import {
  checkInExistingPatient,
  listRecentPatientsForCheckIn,
  searchPatientsForCheckIn,
} from "../../../services/rhuVisitService";
import { formatAgeSex, isSearchable, walkInKeyFor } from "../../../utils/rhuQueueView";
import { queryKeys } from "../../../utils/queryKeys";

const SEARCH_DELAY_MS = 300;
const QUEUE_PATH = "/rhu/patients?view=queue";
const PANEL_HEIGHT = "h-[min(100%,26rem)] min-h-[22rem] lg:h-[25rem] lg:min-h-[25rem]";

const panelSheet = [
  "flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200",
  "bg-white shadow-sm shadow-black/[0.02]",
  PANEL_HEIGHT,
].join(" ");

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

function samePatient(a, b) {
  return a != null && b != null && String(a) === String(b);
}

/**
 * Two-panel walk-in workspace: Find Patient (search + select) and Check-in Details (verify + confirm).
 */
export default function WalkInCheckInPanel({
  selectedPatientId = null,
  onClearedSelection,
  onCheckedIn,
}) {
  const access = useAccess();
  const canViewQueue = access.can("clinical.history");
  const client = useQueryClient();
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState([]);
  const [recentStatus, setRecentStatus] = useState({ loading: true, error: "" });
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState({ loading: false, error: "" });
  const [selected, setSelected] = useState(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState("");
  const [saving, setSaving] = useState(false);
  const [successName, setSuccessName] = useState("");
  const walkIn = useRef(null);
  const [reloads, setReloads] = useState(0);
  const latest = useRef(0);
  const searching = isSearchable(query);

  useEffect(() => {
    let cancelled = false;
    setRecentStatus({ loading: true, error: "" });
    (async () => {
      try {
        const rows = await listRecentPatientsForCheckIn(8);
        if (!cancelled) {
          setRecent(rows);
          setRecentStatus({ loading: false, error: "" });
        }
      } catch (error) {
        if (!cancelled) {
          setRecent([]);
          setRecentStatus({ loading: false, error: error.message || "Unable to load recent patients." });
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedPatientId) return undefined;
    let cancelled = false;
    setSelectedLoading(true);
    setSelectedError("");
    setSuccessName("");
    (async () => {
      try {
        const patient = await getRhuPatientById(selectedPatientId);
        if (!cancelled) {
          setSelected(toCheckInRow(patient));
          setSelectedLoading(false);
        }
      } catch {
        if (!cancelled) {
          setSelected(null);
          setSelectedError("Unable to load the registered patient.");
          setSelectedLoading(false);
        }
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

  function markInQueue(patientId, visitId) {
    const apply = (row) => (
      samePatient(row.id, patientId) ? { ...row, active_visit_id: visitId ?? true } : row
    );
    setResults((rows) => rows.map(apply));
    setRecent((rows) => rows.map(apply));
    setSelected((current) => (current ? apply(current) : current));
  }

  function selectPatient(patient) {
    setSuccessName("");
    setSelectedError("");
    setSelectedLoading(false);
    setSelected(toCheckInRow(patient));
  }

  function resetWorkspace() {
    setQuery("");
    setResults([]);
    setStatus({ loading: false, error: "" });
    setSelected(null);
    setSelectedLoading(false);
    setSelectedError("");
    setSuccessName("");
    walkIn.current = null;
    onClearedSelection?.();
  }

  async function confirmCheckIn() {
    if (!selected || selected.active_visit_id || saving || successName) return;
    setSaving(true);
    try {
      walkIn.current = walkInKeyFor(walkIn.current, String(selected.id));
      const visit = await checkInExistingPatient(selected.id, walkIn.current.key);
      const name = selected.full_name;
      walkIn.current = null;
      markInQueue(selected.id, visit?.id ?? true);
      setSuccessName(name);
      await client.invalidateQueries({ queryKey: queryKeys.rhuVisits() });
      onCheckedIn?.();
    } catch (error) {
      if (error?.code === "VISIT_ALREADY_ACTIVE") {
        markInQueue(selected.id, true);
        await client.invalidateQueries({ queryKey: queryKeys.rhuVisits() });
        setReloads((count) => count + 1);
      } else {
        toast.error(error.message || "Unable to check this patient in.");
      }
    } finally {
      setSaving(false);
    }
  }

  const alreadyInQueue = Boolean(selected?.active_visit_id);
  const canConfirm = Boolean(selected) && !alreadyInQueue && !saving && !successName && !selectedLoading;
  const listRows = searching ? results : recent;
  const listLabel = searching ? "Matching patients" : "Recent Patient Records";

  return (
    <div className="grid min-h-0 gap-4 lg:grid-cols-2 lg:items-stretch">
      <section className={panelSheet} aria-labelledby="walk-in-find-heading">
        <div className="shrink-0 border-b border-neutral-100 px-3.5 py-3 sm:px-4">
          <h2 id="walk-in-find-heading" className="text-sm font-semibold text-ink-800">Find Patient</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Search by name, PhilHealth number, or contact number.
          </p>
        </div>

        <div className="shrink-0 border-b border-neutral-100 px-3.5 py-3 sm:px-4">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Name, PhilHealth number or contact number"
            label="Search patients to check in"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3 sm:px-4" aria-live="polite">
          <PatientListBody
            searching={searching}
            status={status}
            recentStatus={recentStatus}
            listRows={listRows}
            listLabel={listLabel}
            selectedId={selected?.id}
            onSelect={selectPatient}
          />
        </div>
      </section>

      <section className={panelSheet} aria-labelledby="walk-in-details-heading">
        <div className="shrink-0 border-b border-neutral-100 px-3.5 py-3 sm:px-4">
          <h2 id="walk-in-details-heading" className="text-sm font-semibold text-ink-800">Check-in Details</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Verify identity, then confirm check-in to Today's Queue.
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5 py-4 sm:px-4">
          {successName ? (
            <SuccessState
              name={successName}
              canViewQueue={canViewQueue}
              onCheckInAnother={resetWorkspace}
            />
          ) : selectedLoading ? (
            <p role="status" className="m-auto py-6 text-center text-[13px] text-neutral-500">Loading patient...</p>
          ) : selectedError ? (
            <p role="alert" className="m-auto py-6 text-center text-[13px] text-danger">{selectedError}</p>
          ) : !selected ? (
            <EmptySelectionState />
          ) : (
            <>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold tracking-tight text-ink-800">{selected.full_name}</p>
                <p className="mt-1 text-[13px] text-neutral-600">
                  {[formatAgeSex(selected), selected.barangay].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>

              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <DetailField label="Birthdate" value={selected.birthdate || "—"} />
                <DetailField label="PhilHealth number" value={selected.philhealth_number || "—"} />
                <DetailField label="Contact number" value={selected.contact_number || "—"} />
                <DetailField label="Barangay" value={selected.barangay || "—"} />
              </dl>

              <div className="mt-4">
                <CheckInStatus alreadyInQueue={alreadyInQueue} />
              </div>

              <div className="mt-auto border-t border-neutral-100 pt-3">
                {alreadyInQueue ? (
                  <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[13px] font-medium text-neutral-700">
                    Already Checked In
                  </p>
                ) : (
                  <Button
                    type="button"
                    variant="brand"
                    className="w-full sm:w-auto"
                    disabled={!canConfirm}
                    onClick={confirmCheckIn}
                  >
                    {saving ? "Checking in..." : "Confirm Check-in"}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function PatientListBody({
  searching,
  status,
  recentStatus,
  listRows,
  listLabel,
  selectedId,
  onSelect,
}) {
  if (searching) {
    if (status.error) {
      return <p role="alert" className="py-5 text-center text-[13px] text-danger">{status.error}</p>;
    }
    if (status.loading) {
      return <p role="status" className="py-5 text-center text-[13px] text-neutral-500">Searching...</p>;
    }
    if (listRows.length === 0) {
      return (
        <p className="py-5 text-center text-[13px] text-neutral-500">
          No matching patient. Use Register New Patient if they are new.
        </p>
      );
    }
  } else {
    if (recentStatus.error) {
      return <p role="alert" className="py-5 text-center text-[13px] text-danger">{recentStatus.error}</p>;
    }
    if (recentStatus.loading) {
      return <p role="status" className="py-5 text-center text-[13px] text-neutral-500">Loading recent patients...</p>;
    }
    if (listRows.length === 0) {
      return (
        <p className="py-5 text-center text-[13px] text-neutral-500">
          No recent patient records yet. Search above or register a new patient.
        </p>
      );
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">{listLabel}</p>
      <ul className="overflow-hidden rounded-lg border border-neutral-200" role="listbox" aria-label={listLabel}>
        {listRows.map((patient) => {
          const isSelected = samePatient(selectedId, patient.id);
          const secondary = [formatAgeSex(patient), patient.barangay].filter(Boolean).join(" · ");
          return (
            <li key={patient.id} role="option" aria-selected={isSelected} className="border-b border-neutral-100 last:border-b-0">
              <button
                type="button"
                onClick={() => onSelect(patient)}
                className={[
                  "flex w-full min-h-14 items-center gap-3 px-3 py-2 text-left transition-colors sm:px-3.5",
                  isSelected
                    ? "bg-brand-50 ring-1 ring-inset ring-brand-600/25"
                    : "hover:bg-neutral-50",
                ].join(" ")}
              >
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[13px] font-semibold text-neutral-900">{patient.full_name}</p>
                  {secondary ? (
                    <p className="mt-0.5 truncate text-[12px] text-neutral-500">{secondary}</p>
                  ) : null}
                </div>
                {patient.active_visit_id ? (
                  <span className="shrink-0 text-[11px] font-medium text-neutral-500">In queue</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EmptySelectionState() {
  return (
    <div className="m-auto flex max-w-[16rem] flex-col items-center px-2 py-6 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
        <UserRound size={22} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <p className="mt-3 text-[14px] font-semibold text-ink-800">No patient selected</p>
      <p className="mt-1 text-[13px] text-neutral-500">
        Choose a recent record or search result to review identity and confirm check-in.
      </p>
    </div>
  );
}

function DetailField({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-1 truncate text-[13px] text-ink-800">{value}</dd>
    </div>
  );
}

function CheckInStatus({ alreadyInQueue }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <span
        aria-hidden="true"
        className={[
          "h-2 w-2 shrink-0 rounded-full",
          alreadyInQueue ? "bg-success-500" : "bg-info-500",
        ].join(" ")}
      />
      <span className={alreadyInQueue ? "font-medium text-success-700" : "text-neutral-700"}>
        {alreadyInQueue ? "Already in Today's Queue" : "Ready to check in"}
      </span>
    </div>
  );
}

function SuccessState({ name, canViewQueue, onCheckInAnother }) {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-success-500" />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-ink-800">Checked in successfully</p>
          <p className="mt-1 text-[13px] text-neutral-600">
            {name} was added to Today's Queue and is waiting.
          </p>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
        <Button type="button" variant="brand" onClick={onCheckInAnother}>
          Check In Another Patient
        </Button>
        {canViewQueue ? (
          <Link
            to={QUEUE_PATH}
            className="inline-flex h-9 items-center rounded-full px-3 text-[13px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
          >
            View Today's Queue
          </Link>
        ) : null}
      </div>
    </div>
  );
}
