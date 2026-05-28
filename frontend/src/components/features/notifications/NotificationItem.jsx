export default function NotificationItem({ notif, onSelect }) {
  return (
    <button
      onClick={() => onSelect(notif)}
      className={`group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-gray-50 ${
        !notif.read ? "border-l-[3px] border-l-blue-400 bg-blue-50/30" : ""
      }`}
    >
      {/* Icon Circle */}
      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 20 20">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M5 13l-1 1H4m0 0 1h6M4 17v-1m0 1H3M3 12l-1 1h2m0 0 1h4m-4 12v-1"
          />
        </svg>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-center justify-between gap-2">
          <h3
            className={`text-[13px] truncate transition-colors ${
              !notif.read
                ? "font-bold text-gray-900"
                : "font-medium text-gray-600"
            }`}
          >
            {notif.sender || "System"}
          </h3>
          <span className="text-[11px] text-gray-400 whitespace-nowrap">
            {notif.timestamp}
          </span>
        </div>
        <p className="mt-1 text-[13px] text-gray-600 truncate">{notif.title}</p>
      </div>
    </button>
  );
}
