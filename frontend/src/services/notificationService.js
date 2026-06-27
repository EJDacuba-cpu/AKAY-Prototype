import { apiRequest, unwrapList } from "./apiClient";

const UPDATE_EVENT = "akay:notifications-updated";
const DEFAULT_STALE_MS = 60_000;
let notificationCache = [];
let loadingPromise = null;
let lastFetchedAt = 0;

function emitUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  }
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
    "follow_up_due_today",
  ].includes(type);
  const link =
    isFollowUpNotification && entityId
      ? buildFollowUpNotificationLink(type, entityId, rawLink)
      : rawLink;

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
    params.set("open", type === "overdue_follow_up" ? "overdue" : "due");
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

export async function refreshNotifications({
  force = false,
  maxAgeMs = DEFAULT_STALE_MS,
} = {}) {
  const now = Date.now();

  if (loadingPromise) return loadingPromise;
  if (!force && lastFetchedAt && now - lastFetchedAt < maxAgeMs) {
    return notificationCache;
  }

  loadingPromise = apiRequest("/notifications")
    .then((response) => {
      notificationCache = unwrapList(response).map(normalizeNotification);
      lastFetchedAt = Date.now();
      emitUpdate();
      return notificationCache;
    })
    .catch(() => {
      emitUpdate();
      return notificationCache;
    })
    .finally(() => {
      loadingPromise = null;
    });

  return loadingPromise;
}

export function getAllNotifications() {
  return notificationCache;
}

export function getNotificationsForUser() {
  return getAllNotifications();
}

export function createNotification(notification) {
  const normalized = normalizeNotification({
    ...notification,
    id: notification.id || `pending-${Date.now()}`,
    createdAt: new Date().toISOString(),
  });
  notificationCache = [normalized, ...notificationCache];
  emitUpdate();
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

export function markNotificationAsRead(notificationId) {
  notificationCache = notificationCache.map((notification) =>
    notification.id === String(notificationId)
      ? { ...notification, isRead: true, read: true }
      : notification,
  );
  emitUpdate();
  apiRequest(`/notifications/${notificationId}/read`, {
    method: "PATCH",
  }).catch(() => {});
}

export function markAllNotificationsAsRead() {
  notificationCache = notificationCache.map((notification) => ({
    ...notification,
    isRead: true,
    read: true,
  }));
  emitUpdate();
  apiRequest("/notifications/read-all", { method: "PATCH" }).catch(() => {});
  return notificationCache;
}

export function getUnreadNotificationCount() {
  return getAllNotifications().filter((notification) => !notification.isRead)
    .length;
}

export function deleteNotification(notificationId) {
  notificationCache = notificationCache.filter(
    (notification) => notification.id !== String(notificationId),
  );
  emitUpdate();
  apiRequest(`/notifications/${notificationId}`, { method: "DELETE" }).catch(() => {});
}

export function clearNotificationsForUser() {
  notificationCache = [];
  lastFetchedAt = Date.now();
  emitUpdate();
  return notificationCache;
}

export function subscribeToNotifications(callback) {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener(UPDATE_EVENT, handler);

  return () => window.removeEventListener(UPDATE_EVENT, handler);
}

export default {
  getNotificationsForUser,
  createNotification,
  createRoleNotification,
  createFacilityNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadNotificationCount,
  subscribeToNotifications,
};
