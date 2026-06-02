import { apiRequest, unwrapList } from "./apiClient";

const UPDATE_EVENT = "akay:notifications-updated";
let notificationCache = [];
let loadingPromise = null;

function emitUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  }
}

function normalizeNotification(notification = {}) {
  return {
    ...notification,
    id: notification.id ? String(notification.id) : "",
    title: notification.title || "",
    message: notification.message || notification.description || "",
    description: notification.message || notification.description || "",
    type: notification.type || "system",
    isRead: Boolean(notification.is_read ?? notification.isRead),
    createdAt: notification.created_at || notification.createdAt || "",
    relatedReferralId: notification.related_referral_id || notification.relatedReferralId || "",
  };
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

export async function refreshNotifications() {
  loadingPromise = apiRequest("/notifications")
    .then((response) => {
      notificationCache = unwrapList(response).map(normalizeNotification);
      emitUpdate();
      return notificationCache;
    })
    .catch(() => {
      notificationCache = [];
      emitUpdate();
      return notificationCache;
    })
    .finally(() => {
      loadingPromise = null;
    });

  return loadingPromise;
}

export function getAllNotifications() {
  if (!loadingPromise) refreshNotifications();
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
      ? { ...notification, isRead: true }
      : notification,
  );
  emitUpdate();
  apiRequest(`/notifications/${notificationId}/read`, { method: "PATCH" }).then(refreshNotifications).catch(() => {});
}

export function markAllNotificationsAsRead() {
  notificationCache = notificationCache.map((notification) => ({ ...notification, isRead: true }));
  emitUpdate();
  apiRequest("/notifications/read-all", { method: "PATCH" }).then(refreshNotifications).catch(() => {});
  return notificationCache;
}

export function getUnreadNotificationCount() {
  return getAllNotifications().filter((notification) => !notification.isRead).length;
}

export function deleteNotification(notificationId) {
  notificationCache = notificationCache.filter((notification) => notification.id !== String(notificationId));
  emitUpdate();
  apiRequest(`/notifications/${notificationId}`, { method: "DELETE" }).catch(() => {});
}

export function clearNotificationsForUser() {
  notificationCache = [];
  emitUpdate();
  return notificationCache;
}

export function subscribeToNotifications(callback) {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener(UPDATE_EVENT, handler);
  refreshNotifications();

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
