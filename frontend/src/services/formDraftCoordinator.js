import { assertFormDraftPayload } from "../utils/formDraftRegistry.js";
import { formDraftSlot, formDraftOwnerTag, importRecoveryKey } from "./formDraftVault.js";
import { registerFormDraftCoordinator } from "./formDraftSession.js";

const copy = (value) => JSON.parse(JSON.stringify(value));
const ordered = (value) => Array.isArray(value) ? value.map(ordered) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])])) : value;
const serialized = (value) => JSON.stringify(ordered(value));
const problem = (code, message) => Object.assign(new Error(message), { code });

class FormDraftCoordinator {
  constructor(options) {
    this.options = options;
    this.api = options.api;
    this.vault = options.vault;
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
    this.localRevision = 0;
    this.localQueue = Promise.resolve();
    this.state = { ready: false, decision: false, status: "checking", error: "", warning: "", hasPendingChanges: false, lastSavedAt: "", deviceSavedAt: "", transactionUuid: "", conflict: false };
  }

  getSnapshot = () => this.state;
  isReadyForValue(value) { return this.state.ready && (!this.awaitingRender || serialized(value) === this.awaitingRender); }
  subscribe = (listener) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  setRestoreHandler(handler) { this.options.onRestore = handler; }
  hasUnprotectedChanges() { return !this.closed && (Boolean(this.invalidSnapshot) || this.state.hasPendingChanges && this.lastLocal !== serialized(this.latest)); }
  patch(update) {
    if (this.closed) return;
    this.state = { ...this.state, ...update };
    for (const listener of this.listeners) listener();
  }
  live(epoch) { return !this.closed && this.epoch === epoch; }
  assertLive(epoch) {
    if (!this.live(epoch)) throw problem("DRAFT_SESSION_CHANGED", "Reopen the form in your current account before saving.");
  }
  clearTimers() {
    if (this.localTimer) this.cancel(this.localTimer);
    if (this.serverTimer) this.cancel(this.serverTimer);
    this.localTimer = this.serverTimer = null;
  }

  queueAutosave() {
    const epoch = this.epoch;
    if (!this.localTimer) this.localTimer = this.schedule(() => {
      this.localTimer = null;
      if (this.live(epoch)) void this.checkpoint().catch((error) => this.handleError(error));
    }, 1500);
    if (this.serverTimer) this.cancel(this.serverTimer);
    this.serverTimer = this.schedule(() => {
      this.serverTimer = null;
      if (this.live(epoch)) void this.flush().catch((error) => this.handleError(error));
    }, 20000);
  }

  async init() {
    this.closed = false;
    this.recoveryReplacement = null;
    this.unregister ||= registerFormDraftCoordinator(this);
    if (!this.latest) this.latest = copy(this.initial);
    const epoch = ++this.epoch;
    this.clearTimers();
    this.patch({ closed: false, completed: false, ready: false, decision: false, conflict: false, status: "checking", error: "" });
    try {
      this.slot = await formDraftSlot({ owner: this.options.owner, formType: this.identity.form_type, mode: this.identity.mode, contextKey: this.identity.context_key });
      this.ownerTag = await formDraftOwnerTag(this.options.owner);
      if (!this.live(epoch)) return;
      const [remote, local] = await Promise.allSettled([this.api.lookup(this.identity), this.vault.inspect(this.slot)]);
      if (!this.live(epoch)) return;
      if (remote.status === "rejected") throw remote.reason;
      this.draft = remote.value;
      this.localAvailable = local.status === "fulfilled";
      let row = this.localAvailable ? local.value : null;
      this.localRevision = row?.revision || 0;
      if (row && !row.terminal) {
        const terminal = await this.api.status(this.identity, row.transactionUuid);
        this.assertLive(epoch);
        if (terminal && ["consumed", "discarded", "expired"].includes(terminal.status)) {
          row = await this.vault.retire(this.slot, row.transactionUuid);
          this.localRevision = row.revision;
          if (serialized(this.latest) !== serialized(this.initial)) {
            this.latest = copy(this.initial);
            this.confirmed = serialized(this.initial);
            this.awaitingRender = serialized(this.initial);
            this.options.onRestore(copy(this.initial));
          }
        }
      }
      if (row && !row.terminal && Date.parse(row.expiresAt) <= Date.now()) {
        row = await this.vault.retire(this.slot, row.transactionUuid);
        this.localRevision = row.revision;
      }
      this.local = row && !row.terminal && !row.reserved ? row : null;
      this.transactionUuid = this.draft?.transaction_uuid || this.local?.transactionUuid || (row && !row.terminal ? row.transactionUuid : this.uuid());
      if (this.localAvailable) {
        const reservation = await this.vault.reserve(this.slot, this.transactionUuid, Boolean(this.draft), this.ownerTag);
        this.assertLive(epoch);
        this.localRevision = reservation.revision;
        if (!this.draft) this.transactionUuid = reservation.transactionUuid;
      }
      this.patch({ transactionUuid: this.transactionUuid, decision: Boolean(this.draft || this.local), ready: !this.draft && !this.local && !this.localAvailable, status: "idle", lastSavedAt: this.draft?.last_saved_at || "", deviceSavedAt: this.local?.savedAt || "", warning: this.localAvailable ? "" : "Device recovery is unavailable. Only confirmed server saves can be recovered." });
      if (!this.draft && !this.local && this.localAvailable) {
        await this.warmKey(epoch).catch((error) => { if (this.live(epoch)) this.patch({ warning: error.message }); });
        if (this.live(epoch)) this.patch({ ready: true });
      }
    } catch (error) {
      if (this.live(epoch)) this.patch({ ready: false, decision: true, status: "error", error: error.message || "Unable to check unfinished input." });
    }
  }

  async warmKey(epoch) {
    if (this.key && Date.parse(this.descriptor.expires_at) > Date.now()) return;
    const result = await this.api.key(this.identity, this.transactionUuid, this.local);
    this.assertLive(epoch);
    const key = await importRecoveryKey(result.key_material);
    this.assertLive(epoch);
    this.key = key;
    this.descriptor = { key_id: result.key_id, key_version: result.key_version, expires_at: result.expires_at };
  }

  setValue(value, fromRender = false) {
    let payload;
    try { payload = assertFormDraftPayload(this.identity.form_type, value); }
    catch (error) { this.invalidSnapshot = error; this.patch({ hasPendingChanges: true }); this.handleError(error); throw error; }
    if (this.closed || !this.state.ready) return;
    if (fromRender && this.awaitingRender && serialized(payload) !== this.awaitingRender) return;
    this.invalidSnapshot = null;
    this.awaitingRender = null;
    this.latest = payload;
    const dirty = serialized(payload) !== this.confirmed;
    this.patch({ hasPendingChanges: dirty, ...(dirty ? { status: this.online() ? "saving" : "offline" } : {}) });
    if (!dirty) {
      this.clearTimers();
      if (this.local && this.lastLocal !== serialized(payload)) void this.checkpoint().catch((error) => this.handleError(error));
      return;
    }
    this.queueAutosave();
  }

  checkpoint() {
    if (this.invalidSnapshot) return Promise.reject(this.invalidSnapshot);
    if (this.options.preferLatestRecovery && this.awaitingRender) return Promise.reject(problem("DRAFT_NOT_READY", "Wait for the restored registration to open before saving."));
    const epoch = this.epoch;
    const operation = this.localQueue.catch(() => {}).then(async () => {
      this.assertLive(epoch);
      if (!this.localAvailable) return false;
      await this.warmKey(epoch);
      this.assertLive(epoch);
      const payload = copy(this.latest);
      const row = await this.vault.write({
        slot: this.slot, key: this.key, descriptor: this.descriptor,
        ownerTag: this.ownerTag, unsynced: serialized(payload) !== this.confirmed || !this.draft,
        transactionUuid: this.transactionUuid, expectedRevision: this.localRevision,
        replaceTransactionUuid: this.recoveryReplacement,
        snapshot: { payload, baseRevision: this.options.baseRevision ?? null, serverVersion: this.draft?.version ?? null, serverPayload: this.confirmed, pendingPayload: this.pendingPayload || null },
      });
      this.assertLive(epoch);
      this.localRevision = row.revision;
      this.recoveryReplacement = null;
      this.local = row;
      this.lastLocal = serialized(payload);
      this.patch({ deviceSavedAt: row.savedAt, warning: "", status: this.online() ? "device-only" : "offline" });
      return true;
    });
    this.localQueue = operation;
    return operation;
  }

  handleError(error) {
    if (this.closed || error.code === "DRAFT_SESSION_CHANGED") return;
    const conflict = error.code === "LOCAL_DRAFT_CONFLICT" || error.status === 409;
    if (conflict) {
      this.clearTimers();
      const candidate = error.payload?.data || error.data;
      if (candidate?.id && candidate.form_type === this.identity.form_type && candidate.context_key === this.identity.context_key) this.draft = candidate;
    }
    this.patch({ status: conflict ? "conflict" : this.online() ? "error" : "offline", error: error.code === "DRAFT_SNAPSHOT_INVALID" ? "Recovery cannot save this input yet. Keep the form open and retry." : error.message || "Draft could not be saved.", conflict,
      ...(conflict ? { ready: false, decision: true } : {}),
    });
  }

  async flush(force = false) {
    if (this.invalidSnapshot) throw this.invalidSnapshot;
    if (this.flight) { await this.flight; if (this.state.hasPendingChanges) return this.flush(force); return this.draft; }
    if (!this.state.ready || this.closed) throw problem("DRAFT_NOT_READY", "Resolve the unfinished form before saving.");
    if (this.state.conflict) throw problem("DRAFT_CONFLICT", "Review the conflicting draft before saving.");
    if (!force && !this.state.hasPendingChanges) return this.draft;
    const epoch = this.epoch;
    const operation = async () => {
      try {
        await this.checkpoint().catch((error) => {
          if (error.code === "LOCAL_DRAFT_CONFLICT" || error.code === "DRAFT_SESSION_CHANGED" || [403, 409].includes(error.status)) throw error;
          this.patch({ warning: error.message });
        });
        this.assertLive(epoch);
        if (!this.online()) throw problem("OFFLINE", "Connect to the internet before saving. Your input remains in this open form.");
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
          else if (!this.draft && actual === this.firstAttempt) saved = await this.api.update(detail, this.identity, payload, this.transactionUuid, this.options.baseRevision ?? null);
          else throw error;
        }
        this.assertLive(epoch);
        this.draft = saved;
        this.confirmed = sent;
        if (this.localAvailable && this.lastLocal === sent) await this.vault.acknowledge(this.slot, this.transactionUuid, this.localRevision).catch(() => {});
        this.assertLive(epoch);
        this.pendingPayload = this.firstAttempt = null;
        const dirty = serialized(this.latest) !== sent;
        this.patch({ hasPendingChanges: dirty, lastSavedAt: saved.last_saved_at || "", deviceSavedAt: this.lastLocal === sent ? "" : this.state.deviceSavedAt, status: dirty ? "saving" : "saved", error: "" });
        return saved;
      } catch (error) { this.handleError(error); throw error; }
    };
    this.flight = operation();
    try { await this.flight; } finally { this.flight = null; }
    if (this.state.hasPendingChanges) return this.flush();
    return this.draft;
  }

  async resume(source = "auto") {
    if (this.options.preferLatestRecovery) return this.resumeLatestRecovery(source);
    if (this.closed || this.state.busy) return false;
    const currentInput = this.state.hasPendingChanges ? copy(this.latest) : null;
    const epoch = ++this.epoch;
    this.clearTimers();
    this.patch({ busy: true, error: "" });
    try {
      const current = await this.api.lookup(this.identity);
      this.assertLive(epoch);
      if (!current) {
        const status = await this.api.status(this.identity, this.transactionUuid);
        this.assertLive(epoch);
        if (status && ["consumed", "discarded", "expired"].includes(status.status)) { await this.init(); return false; }
      }
      const server = current ? await this.api.detail(current.id) : null;
      this.assertLive(epoch);
      const targetUuid = server?.transaction_uuid || this.transactionUuid;
      const oldUuid = this.local?.transactionUuid || this.transactionUuid;
      if (source === "auto" && oldUuid !== targetUuid) {
        this.patch({ conflict: true, status: "conflict", busy: false, error: "Another session saved this form. Choose which input to review." });
        return false;
      }
      let local;
      if (this.local && source !== "server") {
        if (oldUuid !== this.transactionUuid) {
          const descriptor = await this.api.key(this.identity, oldUuid, this.local);
          this.assertLive(epoch);
          const key = await importRecoveryKey(descriptor.key_material);
          local = await this.vault.open(this.slot, key);
        } else {
          await this.warmKey(epoch);
          local = await this.vault.open(this.slot, this.key);
        }
        this.assertLive(epoch);
      }
      const serverValue = server?.payload;
      const divergent = local && server && serialized(local.payload) !== serialized(serverValue) &&
        local.serverVersion !== server.version && local.serverPayload !== serialized(serverValue) && local.pendingPayload !== serialized(serverValue);
      if (source === "auto" && divergent) {
        this.patch({ conflict: true, status: "conflict", error: "The server draft changed in another session. Choose which copy to review.", busy: false });
        return false;
      }
      const payload = source === "server" ? serverValue : source === "device" && currentInput ? currentInput : local?.payload || serverValue;
      if (!payload) throw new Error("This recovery copy is unavailable. Retry or discard the draft.");
      if (oldUuid !== targetUuid) {
        const oldKey = this.local?.keyId || this.descriptor?.key_id;
        if (oldKey) await this.api.retireDevice(this.identity, oldUuid, oldKey);
        if (this.localAvailable) await this.vault.retire(this.slot, oldUuid);
        this.key = this.descriptor = this.local = null;
      }
      this.transactionUuid = targetUuid;
      if (this.localAvailable) {
        const row = await this.vault.reserve(this.slot, targetUuid, true, this.ownerTag);
        this.assertLive(epoch);
        this.localRevision = row.revision;
      }
      const validated = assertFormDraftPayload(this.identity.form_type, payload);
      this.latest = assertFormDraftPayload(this.identity.form_type, this.options.normalizeSnapshot ? this.options.normalizeSnapshot(validated) : validated);
      this.invalidSnapshot = null;
      this.draft = server;
      this.confirmed = serialized(serverValue || this.initial);
      this.awaitingRender = serialized(this.latest);
      this.options.onRestore(copy(this.latest));
      const dirty = serialized(this.latest) !== this.confirmed;
      this.patch({ transactionUuid: targetUuid, ready: true, decision: false, conflict: false, busy: false, error: "", hasPendingChanges: dirty, status: dirty || !server ? "device-only" : "saved", lastSavedAt: server?.last_saved_at || "" });
      if (!this.key && this.localAvailable) await this.warmKey(epoch).catch((error) => this.patch({ warning: error.message }));
      if (source !== "auto" && this.localAvailable) await this.checkpoint();
      if (dirty) this.queueAutosave();
      return true;
    } catch (error) { if (this.live(epoch)) this.patch({ busy: false, error: error.message, status: "error" }); return false; }
  }

  // Opted into only by Walk-in Check-in -> Register New Patient. Other forms
  // keep the existing recovery decisions above.
  async resumeLatestRecovery(source) {
    if (this.closed || this.state.busy) return false;
    const currentInput = this.state.hasPendingChanges ? copy(this.latest) : null;
    const epoch = ++this.epoch;
    this.clearTimers();
    this.patch({ busy: true, error: "" });
    try {
      await this.localQueue.catch(() => {});
      this.assertLive(epoch);
      const current = await this.api.lookup(this.identity);
      this.assertLive(epoch);
      if (!current) {
        const status = await this.api.status(this.identity, this.transactionUuid);
        this.assertLive(epoch);
        if (status && ["consumed", "discarded", "expired"].includes(status.status)) { await this.init(); return false; }
      }
      const server = current ? await this.api.detail(current.id) : null;
      this.assertLive(epoch);
      const row = this.localAvailable ? await this.vault.inspect(this.slot) : null;
      this.assertLive(epoch);
      let local, descriptor, key;
      if (row && !row.terminal && !row.reserved && source !== "server") {
        descriptor = await this.api.key(this.identity, row.transactionUuid, row);
        this.assertLive(epoch);
        key = await importRecoveryKey(descriptor.key_material);
        local = await this.vault.open(this.slot, key);
        const checked = await this.vault.inspect(this.slot);
        this.assertLive(epoch);
        if (checked?.revision !== row.revision || checked?.transactionUuid !== row.transactionUuid || checked?.terminal) {
          throw new Error("The device copy changed in another tab. Retry to load its latest entries.");
        }
      }
      const normalize = (payload) => {
        const valid = assertFormDraftPayload(this.identity.form_type, payload);
        return assertFormDraftPayload(this.identity.form_type, this.options.normalizeSnapshot ? this.options.normalizeSnapshot(valid) : valid);
      };
      // Validate both independently. A malformed copy must not mask a valid one,
      // and neither copy is modified during recovery or a failed restore.
      let deviceValue, serverValue, invalid;
      try { if (currentInput || local) deviceValue = normalize(currentInput || local.payload); } catch (error) { invalid = error; }
      try { if (server) serverValue = normalize(server.payload); } catch (error) { invalid = error; }
      let choice = source;
      if (source === "auto") {
        if (!deviceValue) choice = "server";
        else if (!serverValue) choice = "device";
        else if (serialized(deviceValue) === serialized(serverValue)) choice = "server";
        else if (local && row.transactionUuid === server.transaction_uuid) {
          const version = local.serverVersion;
          const sameBase = local.serverPayload === serialized(server.payload);
          const pendingSaved = local.pendingPayload === serialized(server.payload);
          const unchangedInput = !currentInput || serialized(currentInput) === serialized(local.payload);
          // Acknowledgement and revision links establish causal order. Device
          // savedAt and server last_saved_at use different clocks.
          if (unchangedInput && row.unsynced === false && Number.isInteger(server.version) && server.version >= (version ?? 0)) choice = "server";
          else if (version === server.version || sameBase || pendingSaved) choice = "device";
          else if (unchangedInput && Number.isInteger(version) && server.version > version && serialized(local.payload) === local.serverPayload) choice = "server";
        }
        if (choice === "auto") {
          this.draft = server;
          this.local = row;
          this.patch({ ready: false, decision: true, conflict: true, status: "conflict", busy: false,
            error: "Both copies contain different entries and their order cannot be verified. Choose the copy to continue. Both are kept until restoration succeeds." });
          return false;
        }
      }
      const payload = choice === "device" ? deviceValue : serverValue;
      if (!payload) throw invalid || new Error("This recovery copy is unavailable.");
      this.options.onRestore(copy(payload));
      this.assertLive(epoch);
      const targetUuid = server?.transaction_uuid || row?.transactionUuid || this.transactionUuid;
      const deviceRow = row && !row.terminal && !row.reserved ? row : null;
      const sameTransaction = deviceRow?.transactionUuid === targetUuid;
      this.transactionUuid = targetUuid;
      this.latest = payload;
      this.invalidSnapshot = null;
      this.draft = server;
      this.confirmed = serialized(server?.payload || this.initial);
      this.awaitingRender = serialized(payload);
      this.local = sameTransaction ? deviceRow : null;
      this.localRevision = row?.revision ?? this.localRevision;
      this.lastLocal = local && sameTransaction ? serialized(local.payload) : null;
      this.key = sameTransaction ? key : null;
      this.descriptor = sameTransaction && descriptor ? { key_id: descriptor.key_id, key_version: descriptor.key_version, expires_at: descriptor.expires_at } : null;
      // Keep a different transaction's ciphertext until the form acknowledges
      // hydration and a later checkpoint can replace it atomically.
      this.recoveryReplacement = deviceRow && !sameTransaction ? deviceRow.transactionUuid : null;
      const dirty = serialized(payload) !== this.confirmed;
      this.patch({ transactionUuid: targetUuid, ready: true, decision: false, conflict: false, busy: false, error: "",
        hasPendingChanges: dirty, status: dirty || !server ? "device-only" : "saved", lastSavedAt: server?.last_saved_at || "", deviceSavedAt: deviceRow?.savedAt || "" });
      return true;
    } catch (error) {
      if (this.live(epoch)) this.patch({ ready: false, decision: true, busy: false, status: "error",
        error: `Unable to restore registration. Your draft is still saved. Retry. ${error.message || ""}` });
      return false;
    }
  }

  async discard() {
    if (this.closed || this.state.busy) return false;
    ++this.epoch;
    this.clearTimers();
    this.patch({ busy: true, error: "" });
    try {
      await this.localQueue.catch(() => {});
      if (!this.online()) throw problem("OFFLINE", "Connect to the internet before discarding this draft.");
      if (this.draft) await this.api.discard(this.draft);
      else if (this.local || this.descriptor) await this.api.retireDevice(this.identity, this.transactionUuid, this.local?.keyId || this.descriptor?.key_id);
      if (this.localAvailable) await this.vault.retire(this.slot, this.transactionUuid);
      this.draft = this.local = this.key = this.descriptor = null;
      this.invalidSnapshot = null;
      this.latest = copy(this.initial);
      this.confirmed = serialized(this.initial);
      this.awaitingRender = serialized(this.initial);
      this.options.onRestore(copy(this.initial));
      await this.init();
    } catch (error) { this.patch({ busy: false, decision: true, error: error.message, status: "error" }); }
    finally { this.patch({ busy: false }); }
  }

  async prepareCommit() {
    const draft = await this.flush(true);
    return { draftCommit: { id: draft.id, version: draft.version, transaction_uuid: this.transactionUuid }, draftOwnerContext: this.options.owner };
  }

  async connectionChanged() {
    if (this.closed) return;
    if (!this.online()) {
      this.patch({ status: "offline" });
      if (this.state.ready && this.state.hasPendingChanges) return this.checkpoint();
    } else if (this.state.ready && this.state.hasPendingChanges) return this.flush();
    else this.patch({ status: this.draft ? "saved" : "idle" });
  }

  async flushBeforeLeave() {
    this.clearTimers();
    if (!this.state.ready || !this.state.hasPendingChanges) return true;
    let protectedOnDevice = false;
    try { protectedOnDevice = await this.checkpoint(); }
    catch (error) { this.patch({ warning: error.message }); }
    if (this.online()) {
      try { await this.flush(); return true; }
      catch (error) { if (!protectedOnDevice) throw error; }
    }
    if (!protectedOnDevice) throw problem("DRAFT_NOT_SAVED", "This input is not saved yet. Keep the form open and retry before leaving.");
    return true;
  }

  async complete() {
    this.clearTimers();
    ++this.epoch;
    await this.localQueue.catch(() => {});
    if (this.localAvailable) await this.vault.retire(this.slot, this.transactionUuid).catch(() => {});
    this.close(true);
  }

  close(completed = false) {
    this.clearTimers();
    ++this.epoch;
    this.closed = true;
    this.unregister?.();
    this.unregister = null;
    this.key = this.descriptor = this.pendingPayload = this.firstAttempt = this.latest = this.invalidSnapshot = null;
    this.state = { ...this.state, closed: true, completed, ready: completed, decision: false, error: "", warning: "", hasPendingChanges: false, status: "idle" };
    for (const listener of this.listeners) listener();
    this.listeners.clear();
  }
}

export const createFormDraftCoordinator = (options) => new FormDraftCoordinator(options);
