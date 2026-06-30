import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  CheckCheck,
  CheckSquare,
  Eye,
  Inbox,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useNotifications } from "../../hooks/useNotificationsContext";
import NotificationModal from "../../components/features/notifications/NotificationModal";
import ConfirmationModal from "../../components/common/modals/ConfirmationModal";

export default function NotificationsPage() {
  const {
    notifications,
    markAsRead,
    markSelectedAsRead,
    markAllAsRead,
    clearAll,
    deleteNotification,
    deleteSelected,
  } = useNotifications();
  const [selectedNotif, setSelectedNotif] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const navigate = useNavigate();

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const visibleIds = useMemo(
    () => notifications.map((notification) => String(notification.id)),
    [notifications],
  );
  const selectedCount = selectedIds.length;
  const allVisibleSelected =
    visibleIds.length > 0 &&
    visibleIds.every((notificationId) => selectedIds.includes(notificationId));

  function resetFeedback() {
    setActionMessage("");
    setActionError("");
  }

  function startSelectionMode() {
    resetFeedback();
    setSelectionMode(true);
  }

  function cancelSelectionMode() {
    setSelectionMode(false);
    setSelectedIds([]);
  }

  function toggleNotificationSelection(notificationId) {
    const id = String(notificationId);
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((selectedId) => selectedId !== id)
        : [...prev, id],
    );
  }

  function toggleSelectAllVisible() {
    setSelectedIds(allVisibleSelected ? [] : visibleIds);
  }

  useEffect(() => {
    setSelectedIds((prev) =>
      prev.filter((selectedId) => visibleIds.includes(selectedId)),
    );
    if (notifications.length === 0) {
      setSelectionMode(false);
    }
  }, [notifications.length, visibleIds]);

  const handleViewNotification = (notif) => {
    if (selectionMode) {
      toggleNotificationSelection(notif.id);
      return;
    }
    markAsRead(notif.id);
    if (notif.link) {
      navigate(notif.link);
      return;
    }
    setSelectedNotif(notif);
  };

  const handleCloseModal = () => {
    setSelectedNotif(null);
  };

  const runNotificationAction = async (action, successMessage) => {
    resetFeedback();
    setActionLoading(true);
    try {
      await action();
      setActionMessage(successMessage);
      return true;
    } catch (error) {
      setActionError(error?.message || "Unable to update notifications.");
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkAllAsRead = () => {
    runNotificationAction(
      markAllAsRead,
      "All notifications were marked as read.",
    );
  };

  const handleClearAll = () => {
    setConfirmation({
      type: "clearAll",
      title: "Clear all notifications?",
      description: "This will remove all notifications from your inbox.",
      confirmText: "Clear all",
      loadingText: "Clearing...",
      onConfirm: async () => {
        const cleared = await runNotificationAction(async () => {
          await clearAll();
          cancelSelectionMode();
        }, "All notifications were cleared.");
        if (cleared) setConfirmation(null);
      },
    });
  };

  const handleMarkSelectedAsRead = () => {
    if (selectedCount === 0) return;

    runNotificationAction(
      () => markSelectedAsRead(selectedIds),
      `${selectedCount} notification${selectedCount !== 1 ? "s" : ""} marked as read.`,
    );
  };

  const handleDeleteSelected = () => {
    if (selectedCount === 0) return;
    const idsToDelete = [...selectedIds];
    const countToDelete = idsToDelete.length;

    setConfirmation({
      type: "deleteSelected",
      title: "Delete selected notifications?",
      description:
        "This will remove the selected notifications from your inbox.",
      confirmText: "Delete selected",
      loadingText: "Deleting...",
      onConfirm: async () => {
        const deleted = await runNotificationAction(async () => {
          await deleteSelected(idsToDelete);
          cancelSelectionMode();
        }, `${countToDelete} notification${countToDelete !== 1 ? "s" : ""} deleted.`);
        if (deleted) setConfirmation(null);
      },
    });
  };

  const handleDeleteNotification = async (id) => {
    const deleted = await runNotificationAction(
      () => deleteNotification(id),
      "Notification deleted.",
    );
    if (deleted && selectedNotif?.id === id) {
      setSelectedNotif(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between  border-gray-200 p-4">
        <div className="flex items-center gap-3">
   
          <div>
            <h1 className="text-base font-bold text-gray-900">
              Notification Inbox
            </h1>
            <p className="text-xs text-gray-500">
              View and manage system alerts and clinical updates
            </p>
          </div>
        </div>

        {notifications.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <p className="text-xs text-gray-500">
              <span className="font-bold text-[#0F172A]">
                {unreadCount} unread
              </span>{" "}
              notification{unreadCount !== 1 ? "s" : ""} remaining
            </p>
            {selectionMode ? (
              <>
                <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-[#B91C1C]">
                  {selectedCount} selected
                </span>
                <button
                  type="button"
                  onClick={toggleSelectAllVisible}
                  disabled={actionLoading}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-600 transition-all hover:border-red-200 hover:bg-red-50 hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {allVisibleSelected ? (
                    <CheckSquare size={14} />
                  ) : (
                    <Square size={14} />
                  )}
                  {allVisibleSelected ? "Unselect all" : "Select all"}
                </button>
                <button
                  type="button"
                  onClick={handleMarkSelectedAsRead}
                  disabled={selectedCount === 0 || actionLoading}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-600 transition-all hover:border-red-200 hover:bg-red-50 hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CheckCheck size={14} />
                  Mark as read
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  disabled={selectedCount === 0 || actionLoading}
                  className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 transition-all hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 size={14} />
                  Delete selected
                </button>
                <button
                  type="button"
                  onClick={cancelSelectionMode}
                  disabled={actionLoading}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-600 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X size={14} />
                  Cancel selection
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={startSelectionMode}
                  disabled={actionLoading}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-600 transition-all hover:border-red-200 hover:bg-red-50 hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CheckSquare size={14} />
                  Select
                </button>
                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  disabled={actionLoading}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-600 transition-all hover:border-red-200 hover:bg-red-50 hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CheckCheck size={14} />
                  Mark all as read
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  disabled={actionLoading}
                  className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 transition-all hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 size={14} />
                  Clear all notifications
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {(actionMessage || actionError) && (
        <div
          className={`mx-4 rounded-xl border px-4 py-3 text-sm font-medium ${
            actionError
              ? "border-red-100 bg-red-50 text-red-700"
              : "border-emerald-100 bg-emerald-50 text-emerald-700"
          }`}
        >
          {actionError || actionMessage}
        </div>
      )}

      {/* Inbox List */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <Inbox size={32} className="text-gray-200 mb-3" />
            <h3 className="text-sm font-semibold text-gray-400">
              No notifications in your inbox
            </h3>
            <p className="text-xs text-gray-300 mt-1">All caught up.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                className={`group flex items-start gap-4 px-5 py-4 transition-colors duration-150 hover:bg-gray-50/50 ${
                  !notif.isRead
                    ? "border-l-[3px] border-l-[#B91C1C] bg-red-50/40"
                    : ""
                }`}
              >
                {selectionMode && (
                  <label className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition hover:border-red-200 hover:text-[#B91C1C]">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={selectedIds.includes(String(notif.id))}
                      onChange={() => toggleNotificationSelection(notif.id)}
                      aria-label={`Select notification ${notif.title || notif.id}`}
                    />
                    {selectedIds.includes(String(notif.id)) ? (
                      <CheckSquare size={16} />
                    ) : (
                      <Square size={16} />
                    )}
                  </label>
                )}
                <button
                  onClick={() => handleViewNotification(notif)}
                  type="button"
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-400"
                >
                  <Eye size={14} className="group-hover:text-[#0F172A]" />
                </button>

                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center justify-between gap-3">
                    <h2
                      className={`text-sm truncate ${
                        !notif.isRead
                          ? "font-bold text-gray-900"
                          : "font-medium text-gray-600"
                      }`}
                    >
                      {notif.sender || "AKAY"}
                    </h2>
                    <span className="text-[11px] text-gray-400 whitespace-nowrap">
                      {notif.timestamp}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-gray-700">
                    {notif.title}
                  </p>
                  {notif.message && (
                    <p className="mt-1 text-sm text-gray-500">
                      {notif.message}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FIX: Modal rendered outside the list container */}
      <NotificationModal
        isOpen={!!selectedNotif}
        onClose={handleCloseModal}
        notification={selectedNotif}
        onViewRecord={(notif) => {
          if (notif?.link) {
            handleCloseModal();
            navigate(notif.link);
          }
        }}
        onDelete={handleDeleteNotification}
      />

      <ConfirmationModal
        open={Boolean(confirmation)}
        title={confirmation?.title}
        description={confirmation?.description}
        confirmText={confirmation?.confirmText}
        cancelText="Cancel"
        loading={actionLoading}
        loadingText={confirmation?.loadingText}
        onCancel={() => {
          if (!actionLoading) setConfirmation(null);
        }}
        onConfirm={confirmation?.onConfirm}
      />
    </div>
  );
}
