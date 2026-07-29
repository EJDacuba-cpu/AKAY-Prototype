import {
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
import {
  ModalButton,
  ModalShell,
} from "../../common";

const typeConfig = {
  referral: {
    label: "REFERRAL RECORD",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    icon: ClipboardList,
  },
  feedback: {
    label: "CLINICAL FEEDBACK",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: MessageSquare,
  },
  "return-slip": {
    label: "RHU RETURN SLIP",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: MessageSquare,
  },
  status: {
    label: "REFERRAL STATUS",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    icon: CheckCircle2,
  },
  followup: {
    label: "FOLLOW-UP SCHEDULE",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: CalendarClock,
  },
  "follow-up": {
    label: "FOLLOW-UP SCHEDULE",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: CalendarClock,
  },
  medicine: {
    label: "MEDICINE AVAILABILITY",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    icon: AlertTriangle,
  },
  doctor: {
    label: "DOCTOR AVAILABILITY",
    color: "text-slate-700",
    bg: "bg-slate-50",
    border: "border-slate-200",
    icon: User,
  },
  account: {
    label: "ACCOUNT UPDATE",
    color: "text-gray-700",
    bg: "bg-gray-100",
    border: "border-gray-200",
    icon: Shield,
  },
  audit: {
    label: "AUDIT LOG",
    color: "text-gray-700",
    bg: "bg-gray-100",
    border: "border-gray-200",
    icon: Shield,
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
  deleteLabel = "Discard Notification",
}) {
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
    <ModalShell
      open={isOpen}
      title={config.label}
      subtitle="AKAY Notification"
      icon={<Icon size={14} strokeWidth={2.3} />}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <ModalButton
            onClick={() => {
              onDelete(notification.id);
              onClose();
            }}
          >
            <Trash2 size={12} />
            {deleteLabel}
          </ModalButton>
          <ModalButton onClick={onClose}>Close</ModalButton>
          {notification.link && (
            <ModalButton
              variant="primary"
              primary
              onClick={() => {
                onViewRecord(notification);
                onClose();
              }}
            >
              <ExternalLink size={12} />
              {notification.linkLabel || "View Record"}
            </ModalButton>
          )}
        </>
      }
    >
      <div className="space-y-5">
          <div className="space-y-2">
            <h3 className="text-base font-bold text-gray-900 leading-snug">
              {notification.title}
            </h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 border-b border-dashed border-gray-200 pb-3">
              <span className="flex items-center gap-1.5 font-medium">
                <User size={12} className="text-gray-400" />
                {notification.sender || "AKAY"}
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
                <p className="font-mono text-sm font-bold text-[#B91C1C]">
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
    </ModalShell>
  );
}
