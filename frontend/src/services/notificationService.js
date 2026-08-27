import { apiRequest, isConnectionError, unwrapData, unwrapList } from "./apiClient";

const UPDATE_EVENT = "akay:notifications-updated";
const DEFAULT_STALE_MS = 60_000;
const DEFAULT_PER_PAGE = 50; // Decision D-1
let notificationCache = [];
let notificationCacheIdentity = "";
let notificationPage = { current: 1, last: 1, total: 0 };
let loadingPromise = null;
let lastFetchedAt = 0;
let lastLoadError = null;
let trashCache = [];
let notificationCounts = null;

function emitUpdate(detail = {}) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail }));
  }
}

function buildNotificationIdentity({ userId = "", role = "", facilityId = "" } = {}) {
  return [String(userId), normalizeRole(role), normalizeFacilityId(facilityId)].join(":");
}

export function resetNotificationSessionCache() {
  notificationCache = [];
  notificationCacheIdentity = "";
  notificationPage = { current: 1, last: 1, total: 0 };
  loadingPromise = null;
  lastFetchedAt = 0;
  lastLoadError = null;
  trashCache = [];
  notificationCounts = null;
  emitUpdate({ reason: "session-reset", soundEligible: false });
}

function formatNotificationTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function normalizeNotification(notification = {}) {
  const isRead = Boolean(
    notification.is_read ?? notification.isRead ?? notification.read,
  );
  const createdAt = notification.created_at || notification.createdAt || "";
  const message = notification.message || notification.description || "";
  const type = notification.type || "system";
  const entityType = notification.entity_type || notification.entityType || "";
  const entityId = notification.entity_id || notification.entityId || "";
  const rawLink =
    notification.link_url || notification.linkUrl || notification.link || "";
  const isFollowUpNotification = [
    "overdue_follow_up",
    "follow_up_no_show",
    "follow_up_due_today",
  ].includes(type);
  const link =
    isFollowUpNotification && entityId
      ? buildFollowUpNotificationLink(type, entityId, rawLink)
      : rawLink;

  const trashedAt = notification.trashed_at || notification.trashedAt || "";

  return {
    ...notification,
    id: notification.id ? String(notification.id) : "",
    title: notification.title || "",
    message,
    description: message,
    type,
    isRead,
    read: isRead,
    createdAt,
    timestamp: notification.timestamp || formatNotificationTime(createdAt),
    sender: notification.sender || "AKAY",
    link,
    linkUrl: link,
    entityType,
    entityId,
    relatedReferralId:
      notification.related_referral_id || notification.relatedReferralId || "",
    // Decision D-5 - trashed_at now comes from the server. A row returned
    // by refreshNotifications() (the Inbox) never has this set, since
    // NotificationController::index() excludes trashed rows; it is only
    // ever true for rows fetched via refreshTrashedNotifications().
    isTrashed: Boolean(trashedAt),
    trashedAt,
  };
}

function buildFollowUpNotificationLink(type, entityId, rawLink = "") {
  const baseLink = rawLink && rawLink.includes("/bhc/follow-ups")
    ? rawLink
    : "/bhc/follow-ups";
  const [path, query = ""] = baseLink.split("?");
  const params = new URLSearchParams(query);

  if (!params.get("task")) params.set("task", entityId);
  if (!params.get("open")) {
    params.set(
      "open",
      ["overdue_follow_up", "follow_up_no_show"].includes(type)
        ? "no_show"
        : "due",
    );
  }

  return `${path}?${params.toString()}`;
}

export function normalizeRole(role = "") {
  const value = String(role || "").toLowerCase();
  if (value.includes("admin")) return "admin";
  if (value.includes("rhu")) return "rhu";
  return "bhc";
}

export function normalizeFacilityId(facilityId) {
  return String(facilityId || "").trim();
}

export function notifyNotificationChange() {
  emitUpdate();
}

function buildNotificationsQuery({ page = 1, perPage = DEFAULT_PER_PAGE, search = "" } = {}) {
  const query = new URLSearchParams(
    Object.entries({ page, per_page: perPage, search: search || undefined }).filter(
      ([, value]) => value !== undefined && value !== "",
    ),
  );
  return query.size ? `?${query}` : "";
}

export async function refreshNotifications({
  force = false,
  maxAgeMs = DEFAULT_STALE_MS,
  soundEligible = false,
  identity = {},
  page = 1,
  append = false,
  search = "",
} = {}) {
  const now = Date.now();
  const requestedIdentity = buildNotificationIdentity(identity);

  if (!requestedIdentity || requestedIdentity.startsWith(":")) {
    resetNotificationSessionCache();
    return [];
  }

  if (notificationCacheIdentity !== requestedIdentity) {
    resetNotificationSessionCache();
    notificationCacheIdentity = requestedIdentity;
  }

  if (loadingPromise) return loadingPromise;
  if (!force && page === 1 && !append && lastFetchedAt && now - lastFetchedAt < maxAgeMs) {
    return notificationCache;
  }

  const requestPromise = apiRequest(`/notifications${buildNotificationsQuery({ page, search })}`)
    .then((response) => {
      if (notificationCacheIdentity !== requestedIdentity) return [];
      const paginator = unwrapData(response) || {};
      const rows = unwrapList(response).map(normalizeNotification);

      notificationCache = append ? [...notificationCache, ...rows] : rows;
      notificationPage = {
        current: paginator.current_page ?? page,
        last: paginator.last_page ?? page,
        total: paginator.total ?? notificationCache.length,
      };
      lastFetchedAt = Date.now();
      lastLoadError = null;
      emitUpdate({ reason: "fetch", soundEligible });
      return notificationCache;
    })
    .catch((error) => {
      if (notificationCacheIdentity !== requestedIdentity) return [];
      lastLoadError = {
        isConnectionError: isConnectionError(error),
        message:
          error?.message ||
          "Unable to load notifications. Please check your connection and try again.",
        status: error?.status || null,
        code: error?.code || "",
      };
      emitUpdate({ reason: "fetch-error", soundEligible: false });
      return notificationCache;
    })
    .finally(() => {
      if (loadingPromise === requestPromise) loadingPromise = null;
    });

  loadingPromise = requestPromise;
  return requestPromise;
}

/** Decision D-2 - the escape hatch for D-1's cap: fetch the next page and append it. */
export async function loadMoreNotifications(options = {}) {
  return refreshNotifications({
    ...options,
    page: notificationPage.current + 1,
    append: true,
    force: true,
    maxAgeMs: 0,
  });
}

export function getNotificationPageInfo() {
  return notificationPage;
}

export function hasMoreNotifications() {
  return notificationPage.current < notificationPage.last;
}

/** Decision D-4 - true, database-backed counts, replacing NotificationsPage.jsx's client useMemo over a capped array. */
export async function refreshNotificationCounts(identity = {}) {
  const requestedIdentity = buildNotificationIdentity(identity);
  if (!requestedIdentity || requestedIdentity.startsWith(":")) return null;

  try {
    const response = await apiRequest("/notifications/counts");
    notificationCounts = unwrapData(response) || null;
    emitUpdate({ reason: "counts", soundEligible: false });
    return notificationCounts;
  } catch {
    return notificationCounts;
  }
}

export function getNotificationCounts() {
  return notificationCounts;
}

/** Decision D-5 - the Trash tab now has a real, server-backed list of its own. */
export async function refreshTrashedNotifications({ page = 1, append = false, search = "" } = {}) {
  const response = await apiRequest(`/notifications/trash${buildNotificationsQuery({ page, search })}`);
  const rows = unwrapList(response).map(normalizeNotification);
  trashCache = append ? [...trashCache, ...rows] : rows;
  emitUpdate({ reason: "trash-fetch", soundEligible: false });
  return trashCache;
}

export function getTrashedNotifications() {
  return trashCache;
}

export function getAllNotifications() {
  return notificationCache;
}

export function getNotificationLoadError() {
  return lastLoadError;
}

export function getNotificationsForUser(role, facilityId, userId) {
  const requestedIdentity = buildNotificationIdentity({
    userId,
    role,
    facilityId,
  });
  return requestedIdentity === notificationCacheIdentity
    ? getAllNotifications()
    : [];
}

export function createNotification(notification) {
  const normalized = normalizeNotification({
    ...notification,
    id: notification.id || `pending-${Date.now()}`,
    createdAt: new Date().toISOString(),
  });
  notificationCache = [normalized, ...notificationCache];
  emitUpdate({ reason: "create", soundEligible: true });
  return normalized;
}

export function createRoleNotification(role, notification) {
  void role;
  return createNotification(notification);
}

export function createFacilityNotification(role, facilityId, notification) {
  void role;
  void facilityId;
  return createNotification(notification);
}

export async function markNotificationAsRead(notificationId) {
  notificationCache = notificationCache.map((notification) =>
    notification.id === String(notificationId)
      ? { ...notification, isRead: true, read: true }
      : notification,
  );
  emitUpdate({ reason: "mark-read", soundEligible: false });

  try {
    await apiRequest(`/notifications/${notificationId}/read`, {
      method: "PATCH",
    });
  } finally {
    await refreshNotifications({ force: true, maxAgeMs: 0 });
  }

  return notificationCache;
}

export async function markNotificationsAsRead(notificationIds = []) {
  const ids = notificationIds.map(String).filter(Boolean);
  if (ids.length === 0) return notificationCache;

  notificationCache = notificationCache.map((notification) =>
    ids.includes(String(notification.id))
      ? { ...notification, isRead: true, read: true }
      : notification,
  );
  emitUpdate({ reason: "mark-read", soundEligible: false });

  try {
    await Promise.all(
      ids.map((id) =>
        apiRequest(`/notifications/${id}/read`, {
          method: "PATCH",
        }),
      ),
    );
  } finally {
    await refreshNotifications({ force: true, maxAgeMs: 0 });
  }

  return notificationCache;
}

export async function markAllNotificationsAsRead() {
  notificationCache = notificationCache.map((notification) => ({
    ...notification,
    isRead: true,
    read: true,
  }));
  emitUpdate({ reason: "mark-read", soundEligible: false });

  try {
    await apiRequest("/notifications/read-all", { method: "PATCH" });
  } finally {
    await refreshNotifications({ force: true, maxAgeMs: 0 });
  }

  return notificationCache;
}

/**
 * Decision D-7 (N11) - markSelectedAsUnread used to be client-state-only,
 * with no endpoint to reverse a read and nothing re-applying the flag after
 * a refetch, so it silently reverted itself on the next navigation. Mirrors
 * markNotificationsAsRead's shape exactly, just against the unread route.
 */
export async function markNotificationsAsUnread(notificationIds = []) {
  const ids = notificationIds.map(String).filter(Boolean);
  if (ids.length === 0) return notificationCache;

  notificationCache = notificationCache.map((notification) =>
    ids.includes(String(notification.id))
      ? { ...notification, isRead: false, read: false }
      : notification,
  );
  emitUpdate({ reason: "mark-unread", soundEligible: false });

  try {
    await Promise.all(
      ids.map((id) => apiRequest(`/notifications/${id}/unread`, { method: "PATCH" })),
    );
  } finally {
    await refreshNotifications({ force: true, maxAgeMs: 0 });
  }

  return notificationCache;
}

/**
 * Decision D-5 (N10) - moveNotificationsToTrash/restoreNotificationsFromTrash
 * used to write only to a React state map with no API call and no
 * persistent store, lost on every page reload.
 */
export async function trashNotifications(notificationIds = []) {
  const ids = notificationIds.map(String).filter(Boolean);
  if (ids.length === 0) return notificationCache;

  notificationCache = notificationCache.filter(
    (notification) => !ids.includes(String(notification.id)),
  );
  emitUpdate({ reason: "trash", soundEligible: false });

  try {
    await Promise.all(
      ids.map((id) => apiRequest(`/notifications/${id}/trash`, { method: "POST" })),
    );
  } finally {
    await Promise.all([
      refreshNotifications({ force: true, maxAgeMs: 0 }),
      refreshNotificationCounts(),
    ]);
  }

  return notificationCache;
}

export async function restoreNotifications(notificationIds = []) {
  const ids = notificationIds.map(String).filter(Boolean);
  if (ids.length === 0) return trashCache;

  trashCache = trashCache.filter(
    (notification) => !ids.includes(String(notification.id)),
  );
  emitUpdate({ reason: "restore", soundEligible: false });

  try {
    await Promise.all(
      ids.map((id) => apiRequest(`/notifications/${id}/restore`, { method: "POST" })),
    );
  } finally {
    await Promise.all([
      refreshNotifications({ force: true, maxAgeMs: 0 }),
      refreshTrashedNotifications(),
      refreshNotificationCounts(),
    ]);
  }

  return trashCache;
}

export function getUnreadNotificationCount() {
  return getAllNotifications().filter((notification) => !notification.isRead)
    .length;
}

export async function deleteNotification(notificationId) {
  notificationCache = notificationCache.filter(
    (notification) => notification.id !== String(notificationId),
  );
  emitUpdate({ reason: "delete", soundEligible: false });

  try {
    await apiRequest(`/notifications/${notificationId}`, { method: "DELETE" });
  } finally {
    await refreshNotifications({ force: true, maxAgeMs: 0 });
  }

  return notificationCache;
}

export async function deleteNotifications(notificationIds = []) {
  const ids = notificationIds.map(String).filter(Boolean);
  if (ids.length === 0) return notificationCache;

  notificationCache = notificationCache.filter(
    (notification) => !ids.includes(String(notification.id)),
  );
  emitUpdate({ reason: "delete", soundEligible: false });

  try {
    await Promise.all(
      ids.map((id) => apiRequest(`/notifications/${id}`, { method: "DELETE" })),
    );
  } finally {
    await refreshNotifications({ force: true, maxAgeMs: 0 });
  }

  return notificationCache;
}

export async function clearNotificationsForUser() {
  notificationCache = [];
  emitUpdate({ reason: "clear", soundEligible: false });

  try {
    await apiRequest("/notifications", { method: "DELETE" });
  } finally {
    await refreshNotifications({ force: true, maxAgeMs: 0 });
  }

  return notificationCache;
}

export function subscribeToNotifications(callback) {
  if (typeof window === "undefined") return () => {};
  const handler = (event) => callback(event.detail || {});
  window.addEventListener(UPDATE_EVENT, handler);

  return () => window.removeEventListener(UPDATE_EVENT, handler);
}

export default {
  getNotificationsForUser,
  createNotification,
  createRoleNotification,
  createFacilityNotification,
  markNotificationAsRead,
  markNotificationsAsRead,
  markAllNotificationsAsRead,
  getUnreadNotificationCount,
  deleteNotification,
  deleteNotifications,
  clearNotificationsForUser,
  subscribeToNotifications,
};

if (typeof window !== "undefined") {
  window.addEventListener(
    "akay:sensitive-session-cleared",
    resetNotificationSessionCache,
  );
}
