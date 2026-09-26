import { useCallback, useEffect, useRef, useState } from "react";
import { isConnectionError } from "../services/apiClient";
import {
  createHealthRecordDraft as defaultCreateDraft,
  updateHealthRecordDraft as defaultUpdateDraft,
} from "../services/healthRecordDraftService";
import * as defaultLocalDraftVault from "../services/localDraftVault";
import { SENSITIVE_SESSION_CLEARED_EVENT } from "../utils/sessionPrivacy";

/**
 * Online-first autosave for encrypted health-record drafts, with an on-device
 * safety net for a consultation that is already open.
 *
 * The server draft API stays the system of record: every save goes there first
 * and the local copy exists only while the server cannot be reached.
 *
 * Privacy contract: this hook never writes clinical data to browser storage in
 * the clear. Unsaved input lives in React state on the calling page and in the
 * in-memory `pendingSaveRef`. When the connection drops, the same snapshot is
 * additionally sealed into the encrypted IndexedDB vault (`localDraftVault`),
 * which is keyed to the authenticated user and destroyed by session cleanup.
 * No localStorage, sessionStorage, service worker, or persisted query cache is
 * ever used for clinical data.
 */

const DEFAULT_DEBOUNCE_MS = 20_000;
// 20s debounce keeps writes at most 3/min, well under the 30/min server limit.
// Do not lower this without raising the corresponding backend rate limit.
const BACKOFF_SCHEDULE_MS = [5_000, 10_000, 30_000, 60_000];
// Local writes touch no network and no rate limit, so an offline consultation
// is checkpointed far more eagerly than the server debounce allows.
const LOCAL_PERSIST_DEBOUNCE_MS = 1_500;
const DRAFT_VERSION_CONFLICT_CODE = "DRAFT_VERSION_CONFLICT";
// The server already has a draft for this consultation_uuid (another tab, or a
// device that reconnected first). Resolved exactly like a version conflict:
// the newer server copy is never silently overwritten.
const DRAFT_CONSULTATION_EXISTS_CODE = "DRAFT_CONSULTATION_EXISTS";

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
 * @param {string}   [options.consultationUuid] Stable identity of the consultation,
 *        sent with every create/update so reconnect can find the right draft.
 * @param {{ownerKey: string, consultationKey: string}|null} [options.localDraft]
 *        Identity of the encrypted on-device snapshot. Null disables the vault.
 * @param {() => object|null} [options.buildLocalRecord]
 *        Builds the restorable snapshot, called only when writing locally.
 * @param {boolean}  [options.unsyncedRecovery] The form was just restored from
 *        the on-device vault and is NEWER than the server draft.
 * @param {object}   [options.vault]           Injected local vault (defaults to service).
 * @returns {{ status: string, lastSavedAt: string|null, hasPendingChanges: boolean,
 *            conflict: object|null, error: object|null, localStatus: string,
 *            syncStatus: string, offlineEpoch: number, saveNow: Function,
 *            flushBeforeLeave: Function, resolveConflict: Function,
 *            acknowledgeSync: Function }}
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
  consultationUuid = "",
  localDraft = null,
  buildLocalRecord = null,
  unsyncedRecovery = false,
  vault = defaultLocalDraftVault,
} = {}) {
  const [status, setStatus] = useState(getInitialStatus);
  const [lastSavedAt, setLastSavedAt] = useState(() => draft?.lastSavedAt || null);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [error, setError] = useState(null);
  // Encrypted on-device copy: "idle" | "saved" | "unavailable" | "failed".
  const [localStatus, setLocalStatus] = useState("idle");
  // Server reconciliation of that copy: "idle" | "syncing" | "synced".
  const [syncStatus, setSyncStatus] = useState("idle");
  // Increments once per NEW offline transition, so the page can show the
  // Connection Lost modal once instead of interrupting every failed retry.
  const [offlineEpoch, setOfflineEpoch] = useState(0);

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
  // True between entering offline and the next confirmed server save.
  const offlineRef = useRef(false);
  // True while an encrypted snapshot exists on this device awaiting sync.
  const hasLocalCopyRef = useRef(false);
  const lastLocalSerializedRef = useRef("");
  const localWriteSeqRef = useRef(0);
  const localWritesRef = useRef(Promise.resolve());
  const finalizedRef = useRef(false);

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

  /**
   * Seal the current snapshot into the encrypted on-device vault. Never called
   * while the server is reachable: the server copy is the system of record.
   * Returns false (and reports "unavailable") when this browser context cannot
   * encrypt, so the UI can say so instead of implying the work is protected.
   */
  const persistLocalNow = useCallback(async () => {
    const params = paramsRef.current;
    const target = params.localDraft;
    if (!target?.ownerKey || !target?.consultationKey) return false;

    if (!params.vault.isLocalDraftVaultAvailable()) {
      if (isMountedRef.current) setLocalStatus("unavailable");
      return false;
    }

    const record = params.buildLocalRecord?.();
    if (!record || finalizedRef.current) return false;
    if (record.draft && draftRef.current) {
      record.draft.id = draftRef.current.id;
      record.draft.version = draftRef.current.version;
    }

    const serializedAtWrite = serializePayload(latestPayloadRef.current);
    const sequence = (localWriteSeqRef.current += 1);
    try {
      const write = localWritesRef.current.catch(() => {}).then(() =>
        params.vault.saveLocalDraft({
          ownerKey: target.ownerKey,
          consultationKey: target.consultationKey,
          record,
        }),
      );
      localWritesRef.current = write;
      await write;
      hasLocalCopyRef.current = true;
      lastLocalSerializedRef.current = serializedAtWrite;
      // A newer write already landed; do not report this stale one.
      if (isMountedRef.current && sequence === localWriteSeqRef.current) {
        setLocalStatus("saved");
      }
      return true;
    } catch {
      if (isMountedRef.current && sequence === localWriteSeqRef.current) {
        setLocalStatus("failed");
      }
      return false;
    }
  }, []);

  // Stop autosave before deleting recovery, so a late timer cannot recreate it.
  const completeConsultation = useCallback(async () => {
    finalizedRef.current = true;
    clearDebounceTimer();
    clearRetryTimer();
    const target = paramsRef.current.localDraft;
    await localWritesRef.current.catch(() => {});
    if (target?.ownerKey && target?.consultationKey) {
      await paramsRef.current.vault.deleteLocalDraft(target);
    }
    hasLocalCopyRef.current = false;
    pendingSaveRef.current = null;
    if (isMountedRef.current) setHasPendingChanges(false);
  }, [clearDebounceTimer, clearRetryTimer]);

  /** Mark a NEW offline transition (once per drop, not once per failed retry). */
  const enterOfflineMode = useCallback(() => {
    if (offlineRef.current) return;
    offlineRef.current = true;
    if (isMountedRef.current) setOfflineEpoch((epoch) => epoch + 1);
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
      // Nothing was confirmed, so no attempt is still "syncing". Every branch
      // below decides what to show instead; none may leave it hanging.
      if (isMountedRef.current) setSyncStatus("idle");

      if (isConnectionError(err)) {
        const attempts = (pendingSaveRef.current?.attempts ?? 0) + 1;
        pendingSaveRef.current = {
          payload: latestPayloadRef.current,
          version: draftRef.current?.version ?? null,
          attempts,
        };
        enterOfflineMode();
        if (isMountedRef.current) {
          setStatus("offline");
          setHasPendingChanges(true);
        }
        // The server could not take it, so protect it on this device instead.
        void persistLocalNow();
        scheduleRetry(attempts);
        return;
      }

      if (
        httpStatus === 409 &&
        (code === DRAFT_VERSION_CONFLICT_CODE ||
          code === DRAFT_CONSULTATION_EXISTS_CODE)
      ) {
        pausedRef.current = true;
        pendingSaveRef.current = null;
        clearRetryTimer();
        clearDebounceTimer();
        if (isMountedRef.current) {
          setStatus("conflict");
          setConflict({
            // A consultation-exists conflict names the draft the server holds;
            // Reload opens THAT one rather than a draft this tab never had.
            draftId:
              err?.payload?.draft_id || draftRef.current?.id || "",
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
      // An on-device copy made while offline is deliberately left in place -
      // only a confirmed server save may remove it.
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
    [
      clearDebounceTimer,
      clearRetryTimer,
      enterOfflineMode,
      persistLocalNow,
      scheduleRetry,
    ],
  );

  const runSave = useCallback(
    async () => {
      const params = paramsRef.current;
      if (!params.enabled || finalizedRef.current) return;
      // Conflict/validation pause halts autosave until reload; manual save overrides.
      if (pausedRef.current) return;
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

      if (!isOnline()) {
        enterOfflineMode();
        if (isMountedRef.current) { setStatus("offline"); setHasPendingChanges(true); }
        await persistLocalNow();
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

      if (isMountedRef.current) {
        setStatus("saving");
        // A pending on-device copy means this attempt IS the sync.
        if (hasLocalCopyRef.current) setSyncStatus("syncing");
      }

      const request = {
        consultationUuid: params.consultationUuid || "",
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
        offlineRef.current = false;
        clearRetryTimer();

        // The server has CONFIRMED this draft, so the on-device copy has done
        // its job and may finally be removed.
        const hadLocalCopy = hasLocalCopyRef.current;
        // Recovery is retained until the official Health Record is confirmed.

        if (isMountedRef.current) {
          setLastSavedAt(saved.lastSavedAt || null);
          setConflict(null);
          setError(null);
          setHasPendingChanges(false);
          setStatus("saved");
          setSyncStatus(hadLocalCopy ? "synced" : "idle");
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
    [clearDebounceTimer, clearRetryTimer, enterOfflineMode, handleSaveError, persistLocalNow],
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
      consultationUuid,
      onDraftSaved,
      createDraft,
      updateDraft,
      localDraft,
      buildLocalRecord,
      vault,
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

  // A draft restored from the on-device vault is NEWER than anything the
  // server holds, so it must not be mistaken for an already-saved baseline.
  // Declared AFTER the identity and enable effects so it wins on the render
  // they all fire, then pushes the recovered content up immediately.
  useEffect(() => {
    if (!unsyncedRecovery) return;
    lastSavedSerializedRef.current = "";
    hasLocalCopyRef.current = true;
    if (isMountedRef.current) setHasPendingChanges(true);
    void runSaveRef.current?.("recovered");
  }, [unsyncedRecovery]);

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

  // Immediate save on step/section change. While offline there is no server to
  // reach, so the step change checkpoints the on-device copy instead.
  const sectionKeyRef = useRef(sectionKey);
  useEffect(() => {
    if (sectionKeyRef.current === sectionKey) return;
    sectionKeyRef.current = sectionKey;
    if (!enabled || pausedRef.current) return;
    if (
      serializePayload(latestPayloadRef.current) !==
      lastSavedSerializedRef.current
    ) {
      if (offlineRef.current) void persistLocalNow();
      void runSaveRef.current?.("section");
    }
  }, [sectionKey, enabled, persistLocalNow]);

  // While offline, checkpoint edits on this device quickly. This is what makes
  // a refresh, tab close, or PC restart survivable; the 20s server debounce is
  // far too slow to rely on, and no request is being made anyway.
  useEffect(() => {
    if (!enabled || !serialized || finalizedRef.current) return undefined;
    if (serialized === lastLocalSerializedRef.current) return undefined;

    const timer = setTimeout(() => {
      void persistLocalNow();
    }, LOCAL_PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [serialized, enabled, status, persistLocalNow]);

  // Flush immediately when the connection returns, bypassing backoff.
  useEffect(() => {
    function handleOnline() {
      clearRetryTimer();
      const stillDirty =
        pendingSaveRef.current ||
        hasLocalCopyRef.current ||
        serializePayload(latestPayloadRef.current) !==
          lastSavedSerializedRef.current;
      if (paramsRef.current.enabled && !pausedRef.current && stillDirty) {
        if (isMountedRef.current && hasLocalCopyRef.current) {
          setSyncStatus("syncing");
        }
        void runSaveRef.current?.("online");
      }
    }

    function handleOffline() {
      if (paramsRef.current.enabled && !finalizedRef.current) {
        enterOfflineMode();
        if (isMountedRef.current) {
          setStatus("offline");
          setSyncStatus("idle");
        }
        void persistLocalNow();
      }
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [clearRetryTimer, enterOfflineMode, persistLocalNow]);

  useEffect(() => {
    const checkpoint = () => {
      if (!paramsRef.current.enabled || finalizedRef.current) return;
      void persistLocalNow();
      void runSaveRef.current?.("pagehide");
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") checkpoint(); };
    window.addEventListener("pagehide", checkpoint);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", checkpoint);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [persistLocalNow]);

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
      offlineRef.current = false;
      // Session cleanup purges the vault itself (and destroys its keys), so the
      // hook only drops its view of a copy that no longer exists.
      hasLocalCopyRef.current = false;
      lastLocalSerializedRef.current = "";
      if (isMountedRef.current) {
        setStatus(getInitialStatus());
        setLastSavedAt(null);
        setHasPendingChanges(false);
        setConflict(null);
        setError(null);
        setLocalStatus("idle");
        setSyncStatus("idle");
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

  /**
   * Force an immediate save. Resolves TRUE only when the latest edits are
   * genuinely on the server, so a caller can report the outcome honestly
   * instead of assuming the attempt worked.
   */
  const saveNow = useCallback(async () => {
    clearDebounceTimer();
    await runSaveRef.current?.("manual");
    return (
      serializePayload(latestPayloadRef.current) ===
      lastSavedSerializedRef.current
    );
  }, [clearDebounceTimer]);

  /**
   * Save before the page is left. Unlike saveNow, this settles only once any
   * in-flight write is done and resolves true only when the latest edits are
   * actually on the server - so a caller can decide whether leaving is safe.
   * A conflict/validation pause resolves false: those edits cannot be saved
   * without the user's decision, and the existing notice already asked for it.
   */
  const flushBeforeLeave = useCallback(async () => {
    if (!paramsRef.current.enabled) return true;
    clearDebounceTimer();

    const isSaved = () =>
      serializePayload(latestPayloadRef.current) ===
      lastSavedSerializedRef.current;
    const waitForInFlight = async () => {
      for (let waited = 0; inFlightRef.current && waited < 15_000; waited += 100) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    };

    await waitForInFlight();
    if (isSaved()) return true;
    if (pausedRef.current) return false;

    await runSaveRef.current?.("leave");
    await waitForInFlight();
    return isSaved();
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

  /** Dismiss the transient "Draft synced" confirmation. */
  const acknowledgeSync = useCallback(() => {
    setSyncStatus((current) => (current === "synced" ? "idle" : current));
  }, []);

  return {
    status,
    lastSavedAt,
    hasPendingChanges,
    conflict,
    error,
    localStatus,
    syncStatus,
    offlineEpoch,
    saveNow,
    flushBeforeLeave,
    persistLocalNow,
    completeConsultation,
    getDraftIdentity: () => draftRef.current,
    resolveConflict,
    acknowledgeSync,
  };
}
