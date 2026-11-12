import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getCurrentUser } from "../utils/auth";
import { formDraftOwnerContext } from "../utils/formDraftRequest";
import { createFormDraftApi } from "../services/formDraftService";
import { createFormDraftCoordinator } from "../services/formDraftCoordinator";
import { SENSITIVE_SESSION_CLEARED_EVENT } from "../utils/sessionPrivacy";
import { FORM_DRAFTS_ENABLED } from "../utils/featureFlags";

const disabledState = { ready: true, decision: false, status: "idle", error: "", warning: "", hasPendingChanges: false };
const noSubscribe = () => () => {};
const disabledSnapshot = () => disabledState;

export default function useFormDraft({
  formType, mode, contextKey, value, initialValue, onRestore, normalizeSnapshot,
  preparedEngine = null, onEntryConsumed, enabled = FORM_DRAFTS_ENABLED, baseRevision = null,
}) {
  const queryClient = useQueryClient();
  const owner = formDraftOwnerContext(getCurrentUser() || {});
  const engine = useMemo(() => enabled ? preparedEngine || createFormDraftCoordinator({
    identity: { form_type: formType, mode, context_key: contextKey }, owner,
    initialValue, baseRevision, normalizeSnapshot, onRestore: () => {},
    api: createFormDraftApi({ owner, queryClient }),
  }) : null,
  // The baseline belongs to the opened form identity. Typing/refetch must not replace it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [enabled, owner, formType, mode, contextKey, queryClient, preparedEngine]);
  const restoredEntry = useRef(null);
  const lifetime = useRef(null);
  useEffect(() => {
    engine?.setRestoreHandler(onRestore);
    if (engine && engine === preparedEngine && restoredEntry.current !== engine) {
      restoredEntry.current = engine;
      if (engine.registrationEntryFresh) {
        // Fresh Discard/entry opens a blank form; do not keep a restore gate.
        engine.awaitingRender = null;
        onEntryConsumed?.();
        return;
      }
      try {
        onRestore(JSON.parse(JSON.stringify(engine.latest)));
        onEntryConsumed?.();
      } catch {
        engine.patch({
          ready: false, decision: true, busy: false, status: "error",
          error: "We couldn't restore your unfinished work. Please try again.",
        });
      }
    }
  }, [engine, preparedEngine, onRestore, onEntryConsumed]);
  const state = useSyncExternalStore(engine?.subscribe || noSubscribe, engine?.getSnapshot || disabledSnapshot, engine?.getSnapshot || disabledSnapshot);
  useEffect(() => {
    // A failed handoff can succeed on Retry after the initial effect ran.
    if (engine === preparedEngine && state.ready) onEntryConsumed?.();
  }, [engine, preparedEngine, state.ready, onEntryConsumed]);
  const inputSnapshot = JSON.stringify(value);
  useEffect(() => {
    if (!engine) return;
    if (lifetime.current?.engine === engine) lifetime.current.active = false;
    const attachment = { engine, active: true };
    lifetime.current = attachment;
    if (engine !== preparedEngine) void engine.init();
    const clear = () => engine.close();
    const online = () => { void engine.connectionChanged().catch((error) => engine.handleError(error)); };
    const hidden = () => {
      if (document.visibilityState === "hidden" && engine.getSnapshot().ready && engine.getSnapshot().hasPendingChanges) {
        void engine.flush().catch(() => {});
      }
    };
    window.addEventListener(SENSITIVE_SESSION_CLEARED_EVENT, clear);
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener(SENSITIVE_SESSION_CLEARED_EVENT, clear);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      document.removeEventListener("visibilitychange", hidden);
      engine.clearTimers();
      // StrictMode reattaches the same prepared session in this microtask.
      // Only a real detach closes it; hydration must not trigger another lookup.
      queueMicrotask(() => {
        if (!attachment.active) return;
        if (engine.getSnapshot().ready && engine.getSnapshot().hasPendingChanges) {
          void engine.flush().catch(() => {}).finally(() => engine.close());
        } else engine.close();
      });
    };
  }, [engine, preparedEngine]);
  useEffect(() => {
    if (!engine) return;
    try { engine.setValue(JSON.parse(inputSnapshot), true); } catch (error) { engine.handleError(error); }
  }, [engine, inputSnapshot, state.ready]);

  const flush = () => engine?.flush();
  const dismiss = async (onClose) => {
    if (engine?.getSnapshot().busy) return false;
    if (engine) {
      engine.patch({ busy: true });
      try { await engine.flushBeforeLeave(); }
      catch (error) { engine.handleError(error); engine.patch({ busy: false }); return false; }
    }
    engine?.close(); onClose?.(); return true;
  };
  return {
    ...state, ready: engine ? engine.isReadyForValue(value) : state.ready, engine, flush, dismiss,
    resume: () => engine?.resume(), discard: () => engine?.discard(),
    prepareCommit: () => engine ? engine.prepareCommit() : Promise.resolve({}),
    complete: () => engine?.complete(),
    entryProps: {
      open: !state.ready && !state.closed, checking: state.status === "checking", busy: state.busy,
      error: state.error, lastSavedAt: state.lastSavedAt,
      onResume: engine?.draft ? () => engine.resume() : undefined,
      onDiscard: engine?.draft ? () => engine.discard() : undefined,
      onRetry: state.error ? () => engine?.init() : undefined,
    },
    statusProps: {
      status: state.warning && state.status === "idle" ? "unavailable" : state.status,
      lastSavedAt: state.lastSavedAt,
      error: state.error || state.warning,
      onRetry: () => flush()?.catch(() => {}),
    },
  };
}
