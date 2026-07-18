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

const NotificationContext = createContext(null);

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
    getNotificationsForUser(userContext.role, userContext.facilityId),
  );
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState(() =>
    getNotificationLoadError(),
  );
  const [selectedNotif, setSelectedNotif] = useState(null);
  const isMountedRef = useRef(false);
  const pendingFetchRef = useRef(null);

  const syncNotificationsFromCache = useCallback(() => {
    const nextContext = getNotificationUserContext();
    setUserContext(nextContext);
    setNotifications(
      getNotificationsForUser(nextContext.role, nextContext.facilityId),
    );
    setNotificationsError(getNotificationLoadError());
  }, []);

  const refreshNotifications = useCallback(
    ({ force = false, maxAgeMs = 60_000 } = {}) => {
      if (pendingFetchRef.current) return pendingFetchRef.current;

      const nextContext = getNotificationUserContext();
      setUserContext(nextContext);
      setNotificationsLoading(true);
      setNotificationsError(null);

      pendingFetchRef.current = fetchNotifications({ force, maxAgeMs })
        .then((nextNotifications) => {
          if (isMountedRef.current) {
            setNotifications(nextNotifications);
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
    [],
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
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications],
  );

  const getLatestNotifications = useCallback(
    () => notifications.slice(0, 5),
    [notifications],
  );

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
          if (isMountedRef.current) setNotifications(nextNotifications);
          return nextNotifications;
        })
        .catch(() => {
          void refreshNotifications({ force: true, maxAgeMs: 0 });
          throw new Error("Unable to mark notification as read.");
        });
    },
    [refreshNotifications],
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
          if (isMountedRef.current) setNotifications(nextNotifications);
          return nextNotifications;
        })
        .catch(() => {
          void refreshNotifications({ force: true, maxAgeMs: 0 });
          throw new Error("Unable to mark selected notifications as read.");
        });
    },
    [refreshNotifications],
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
        if (isMountedRef.current) setNotifications(nextNotifications);
        return nextNotifications;
      })
      .catch(() => {
        void refreshNotifications({ force: true, maxAgeMs: 0 });
        throw new Error("Unable to mark all notifications as read.");
      });
  }, [refreshNotifications, userContext.facilityId, userContext.role]);

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
      unreadCount,
      getLatestNotifications,
      refreshNotifications,
      markAsRead,
      markSelectedAsRead,
      markAllAsRead,
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
      notifications,
      notificationsError,
      notificationsLoading,
      refreshNotifications,
      selectedNotif,
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
