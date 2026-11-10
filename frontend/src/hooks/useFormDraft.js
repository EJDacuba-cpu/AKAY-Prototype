import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getCurrentUser } from "../utils/auth";
import { formDraftOwnerContext } from "../utils/formDraftRequest";
import { createFormDraftApi } from "../services/formDraftService";
import { createFormDraftCoordinator } from "../services/formDraftCoordinator";
import { formDraftVault } from "../services/formDraftVault";
import { SENSITIVE_SESSION_CLEARED_EVENT } from "../utils/sessionPrivacy";
import { FORM_DRAFTS_ENABLED } from "../utils/featureFlags";

const disabledState = { ready: true, decision: false, status: "idle", error: "", warning: "", hasPendingChanges: false };
const noSubscribe = () => () => {};
const disabledSnapshot = () => disabledState;

export default function useFormDraft({ formType, mode, contextKey, value, initialValue, onRestore, normalizeSnapshot, preparedEngine = null, onEntryConsumed, enabled = FORM_DRAFTS_ENABLED, baseRevision = null, preferLatestRecovery = false }) {
  const queryClient = useQueryClient();
  const owner = formDraftOwnerContext(getCurrentUser() || {});
  const engine = useMemo(() => enabled ? preparedEngine || createFormDraftCoordinator({
    identity: { form_type: formType, mode, context_key: contextKey }, owner,
    initialValue, baseRevision, normalizeSnapshot, preferLatestRecovery, onRestore: () => {},
    vault: formDraftVault, api: createFormDraftApi({ owner, queryClient }),
  }) : null,
  // The baseline belongs to the opened form identity. Typing/refetch must not replace it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [enabled, owner, formType, mode, contextKey, queryClient, preparedEngine, preferLatestRecovery]);
  const restoredEntry = useRef(null);
  const lifetime = useRef(null);
  useEffect(() => {
    engine?.setRestoreHandler(onRestore);
    if (engine && engine === preparedEngine && restoredEntry.current !== engine) {
      restoredEntry.current = engine;
      if (engine.registrationEntryFresh) {
        onEntryConsumed?.();
        return;
      }
      if (preferLatestRecovery) {
        try { onRestore(JSON.parse(JSON.stringify(engine.latest))); onEntryConsumed?.(); }
        catch (error) { engine.patch({ ready: false, decision: true, busy: false, status: "error", error: `Unable to restore registration. Your draft is still saved. Retry. ${error.message || ""}` }); }
      } else {
        onEntryConsumed?.();
        onRestore(JSON.parse(JSON.stringify(engine.latest)));
      }
    }
  }, [engine, preparedEngine, onRestore, onEntryConsumed, preferLatestRecovery]);
  const state = useSyncExternalStore(engine?.subscribe || noSubscribe, engine?.getSnapshot || disabledSnapshot, engine?.getSnapshot || disabledSnapshot);
  useEffect(() => {
    // A failed handoff can succeed on Retry after the initial effect ran.
    if (preferLatestRecovery && engine === preparedEngine && state.ready) onEntryConsumed?.();
  }, [engine, preparedEngine, state.ready, preferLatestRecovery, onEntryConsumed]);
  const inputSnapshot = JSON.stringify(value);
  useEffect(() => {
    if (!engine) return;
    if (lifetime.current?.engine === engine) lifetime.current.active = false;
    const attachment = { engine, active: true };
    lifetime.current = attachment;
    if (engine !== preparedEngine) void engine.init();
    const clear = () => engine.close();
    const online = () => { void engine.connectionChanged().catch((error) => engine.handleError(error)); };
    const hidden = () => { if (document.visibilityState === "hidden" && engine.getSnapshot().ready && engine.getSnapshot().hasPendingChanges) void engine.checkpoint().catch(() => {}); };
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
        if (engine.getSnapshot().ready && engine.getSnapshot().hasPendingChanges) void engine.checkpoint().catch(() => {}).finally(() => engine.close());
        else engine.close();
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
    resume: (source) => engine?.resume(source), discard: () => engine?.discard(),
    prepareCommit: () => engine ? engine.prepareCommit() : Promise.resolve({}),
    complete: () => engine?.complete(),
    entryProps: {
      open: !state.ready && !state.closed, checking: state.status === "checking", busy: state.busy,
      error: state.error, lastSavedAt: state.deviceSavedAt || state.lastSavedAt,
      deviceOnly: Boolean(state.deviceSavedAt),
      onResume: !state.conflict && (engine?.draft || engine?.local) ? () => engine.resume() : undefined,
      onResumeDevice: state.conflict ? () => engine?.resume("device") : undefined,
      onResumeServer: state.conflict && engine?.draft ? () => engine.resume("server") : undefined,
      onDiscard: engine?.draft || engine?.local ? () => engine.discard() : undefined,
      onRetry: state.error ? () => engine?.init() : undefined,
    },
    statusProps: { status: state.warning && state.status === "idle" ? "unavailable" : state.status, lastSavedAt: state.lastSavedAt, deviceSavedAt: state.deviceSavedAt, error: state.error || state.warning, onRetry: () => flush()?.catch(() => {}) },
  };
}
