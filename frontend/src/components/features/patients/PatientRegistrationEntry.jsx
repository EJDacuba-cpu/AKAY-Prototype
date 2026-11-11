import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import FormDraftRecoveryDialog from "../../common/drafts/FormDraftRecoveryDialog";
import { createFormDraftCoordinator } from "../../../services/formDraftCoordinator";
import { createFormDraftApi } from "../../../services/formDraftService";
import { formDraftOwnerContext } from "../../../utils/formDraftRequest";
import { getCurrentUser } from "../../../utils/auth";
import { registrationTarget, registrationRecoveryDialogProps, storeRegistrationEntry, releaseRegistrationEntry } from "../../../utils/patientRegistrationEntry";
import { INITIAL_FORM_STATE } from "../../../utils/patientRegistrationDefaults";
import { registrationDraftSnapshot, restoreRegistrationDraft } from "../../../utils/patientRegistrationPayload";

const EntryContext = createContext(null);
const noSubscribe = () => () => {};
const idle = {};
const idleSnapshot = () => idle;

export function PatientRegistrationEntryProvider({ role, children }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const current = useRef(null);
  const operating = useRef(false);
  const lifetime = useRef(null);
  const [entry, setEntry] = useState(null);
  const [operation, setOperation] = useState("");
  const engine = entry?.engine;
  const state = useSyncExternalStore(engine?.subscribe || noSubscribe, engine?.getSnapshot || idleSnapshot, engine?.getSnapshot || idleSnapshot);
  useEffect(() => {
    if (lifetime.current) lifetime.current.active = false;
    const attachment = { active: true };
    lifetime.current = attachment;
    return () => { queueMicrotask(() => { if (attachment.active) current.current?.engine.close(); }); };
  }, []);

  function close() {
    if (operating.current || state.busy) return;
    current.current?.engine.close(); current.current = null;
    setEntry(null);
  }
  function enter(item, restored) {
    if (item.owner !== formDraftOwnerContext(getCurrentUser() || {})) throw new Error("Your account changed. Reopen registration in your current account.");
    {
      item.engine.registrationEntryFresh = !restored;
      if (!restored) item.engine.awaitingRender = null;
      storeRegistrationEntry(client, item.owner, item.path, item.engine);
      // Only an unconsumed handoff is closed. No patient input is put in history.
      const expiry = setTimeout(() => {
        if (releaseRegistrationEntry(client, item.owner, item.path, item.engine)) item.engine.close();
      }, 59900);
      expiry.unref?.();
    }
    current.current = null;
    setEntry(null); setOperation("");
    navigate(item.path);
  }
  async function check(item) {
    if (operating.current) return;
    operating.current = true;
    setOperation("checking");
    try {
      await item.engine.init();
      if (current.current !== item) return;
      if (item.engine.getSnapshot().ready) enter(item, false);
    } catch (error) { item.engine.handleError(error); }
    finally { operating.current = false; setOperation(""); }
  }
  function open(path) {
    if (current.current) return;
    const owner = formDraftOwnerContext(getCurrentUser() || {});
    const initialValue = registrationDraftSnapshot({ form: INITIAL_FORM_STATE });
    const coordinator = createFormDraftCoordinator({
      identity: { form_type: "patient", mode: "create", context_key: "new" }, owner, initialValue,
      normalizeSnapshot: (payload) => registrationDraftSnapshot(restoreRegistrationDraft(payload, INITIAL_FORM_STATE)),
      onRestore: () => {}, api: createFormDraftApi({ owner, queryClient: client }),
    });
    const item = { engine: coordinator, owner, path };
    current.current = item; setEntry(item); void check(item);
  }
  async function resume() {
    if (operating.current || engine?.getSnapshot().busy || current.current !== entry) return;
    operating.current = true;
    setOperation("restoring");
    try { if (await engine.resume()) enter(entry, true); }
    catch (error) { engine.handleError(error); }
    finally { operating.current = false; setOperation(""); }
  }
  async function discard() {
    if (operating.current || engine?.getSnapshot().busy || current.current !== entry) return;
    operating.current = true;
    setOperation("discarding");
    try { await engine.discard(); if (engine.getSnapshot().ready) enter(entry, false); }
    catch (error) { engine.handleError(error); }
    finally { operating.current = false; setOperation(""); }
  }
  const busy = Boolean(operation || state.busy);
  const hasDraft = Boolean(engine?.draft);
  const recoveryCopy = registrationRecoveryDialogProps({ hasDraft, checkFailed: Boolean(state.error) && !hasDraft });
  return <EntryContext.Provider value={{ role, open, path: entry?.path, checking: operation === "checking", disabled: Boolean(entry) }}>
    {children}
    {entry && operation !== "checking" && (state.decision || state.error || operation === "restoring") && createPortal(<FormDraftRecoveryDialog
      open title={recoveryCopy.title} description={recoveryCopy.description}
      lastSavedAt={state.lastSavedAt}
      busy={busy} resuming={operation === "restoring"} error={state.error} cancelLabel={state.error ? "Cancel" : ""}
      resumeLabel={recoveryCopy.resumeLabel} onClose={close}
      onResume={hasDraft ? resume : undefined}
      onDiscard={hasDraft ? discard : undefined}
      onRetry={state.error ? () => hasDraft ? resume() : check(entry) : undefined}
    />, document.body)}
  </EntryContext.Provider>;
}

export function PatientRegistrationEntryLink({ to, onClick, children, ...props }) {
  const entry = useContext(EntryContext);
  const target = registrationTarget(to, entry?.role);
  if (!target) return <Link {...props} to={to} onClick={onClick}>{children}</Link>;
  const checking = target && target === entry?.path && entry.checking;
  return <Link {...props} to={to} aria-disabled={target && entry?.disabled || undefined} aria-busy={checking || undefined}
    onClick={(event) => {
      onClick?.(event);
      if (!target || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); entry.open(target);
    }}>{checking ? <><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Checking...</> : children}</Link>;
}
