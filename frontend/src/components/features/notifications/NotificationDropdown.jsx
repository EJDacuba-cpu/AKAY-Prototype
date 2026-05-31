import { useEffect, useRef } from "react";
import { Inbox } from "lucide-react";
import { useNotifications } from "../../../hooks/useNotificationsContext";
import NotificationItem from "./NotificationItem";

export default function NotificationDropdown({
  isOpen,
  onClose,
  onSelect,
  onSeeAll,
}) {
  const dropdownRef = useRef(null);
  const { getLatestNotifications, markAllAsRead } = useNotifications();

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onClose();
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  const latestNotifs = getLatestNotifications();

  return (
    <div
      ref={dropdownRef}
      className="fixed top-[52px] right-2 sm:right-5 z-[9999] w-[400px] origin-top-right overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl shadow-black/20 transition-all duration-200 data-[state=open]:scale-100 data-[state=open]:opacity-100 scale-95 opacity-0"
      data-state={isOpen ? "open" : "closed"}
    >
      <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-100 bg-white [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300">
        {latestNotifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <Inbox size={24} className="text-gray-300 mb-1" />
            <p className="text-xs text-gray-400">No notifications yet.</p>
          </div>
        ) : (
          latestNotifs.map((notif) => (
            <NotificationItem
              key={notif.id}
              notif={notif}
              onSelect={onSelect}
            />
          ))
        )}
      </div>

      {latestNotifs.length > 0 && (
        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50/50 px-4 py-2.5">
          <button
            onClick={onSeeAll}
            className="text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
          >
            See all notifications
          </button>
          <button
            onClick={markAllAsRead}
            className="text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
          >
            Mark all as read
          </button>
        </div>
      )}
    </div>
  );
}
