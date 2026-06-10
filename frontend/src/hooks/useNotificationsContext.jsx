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
  deleteNotification as deleteStoredNotification,
  getNotificationsForUser,
  markAllNotificationsAsRead,
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
  const [selectedNotif, setSelectedNotif] = useState(null);
  const isMountedRef = useRef(false);
  const pendingFetchRef = useRef(null);

  const syncNotificationsFromCache = useCallback(() => {
    const nextContext = getNotificationUserContext();
    setUserContext(nextContext);
    setNotifications(
      getNotificationsForUser(nextContext.role, nextContext.facilityId),
    );
  }, []);

  const refreshNotifications = useCallback(
    ({ force = false, maxAgeMs = 60_000 } = {}) => {
      if (pendingFetchRef.current) return pendingFetchRef.current;

      const nextContext = getNotificationUserContext();
      setUserContext(nextContext);

      pendingFetchRef.current = fetchNotifications({ force, maxAgeMs })
        .then((nextNotifications) => {
          if (isMountedRef.current) {
            setNotifications(nextNotifications);
          }
          return nextNotifications;
        })
        .finally(() => {
          pendingFetchRef.current = null;
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
    (id) => {
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === String(id)
            ? { ...notification, isRead: true, read: true }
            : notification,
        ),
      );
      markNotificationAsRead(id);
    },
    [],
  );

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) =>
      prev.map((notification) => ({
        ...notification,
        isRead: true,
        read: true,
      })),
    );
    markAllNotificationsAsRead(userContext.role, userContext.facilityId);
  }, [userContext.facilityId, userContext.role]);

  const deleteNotification = useCallback(
    (id) => {
      setNotifications((prev) =>
        prev.filter((notification) => notification.id !== String(id)),
      );
      deleteStoredNotification(id);
      setSelectedNotif((prev) =>
        prev?.id === String(id) || prev?.id === id ? null : prev,
      );
    },
    [],
  );

  const clearAll = useCallback(() => {
    setNotifications([]);
    clearNotificationsForUser(userContext.role, userContext.facilityId);
  }, [userContext.facilityId, userContext.role]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      getLatestNotifications,
      refreshNotifications,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      clearAll,
      selectedNotif,
      setSelectedNotif,
    }),
    [
      clearAll,
      deleteNotification,
      getLatestNotifications,
      markAllAsRead,
      markAsRead,
      notifications,
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
