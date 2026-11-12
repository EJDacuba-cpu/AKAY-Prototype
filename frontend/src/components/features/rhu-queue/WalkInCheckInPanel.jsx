import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import toast from "react-hot-toast";

import { ConnectionErrorState, SearchField } from "../../common";
import { Button } from "../../ui/button";
import useAccess from "../../../hooks/useAccess";
import { errorStateVariant } from "../../../utils/errorStateVariant";
import { getRhuPatientById } from "../../../services/patientService";
import {
  checkInExistingPatient,
  listPendingFollowUpsForCheckIn,
  listPendingReferralsForCheckIn,
  listRecentPatientsForCheckIn,
  searchPatientsForCheckIn,
} from "../../../services/rhuVisitService";
import { formatAgeSex, isSearchable, walkInKeyFor } from "../../../utils/rhuQueueView";
import { visitCheckInReview } from "../../../utils/visitCheckInReview";
import { queryKeys } from "../../../utils/queryKeys";

const SEARCH_DELAY_MS = 300;
const QUEUE_PATH = "/rhu/patients?view=queue";
const PANEL_HEIGHT = [
  "min-h-[24rem]",
  "h-[min(100%,42rem)]",
  "max-h-[min(100%,42rem)]",
  "lg:min-h-[28rem]",
  "lg:h-[min(100%,42rem)]",
  "lg:max-h-[42rem]",
].join(" ");

const panelSheet = [
  "flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200",
  "bg-white shadow-sm shadow-black/[0.02]",
  PANEL_HEIGHT,
].join(" ");

function displayPatientId(patient) {
  const raw = patient?.patientId || patient?.patient_id || patient?.id;
  if (raw == null || String(raw).trim() === "") return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits && String(Number(digits)) === digits) {
    return `PT-${digits.padStart(5, "0")}`;
  }
  return String(raw).trim();
}

function displayValue(value) {
  const text = value == null ? "" : String(value).trim();
  return text || "None";
}

/** Identity from GET /patients/:id, in the same shape as a check-in search row. */
function toCheckInRow(patient) {
  return {
    id: patient?.id ?? "",
    full_name: patient?.full_name || patient?.fullName || patient?.name || "",
    birthdate: patient?.birthdate || patient?.birthDate || "",
    barangay: patient?.barangay || "",
    age: patient?.age ?? "",
    sex: patient?.sex || "",
    philhealth_number: patient?.philhealth_number || patient?.philHealthNumber || "",
    contact_number: patient?.contact_number || patient?.contactNumber || patient?.contact || "",
    family_serial_number:
      patient?.family_serial_number || patient?.familySerialNumber || patient?.household?.serial_number || "",
    purok_area: patient?.purok_area || patient?.purokArea || patient?.purok || "",
    patient_code: displayPatientId(patient),
    active_visit_id: patient?.active_visit_id ?? null,
  };
}

function samePatient(a, b) {
  return a != null && b != null && String(a) === String(b);
}

function emptyVisitRecords() {
  return {
    patientId: null,
    loading: false,
    error: "",
    referrals: null,
    followUps: null,
  };
}

/**
 * Two-panel Visit Check-in workspace: Find Patient and Visit Review.
 */
export default function WalkInCheckInPanel({
  selectedPatientId = null,
  onClearedSelection,
  header = null,
}) {
  const access = useAccess();
  const canViewQueue = access.can("clinical.history");
  const client = useQueryClient();
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState([]);
  const [recentStatus, setRecentStatus] = useState({ loading: true, error: null });
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState({ loading: false, error: null });
  const [selected, setSelected] = useState(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [successName, setSuccessName] = useState("");
  const [visitRecords, setVisitRecords] = useState(emptyVisitRecords);
  const [recordsReload, setRecordsReload] = useState(0);
  const walkIn = useRef(null);
  const [reloads, setReloads] = useState(0);
  const [recentReloads, setRecentReloads] = useState(0);
  const latest = useRef(0);
  const searching = isSearchable(query);

  useEffect(() => {
    let cancelled = false;
    setRecentStatus({ loading: true, error: null });
    (async () => {
      try {
        const rows = await listRecentPatientsForCheckIn(8);
        if (!cancelled) {
          setRecent(rows);
          setRecentStatus({ loading: false, error: null });
        }
      } catch (error) {
        if (!cancelled) {
          setRecent([]);
          setRecentStatus({ loading: false, error });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [recentReloads]);

  useEffect(() => {
    if (!selectedPatientId) return undefined;
    let cancelled = false;
    setSelected(null);
    setVisitRecords(emptyVisitRecords());
    setSelectedLoading(true);
    setSelectedError(null);
    setSuccessName("");
    (async () => {
      try {
        const patient = await getRhuPatientById(selectedPatientId);
        if (!cancelled) {
          setSelected(toCheckInRow(patient));
          setSelectedLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setSelected(null);
          setSelectedError(error || new Error("Unable to load the registered patient."));
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
      setStatus({ loading: false, error: null });
      return undefined;
    }
    setStatus({ loading: true, error: null });
    const timer = setTimeout(async () => {
      try {
        const found = await searchPatientsForCheckIn(query.trim());
        if (request !== latest.current) return;
        setResults(found);
        setStatus({ loading: false, error: null });
      } catch (error) {
        if (request !== latest.current) return;
        setResults([]);
        setStatus({ loading: false, error });
      }
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, reloads]);

  useEffect(() => {
    const patientId = selected?.id;
    if (!patientId) {
      setVisitRecords(emptyVisitRecords());
      return undefined;
    }
    let cancelled = false;
    setVisitRecords({
      patientId,
      loading: true,
      error: "",
      referrals: null,
      followUps: null,
    });
    (async () => {
      const [referralResult, followUpResult] = await Promise.allSettled([
        listPendingReferralsForCheckIn(patientId),
        listPendingFollowUpsForCheckIn(patientId),
      ]);
      if (cancelled) return;

      const referralFailed = referralResult.status === "rejected";
      const followUpFailed = followUpResult.status === "rejected";
      if (referralFailed || followUpFailed) {
        const message = referralFailed
          ? (referralResult.reason?.message || "Unable to check visit records.")
          : (followUpResult.reason?.message || "Unable to check visit records.");
        setVisitRecords({
          patientId,
          loading: false,
          error: message,
          referrals: null,
          followUps: null,
        });
        return;
      }

      setVisitRecords({
        patientId,
        loading: false,
        error: "",
        referrals: referralResult.value,
        followUps: followUpResult.value,
      });
    })();
    return () => { cancelled = true; };
  }, [selected?.id, recordsReload]);

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
    setSelectedError(null);
    setSelectedLoading(false);
    setSelected(toCheckInRow(patient));
  }

  function resetWorkspace() {
    setQuery("");
    setResults([]);
    setStatus({ loading: false, error: null });
    setSelected(null);
    setSelectedLoading(false);
    setSelectedError(null);
    setSuccessName("");
    setVisitRecords(emptyVisitRecords());
    walkIn.current = null;
    onClearedSelection?.();
  }

  async function confirmCheckIn() {
    const recordsReady = samePatient(visitRecords.patientId, selected?.id)
      && !visitRecords.loading
      && !visitRecords.error;
    const review = visitCheckInReview({
      alreadyInQueue: Boolean(selected?.active_visit_id),
      loading: !recordsReady,
      error: visitRecords.error,
      pendingReferrals: visitRecords.referrals,
      pendingFollowUps: visitRecords.followUps,
    });
    if (
      !selected
      || selected.active_visit_id
      || saving
      || successName
      || selectedLoading
      || !review.canConfirm
    ) return;

    const patientId = selected.id;
    setSaving(true);
    try {
      walkIn.current = walkInKeyFor(walkIn.current, String(patientId));
      const visit = await checkInExistingPatient(patientId, walkIn.current.key);
      if (!samePatient(selected?.id, patientId)) return;
      const name = selected.full_name;
      walkIn.current = null;
      markInQueue(patientId, visit?.id ?? true);
      setSuccessName(name);
      await client.invalidateQueries({ queryKey: queryKeys.rhuVisits() });
    } catch (error) {
      if (!samePatient(selected?.id, patientId)) return;
      if (error?.code === "VISIT_ALREADY_ACTIVE") {
        markInQueue(patientId, error?.payload?.active_visit_id ?? true);
        await client.invalidateQueries({ queryKey: queryKeys.rhuVisits() });
        setReloads((count) => count + 1);
      } else if (error?.code === "VISIT_PENDING_REFERRAL") {
        setRecordsReload((count) => count + 1);
        toast.error(error.message || "This patient has a pending BHC referral.");
      } else {
        toast.error(error.message || "Unable to check this patient in.");
      }
    } finally {
      setSaving(false);
    }
  }

  const recordsReady = samePatient(visitRecords.patientId, selected?.id);
  const review = visitCheckInReview({
    alreadyInQueue: Boolean(selected?.active_visit_id),
    loading: Boolean(selected) && (!recordsReady || visitRecords.loading),
    error: recordsReady && !visitRecords.loading ? visitRecords.error : "",
    pendingReferrals: recordsReady && !visitRecords.loading && !visitRecords.error
      ? visitRecords.referrals
      : null,
    pendingFollowUps: recordsReady && !visitRecords.loading && !visitRecords.error
      ? visitRecords.followUps
      : null,
  });
  const canConfirm = Boolean(selected)
    && !saving
    && !successName
    && !selectedLoading
    && review.canConfirm;
  const listRows = searching ? results : recent;
  const listLabel = searching ? "Matching patients" : "Available for Check-in";

  if (recentStatus.error && !searching && !selectedPatientId) {
    return (
      <ConnectionErrorState
        fullPage
        variant={errorStateVariant(recentStatus.error)}
        onRetry={() => setRecentReloads((count) => count + 1)}
        retrying={recentStatus.loading}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {header}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2 lg:items-stretch">
      <section className={panelSheet} aria-labelledby="visit-check-in-find-heading">
        <div className="shrink-0 border-b border-neutral-100 px-3.5 py-3 sm:px-4">
          <h2 id="visit-check-in-find-heading" className="text-sm font-semibold text-ink-800">Find Patient</h2>
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
            onRetrySearch={() => setReloads((count) => count + 1)}
            onRetryRecent={() => setRecentReloads((count) => count + 1)}
          />
        </div>
      </section>

      <section className={panelSheet} aria-labelledby="visit-review-heading">
        <div className="shrink-0 border-b border-neutral-100 px-3.5 py-3 sm:px-4">
          <h2 id="visit-review-heading" className="text-sm font-semibold text-ink-800">Visit Review</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Verify identity, then add the patient to Today's Queue.
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
            <ConnectionErrorState
              size="compact"
              variant={errorStateVariant(selectedError)}
              onRetry={() => {
                if (!selectedPatientId) return;
                setSelectedError(null);
                setSelectedLoading(true);
                getRhuPatientById(selectedPatientId)
                  .then((patient) => {
                    setSelected(toCheckInRow(patient));
                    setSelectedLoading(false);
                  })
                  .catch((error) => {
                    setSelected(null);
                    setSelectedError(error || new Error("Unable to load the registered patient."));
                    setSelectedLoading(false);
                  });
              }}
              retrying={selectedLoading}
            />
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

              <dl className="mt-4 grid gap-x-4 gap-y-3 sm:grid-cols-2">
                <DetailField label="Birthdate" value={displayValue(selected.birthdate)} />
                <DetailField label="Patient ID" value={displayValue(selected.patient_code)} mono />
                <DetailField label="Family Serial Number" value={displayValue(selected.family_serial_number)} mono />
                <DetailField label="PhilHealth Number" value={displayValue(selected.philhealth_number)} />
                <DetailField label="Contact Number" value={displayValue(selected.contact_number)} />
                <DetailField label="Barangay" value={displayValue(selected.barangay)} />
                <DetailField label="Purok / Area" value={displayValue(selected.purok_area)} className="sm:col-span-2" />
              </dl>

              <div className="mt-4">
                <VisitStatus review={review} />
              </div>

              <div className="mt-auto border-t border-neutral-100 pt-3">
                <DetailsAction
                  review={review}
                  canConfirm={canConfirm}
                  saving={saving}
                  onConfirm={confirmCheckIn}
                  onRetry={() => setRecordsReload((count) => count + 1)}
                />
              </div>
            </>
          )}
        </div>
      </section>
      </div>
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
  onRetrySearch,
  onRetryRecent,
}) {
  if (searching) {
    if (status.error) {
      return (
        <ConnectionErrorState
          size="compact"
          variant={errorStateVariant(status.error)}
          onRetry={onRetrySearch}
          retrying={status.loading}
        />
      );
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
      return (
        <ConnectionErrorState
          size="compact"
          variant={errorStateVariant(recentStatus.error)}
          onRetry={onRetryRecent}
          retrying={recentStatus.loading}
        />
      );
    }
    if (recentStatus.loading) {
      return <p role="status" className="py-5 text-center text-[13px] text-neutral-500">Loading recent patients...</p>;
    }
    if (listRows.length === 0) {
      return (
        <p className="py-5 text-center text-[13px] text-neutral-500">
          No patients available for check-in yet. Search above or register a new patient.
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
        Choose a recent record or search result to review identity and check in.
      </p>
    </div>
  );
}

function DetailField({ label, value, mono = false, className = "" }) {
  return (
    <div className={["min-w-0", className].filter(Boolean).join(" ")}>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd
        className={[
          "mt-1 truncate text-[13px] text-ink-800",
          mono ? "font-mono tabular-nums" : "",
        ].filter(Boolean).join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

function VisitStatus({ review }) {
  const queued = review.kind === "already_in_queue";
  const failed = review.kind === "error";
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-[13px]">
        <span
          aria-hidden="true"
          className={[
            "h-2 w-2 shrink-0 rounded-full",
            queued ? "bg-success-500" : failed ? "bg-danger" : "bg-info-500",
          ].join(" ")}
        />
        <span className={queued ? "font-medium text-success-700" : failed ? "text-danger" : "text-neutral-700"}>
          {review.statusLabel}
        </span>
      </div>
      {review.statusDetail ? (
        <p className="pl-4 text-[12px] text-neutral-600">{review.statusDetail}</p>
      ) : null}
      {review.followUpDetail ? (
        <p className="pl-4 text-[12px] text-neutral-600">{review.followUpDetail}</p>
      ) : null}
    </div>
  );
}

function DetailsAction({
  review,
  canConfirm,
  saving,
  onConfirm,
  onRetry,
}) {
  if (review.kind === "already_in_queue") {
    return (
      <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[13px] font-medium text-neutral-700">
        Already in Today's Queue
      </p>
    );
  }
  if (review.loading) {
    return null;
  }
  if (review.kind === "error") {
    return (
      <div className="space-y-2">
        <p role="alert" className="text-[13px] text-danger">{review.error}</p>
        <Button type="button" variant="secondary" onClick={onRetry}>Try again</Button>
      </div>
    );
  }
  if (review.kind === "pending_referral") {
    const links = review.referralLinks || [];
    if (links.length === 1) {
      return (
        <Button asChild variant="brand" className="w-full sm:w-auto">
          <Link to={links[0].href}>View Incoming Referral</Link>
        </Button>
      );
    }
    if (links.length > 1) {
      return (
        <ul className="space-y-2">
          {links.map((link, index) => (
            <li key={`${link.trackingId}-${index}`}>
              <Link
                to={link.href}
                className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 text-[13px] transition-colors hover:bg-neutral-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink-800">{link.trackingId}</span>
                  <span className="block truncate text-neutral-600">{link.sendingBhc}</span>
                </span>
                <span className="shrink-0 font-medium text-brand-700">View Incoming Referral</span>
              </Link>
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p className="text-[13px] text-neutral-700">
        Verify arrival via Incoming Referrals before check-in.
      </p>
    );
  }
  return (
    <Button
      type="button"
      variant="brand"
      className="w-full sm:w-auto"
      disabled={!canConfirm}
      onClick={onConfirm}
    >
      {saving ? "Adding to queue..." : "Add to Today's Queue"}
    </Button>
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
