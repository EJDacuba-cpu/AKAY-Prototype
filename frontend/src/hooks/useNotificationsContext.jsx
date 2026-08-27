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
  getNotificationCounts,
  getNotificationLoadError,
  getNotificationsForUser,
  getTrashedNotifications,
  hasMoreNotifications as hasMoreStoredNotifications,
  loadMoreNotifications as loadMoreStoredNotifications,
  markAllNotificationsAsRead,
  markNotificationsAsRead,
  markNotificationAsRead,
  markNotificationsAsUnread,
  normalizeFacilityId,
  normalizeRole,
  refreshNotificationCounts,
  refreshNotifications as fetchNotifications,
  refreshTrashedNotifications,
  restoreNotifications as restoreStoredNotifications,
  subscribeToNotifications,
  trashNotifications as trashStoredNotifications,
} from "../services/notificationService";
import {
  getNotificationSoundEnabled,
  isUrgentNotification,
  playAkayUrgentAlertSound,
  setNotificationSoundEnabled as saveNotificationSoundEnabled,
  unlockAkayUrgentAlertSound,
} from "../utils/notificationSound";
import { SENSITIVE_SESSION_CLEARED_EVENT } from "../utils/sessionPrivacy";

const NotificationContext = createContext(null);

function getNotificationUserContext() {
  const user = getCurrentUser() || {};
  const role = normalizeRole(user.role || "bhc");
  const facilityId = normalizeFacilityId(
    user.barangayHealthCenterId || user.ruralHealthUnitId || user.facilityId,
  );

  return { userId: String(user.id || ""), role, facilityId };
}

export function NotificationProvider({ children }) {
  const location = useLocation();
  const [userContext, setUserContext] = useState(getNotificationUserContext);
  const [notifications, setNotifications] = useState(() =>
    getNotificationsForUser(
      userContext.role,
      userContext.facilityId,
      userContext.userId,
    ),
  );
  // Decision D-5 (N10) - trashed_at is now server-truthful. Notifications
  // returned by refreshNotifications() never carry it (the backend excludes
  // them from the Inbox query), so no client-side re-application is needed
  // for that list. Trash gets its own cache, fetched on demand.
  const [trashedNotifications, setTrashedNotifications] = useState(() =>
    getTrashedNotifications(),
  );
  const [notificationCounts, setNotificationCounts] = useState(() =>
    getNotificationCounts(),
  );
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [trashLoading, setTrashLoading] = useState(false);
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
      const nextIds = new Set(
        nextNotifications
          .map((notification) => String(notification.id || ""))
          .filter(Boolean),
      );

      if (!hasPrimedNotificationSoundRef.current) {
        knownNotificationIdsRef.current = nextIds;
        hasPrimedNotificationSoundRef.current = true;
      } else {
        const newNotifications = nextNotifications.filter((notification) => {
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

      setNotifications(nextNotifications);
    },
    [],
  );

  const syncNotificationsFromCache = useCallback((eventDetail = {}) => {
    const nextContext = getNotificationUserContext();
    setUserContext(nextContext);
    applyNotificationsWithAlertCheck(
      getNotificationsForUser(
        nextContext.role,
        nextContext.facilityId,
        nextContext.userId,
      ),
      { allowSound: eventDetail.soundEligible === true },
    );
    setTrashedNotifications(getTrashedNotifications());
    setNotificationCounts(getNotificationCounts());
    setNotificationsError(getNotificationLoadError());
  }, [applyNotificationsWithAlertCheck]);

  const refreshNotifications = useCallback(
    ({ force = false, maxAgeMs = 60_000, soundEligible = false, search = "" } = {}) => {
      if (pendingFetchRef.current) return pendingFetchRef.current;

      const nextContext = getNotificationUserContext();
      setUserContext(nextContext);
      setNotificationsLoading(true);
      setNotificationsError(null);

      pendingFetchRef.current = fetchNotifications({
        force,
        maxAgeMs,
        soundEligible,
        identity: nextContext,
        search,
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

  /** Decision D-2 - fetches the next page and appends it, the escape hatch for D-1's cap. */
  const loadMoreNotifications = useCallback(async () => {
    const next = await loadMoreStoredNotifications();
    if (isMountedRef.current) setNotifications(next);
    return next;
  }, []);

  const hasMoreNotifications = hasMoreStoredNotifications();

  /** Decision D-4 - the database-backed replacement for NotificationsPage.jsx's client useMemo counts. */
  const refreshCounts = useCallback(async () => {
    const nextContext = getNotificationUserContext();
    const counts = await refreshNotificationCounts(nextContext);
    if (isMountedRef.current) setNotificationCounts(counts);
    return counts;
  }, []);

  /** Decision D-5 - the Trash tab's real, server-backed fetch. */
  const refreshTrash = useCallback(
    async ({ search = "" } = {}) => {
      setTrashLoading(true);
      try {
        const next = await refreshTrashedNotifications({ search });
        if (isMountedRef.current) setTrashedNotifications(next);
        return next;
      } finally {
        if (isMountedRef.current) setTrashLoading(false);
      }
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
    function resetSensitiveNotificationState() {
      pendingFetchRef.current = null;
      knownNotificationIdsRef.current = new Set();
      hasPrimedNotificationSoundRef.current = false;
      setNotifications([]);
      setTrashedNotifications([]);
      setNotificationCounts(null);
      setNotificationsLoading(false);
      setNotificationsError(null);
      setSelectedNotif(null);
      setUserContext(getNotificationUserContext());
    }

    window.addEventListener(
      SENSITIVE_SESSION_CLEARED_EVENT,
      resetSensitiveNotificationState,
    );
    return () =>
      window.removeEventListener(
        SENSITIVE_SESSION_CLEARED_EVENT,
        resetSensitiveNotificationState,
      );
  }, []);

  useEffect(() => {
    if (getCurrentUser()) {
      void refreshNotifications();
      void refreshCounts();
    }
  }, [location.pathname, refreshNotifications, refreshCounts]);

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

  /** Decision D-5 (N10) - now a real API call (via trashStoredNotifications), not just local state. */
  const moveNotificationsToTrash = useCallback(
    async (ids = []) => {
      const normalizedIds = ids.map(String);
      setNotifications((prev) =>
        prev.filter((notification) => !normalizedIds.includes(String(notification.id))),
      );
      const next = await trashStoredNotifications(normalizedIds);
      if (isMountedRef.current) {
        setNotifications(next);
        setTrashedNotifications(getTrashedNotifications());
        setNotificationCounts(getNotificationCounts());
      }
      return next;
    },
    [],
  );

  const restoreNotificationsFromTrash = useCallback(
    async (ids = []) => {
      const normalizedIds = ids.map(String);
      setTrashedNotifications((prev) =>
        prev.filter((notification) => !normalizedIds.includes(String(notification.id))),
      );
      const next = await restoreStoredNotifications(normalizedIds);
      if (isMountedRef.current) {
        setTrashedNotifications(next);
        setNotifications(getNotificationsForUser(
          userContext.role,
          userContext.facilityId,
          userContext.userId,
        ));
        setNotificationCounts(getNotificationCounts());
      }
      return next;
    },
    [userContext.facilityId, userContext.role, userContext.userId],
  );

  /** Decision D-7 (N11) - now a real API call, so it survives the next refetch instead of reverting. */
  const markSelectedAsUnread = useCallback(
    async (ids = []) => {
      const normalizedIds = ids.map(String);
      setNotifications((prev) =>
        prev.map((notification) =>
          normalizedIds.includes(String(notification.id))
            ? { ...notification, isRead: false, read: false }
            : notification,
        ),
      );
      return markNotificationsAsUnread(normalizedIds)
        .then((nextNotifications) => {
          if (isMountedRef.current) setNotifications(nextNotifications);
          return nextNotifications;
        })
        .catch(() => {
          void refreshNotifications({ force: true, maxAgeMs: 0 });
          throw new Error("Unable to mark selected notifications as unread.");
        });
    },
    [refreshNotifications],
  );

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
      trashedNotifications,
      trashLoading,
      notificationCounts,
      notificationsLoading,
      notificationsError,
      notificationSoundEnabled,
      unreadCount,
      hasMoreNotifications,
      getLatestNotifications,
      refreshNotifications,
      loadMoreNotifications,
      refreshCounts,
      refreshTrash,
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
      hasMoreNotifications,
      loadMoreNotifications,
      markAllAsRead,
      markAsRead,
      markSelectedAsRead,
      markSelectedAsUnread,
      moveNotificationsToTrash,
      notificationCounts,
      notificationSoundEnabled,
      notifications,
      notificationsError,
      notificationsLoading,
      refreshCounts,
      refreshNotifications,
      refreshTrash,
      restoreNotificationsFromTrash,
      selectedNotif,
      setNotificationSoundEnabled,
      trashLoading,
      trashedNotifications,
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
