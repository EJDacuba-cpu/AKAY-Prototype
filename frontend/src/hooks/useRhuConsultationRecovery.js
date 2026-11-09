import { useEffect, useRef, useState } from "react";
import { getHealthRecordDraft, lookupHealthRecordDraft, discardHealthRecordDraft, transitionDraft } from "../services/healthRecordDraftService";
import { lookupRhuRecovery, resumeRhuRecovery, discardRhuRecovery } from "../utils/rhuDraftResume";

const api = {
  lookup: lookupHealthRecordDraft,
  load: getHealthRecordDraft,
  discard: discardHealthRecordDraft,
  claim: (id, version, options) => transitionDraft(id, "claim", version, undefined, options),
};

/** One recovery owner for queue entry and direct/refresh workspace entry. */
export default function useRhuConsultationRecovery({ visit, patientId, owner, vault, enabled, shared, handoff, onRestore, onDiscarded }) {
  const [ready, setReady] = useState(!enabled);
  const [checking, setChecking] = useState(enabled);
  const [decision, setDecision] = useState(null);
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
    setDecision(null);
    if (handoff) {
      if (handoff.draft) callbacks.current.onRestore?.(handoff.draft, handoff.unsynced);
      setReady(true);
      setChecking(false);
      return () => { cancelled = true; generation.current = epoch + 1; };
    }
    lookupRhuRecovery({ visit, patientId, owner, vault, shared, api })
      .then((result) => { if (current()) { setDecision(result); setReady(!result); } })
      .catch((problem) => { if (current()) setError(problem?.message || "Unable to check unfinished consultation input."); })
      .finally(() => { if (current()) setChecking(false); });
    return () => { cancelled = true; generation.current = epoch + 1; };
  }, [visit, uuid, patientId, owner, vault, enabled, shared, handoff, attempt]);

  async function run(kind, source = "") {
    if (gate.current || checking || !decision) return;
    gate.current = true;
    const epoch = generation.current;
    setBusy(true);
    setOperation(kind);
    setFailedOperation("");
    setError("");
    try {
      const args = { visit, patientId, owner, decision, vault, shared, api };
      if (kind === "discard") {
        await discardRhuRecovery(args);
        if (epoch !== generation.current) return;
        setDecision(null);
        callbacks.current.onDiscarded?.();
      } else {
        const result = await resumeRhuRecovery({ ...args, source });
        if (epoch !== generation.current) return;
        if (result.decision) { setDecision(result.decision); return; }
        callbacks.current.onRestore?.(result.draft, result.unsynced);
        setDecision(null);
        setReady(true);
      }
    } catch (problem) {
      if (epoch === generation.current) { setFailedOperation(kind); setError(problem?.message || "Unable to recover this consultation. Retry while online."); }
    } finally {
      gate.current = false;
      if (epoch === generation.current) { setBusy(false); setOperation(""); }
    }
  }
  return { ready, checking, decision, busy, operation, failedOperation, error, resume: (source) => run("resume", source), discard: () => run("discard"), retry: () => { if (!gate.current) setAttempt((value) => value + 1); } };
}
