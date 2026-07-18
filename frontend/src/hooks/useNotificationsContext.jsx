import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";
import { useLocation } from "react-router";
import { getCurrentUser } from "../utils/auth";
import {
  clearNotificationsForUser,
  deleteNotifications as deleteStoredNotifications,
  deleteNotification as deleteStoredNotification,
  getNotificationLoadError,
  getNotificationsForUser,
  markAllNotificationsAsRead,
  markNotificationsAsRead,
  markNotificationAsRead,
  normalizeFacilityId,
  normalizeRole,
  refreshNotifications as fetchNotifications,
  subscribeToNotifications,
} from "../services/notificationService";
import {
  getNotificationSoundEnabled,
  isUrgentNotification,
  playAkayUrgentAlertSound,
  setNotificationSoundEnabled as saveNotificationSoundEnabled,
  unlockAkayUrgentAlertSound,
} from "../utils/notificationSound";

const NotificationContext = createContext(null);
const NOTIFICATION_TRASH_STORAGE_KEY = "akay_notification_trash";

function readNotificationTrashMap() {
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_TRASH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeNotificationTrashMap(trashMap) {
  window.localStorage.setItem(
    NOTIFICATION_TRASH_STORAGE_KEY,
    JSON.stringify(trashMap),
  );
}

function applyNotificationTrashState(notifications = [], trashMap = {}) {
  return notifications.map((notification) => {
    const id = String(notification.id);
    const trashedAt = trashMap[id] || "";
    return {
      ...notification,
      isTrashed: Boolean(trashedAt),
      trashedAt,
    };
  });
}

function getNotificationUserContext() {
  const user = getCurrentUser() || {};
  const role = normalizeRole(user.role || "bhc");
  const facilityId = normalizeFacilityId(user.facility, role);

  return { role, facilityId };
}

export function NotificationProvider({ children }) {
  const location = useLocation();
  const [userContext, setUserContext] = useState(getNotificationUserContext);
  const [notifications, setNotifications] = useState(() =>
    applyNotificationTrashState(
      getNotificationsForUser(userContext.role, userContext.facilityId),
      readNotificationTrashMap(),
    ),
  );
  const [notificationTrashMap, setNotificationTrashMap] = useState(
    readNotificationTrashMap,
  );
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState(() =>
    getNotificationLoadError(),
  );
  const [notificationSoundEnabled, setNotificationSoundEnabledState] = useState(
    getNotificationSoundEnabled,
  );
  const [selectedNotif, setSelectedNotif] = useState(null);
  const isMountedRef = useRef(false);
  const pendingFetchRef = useRef(null);
  const knownNotificationIdsRef = useRef(new Set());
  const hasPrimedNotificationSoundRef = useRef(false);
  const notificationSoundEnabledRef = useRef(notificationSoundEnabled);

  useEffect(() => {
    notificationSoundEnabledRef.current = notificationSoundEnabled;
  }, [notificationSoundEnabled]);

  const applyNotificationsWithAlertCheck = useCallback(
    (nextNotifications = [], { allowSound = false } = {}) => {
      const nextWithTrashState = applyNotificationTrashState(
        nextNotifications,
        notificationTrashMap,
      );
      const nextIds = new Set(
        nextWithTrashState
          .map((notification) => String(notification.id || ""))
          .filter(Boolean),
      );

      if (!hasPrimedNotificationSoundRef.current) {
        knownNotificationIdsRef.current = nextIds;
        hasPrimedNotificationSoundRef.current = true;
      } else {
        const newNotifications = nextWithTrashState.filter((notification) => {
          const id = String(notification.id || "");
          return id && !knownNotificationIdsRef.current.has(id);
        });

        knownNotificationIdsRef.current = nextIds;

        if (
          allowSound &&
          notificationSoundEnabledRef.current &&
          newNotifications.some(isUrgentNotification)
        ) {
          void playAkayUrgentAlertSound();
        }
      }

      setNotifications(nextWithTrashState);
    },
    [notificationTrashMap],
  );

  const syncNotificationsFromCache = useCallback((eventDetail = {}) => {
    const nextContext = getNotificationUserContext();
    setUserContext(nextContext);
    applyNotificationsWithAlertCheck(
      getNotificationsForUser(nextContext.role, nextContext.facilityId),
      { allowSound: eventDetail.soundEligible === true },
    );
    setNotificationsError(getNotificationLoadError());
  }, [applyNotificationsWithAlertCheck]);

  const refreshNotifications = useCallback(
    ({ force = false, maxAgeMs = 60_000, soundEligible = false } = {}) => {
      if (pendingFetchRef.current) return pendingFetchRef.current;

      const nextContext = getNotificationUserContext();
      setUserContext(nextContext);
      setNotificationsLoading(true);
      setNotificationsError(null);

      pendingFetchRef.current = fetchNotifications({
        force,
        maxAgeMs,
        soundEligible,
      })
        .then((nextNotifications) => {
          if (isMountedRef.current) {
            applyNotificationsWithAlertCheck(nextNotifications, {
              allowSound: soundEligible === true,
            });
            setNotificationsError(getNotificationLoadError());
          }
          return nextNotifications;
        })
        .finally(() => {
          pendingFetchRef.current = null;
          if (isMountedRef.current) setNotificationsLoading(false);
        });

      return pendingFetchRef.current;
    },
    [applyNotificationsWithAlertCheck],
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (getCurrentUser()) {
      void refreshNotifications();
    }
  }, [location.pathname, refreshNotifications]);

  useEffect(() => {
    return subscribeToNotifications(syncNotificationsFromCache);
  }, [syncNotificationsFromCache]);

  const unreadCount = useMemo(
    () =>
      notifications.filter(
        (notification) => !notification.isRead && !notification.isTrashed,
      ).length,
    [notifications],
  );

  const getLatestNotifications = useCallback(
    () => notifications.filter((notification) => !notification.isTrashed).slice(0, 5),
    [notifications],
  );

  const moveNotificationsToTrash = useCallback((ids = []) => {
    const normalizedIds = ids.map(String);
    const now = new Date().toISOString();
    setNotificationTrashMap((prev) => {
      const next = { ...prev };
      normalizedIds.forEach((id) => {
        next[id] = next[id] || now;
      });
      writeNotificationTrashMap(next);
      return next;
    });
    setNotifications((prev) =>
      prev.map((notification) =>
        normalizedIds.includes(String(notification.id))
          ? { ...notification, isTrashed: true, trashedAt: now }
          : notification,
      ),
    );
  }, []);

  const restoreNotificationsFromTrash = useCallback((ids = []) => {
    const normalizedIds = ids.map(String);
    setNotificationTrashMap((prev) => {
      const next = { ...prev };
      normalizedIds.forEach((id) => {
        delete next[id];
      });
      writeNotificationTrashMap(next);
      return next;
    });
    setNotifications((prev) =>
      prev.map((notification) =>
        normalizedIds.includes(String(notification.id))
          ? { ...notification, isTrashed: false, trashedAt: "" }
          : notification,
      ),
    );
  }, []);

  const markSelectedAsUnread = useCallback((ids = []) => {
    const normalizedIds = ids.map(String);
    setNotifications((prev) =>
      prev.map((notification) =>
        normalizedIds.includes(String(notification.id))
          ? { ...notification, isRead: false, read: false }
          : notification,
      ),
    );
  }, []);

  const setNotificationSoundEnabled = useCallback(async (enabled) => {
    const nextEnabled = Boolean(enabled);
    saveNotificationSoundEnabled(nextEnabled);
    setNotificationSoundEnabledState(nextEnabled);
    notificationSoundEnabledRef.current = nextEnabled;

    if (!nextEnabled) return true;
    return unlockAkayUrgentAlertSound();
  }, []);

  const markAsRead = useCallback(
    async (id) => {
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === String(id)
            ? { ...notification, isRead: true, read: true }
            : notification,
        ),
      );
      return markNotificationAsRead(id)
        .then((nextNotifications) => {
          if (isMountedRef.current) {
            setNotifications(
              applyNotificationTrashState(nextNotifications, notificationTrashMap),
            );
          }
          return nextNotifications;
        })
        .catch(() => {
          void refreshNotifications({ force: true, maxAgeMs: 0 });
          throw new Error("Unable to mark notification as read.");
        });
    },
    [notificationTrashMap, refreshNotifications],
  );

  const markSelectedAsRead = useCallback(
    async (ids) => {
      const normalizedIds = ids.map(String);
      setNotifications((prev) =>
        prev.map((notification) =>
          normalizedIds.includes(String(notification.id))
            ? { ...notification, isRead: true, read: true }
            : notification,
        ),
      );
      return markNotificationsAsRead(normalizedIds)
        .then((nextNotifications) => {
          if (isMountedRef.current) {
            setNotifications(
              applyNotificationTrashState(nextNotifications, notificationTrashMap),
            );
          }
          return nextNotifications;
        })
        .catch(() => {
          void refreshNotifications({ force: true, maxAgeMs: 0 });
          throw new Error("Unable to mark selected notifications as read.");
        });
    },
    [notificationTrashMap, refreshNotifications],
  );

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) =>
      prev.map((notification) => ({
        ...notification,
        isRead: true,
        read: true,
      })),
    );
    return markAllNotificationsAsRead(userContext.role, userContext.facilityId)
      .then((nextNotifications) => {
        if (isMountedRef.current) {
          setNotifications(
            applyNotificationTrashState(nextNotifications, notificationTrashMap),
          );
        }
        return nextNotifications;
      })
      .catch(() => {
        void refreshNotifications({ force: true, maxAgeMs: 0 });
        throw new Error("Unable to mark all notifications as read.");
      });
  }, [
    notificationTrashMap,
    refreshNotifications,
    userContext.facilityId,
    userContext.role,
  ]);

  const deleteNotification = useCallback(
    async (id) => {
      setNotifications((prev) =>
        prev.filter((notification) => notification.id !== String(id)),
      );
      return deleteStoredNotification(id)
        .then((nextNotifications) => {
          if (isMountedRef.current) setNotifications(nextNotifications);
          return nextNotifications;
        })
        .catch(() => {
          void refreshNotifications({ force: true, maxAgeMs: 0 });
          throw new Error("Unable to delete notification.");
        });
    },
    [refreshNotifications],
  );

  const deleteSelected = useCallback(
    async (ids) => {
      const normalizedIds = ids.map(String);
      setNotifications((prev) =>
        prev.filter(
          (notification) => !normalizedIds.includes(String(notification.id)),
        ),
      );
      return deleteStoredNotifications(normalizedIds)
        .then((nextNotifications) => {
          if (isMountedRef.current) setNotifications(nextNotifications);
          setSelectedNotif((prev) =>
            prev && normalizedIds.includes(String(prev.id)) ? null : prev,
          );
          return nextNotifications;
        })
        .catch(() => {
          void refreshNotifications({ force: true, maxAgeMs: 0 });
          throw new Error("Unable to delete selected notifications.");
        });
    },
    [refreshNotifications],
  );

  const clearAll = useCallback(async () => {
    setNotifications([]);
    return clearNotificationsForUser(userContext.role, userContext.facilityId)
      .then((nextNotifications) => {
        if (isMountedRef.current) setNotifications(nextNotifications);
        setSelectedNotif(null);
        return nextNotifications;
      })
      .catch(() => {
        void refreshNotifications({ force: true, maxAgeMs: 0 });
        throw new Error("Unable to clear notifications.");
      });
  }, [refreshNotifications, userContext.facilityId, userContext.role]);

  const value = useMemo(
    () => ({
      notifications,
      notificationsLoading,
      notificationsError,
      notificationSoundEnabled,
      unreadCount,
      getLatestNotifications,
      refreshNotifications,
      markAsRead,
      markSelectedAsRead,
      markSelectedAsUnread,
      markAllAsRead,
      setNotificationSoundEnabled,
      moveNotificationsToTrash,
      restoreNotificationsFromTrash,
      deleteNotification,
      deleteSelected,
      clearAll,
      selectedNotif,
      setSelectedNotif,
    }),
    [
      clearAll,
      deleteNotification,
      deleteSelected,
      getLatestNotifications,
      markAllAsRead,
      markAsRead,
      markSelectedAsRead,
      markSelectedAsUnread,
      moveNotificationsToTrash,
      notificationSoundEnabled,
      notifications,
      notificationsError,
      notificationsLoading,
      refreshNotifications,
      restoreNotificationsFromTrash,
      selectedNotif,
      setNotificationSoundEnabled,
      unreadCount,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error(
      "useNotifications must be used within NotificationProvider",
    );
  }
  return ctx;
}
