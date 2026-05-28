import { useEffect } from "react";
import {
  X,
  ExternalLink,
  Trash2,
  FileText,
  MessageSquare,
  CalendarClock,
  AlertTriangle,
  CheckCircle2,
  User,
  Shield,
  ClipboardList,
} from "lucide-react";

const typeConfig = {
  referral: {
    label: "REFERRAL RECORD",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: ClipboardList,
  },
  feedback: {
    label: "CLINICAL FEEDBACK",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: MessageSquare,
  },
  followup: {
    label: "FOLLOW-UP SCHEDULE",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: CalendarClock,
  },
  alert: {
    label: "SYSTEM ALERT",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    icon: AlertTriangle,
  },
  monitoring: {
    label: "PATIENT MONITORING",
    color: "text-gray-700",
    bg: "bg-gray-100",
    border: "border-gray-200",
    icon: CheckCircle2,
  },
};

export default function NotificationModal({
  isOpen,
  onClose,
  notification,
  onViewRecord,
  onDelete,
}) {
  useEffect(() => {
    function handleEsc(e) {
      if (e.key === "Escape") onClose();
    }
    if (isOpen) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen || !notification) return null;

  const config = typeConfig[notification.type] || {
    label: "SYSTEM NOTIFICATION",
    color: "text-gray-700",
    bg: "bg-gray-100",
    border: "border-gray-200",
    icon: FileText,
  };
  const Icon = config.icon;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Clinical Container */}
      <div
        className="relative w-full max-w-xl bg-white rounded-xl shadow-2xl shadow-black/10 overflow-hidden border border-gray-200 transition-all duration-200 data-[state=open]:scale-100 data-[state=open]:opacity-100 scale-95 opacity-0"
        data-state={isOpen ? "open" : "closed"}
      >
        {/* Header Strip */}
        <div
          className={`flex items-center justify-between border-b-2 ${config.border} ${config.bg} px-6 py-3`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-md bg-white shadow-sm ${config.color}`}
            >
              <Icon size={14} strokeWidth={2.5} />
            </div>
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-500">
                Barangay Health Center
              </h4>
              <h2 className={`text-sm font-bold tracking-wide ${config.color}`}>
                {config.label}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-white/80 text-gray-500 transition-colors hover:bg-white hover:text-gray-700"
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <h3 className="text-base font-bold text-gray-900 leading-snug">
              {notification.title}
            </h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 border-b border-dashed border-gray-200 pb-3">
              <span className="flex items-center gap-1.5 font-medium">
                <User size={12} className="text-gray-400" />
                {notification.sender || "System"}
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarClock size={12} className="text-gray-400" />
                {notification.timestamp}
              </span>
              {notification.status && (
                <span className="flex items-center gap-1.5 font-medium text-amber-600">
                  <Shield size={12} />
                  {notification.status}
                </span>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-gray-100 bg-[#FAFBFC] p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
              Clinical Details / Notes
            </p>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {notification.fullMessage || notification.description}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {notification.referralId && (
              <div className="rounded-md border border-gray-100 bg-white p-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Reference ID
                </p>
                <p className="font-mono text-sm font-bold text-[#0B2E59]">
                  {notification.referralId}
                </p>
              </div>
            )}
            {notification.patientName && (
              <div className="rounded-md border border-gray-100 bg-white p-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Related Patient
                </p>
                <p className="text-sm font-bold text-gray-800">
                  {notification.patientName}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 bg-[#FAFAFA] px-6 py-4">
          <button
            onClick={() => {
              onDelete(notification.id);
              onClose();
            }}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-500 transition-all hover:bg-red-50 hover:border-red-200 hover:text-red-600"
          >
            <Trash2 size={12} />
            Discard Notification
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-600 transition-all hover:bg-gray-100"
            >
              Close
            </button>
            {notification.link && (
              <button
                onClick={() => {
                  onViewRecord(notification);
                  onClose();
                }}
                className="flex items-center gap-1.5 rounded-md bg-[#0B2E59] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#092347]"
              >
                <ExternalLink size={12} />
                {notification.linkLabel || "View Record"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
