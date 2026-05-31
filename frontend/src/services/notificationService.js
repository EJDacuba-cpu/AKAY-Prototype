const STORAGE_KEY = "akay_notifications";
const UPDATE_EVENT = "akay:notifications-updated";

const ROLE_WIDE_FACILITY = {
  bhc: "all-bhc",
  rhu: "all-rhu",
  admin: "all-admin",
};

const ROLE_DEFAULT_FACILITY = {
  bhc: "all-bhc",
  rhu: "rhu-bulakan",
  admin: "municipality-bulakan",
};

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeRole(role = "") {
  const value = String(role || "").toLowerCase();
  if (value.includes("admin") || value.includes("mho")) return "admin";
  if (value.includes("rhu")) return "rhu";
  if (value.includes("bhc") || value.includes("barangay")) return "bhc";
  return value || "bhc";
}

export function normalizeFacilityId(facilityId, role = "") {
  const normalizedRole = normalizeRole(role);
  const raw = String(facilityId || "").trim();

  if (!raw) return ROLE_DEFAULT_FACILITY[normalizedRole] || "";
  if (Object.values(ROLE_WIDE_FACILITY).includes(raw)) return raw;
  if (normalizedRole === "admin") return "municipality-bulakan";
  if (normalizedRole === "rhu") return "rhu-bulakan";

  return raw
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getRoleWideFacility(role) {
  return ROLE_WIDE_FACILITY[normalizeRole(role)] || "";
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createNotificationId(existing = []) {
  const max = existing.reduce((highest, notification) => {
    const value = parseInt(String(notification.id || "").replace(/\D/g, ""), 10);
    return Number.isNaN(value) ? highest : Math.max(highest, value);
  }, 0);

  return `NOTIF-${String(max + 1).padStart(3, "0")}`;
}

function readNotifications() {
  if (typeof window === "undefined") return [];

  try {
    return ensureArray(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return [];
  }
}

function writeNotifications(notifications) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
}

function sortByNewest(notifications) {
  return notifications.slice().sort((a, b) => {
    const diff =
      new Date(b.createdAt || 0).getTime() -
      new Date(a.createdAt || 0).getTime();
    if (diff !== 0) return diff;
    return String(b.id || "").localeCompare(String(a.id || ""));
  });
}

export function notifyNotificationChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

function normalizeNotification(notification = {}, existing = []) {
  const recipientRole = normalizeRole(notification.recipientRole);
  const recipientFacilityId = normalizeFacilityId(
    notification.recipientFacilityId || getRoleWideFacility(recipientRole),
    recipientRole,
  );
  const createdAt = notification.createdAt || new Date().toISOString();
  const message = notification.message || notification.description || "";

  return {
    id: notification.id || createNotificationId(existing),
    recipientRole,
    recipientFacilityId,
    title: notification.title || "System notification",
    message,
    description: message,
    fullMessage: notification.fullMessage || message,
    type: notification.type || "system",
    referenceId: notification.referenceId || notification.referralId || "",
    link: notification.link || "",
    linkLabel: notification.linkLabel || "View Record",
    isRead: Boolean(notification.isRead ?? notification.read),
    read: Boolean(notification.isRead ?? notification.read),
    sender: notification.sender || "AKAY System",
    patientName: notification.patientName || "",
    status: notification.status || "",
    createdAt,
    timestamp: notification.timestamp || formatTimestamp(createdAt),
  };
}

function isForUser(notification, role, facilityId) {
  const normalizedRole = normalizeRole(role);
  const normalizedFacility = normalizeFacilityId(facilityId, normalizedRole);
  const roleWideFacility = getRoleWideFacility(normalizedRole);

  return (
    notification.recipientRole === normalizedRole &&
    (notification.recipientFacilityId === normalizedFacility ||
      notification.recipientFacilityId === roleWideFacility)
  );
}

export function getAllNotifications() {
  return sortByNewest(readNotifications().map((item) => normalizeNotification(item)));
}

export function getNotificationsForUser(role, facilityId) {
  return getAllNotifications().filter((notification) =>
    isForUser(notification, role, facilityId),
  );
}

export function createNotification(notification) {
  const existing = readNotifications().map((item) => normalizeNotification(item));
  const next = normalizeNotification(notification, existing);

  if (next.referenceId) {
    const duplicate = existing.find(
      (item) =>
        item.recipientRole === next.recipientRole &&
        item.recipientFacilityId === next.recipientFacilityId &&
        item.type === next.type &&
        item.referenceId === next.referenceId,
    );

    if (duplicate) return duplicate;
  }

  const notifications = [next, ...existing];
  writeNotifications(notifications);
  notifyNotificationChange();
  return next;
}

export function createRoleNotification(role, notification) {
  const normalizedRole = normalizeRole(role);
  return createNotification({
    ...notification,
    recipientRole: normalizedRole,
    recipientFacilityId: getRoleWideFacility(normalizedRole),
  });
}

export function createFacilityNotification(role, facilityId, notification) {
  return createNotification({
    ...notification,
    recipientRole: normalizeRole(role),
    recipientFacilityId: normalizeFacilityId(facilityId, role),
  });
}

export function markNotificationAsRead(notificationId) {
  const notifications = readNotifications().map((notification) =>
    notification.id === notificationId
      ? { ...notification, isRead: true, read: true }
      : notification,
  );
  writeNotifications(notifications);
  notifyNotificationChange();
  return notifications.find((notification) => notification.id === notificationId);
}

export function markAllNotificationsAsRead(role, facilityId) {
  const notifications = readNotifications().map((notification) => {
    const normalized = normalizeNotification(notification);
    if (!isForUser(normalized, role, facilityId)) return notification;
    return { ...notification, isRead: true, read: true };
  });

  writeNotifications(notifications);
  notifyNotificationChange();
  return getNotificationsForUser(role, facilityId);
}

export function getUnreadNotificationCount(role, facilityId) {
  return getNotificationsForUser(role, facilityId).filter(
    (notification) => !notification.isRead,
  ).length;
}

export function deleteNotification(notificationId) {
  const notifications = readNotifications().filter(
    (notification) => notification.id !== notificationId,
  );
  writeNotifications(notifications);
  notifyNotificationChange();
  return notifications;
}

export function clearNotificationsForUser(role, facilityId) {
  const notifications = readNotifications()
    .map((item) => normalizeNotification(item))
    .filter((notification) => !isForUser(notification, role, facilityId));

  writeNotifications(notifications);
  notifyNotificationChange();
  return [];
}

export function subscribeToNotifications(callback) {
  if (typeof window === "undefined") return () => {};

  const handler = () => callback();
  window.addEventListener(UPDATE_EVENT, handler);
  window.addEventListener("storage", handler);

  return () => {
    window.removeEventListener(UPDATE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
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
  notifyNotificationChange,
  deleteNotification,
  clearNotificationsForUser,
  normalizeRole,
  normalizeFacilityId,
};
