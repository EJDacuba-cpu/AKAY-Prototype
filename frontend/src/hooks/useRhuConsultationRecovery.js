import { useEffect, useRef, useState } from "react";
import { getHealthRecordDraft, lookupHealthRecordDraft, discardHealthRecordDraft, transitionDraft } from "../services/healthRecordDraftService";
import {
  lookupRhuRecovery,
  resumeRhuRecovery,
  discardRhuRecovery,
  takeoverRhuRecovery,
} from "../utils/rhuDraftResume";
import {
  ownershipFromDraft,
  ownershipFromProblem,
  isEditorLeaseConflict,
} from "../utils/clinicalConsultationLease";

const api = {
  lookup: lookupHealthRecordDraft,
  load: getHealthRecordDraft,
  discard: discardHealthRecordDraft,
  claim: (id, version, options) => transitionDraft(id, "claim", version, undefined, options),
  takeover: (id, version, note, options) => transitionDraft(id, "takeover", version, note, options),
};

const FRIENDLY = {
  check: "We couldn't check for unfinished work. Please try again.",
  recover: "We couldn't restore your unfinished work. Please try again.",
};

function friendlyMessage(problem, fallback) {
  const raw = problem?.message || "";
  if (!raw) return fallback;
  if (/ECONN|timeout|500|404|403|version|DRAFT_|FORM_/i.test(raw)) return fallback;
  return raw;
}

/** One recovery owner for queue entry and direct/refresh workspace entry. */
export default function useRhuConsultationRecovery({
  visit,
  patientId,
  owner,
  currentUserId,
  enabled,
  handoff,
  onRestore,
  onDiscarded,
}) {
  const [ready, setReady] = useState(!enabled);
  const [checking, setChecking] = useState(enabled);
  const [decision, setDecision] = useState(null);
  const [ownership, setOwnership] = useState(null);
  const [busy, setBusy] = useState(false);
  const [operation, setOperation] = useState("");
  const [failedOperation, setFailedOperation] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const gate = useRef(false);
  const generation = useRef(0);
  const callbacks = useRef({ onRestore, onDiscarded });
  useEffect(() => { callbacks.current = { onRestore, onDiscarded }; });
  const uuid = visit?.consultation_uuid || visit?.consultationUuid || "";

  useEffect(() => {
    const epoch = ++generation.current;
    if (!enabled) { setReady(true); setChecking(false); return undefined; }
    if (!visit) { setReady(false); setChecking(true); return undefined; }
    let cancelled = false;
    const current = () => !cancelled && epoch === generation.current;
    setReady(false);
    setChecking(true);
    setError("");
    setFailedOperation("");
    setOwnership(null);
    setDecision(null);
    // A newer lookup must not leave a prior Resume stuck on "Restoring...".
    setBusy(false);
    setOperation("");
    gate.current = false;
    if (handoff) {
      if (handoff.draft) callbacks.current.onRestore?.(handoff.draft, false);
      setReady(true);
      setChecking(false);
      return () => { cancelled = true; generation.current = epoch + 1; };
    }
    lookupRhuRecovery({ visit, patientId, owner, api })
      .then((result) => {
        if (!current()) return;
        setDecision(result);
        setOwnership(ownershipFromDraft(result?.server, currentUserId));
        setReady(!result);
      })
      .catch((problem) => { if (current()) setError(friendlyMessage(problem, FRIENDLY.check)); })
      .finally(() => { if (current()) setChecking(false); });
    return () => { cancelled = true; generation.current = epoch + 1; };
  }, [visit, uuid, patientId, owner, currentUserId, enabled, handoff, attempt]);

  async function run(kind, note) {
    if (gate.current || checking || !decision) return;
    if (kind !== "takeover" && ownership?.occupied) return;
    gate.current = true;
    const epoch = generation.current;
    setBusy(true);
    setOperation(kind);
    setFailedOperation("");
    setError("");
    try {
      const args = { visit, patientId, owner, decision, api, currentUserId };
      if (kind === "discard") {
        await discardRhuRecovery(args);
        if (epoch !== generation.current) return;
        setDecision(null);
        setOwnership(null);
        callbacks.current.onDiscarded?.();
      } else if (kind === "takeover") {
        const result = await takeoverRhuRecovery({ ...args, note });
        if (epoch !== generation.current) return;
        callbacks.current.onRestore?.(result.draft, false);
        setDecision(null);
        setOwnership(null);
        setReady(true);
      } else {
        const result = await resumeRhuRecovery(args);
        if (epoch !== generation.current) return;
        callbacks.current.onRestore?.(result.draft, false);
        setDecision(null);
        setOwnership(null);
        setReady(true);
      }
    } catch (problem) {
      if (epoch !== generation.current) return;
      const lease = ownershipFromProblem(problem) || (isEditorLeaseConflict(problem)
        ? ownershipFromDraft(decision?.server, currentUserId)
        : null);
      if (lease?.occupied) {
        setOwnership({ ...lease, canTakeover: lease.canTakeover ?? decision?.server?.canEdit !== false });
        setFailedOperation("");
        setError("");
      } else {
        setFailedOperation(kind === "takeover" ? "takeover" : kind);
        setError(friendlyMessage(problem, FRIENDLY.recover));
      }
    } finally {
      // Always clear busy so a Retry/lookup that bumps generation cannot leave
      // recovery actions permanently disabled on "Restoring...".
      gate.current = false;
      setBusy(false);
      setOperation("");
    }
  }
  return {
    ready, checking, decision, ownership, busy, operation, failedOperation, error,
    resume: () => run("resume"),
    discard: () => run("discard"),
    takeover: (note) => run("takeover", note),
    retry: () => { if (!gate.current) setAttempt((value) => value + 1); },
  };
}
