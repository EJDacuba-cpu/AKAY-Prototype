import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { QueryClient } from "@tanstack/react-query";

const user = { id: 7, role: "admin", name: "Test account" };
const session = { token: "refreshed-test-token", user };
const json = (status, body = {}) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});
const expired = () => json(401, { code: "SESSION_EXPIRED" });
const dataModule = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
let moduleId = 0;

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function storage() {
  const entries = new Map();
  return {
    get length() { return entries.size; },
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
    key: (index) => [...entries.keys()][index],
  };
}

async function harness(t, respond, { timeoutMs = 10000 } = {}) {
  const calls = [], clears = [], broadcasts = [], redirects = [];
  const queryClient = new QueryClient();
  queryClient.setQueryData(["protected-test-data"], { synthetic: true });
  let vaultPurges = 0;
  const browser = Object.assign(new EventTarget(), {
    localStorage: storage(), sessionStorage: storage(),
    location: { pathname: "/admin/dashboard", assign: (path) => redirects.push(path) },
    BroadcastChannel: class {
      postMessage(message) { broadcasts.push(message); }
      close() {}
    },
  });
  browser.addEventListener("akay:sensitive-session-cleared", (event) => clears.push(event.detail));
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    // Fail the test on unexpected calls: no real HTTP request can escape this harness.
    const call = { path: new URL(url).pathname.replace(/^\/api/, ""), ...options };
    calls.push(call);
    options.signal.throwIfAborted();
    return respond(call, calls.length);
  });
  t.after(() => {
    queryClient.clear();
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else delete globalThis.window;
  });

  // Execute the real client and privacy utility. Only Vite configuration, the cache
  // instance, and the IndexedDB vault boundary are injected, like other service tests.
  const key = `__authRecoveryTest${moduleId++}`;
  globalThis[key] = { queryClient, purge: async () => { vaultPurges++; } };
  const boundaries = dataModule(`const fixture = globalThis.${key};
    export const queryClient = fixture.queryClient;
    export const purgeLocalDraftVault = fixture.purge;`);
  const privacy = await readFile(new URL("../utils/sessionPrivacy.js", import.meta.url), "utf8");
  const privacyUrl = dataModule(privacy.replace('"../services/localDraftVault"', JSON.stringify(boundaries)));
  const clientUrl = new URL("./apiClient.js", import.meta.url);
  const source = await readFile(clientUrl, "utf8");
  const replacements = {
    "../lib/queryClient": boundaries,
    "../utils/sessionPrivacy": privacyUrl,
    "../config/environment": dataModule('export const API_BASE_URL = "https://example.test/api";'),
  };
  const executable = source
    .replace(/from "([^"]+)"/g, (_, specifier) => `from ${JSON.stringify(replacements[specifier] || new URL(`${specifier}.js`, clientUrl).href)}`)
    .replaceAll("import.meta.env", `({ VITE_REQUEST_TIMEOUT_MS: ${timeoutMs} })`);
  let api;
  try {
    api = await import(`${dataModule(executable)}#${key}`);
  } finally {
    delete globalThis[key];
  }
  api.storeAuthSession({ token: "original-test-token", user });
  return { api, calls, clears, broadcasts, redirects, queryClient, get vaultPurges() { return vaultPurges; } };
}

function preserved(h, token = "original-test-token") {
  assert.equal(h.api.getAuthToken(), token);
  assert.equal(h.api.getStoredAuthUser().id, "7");
  assert.deepEqual(h.clears, []);
  assert.deepEqual(h.broadcasts, []);
  assert.equal(h.vaultPurges, 0);
}

function invalidated(h) {
  assert.equal(h.api.getAuthToken(), null);
  assert.equal(h.api.getStoredAuthUser(), null);
  assert.equal(h.api.getAuthRecoveryError(), null);
  assert.equal(h.queryClient.getQueryData(["protected-test-data"]), undefined);
  assert.equal(h.clears.length, 1);
  assert.equal(h.broadcasts.length, 1);
  assert.equal(h.vaultPurges, 1);
}

for (const status of [429, 500, 501, 502, 503, 504]) {
  test(`protected 401 then refresh ${status} retains the session and gates further protected requests`, async (t) => {
    const h = await harness(t, (call) => call.path === "/auth/refresh" ? json(status) : expired());
    let notifications = 0;
    const unsubscribe = h.api.subscribeToAuthRecovery(() => { notifications++; });
    await assert.rejects(h.api.apiRequest("/protected"), { status });
    preserved(h);
    assert.equal(h.api.getAuthRecoveryError().status, status);
    assert.equal(notifications, 1);
    await assert.rejects(h.api.apiRequest("/other-protected"), { status });
    assert.equal(h.calls.length, 2);
    unsubscribe();
  });
}

test("refresh network failure is recoverable and a successful explicit retry releases the gate", async (t) => {
  let available = false;
  const h = await harness(t, (call) => {
    if (call.path === "/auth/refresh") {
      if (!available) throw new TypeError("Simulated network failure");
      return json(200, session);
    }
    return available ? json(200, { ok: true }) : expired();
  });
  await assert.rejects(h.api.apiRequest("/protected"), { code: "NETWORK_ERROR" });
  preserved(h);
  assert.equal(h.api.getAuthRecoveryError().isNetworkError, true);
  available = true;
  await h.api.refreshAuthSession();
  assert.equal(h.api.getAuthRecoveryError(), null);
  assert.deepEqual(await h.api.apiRequest("/protected"), { ok: true });
  preserved(h, session.token);
});

test("refresh timeout preserves credentials and exposes a recoverable timeout", async (t) => {
  const h = await harness(t, (call) => call.path !== "/auth/refresh" ? expired() : new Promise((_, reject) => {
    call.signal.addEventListener("abort", () => reject(call.signal.reason), { once: true });
  }), { timeoutMs: 10 });
  await assert.rejects(h.api.apiRequest("/protected"), { code: "TIMEOUT" });
  preserved(h);
  assert.equal(h.api.getAuthRecoveryError().isTimeout, true);
});

test("successful refresh followed by replay 503 preserves the newly verified session", async (t) => {
  const h = await harness(t, (call, number) => call.path === "/auth/refresh"
    ? json(200, session) : number === 1 ? expired() : json(503));
  await assert.rejects(h.api.apiRequest("/protected"), { status: 503 });
  preserved(h, session.token);
  assert.equal(h.api.getAuthRecoveryError(), null);
  assert.deepEqual(h.calls.map((call) => call.path), ["/protected", "/auth/refresh", "/protected"]);
  assert.equal(h.calls[2].headers.Authorization, `Bearer ${session.token}`);
});

test("SESSION_REPLACED clears the session like a forced invalidation", async (t) => {
  const h = await harness(t, () => json(401, {
    message: "You have been signed out because your account was logged in on another device.",
    code: "SESSION_REPLACED",
  }));
  await assert.rejects(h.api.apiRequest("/protected", { retryAfterRefresh: false }), { code: "SESSION_REPLACED" });
  invalidated(h);
  assert.equal(h.clears[0]?.reason, "session-replaced");
});

for (const code of ["SESSION_INVALID", "SESSION_EXPIRED"]) {
  test(`definitively rejected refresh (${code}) clears credentials and sensitive state`, async (t) => {
    const h = await harness(t, (call) => call.path === "/auth/refresh" ? json(401, { code }) : expired());
    await assert.rejects(h.api.apiRequest("/protected"), { status: 401, code });
    invalidated(h);
  });
}

for (const phase of ["initial", "refresh", "replay"]) {
  for (const code of ["ACCOUNT_INACTIVE", "SESSION_CONTEXT_INVALID", "ACCOUNT_SETUP_REQUIRED"]) {
    test(`${phase} account-invalidating 403 (${code}) retains existing cleanup`, async (t) => {
      const h = await harness(t, (call, number) => {
        if (phase === "initial" || (phase === "refresh" && call.path === "/auth/refresh") || (phase === "replay" && number === 3)) {
          return json(403, { code });
        }
        return call.path === "/auth/refresh" ? json(200, session) : expired();
      });
      await assert.rejects(h.api.apiRequest("/protected"), { status: 403, code });
      invalidated(h);
    });
  }
}

test("replay password-change 403 keeps its redirect without invalidating the refreshed session", async (t) => {
  const h = await harness(t, (call, number) => call.path === "/auth/refresh"
    ? json(200, session) : number === 1 ? expired() : json(403, { code: "PASSWORD_CHANGE_REQUIRED" }));
  await assert.rejects(h.api.apiRequest("/protected"), { status: 403 });
  preserved(h, session.token);
  assert.deepEqual(h.redirects, ["/change-password"]);
});

test("concurrent protected 401 responses share one refresh and replay once each", async (t) => {
  const refresh = deferred(), started = deferred();
  const h = await harness(t, (call) => {
    if (call.path === "/auth/refresh") { started.resolve(); return refresh.promise; }
    return call.headers.Authorization === `Bearer ${session.token}` ? json(200, { ok: true }) : expired();
  });
  const requests = Promise.all([h.api.apiRequest("/one"), h.api.apiRequest("/two")]);
  await started.promise;
  refresh.resolve(json(200, session));
  await requests;
  assert.equal(h.calls.filter((call) => call.path === "/auth/refresh").length, 1);
  assert.equal(h.calls.filter((call) => call.path === "/one").length, 2);
  assert.equal(h.calls.filter((call) => call.path === "/two").length, 2);
  preserved(h, session.token);
});

test("a second 401 after refresh invalidates without another refresh loop", async (t) => {
  const h = await harness(t, (call) => call.path === "/auth/refresh" ? json(200, session) : expired());
  await assert.rejects(h.api.apiRequest("/protected"), { status: 401 });
  assert.equal(h.calls.length, 3);
  invalidated(h);
});

for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
  test(`${method} clinical request is sent only once even when refresh succeeds`, async (t) => {
    const h = await harness(t, (call) => call.path === "/auth/refresh" ? json(200, session) : expired());
    await assert.rejects(h.api.apiRequest("/clinical-write", { method, body: { synthetic: true } }), {
      code: "AUTH_RECOVERED_RETRY_REQUIRED",
    });
    assert.deepEqual(h.calls.map((call) => call.path), ["/clinical-write", "/auth/refresh"]);
    preserved(h, session.token);
  });
}

test("an opted-out request does not refresh", async (t) => {
  const h = await harness(t, expired);
  await assert.rejects(h.api.apiRequest("/protected", { retryAfterRefresh: false }), { status: 401 });
  assert.equal(h.calls.length, 1);
  invalidated(h);
});

test("malformed refresh success is recoverable, not fabricated invalid authentication", async (t) => {
  const h = await harness(t, (call) => call.path === "/auth/refresh" ? json(200, {}) : expired());
  await assert.rejects(h.api.apiRequest("/protected"), { code: "SESSION_RESTORE_UNAVAILABLE" });
  preserved(h);
  assert.equal(h.api.getAuthRecoveryError().status, undefined);
});

test("explicit recovery retry that discovers revocation clears the recoverable session", async (t) => {
  let revoked = false;
  const h = await harness(t, (call) => call.path === "/auth/refresh"
    ? revoked ? json(401, { code: "SESSION_INVALID" }) : json(503)
    : expired());
  await assert.rejects(h.api.apiRequest("/protected"), { status: 503 });
  preserved(h);
  revoked = true;
  await assert.rejects(h.api.refreshAuthSession(), { code: "SESSION_INVALID" });
  invalidated(h);
});

test("ordinary replay permission denial does not invalidate a refreshed session", async (t) => {
  const h = await harness(t, (call, number) => call.path === "/auth/refresh"
    ? json(200, session) : number === 1 ? expired() : json(403, { message: "Access not assigned." }));
  await assert.rejects(h.api.apiRequest("/protected"), { status: 403 });
  preserved(h, session.token);
  assert.equal(h.api.getAuthRecoveryError(), null);
});

test("cancellation as shared refresh starts rejects the caller before refresh finishes", async (t) => {
  const refresh = deferred();
  const controller = new AbortController();
  const h = await harness(t, (call) => {
    if (call.path === "/auth/refresh") { controller.abort(); return refresh.promise; }
    return expired();
  });
  await assert.rejects(h.api.apiRequest("/protected", { signal: controller.signal }), (error) => error === controller.signal.reason);
  const completion = h.api.refreshAuthSession();
  refresh.resolve(json(200, session));
  await completion;
  assert.equal(h.calls.length, 2);
  preserved(h, session.token);
});

test("cancelling one refresh waiter is immediate and does not cancel another caller", async (t) => {
  const refresh = deferred(), started = deferred();
  let refreshSignal;
  const h = await harness(t, (call) => {
    if (call.path === "/auth/refresh") { refreshSignal = call.signal; started.resolve(); return refresh.promise; }
    return call.headers.Authorization === `Bearer ${session.token}` ? json(200, {}) : expired();
  });
  const controller = new AbortController();
  const cancelled = h.api.apiRequest("/cancelled", { signal: controller.signal });
  const other = h.api.apiRequest("/other");
  await started.promise;
  controller.abort();
  await assert.rejects(cancelled, (error) => error === controller.signal.reason);
  assert.equal(refreshSignal.aborted, false);
  refresh.resolve(json(200, session));
  await other;
  assert.equal(h.calls.filter((call) => call.path === "/cancelled").length, 1);
  assert.equal(h.calls.filter((call) => call.path === "/auth/refresh").length, 1);
  preserved(h, session.token);
});

test("cancelling replay preserves the refreshed session and original abort error", async (t) => {
  const replayStarted = deferred();
  const controller = new AbortController();
  const h = await harness(t, (call, number) => {
    if (call.path === "/auth/refresh") return json(200, session);
    if (number === 1) return expired();
    replayStarted.resolve();
    return new Promise((_, reject) => call.signal.addEventListener("abort", () => reject(call.signal.reason), { once: true }));
  });
  const request = h.api.apiRequest("/protected", { signal: controller.signal });
  await replayStarted.promise;
  controller.abort();
  await assert.rejects(request, (error) => error === controller.signal.reason);
  preserved(h, session.token);
  assert.equal(h.api.getAuthRecoveryError(), null);
});

test("an already cancelled request sends nothing", async (t) => {
  const h = await harness(t, () => assert.fail("Unexpected request"));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(h.api.apiRequest("/protected", { signal: controller.signal }), (error) => error === controller.signal.reason);
  assert.equal(h.calls.length, 0);
  preserved(h);
});

test("a browser CORS-style fetch rejection becomes the FSN connection message without retrying registration", async (t) => {
  const cause = new TypeError("Failed to fetch");
  const h = await harness(t, call => {
    assert.equal(call.headers['X-Form-Draft-Id'], 'synthetic-draft');
    assert.equal(call.headers['X-Form-Draft-Version'], '1');
    assert.equal(call.headers['X-Form-Draft-Transaction'], '00000000-0000-4000-8000-000000000001');
    throw cause;
  });
  const { formDraftOwnerContext } = await import('../utils/formDraftRequest.js');
  await assert.rejects(h.api.apiRequest('/patients', {
    method: 'POST', body: { household: { kind: 'new', serial_mode: 'auto' } },
    draftOwnerContext: formDraftOwnerContext(user),
    draftCommit: { id: 'synthetic-draft', version: 1, transaction_uuid: '00000000-0000-4000-8000-000000000001' },
  }), error => {
    assert.equal(error, cause);
    assert.equal(error.code, 'NETWORK_ERROR');
    assert.equal(error.isNetworkError, true);
    assert.match(error.message, /We couldn't reach the server/);
    return true;
  });
  assert.equal(h.calls.length, 1);
});

test("a Laravel registration failure with an HTTP response is not classified as unreachable", async (t) => {
  const h = await harness(t, () => json(500, { message: 'Synthetic server failure' }));
  await assert.rejects(h.api.apiRequest('/patients', { method: 'POST', body: {} }), error => {
    assert.equal(error.status, 500);
    assert.equal(error.message, 'Synthetic server failure');
    assert.equal(error.isNetworkError, undefined);
    return true;
  });
  assert.equal(h.calls.length, 1);
});

test("invalid local draft metadata fails before transport and is not a connection failure", async (t) => {
  const h = await harness(t, () => assert.fail('No transport expected'));
  const { formDraftOwnerContext } = await import('../utils/formDraftRequest.js');
  await assert.rejects(h.api.apiRequest('/patients', {
    method: 'POST', body: {}, draftOwnerContext: formDraftOwnerContext(user), draftCommit: { id: 'draft' },
  }), error => {
    assert.equal(error.message, 'Draft commit metadata is incomplete.');
    assert.equal(error.isNetworkError, undefined);
    return true;
  });
  assert.equal(h.calls.length, 0);
});

test("HTTP 429 preserves Retry-After seconds on the thrown error", async (t) => {
  const h = await harness(t, () => new Response(JSON.stringify({ message: "Too Many Attempts." }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": "12" },
  }));
  await assert.rejects(h.api.apiRequest("/rhu-providers"), (error) => {
    assert.equal(error.status, 429);
    assert.equal(error.retryAfter, 12);
    assert.match(error.message, /Too Many Attempts/i);
    return true;
  });
});
