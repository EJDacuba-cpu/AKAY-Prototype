import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";

// Only the HTTP boundary is replaced; execute the actual cache/mutation module.
let moduleId = 0;
async function loadService(request) {
  const source = await readFile(new URL("./notificationService.js", import.meta.url), "utf8");
  const key = `__notificationTest${moduleId++}`;
  globalThis[key] = request;
  const stub = `const apiRequest = globalThis.${key};
    const isConnectionError = () => false;
    const unwrapData = r => r.data;
    const unwrapList = r => r.data.data;`;
  try {
    return await import(`data:text/javascript;base64,${Buffer.from(source.replace(/^import .*?;\r?\n/, stub)).toString("base64")}#${key}`);
  } finally {
    delete globalThis[key];
  }
}
const admin = { userId: "7", role: "admin" };
const staff = { userId: "8", role: "bhc", facilityId: "3" };
const page = (ids, current = 1, last = 1) => ({ data: {
  data: ids.map(id => ({ id, title: "Alert", type: "password_reset_request", is_read: false })),
  current_page: current, last_page: last, total: last === 1 ? ids.length : 51,
} });
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

test("inbox readiness distinguishes initial failure from a successfully empty frame and survives refresh", async () => {
  let result = () => Promise.reject(new Error("Offline"));
  const api = await loadService(async () => result());
  assert.equal(api.hasLoadedNotifications(admin), false);
  await api.refreshNotifications({ identity: admin });
  assert.equal(api.hasLoadedNotifications(admin), false);
  result = () => page([]);
  await api.refreshNotifications({ identity: admin, force: true });
  assert.equal(api.hasLoadedNotifications(admin), true);
  assert.equal(api.hasLoadedNotifications(staff), false);
  const pending = deferred();
  result = () => pending.promise;
  const refresh = api.refreshNotifications({ identity: admin, force: true });
  assert.equal(api.hasLoadedNotifications(admin), true);
  pending.resolve(page([]));
  await refresh;
  result = () => Promise.reject(new Error("Offline again"));
  await api.refreshNotifications({ identity: admin, force: true });
  assert.equal(api.hasLoadedNotifications(admin), true);
  api.resetNotificationSessionCache();
  assert.equal(api.hasLoadedNotifications(admin), false);
});

test("access-action invalidation preserves inbox readiness while revalidating an empty cache", async () => {
  const pending = deferred();
  let calls = 0;
  const api = await loadService(async url => url === "/notifications/counts" ? { data: { unread: 0 } } : ++calls === 1 ? page([]) : pending.promise);
  await api.refreshNotifications({ identity: admin });
  const refresh = api.notifyNotificationChange();
  assert.equal(api.hasLoadedNotifications(admin), true);
  pending.resolve(page([]));
  await refresh;
  assert.equal(api.hasLoadedNotifications(admin), true);
});

test("trash readiness separates failed-first, successful-empty and background refresh states", async () => {
  let result = () => Promise.reject(new Error("Trash offline"));
  const api = await loadService(async url => url.startsWith('/notifications/trash') ? result() : page([]));
  await api.refreshNotifications({ identity: admin });
  assert.equal(api.hasLoadedTrash(admin), false);
  await assert.rejects(api.refreshTrashedNotifications(), /Trash offline/);
  assert.equal(api.hasLoadedTrash(admin), false);
  result = () => page([]);
  await api.refreshTrashedNotifications();
  assert.equal(api.hasLoadedTrash(admin), true);
  assert.equal(api.hasLoadedTrash(staff), false);
  const pending = deferred();
  result = () => pending.promise;
  const refresh = api.refreshTrashedNotifications();
  assert.equal(api.hasLoadedTrash(admin), true);
  pending.resolve(page([]));
  await refresh;
  result = () => Promise.reject(new Error("Refresh failed"));
  await assert.rejects(api.refreshTrashedNotifications(), /Refresh failed/);
  assert.equal(api.hasLoadedTrash(admin), true);
  api.resetNotificationSessionCache();
  assert.equal(api.hasLoadedTrash(admin), false);
});

test("read/unread refresh keeps identity, rows and authoritative counts", async () => {
  let read = false;
  const api = await loadService(async (url, options = {}) => {
    if (options.method === "PATCH") { read = url.endsWith("/read"); return { data: {} }; }
    if (url === "/notifications/counts") return { data: { unread: read ? 49 : 50 } };
    const result = page([1]); result.data.data[0].is_read = read; return result;
  });
  await api.refreshNotifications({ identity: admin });
  await api.markNotificationAsRead(1);
  assert.equal(api.getNotificationsForUser("admin", "", "7").length, 1);
  assert.equal(api.getAllNotifications()[0].isRead, true);
  assert.equal(api.getNotificationCounts().unread, 49);
  assert.equal(api.getUnreadNotificationCount(), 49);
  await api.markNotificationsAsUnread([1]);
  assert.equal(api.getAllNotifications()[0].isRead, false);
  assert.equal(api.getNotificationCounts().unread, 50);
});

test("Load more retains identity and appends the next page", async () => {
  const api = await loadService(async url => url.includes("page=2") ? page([51], 2, 2) : page([1], 1, 2));
  await api.refreshNotifications({ identity: admin });
  await api.loadMoreNotifications();
  assert.deepEqual(api.getAllNotifications().map(n => n.id), ["1", "51"]);
  assert.equal(api.getNotificationPageInfo().current, 2);
});

test("late counts and trash from a previous login cannot repopulate session caches", async () => {
  const counts = deferred(); const trash = deferred();
  const api = await loadService(async url => {
    if (url === "/notifications/counts") return counts.promise;
    if (url.startsWith("/notifications/trash")) return trash.promise;
    return page([]);
  });
  await api.refreshNotifications({ identity: admin });
  const pendingCounts = api.refreshNotificationCounts(admin);
  const pendingTrash = api.refreshTrashedNotifications();
  api.resetNotificationSessionCache();
  // Even logging back into the same account must invalidate old responses.
  await api.refreshNotifications({ identity: admin });
  counts.resolve({ data: { unread: 99 } }); trash.resolve(page([99]));
  await Promise.all([pendingCounts, pendingTrash]);
  assert.equal(api.getNotificationCounts(), null);
  assert.deepEqual(api.getTrashedNotifications(), []);
});

test("a completed old-session mutation does not fetch or replace the new user's rows", async () => {
  const mutation = deferred(); let listCalls = 0;
  const api = await loadService(async (url, options = {}) => {
    if (options.method) return mutation.promise;
    if (url === "/notifications/counts") return { data: { unread: 0 } };
    listCalls++; return page([listCalls]);
  });
  await api.refreshNotifications({ identity: admin });
  const pending = api.markNotificationAsRead(1);
  api.resetNotificationSessionCache();
  await api.refreshNotifications({ identity: staff });
  mutation.resolve({ data: {} }); await pending;
  assert.equal(listCalls, 2);
  assert.deepEqual(api.getNotificationsForUser("bhc", "3", "8").map(n => n.id), ["2"]);
});

test("forced refresh after an action supersedes an earlier in-flight list response", async () => {
  const old = deferred(); let calls = 0;
  const api = await loadService(async () => ++calls === 1 ? old.promise : page([2]));
  const first = api.refreshNotifications({ identity: admin });
  const second = api.refreshNotifications({ identity: admin, force: true });
  old.resolve(page([1])); await Promise.all([first, second]);
  assert.deepEqual(api.getAllNotifications().map(n => n.id), ["2"]);
});

test("trash and restore refresh inbox/counts and persist the restored read flag", async () => {
  let trashed = false;
  const api = await loadService(async (url, options = {}) => {
    if (options.method) { trashed = url.endsWith("/trash"); return { data: {} }; }
    if (url === "/notifications/counts") return { data: { unread: trashed ? 0 : 1, trash: trashed ? 1 : 0 } };
    if (url.startsWith("/notifications/trash")) return page(trashed ? [1] : []);
    return page(trashed ? [] : [1]);
  });
  await api.refreshNotifications({ identity: admin });
  await api.trashNotifications([1]);
  assert.deepEqual(api.getAllNotifications(), []);
  assert.equal(api.getNotificationCounts().trash, 1);
  await api.refreshTrashedNotifications();
  assert.equal(api.getTrashedNotifications().length, 1);
  await api.restoreNotifications([1]);
  assert.equal(api.getAllNotifications().length, 1);
  assert.equal(api.getAllNotifications()[0].isRead, false);
  assert.deepEqual(api.getTrashedNotifications(), []);
  assert.equal(api.getNotificationCounts().unread, 1);
});

test("access action invalidation forces a fresh list and count within the normal cache window", async () => {
  let resolved = false;
  const api = await loadService(async url => url === "/notifications/counts"
    ? { data: { unread: resolved ? 0 : 1 } } : page(resolved ? [] : [1]));
  await api.refreshNotifications({ identity: admin });
  resolved = true;
  await api.notifyNotificationChange();
  assert.deepEqual(api.getAllNotifications(), []);
  assert.equal(api.getUnreadNotificationCount(), 0);
});
