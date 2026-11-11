import { assertFormDraftPayload } from "../utils/formDraftRegistry.js";
import { registerFormDraftCoordinator } from "./formDraftSession.js";

const copy = (value) => JSON.parse(JSON.stringify(value));
const ordered = (value) => Array.isArray(value) ? value.map(ordered) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])])) : value;
const serialized = (value) => JSON.stringify(ordered(value));
const problem = (code, message) => Object.assign(new Error(message), { code });

const MSG = {
  lookup: "We couldn't check for unfinished work. Please try again.",
  save: "Your changes couldn't be saved. Please try again.",
  restore: "We couldn't restore your unfinished work. Please try again.",
  discard: "We couldn't discard this unfinished work. Please try again.",
  offline: "You're offline. Keep this form open and try again when you're back online.",
  leave: "Your changes couldn't be saved. Please try again before leaving.",
  conflict: "This form was updated elsewhere. Review the latest unfinished work before continuing.",
  notReady: "Resolve unfinished work before saving.",
  session: "Reopen the form in your current account before saving.",
  invalid: "This input can't be saved yet. Keep the form open and retry.",
};

class FormDraftCoordinator {
  constructor(options) {
    this.options = options;
    this.api = options.api;
    this.identity = options.identity;
    this.initial = assertFormDraftPayload(this.identity.form_type, options.initialValue);
    this.latest = copy(this.initial);
    this.confirmed = serialized(this.initial);
    this.listeners = new Set();
    this.schedule = options.schedule || ((...args) => globalThis.setTimeout(...args));
    this.cancel = options.cancel || ((...args) => globalThis.clearTimeout(...args));
    this.online = options.online || (() => navigator.onLine !== false);
    this.uuid = options.uuid || (() => crypto.randomUUID());
    this.epoch = 0;
    this.state = {
      ready: false, decision: false, status: "checking", error: "", warning: "",
      hasPendingChanges: false, lastSavedAt: "", deviceSavedAt: "", transactionUuid: "", conflict: false,
    };
  }

  getSnapshot = () => this.state;
  isReadyForValue(value) { return this.state.ready && (!this.awaitingRender || serialized(value) === this.awaitingRender); }
  subscribe = (listener) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  setRestoreHandler(handler) { this.options.onRestore = handler; }
  hasUnprotectedChanges() { return !this.closed && (Boolean(this.invalidSnapshot) || this.state.hasPendingChanges); }
  patch(update) {
    if (this.closed) return;
    this.state = { ...this.state, ...update };
    for (const listener of this.listeners) listener();
  }
  live(epoch) { return !this.closed && this.epoch === epoch; }
  assertLive(epoch) {
    if (!this.live(epoch)) throw problem("DRAFT_SESSION_CHANGED", MSG.session);
  }
  clearTimers() {
    if (this.serverTimer) this.cancel(this.serverTimer);
    this.serverTimer = null;
  }

  queueAutosave() {
    const epoch = this.epoch;
    if (this.serverTimer) this.cancel(this.serverTimer);
    this.serverTimer = this.schedule(() => {
      this.serverTimer = null;
      if (this.live(epoch)) void this.flush().catch((error) => this.handleError(error));
    }, 20000);
  }

  friendlyError(error, fallback = MSG.save) {
    if (!error) return fallback;
    if (error.code === "DRAFT_SESSION_CHANGED") return MSG.session;
    if (error.code === "DRAFT_SNAPSHOT_INVALID") return MSG.invalid;
    if (error.code === "OFFLINE" || error.code === "DRAFT_NOT_SAVED") return error.message || fallback;
    if (error.status === 409 || error.code === "FORM_DRAFT_CONFLICT" || error.code === "DRAFT_CONFLICT") return MSG.conflict;
    return fallback;
  }

  async init() {
    this.closed = false;
    this.unregister ||= registerFormDraftCoordinator(this);
    if (!this.latest) this.latest = copy(this.initial);
    const epoch = ++this.epoch;
    this.clearTimers();
    this.patch({
      closed: false, completed: false, ready: false, decision: false, conflict: false,
      status: "checking", error: "", warning: "", deviceSavedAt: "",
    });
    try {
      const remote = await this.api.lookup(this.identity);
      if (!this.live(epoch)) return;
      this.draft = remote || null;
      this.transactionUuid = this.draft?.transaction_uuid || this.uuid();
      const hasDraft = Boolean(this.draft);
      this.patch({
        transactionUuid: this.transactionUuid,
        decision: hasDraft,
        ready: !hasDraft,
        status: "idle",
        lastSavedAt: this.draft?.last_saved_at || "",
        deviceSavedAt: "",
        warning: "",
        error: "",
      });
    } catch (error) {
      if (this.live(epoch)) {
        this.patch({
          ready: false, decision: true, status: "error",
          error: this.friendlyError(error, MSG.lookup),
        });
      }
    }
  }

  setValue(value, fromRender = false) {
    let payload;
    try { payload = assertFormDraftPayload(this.identity.form_type, value); }
    catch (error) {
      this.invalidSnapshot = error;
      this.patch({ hasPendingChanges: true });
      this.handleError(error);
      throw error;
    }
    if (this.closed || !this.state.ready) return;
    if (fromRender && this.awaitingRender && serialized(payload) !== this.awaitingRender) return;
    this.invalidSnapshot = null;
    this.awaitingRender = null;
    this.latest = payload;
    const dirty = serialized(payload) !== this.confirmed;
    this.patch({ hasPendingChanges: dirty, ...(dirty ? { status: this.online() ? "saving" : "offline" } : {}) });
    if (!dirty) {
      this.clearTimers();
      return;
    }
    this.queueAutosave();
  }

  /** No local device checkpoint — server is the only store. */
  checkpoint() {
    return Promise.resolve(false);
  }

  handleError(error) {
    if (this.closed || error.code === "DRAFT_SESSION_CHANGED") return;
    const conflict = error.code === "FORM_DRAFT_CONFLICT" || error.code === "DRAFT_CONFLICT" || error.status === 409;
    if (conflict) {
      this.clearTimers();
      const candidate = error.payload?.data || error.data;
      if (candidate?.id && candidate.form_type === this.identity.form_type && candidate.context_key === this.identity.context_key) {
        this.draft = candidate;
      }
    }
    this.patch({
      status: conflict ? "conflict" : this.online() ? "error" : "offline",
      error: this.friendlyError(error, conflict ? MSG.conflict : MSG.save),
      conflict,
      ...(conflict ? { ready: false, decision: true } : {}),
    });
  }

  async flush(force = false) {
    if (this.invalidSnapshot) throw this.invalidSnapshot;
    if (this.flight) {
      await this.flight;
      if (this.state.hasPendingChanges) return this.flush(force);
      return this.draft;
    }
    if (!this.state.ready || this.closed) throw problem("DRAFT_NOT_READY", MSG.notReady);
    if (this.state.conflict) throw problem("DRAFT_CONFLICT", MSG.conflict);
    if (!force && !this.state.hasPendingChanges) return this.draft;
    const epoch = this.epoch;
    const operation = async () => {
      try {
        this.assertLive(epoch);
        if (!this.online()) throw problem("OFFLINE", MSG.offline);
        const payload = copy(this.latest);
        const sent = serialized(payload);
        this.pendingPayload = sent;
        this.patch({ status: "saving", error: "" });
        let saved;
        try {
          if (!this.draft) this.firstAttempt ||= sent;
          saved = this.draft
            ? await this.api.update(this.draft, this.identity, payload, this.transactionUuid, this.options.baseRevision ?? null)
            : await this.api.create(this.identity, payload, this.transactionUuid, this.options.baseRevision ?? null);
        } catch (error) {
          const candidate = error.payload?.data || error.data;
          if (error.status !== 409 || candidate?.transaction_uuid !== this.transactionUuid) throw error;
          const detail = await this.api.detail(candidate.id);
          this.assertLive(epoch);
          const actual = serialized(detail.payload);
          if (actual === sent) saved = detail;
          else if (!this.draft && actual === this.firstAttempt) {
            saved = await this.api.update(detail, this.identity, payload, this.transactionUuid, this.options.baseRevision ?? null);
          } else throw error;
        }
        if (!this.live(epoch)) {
          // Discard/resume advanced the session while this write was in flight.
          // Retire any draft the stale write just created so Discard stays final.
          if (saved?.id) {
            try { await this.api.discard(saved); } catch { /* best effort */ }
          }
          throw problem("DRAFT_SESSION_CHANGED", MSG.session);
        }
        this.draft = saved;
        this.confirmed = sent;
        this.pendingPayload = this.firstAttempt = null;
        const dirty = serialized(this.latest) !== sent;
        this.patch({
          hasPendingChanges: dirty,
          lastSavedAt: saved.last_saved_at || "",
          deviceSavedAt: "",
          status: dirty ? "saving" : "saved",
          error: "",
        });
        return saved;
      } catch (error) {
        this.handleError(error);
        throw error;
      }
    };
    this.flight = operation();
    try { await this.flight; } finally { this.flight = null; }
    if (this.state.hasPendingChanges) return this.flush();
    return this.draft;
  }

  async resume() {
    if (this.closed || this.state.busy) return false;
    const epoch = ++this.epoch;
    this.clearTimers();
    this.patch({ busy: true, error: "" });
    try {
      const current = await this.api.lookup(this.identity);
      this.assertLive(epoch);
      if (!current) {
        const status = await this.api.status(this.identity, this.transactionUuid);
        this.assertLive(epoch);
        if (status && ["consumed", "discarded", "expired"].includes(status.status)) {
          await this.init();
          return false;
        }
        throw problem("DRAFT_MISSING", MSG.restore);
      }
      const server = await this.api.detail(current.id);
      this.assertLive(epoch);
      if (!server?.payload) throw problem("DRAFT_MISSING", MSG.restore);
      const validated = assertFormDraftPayload(this.identity.form_type, server.payload);
      this.latest = assertFormDraftPayload(
        this.identity.form_type,
        this.options.normalizeSnapshot ? this.options.normalizeSnapshot(validated) : validated,
      );
      this.invalidSnapshot = null;
      this.draft = server;
      this.transactionUuid = server.transaction_uuid || this.transactionUuid;
      this.confirmed = serialized(server.payload);
      this.awaitingRender = serialized(this.latest);
      this.options.onRestore(copy(this.latest));
      const dirty = serialized(this.latest) !== this.confirmed;
      this.patch({
        transactionUuid: this.transactionUuid,
        ready: true, decision: false, conflict: false, busy: false, error: "",
        hasPendingChanges: dirty,
        status: dirty ? "saving" : "saved",
        lastSavedAt: server.last_saved_at || "",
        deviceSavedAt: "",
      });
      if (dirty) this.queueAutosave();
      return true;
    } catch (error) {
      if (this.live(epoch)) {
        this.patch({ busy: false, error: this.friendlyError(error, MSG.restore), status: "error" });
      }
      return false;
    }
  }

  async discard() {
    if (this.closed || this.state.busy) return false;
    ++this.epoch;
    this.clearTimers();
    this.patch({ busy: true, error: "" });
    try {
      if (!this.online()) throw problem("OFFLINE", MSG.offline);
      if (this.draft) await this.api.discard(this.draft);
      this.draft = this.pendingPayload = this.firstAttempt = null;
      this.invalidSnapshot = null;
      this.latest = copy(this.initial);
      this.confirmed = serialized(this.initial);
      this.awaitingRender = null;
      this.options.onRestore(copy(this.initial));
      await this.init();
      if (this.getSnapshot().decision) {
        throw problem("DRAFT_DISCARD_INCOMPLETE", MSG.discard);
      }
    } catch (error) {
      this.patch({
        busy: false, decision: true,
        error: this.friendlyError(error, MSG.discard),
        status: "error",
      });
    } finally {
      this.patch({ busy: false });
    }
  }

  async prepareCommit() {
    this.clearTimers();
    const draft = await this.flush(!this.draft);
    return {
      draftCommit: { id: draft.id, version: draft.version, transaction_uuid: this.transactionUuid },
      draftOwnerContext: this.options.owner,
    };
  }

  async connectionChanged() {
    if (this.closed) return;
    if (!this.online()) {
      this.patch({ status: "offline" });
      return;
    }
    if (this.state.ready && this.state.hasPendingChanges) return this.flush();
    this.patch({ status: this.draft ? "saved" : "idle" });
  }

  async flushBeforeLeave() {
    this.clearTimers();
    if (!this.state.ready || !this.state.hasPendingChanges) return true;
    if (!this.online()) throw problem("DRAFT_NOT_SAVED", MSG.leave);
    try {
      await this.flush();
      return true;
    } catch {
      throw problem("DRAFT_NOT_SAVED", MSG.leave);
    }
  }

  async complete() {
    this.clearTimers();
    ++this.epoch;
    this.close(true);
  }

  close(completed = false) {
    this.clearTimers();
    ++this.epoch;
    this.closed = true;
    this.unregister?.();
    this.unregister = null;
    this.pendingPayload = this.firstAttempt = this.latest = this.invalidSnapshot = null;
    this.state = {
      ...this.state, closed: true, completed, ready: completed, decision: false,
      error: "", warning: "", hasPendingChanges: false, status: "idle", deviceSavedAt: "",
    };
    for (const listener of this.listeners) listener();
    this.listeners.clear();
  }
}

export const createFormDraftCoordinator = (options) => new FormDraftCoordinator(options);
