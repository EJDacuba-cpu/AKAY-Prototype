import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
} from "react";
/* eslint-disable react-refresh/only-export-components */
import { getCurrentUser } from "../utils/auth";
import {
  clearNotificationsForUser,
  deleteNotification as deleteStoredNotification,
  getNotificationsForUser,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  normalizeFacilityId,
  normalizeRole,
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
  const [userContext, setUserContext] = useState(getNotificationUserContext);
  const [notifications, setNotifications] = useState(() =>
    getNotificationsForUser(userContext.role, userContext.facilityId),
  );
  const [selectedNotif, setSelectedNotif] = useState(null);

  const refreshNotifications = useCallback(() => {
    const nextContext = getNotificationUserContext();
    setUserContext(nextContext);
    setNotifications(
      getNotificationsForUser(nextContext.role, nextContext.facilityId),
    );
  }, []);

  useEffect(() => {
    return subscribeToNotifications(refreshNotifications);
  }, [refreshNotifications]);

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
      markNotificationAsRead(id);
      refreshNotifications();
    },
    [refreshNotifications],
  );

  const markAllAsRead = useCallback(() => {
    markAllNotificationsAsRead(userContext.role, userContext.facilityId);
    refreshNotifications();
  }, [refreshNotifications, userContext.facilityId, userContext.role]);

  const deleteNotification = useCallback(
    (id) => {
      deleteStoredNotification(id);
      refreshNotifications();
    },
    [refreshNotifications],
  );

  const clearAll = useCallback(() => {
    clearNotificationsForUser(userContext.role, userContext.facilityId);
    refreshNotifications();
  }, [refreshNotifications, userContext.facilityId, userContext.role]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        getLatestNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAll,
        selectedNotif,
        setSelectedNotif,
      }}
    >
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
