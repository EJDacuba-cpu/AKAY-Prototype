import { useState } from "react";
import { useNavigate } from "react-router";
import { Bell, Inbox, Eye, Trash2 } from "lucide-react";
import { useNotifications } from "../../hooks/useNotificationsContext";
import NotificationModal from "../../components/features/notifications/NotificationModal";

export default function NotificationsPage() {
  const { notifications, markAsRead, clearAll, deleteNotification } =
    useNotifications();
  const [selectedNotif, setSelectedNotif] = useState(null);
  const navigate = useNavigate();

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleViewNotification = (notif) => {
    markAsRead(notif.id);
    setSelectedNotif(notif);
  };

  const handleCloseModal = () => {
    setSelectedNotif(null);
  };

  const handleDeleteNotification = (id) => {
    deleteNotification(id);
    if (selectedNotif?.id === id) {
      setSelectedNotif(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50">
            <Bell size={16} className="text-[#991B1B]" />
          </div>
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
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-gray-500">
              <span className="font-bold text-[#0F172A]">
                {unreadCount} unread
              </span>{" "}
              notification{unreadCount !== 1 ? "s" : ""} remaining
            </p>
            <button
              onClick={clearAll}
              className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 transition-all hover:bg-red-100"
            >
              <Trash2 size={14} />
              Clear all notifications
            </button>
          </div>
        )}
      </div>

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
                  !notif.read
                    ? "border-l-[3px] border-l-[#B91C1C] bg-red-50/40"
                    : ""
                }`}
              >
                <button
                  onClick={() => handleViewNotification(notif)}
                  className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-400"
                >
                  <Eye size={14} className="group-hover:text-[#0F172A]" />
                </button>

                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center justify-between gap-3">
                    <h2
                      className={`text-sm truncate ${
                        !notif.read
                          ? "font-bold text-gray-900"
                          : "font-medium text-gray-600"
                      }`}
                    >
                      {notif.sender || "System"}
                    </h2>
                    <span className="text-[11px] text-gray-400 whitespace-nowrap">
                      {notif.timestamp}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{notif.title}</p>
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
    </div>
  );
}
