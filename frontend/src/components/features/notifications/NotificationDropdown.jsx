import { useEffect, useRef } from "react";
import { AlertCircle, Inbox, LoaderCircle, RefreshCw } from "lucide-react";
import { useNotifications } from "../../../hooks/useNotificationsContext";
import NotificationItem from "./NotificationItem";

export default function NotificationDropdown({
  isOpen,
  onClose,
  onSelect,
  onSeeAll,
}) {
  const dropdownRef = useRef(null);
  const {
    getLatestNotifications,
    markAllAsRead,
    notificationsError,
    notificationsLoading,
    refreshNotifications,
  } = useNotifications();

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onClose();
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    void refreshNotifications({ force: true, maxAgeMs: 0 });
  }, [isOpen, refreshNotifications]);

  const latestNotifs = getLatestNotifications();
  const showLoading = notificationsLoading && latestNotifs.length === 0;
  const showError = Boolean(notificationsError);

  function handleRetry() {
    void refreshNotifications({ force: true, maxAgeMs: 0 });
  }

  return (
    <div
      ref={dropdownRef}
      className="fixed right-2 top-[52px] z-[9999] w-[calc(100vw-1rem)] origin-top-right overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl shadow-black/20 transition-all duration-200 data-[state=open]:scale-100 data-[state=open]:opacity-100 scale-95 opacity-0 sm:right-5 sm:w-[400px]"
      data-state={isOpen ? "open" : "closed"}
    >
      <div className="max-h-[min(70dvh,400px)] overflow-y-auto divide-y divide-gray-100 bg-white [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300">
        {showLoading ? (
          <div className="flex h-32 flex-col items-center justify-center px-4 text-center">
            <LoaderCircle size={22} className="mb-2 animate-spin text-gray-300" />
            <p className="text-xs font-medium text-gray-400">
              Loading notifications...
            </p>
          </div>
        ) : showError ? (
          <div className="flex min-h-40 flex-col items-center justify-center px-5 py-6 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-[#B91C1C]">
              <AlertCircle size={19} />
            </div>
            <p className="text-sm font-bold text-[#0F172A]">
              Unable to load notifications
            </p>
            <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-gray-500">
              Please check your connection and try again.
            </p>
            <button
              type="button"
              onClick={handleRetry}
              disabled={notificationsLoading}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {notificationsLoading ? (
                <LoaderCircle size={13} className="animate-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              Retry
            </button>
          </div>
        ) : latestNotifs.length === 0 ? (
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

      {latestNotifs.length > 0 && !showError && (
        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50/50 px-4 py-2.5">
          <button
            onClick={onSeeAll}
            className="text-[11px] font-medium text-[#B91C1C] hover:text-[#7F1D1D] hover:underline transition-colors"
          >
            See all notifications
          </button>
          <button
            onClick={markAllAsRead}
            className="text-[11px] font-medium text-[#B91C1C] hover:text-[#7F1D1D] hover:underline transition-colors"
          >
            Mark all as read
          </button>
        </div>
      )}
    </div>
  );
}
