import { useCallback, useEffect, useRef, useState } from "react";
import { isConnectionError } from "../services/apiClient";
import {
  createHealthRecordDraft as defaultCreateDraft,
  updateHealthRecordDraft as defaultUpdateDraft,
} from "../services/healthRecordDraftService";
import { SENSITIVE_SESSION_CLEARED_EVENT } from "../utils/sessionPrivacy";

/**
 * Offline-resilient, in-memory autosave for encrypted health-record drafts.
 *
 * Privacy contract: this hook never writes clinical data to browser storage.
 * Unsaved input lives only in React state on the calling page; the queued
 * payload is held in `pendingSaveRef` (module-scoped React ref, cleared on
 * unmount and on the sensitive-session-cleared event). No localStorage,
 * sessionStorage, IndexedDB, service worker, or persisted query cache is used.
 */

const DEFAULT_DEBOUNCE_MS = 20_000;
// 20s debounce keeps writes at most 3/min, well under the 30/min server limit.
// Do not lower this without raising the corresponding backend rate limit.
const BACKOFF_SCHEDULE_MS = [5_000, 10_000, 30_000, 60_000];
const DRAFT_VERSION_CONFLICT_CODE = "DRAFT_VERSION_CONFLICT";

function serializePayload(payload) {
  if (!payload) return "";
  try {
    return JSON.stringify(payload);
  } catch {
    return "";
  }
}

function backoffDelay(attempts) {
  const index = Math.min(
    Math.max(attempts - 1, 0),
    BACKOFF_SCHEDULE_MS.length - 1,
  );
  return BACKOFF_SCHEDULE_MS[index];
}

function isOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function getInitialStatus() {
  return isOnline() ? "idle" : "offline";
}

/**
 * @param {object}   options
 * @param {boolean}  options.enabled          Autosave is active (patient + supported classification chosen).
 * @param {number|string} options.patientId   Draft patient id.
 * @param {string}   options.classification    Draft classification.
 * @param {object|null} options.payload        Freshly built draft payload (in-memory, rebuilt each render).
 * @param {object|null} options.draft          Current draft identity { id, version, lastSavedAt } owned by the page.
 * @param {string|number} options.sectionKey   Changing this flushes an immediate save (step/section change).
 * @param {(saved: object) => void} options.onDraftSaved  Sync callback after each successful create/update.
 * @param {number}   [options.debounceMs]      Override debounce window (defaults to 20s).
 * @param {Function} [options.createDraft]     Injected create API (defaults to service).
 * @param {Function} [options.updateDraft]     Injected update API (defaults to service).
 * @returns {{ status: string, lastSavedAt: string|null, hasPendingChanges: boolean,
 *            conflict: object|null, error: object|null, saveNow: Function, resolveConflict: Function }}
 */
export default function useDraftAutosave({
  enabled = false,
  patientId,
  classification,
  payload = null,
  draft = null,
  sectionKey = "",
  onDraftSaved,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  createDraft = defaultCreateDraft,
  updateDraft = defaultUpdateDraft,
} = {}) {
  const [status, setStatus] = useState(getInitialStatus);
  const [lastSavedAt, setLastSavedAt] = useState(() => draft?.lastSavedAt || null);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [error, setError] = useState(null);

  // Latest render values, read by timers/listeners to avoid stale closures.
  const paramsRef = useRef({});
  const latestPayloadRef = useRef(null);
  const serialized = enabled ? serializePayload(payload) : "";

  const draftRef = useRef(null);
  const lastSavedSerializedRef = useRef("");
  const lastSavedAtRef = useRef(draft?.lastSavedAt || null);
  // In-memory queued save: { payload, version, attempts }.
  const pendingSaveRef = useRef(null);
  const inFlightRef = useRef(false);
  const rerunRef = useRef(false);
  const pausedRef = useRef(false);
  const enabledRef = useRef(false);
  const debounceTimerRef = useRef(null);
  const retryTimerRef = useRef(null);
  const isMountedRef = useRef(true);
  const runSaveRef = useRef(null);

  const clearDebounceTimer = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const scheduleRetry = useCallback(
    (attempts) => {
      clearRetryTimer();
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        void runSaveRef.current?.("retry");
      }, backoffDelay(attempts));
    },
    [clearRetryTimer],
  );

  const handleSaveError = useCallback(
    (err) => {
      const httpStatus = Number(err?.status);
      const code = err?.code || err?.payload?.code || "";

      if (isConnectionError(err)) {
        const attempts = (pendingSaveRef.current?.attempts ?? 0) + 1;
        pendingSaveRef.current = {
          payload: latestPayloadRef.current,
          version: draftRef.current?.version ?? null,
          attempts,
        };
        if (isMountedRef.current) {
          setStatus("offline");
          setHasPendingChanges(true);
        }
        scheduleRetry(attempts);
        return;
      }

      if (httpStatus === 409 && code === DRAFT_VERSION_CONFLICT_CODE) {
        pausedRef.current = true;
        pendingSaveRef.current = null;
        clearRetryTimer();
        clearDebounceTimer();
        if (isMountedRef.current) {
          setStatus("conflict");
          setConflict({
            draftId: draftRef.current?.id || "",
            message: err?.message || "This draft was updated elsewhere.",
          });
        }
        return;
      }

      if (httpStatus === 422) {
        pausedRef.current = true;
        pendingSaveRef.current = null;
        clearRetryTimer();
        clearDebounceTimer();
        if (isMountedRef.current) {
          setStatus("error");
          setError({
            type: "validation",
            status: 422,
            message: err?.message || "Some entries could not be saved.",
            fieldErrors: err?.errors || {},
          });
        }
        return;
      }

      if (httpStatus === 429) {
        // Rate limited: back off and retry silently, never surface as an error.
        const attempts = (pendingSaveRef.current?.attempts ?? 0) + 1;
        pendingSaveRef.current = {
          payload: latestPayloadRef.current,
          version: draftRef.current?.version ?? null,
          attempts,
        };
        if (isMountedRef.current) {
          setStatus("saving");
          setHasPendingChanges(true);
        }
        scheduleRetry(attempts);
        return;
      }

      // Unexpected error: stop retrying, surface it, keep form data intact.
      pendingSaveRef.current = null;
      clearRetryTimer();
      if (isMountedRef.current) {
        setStatus("error");
        setError({
          type: "unknown",
          status: httpStatus || 0,
          message: err?.message || "Unable to save this draft.",
          fieldErrors: {},
        });
      }
    },
    [clearDebounceTimer, clearRetryTimer, scheduleRetry],
  );

  const runSave = useCallback(
    async (reason) => {
      const params = paramsRef.current;
      if (!params.enabled) return;
      // Conflict/validation pause halts autosave until reload; manual save overrides.
      if (pausedRef.current && reason !== "manual") return;
      if (inFlightRef.current) {
        rerunRef.current = true;
        return;
      }

      const payloadToSave = latestPayloadRef.current;
      const nextSerialized = serializePayload(payloadToSave);
      if (!nextSerialized) return;

      // Skip entirely if nothing changed since the last successful save.
      if (nextSerialized === lastSavedSerializedRef.current) {
        pendingSaveRef.current = null;
        if (isMountedRef.current) {
          setHasPendingChanges(false);
          setStatus(lastSavedAtRef.current ? "saved" : "idle");
        }
        return;
      }

      clearDebounceTimer();
      inFlightRef.current = true;
      const current = draftRef.current;
      pendingSaveRef.current = {
        payload: payloadToSave,
        version: current?.version ?? null,
        attempts: pendingSaveRef.current?.attempts ?? 0,
      };

      if (isMountedRef.current) setStatus("saving");

      const request = {
        patientId: Number(params.patientId),
        classification: params.classification,
        payload: payloadToSave,
      };

      try {
        const saved = current
          ? await params.updateDraft(current.id, {
              ...request,
              version: current.version,
            })
          : await params.createDraft(request);

        lastSavedSerializedRef.current = nextSerialized;
        draftRef.current = { id: saved.id, version: saved.version };
        lastSavedAtRef.current = saved.lastSavedAt || null;
        pendingSaveRef.current = null;
        pausedRef.current = false;
        clearRetryTimer();

        if (isMountedRef.current) {
          setLastSavedAt(saved.lastSavedAt || null);
          setConflict(null);
          setError(null);
          setHasPendingChanges(false);
          setStatus("saved");
        }
        params.onDraftSaved?.(saved);
      } catch (err) {
        handleSaveError(err);
      } finally {
        inFlightRef.current = false;
        // A change arrived mid-flight: re-run if still dirty.
        if (rerunRef.current) {
          rerunRef.current = false;
          if (
            !pausedRef.current &&
            serializePayload(latestPayloadRef.current) !==
              lastSavedSerializedRef.current
          ) {
            void runSaveRef.current?.("rerun");
          }
        }
      }
    },
    [clearDebounceTimer, clearRetryTimer, handleSaveError],
  );

  useEffect(() => {
    runSaveRef.current = runSave;
  }, [runSave]);

  // Commit the latest render values to refs after every render, before the
  // effects below read them. Timers/listeners fire asynchronously and so always
  // observe the most recently committed payload and params (no stale closures).
  useEffect(() => {
    paramsRef.current = {
      enabled,
      patientId,
      classification,
      onDraftSaved,
      createDraft,
      updateDraft,
    };
    latestPayloadRef.current = enabled ? payload : null;
  });

  // Track mount so async completions never call setState after unmount.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Adopt draft identity owned by the page (resume, discard, or server-advanced
  // version). Keyed on id/version so the hook's own version bumps don't reseed.
  useEffect(() => {
    const incoming = draft || null;
    const current = draftRef.current;

    if (!incoming) {
      if (current) {
        draftRef.current = null;
        lastSavedSerializedRef.current = serializePayload(
          latestPayloadRef.current,
        );
        lastSavedAtRef.current = null;
        pendingSaveRef.current = null;
        pausedRef.current = false;
        clearRetryTimer();
        clearDebounceTimer();
        if (isMountedRef.current) {
          setLastSavedAt(null);
          setHasPendingChanges(false);
          setConflict(null);
          setError(null);
          setStatus(getInitialStatus());
        }
      }
      return;
    }

    const isNewIdentity = !current || current.id !== incoming.id;
    const isServerAdvanced =
      current && current.id === incoming.id && incoming.version > current.version;

    if (isNewIdentity || isServerAdvanced) {
      draftRef.current = { id: incoming.id, version: incoming.version };
      // Restored form matches the server draft, so make it the new baseline.
      lastSavedSerializedRef.current = serializePayload(latestPayloadRef.current);
      lastSavedAtRef.current = incoming.lastSavedAt || null;
      pendingSaveRef.current = null;
      pausedRef.current = false;
      clearRetryTimer();
      clearDebounceTimer();
      if (isMountedRef.current) {
        setLastSavedAt(incoming.lastSavedAt || null);
        setHasPendingChanges(false);
        setConflict(null);
        setError(null);
        setStatus(incoming.lastSavedAt ? "saved" : getInitialStatus());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.id, draft?.version]);

  // Rising edge of `enabled`: snapshot default field values as the baseline so
  // a freshly opened form does not autosave an empty draft from prefilled dates.
  useEffect(() => {
    if (enabled && !enabledRef.current) {
      if (!draftRef.current) {
        lastSavedSerializedRef.current = serializePayload(
          latestPayloadRef.current,
        );
      }
    } else if (!enabled && enabledRef.current) {
      clearDebounceTimer();
      clearRetryTimer();
      if (isMountedRef.current) setHasPendingChanges(false);
    }
    enabledRef.current = enabled;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Debounced change detection.
  useEffect(() => {
    if (!enabled || !serialized) {
      clearDebounceTimer();
      return undefined;
    }

    const changed = serialized !== lastSavedSerializedRef.current;
    if (isMountedRef.current) setHasPendingChanges(changed);

    if (!changed || pausedRef.current) {
      clearDebounceTimer();
      return undefined;
    }

    clearDebounceTimer();
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void runSaveRef.current?.("debounce");
    }, debounceMs);

    return clearDebounceTimer;
  }, [serialized, enabled, debounceMs, clearDebounceTimer]);

  // Immediate save on step/section change.
  const sectionKeyRef = useRef(sectionKey);
  useEffect(() => {
    if (sectionKeyRef.current === sectionKey) return;
    sectionKeyRef.current = sectionKey;
    if (!enabled || pausedRef.current) return;
    if (
      serializePayload(latestPayloadRef.current) !==
      lastSavedSerializedRef.current
    ) {
      void runSaveRef.current?.("section");
    }
  }, [sectionKey, enabled]);

  // Flush immediately when the connection returns, bypassing backoff.
  useEffect(() => {
    function handleOnline() {
      clearRetryTimer();
      const stillDirty =
        pendingSaveRef.current ||
        serializePayload(latestPayloadRef.current) !==
          lastSavedSerializedRef.current;
      if (paramsRef.current.enabled && !pausedRef.current && stillDirty) {
        void runSaveRef.current?.("online");
      }
    }

    function handleOffline() {
      const stillDirty =
        pendingSaveRef.current ||
        serializePayload(latestPayloadRef.current) !==
          lastSavedSerializedRef.current;
      if (isMountedRef.current && paramsRef.current.enabled && stillDirty) {
        setStatus("offline");
      }
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [clearRetryTimer]);

  // Reset every trace of draft state when the sensitive session is cleared.
  useEffect(() => {
    function resetSensitiveDraftState() {
      clearDebounceTimer();
      clearRetryTimer();
      draftRef.current = null;
      pendingSaveRef.current = null;
      lastSavedSerializedRef.current = "";
      lastSavedAtRef.current = null;
      inFlightRef.current = false;
      rerunRef.current = false;
      pausedRef.current = false;
      enabledRef.current = false;
      if (isMountedRef.current) {
        setStatus(getInitialStatus());
        setLastSavedAt(null);
        setHasPendingChanges(false);
        setConflict(null);
        setError(null);
      }
    }

    window.addEventListener(
      SENSITIVE_SESSION_CLEARED_EVENT,
      resetSensitiveDraftState,
    );
    return () =>
      window.removeEventListener(
        SENSITIVE_SESSION_CLEARED_EVENT,
        resetSensitiveDraftState,
      );
  }, [clearDebounceTimer, clearRetryTimer]);

  // Final cleanup: no orphaned timers left behind on unmount.
  useEffect(() => {
    return () => {
      clearDebounceTimer();
      clearRetryTimer();
    };
  }, [clearDebounceTimer, clearRetryTimer]);

  const saveNow = useCallback(() => {
    clearDebounceTimer();
    return runSaveRef.current?.("manual") ?? Promise.resolve();
  }, [clearDebounceTimer]);

  const resolveConflict = useCallback((mode) => {
    if (mode === "reload") {
      // The page reloads the latest draft; the identity effect resets the
      // baseline once the newer version lands. Clear conflict UI + unpause.
      pausedRef.current = false;
      pendingSaveRef.current = null;
      setConflict(null);
      setError(null);
      setStatus(lastSavedAtRef.current ? "saved" : getInitialStatus());
    } else {
      // "Keep editing": stay, do not save, do not loop conflicts.
      setConflict(null);
      setStatus("idle");
    }
  }, []);

  return {
    status,
    lastSavedAt,
    hasPendingChanges,
    conflict,
    error,
    saveNow,
    resolveConflict,
  };
}
