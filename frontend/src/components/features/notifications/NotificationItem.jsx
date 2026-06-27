import { BellRing } from "lucide-react";

export default function NotificationItem({ notif, onSelect }) {
  const unread = !notif.isRead;

  return (
    <button
      onClick={() => onSelect(notif)}
      className={`group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-gray-50 ${
        unread ? "border-l-[3px] border-l-[#B91C1C] bg-red-50/40" : ""
      }`}
    >
      <div
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          unread ? "bg-red-100 text-[#B91C1C]" : "bg-gray-100 text-gray-400"
        }`}
      >
        <BellRing size={15} />
      </div>

      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center justify-between gap-2">
          <h3
            className={`text-[13px] truncate transition-colors ${
              unread
                ? "font-bold text-gray-900"
                : "font-medium text-gray-600"
            }`}
          >
            {notif.title || "AKAY Notification"}
          </h3>
          <span className="text-[11px] text-gray-400 whitespace-nowrap">
            {notif.timestamp}
          </span>
        </div>
        {notif.message && (
          <p className="mt-1 truncate text-[13px] text-gray-600">
            {notif.message}
          </p>
        )}
      </div>
    </button>
  );
}
