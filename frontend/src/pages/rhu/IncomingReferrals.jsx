import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  QrCode,
  Search,
  UserCheck,
  UserX,
  ArrowRight,
  AlertCircle,
  ChevronDown,
  X,
  Check,
  Activity,
  Stethoscope,
  MoreVertical,
} from "lucide-react";
import { Link } from "react-router";
import DashboardLayout from "../../layouts/DashboardLayout";

/* ─── Keyframes ─── */
const keyframes = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @keyframes statusPop {
    0%   { transform: scale(0.85); opacity: 0; }
    60%  { transform: scale(1.05); }
    100% { transform: scale(1); opacity: 1; }
  }

  @keyframes menuOpen {
    from { opacity: 0; transform: scale(0.96) translateY(-4px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }

  @keyframes menuClose {
    from { opacity: 1; transform: scale(1) translateY(0); }
    to   { opacity: 0; transform: scale(0.96) translateY(-4px); }
  }

  @keyframes modalPop {
    from { opacity: 0; transform: translateY(10px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  .anim-fade-up {
    opacity: 0;
    animation: fadeUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .anim-fade-in {
    animation: fadeIn 0.25s ease both;
  }

  .anim-status-pop {
    animation: statusPop 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .menu-open {
    animation: menuOpen 0.2s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .menu-close {
    animation: menuClose 0.15s cubic-bezier(0.55, 0, 1, 0.45) both;
  }

  .modal-pop {
    animation: modalPop 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
`;

const stagger = (i) => ({ animationDelay: `${i * 65}ms` });

/* ─── Data ─── */
const INITIAL_REFERRALS = [
  {
    trackingId: "AKY-2026-001",
    patient: "Juan Reyes",
    ageSex: "31/M",
    bhc: "Pitpitan Health Center",
    category: "B1",
    priority: "Medium",
    concern: "Hypertension",
    suggestedSpecialization: "General Consultation",
    dateSubmitted: "May 13, 2026",
    status: "Pending",
  },
  {
    trackingId: "AKY-2026-002",
    patient: "Maria Rosa",
    ageSex: "31/F",
    bhc: "Pitpitan Health Center",
    category: "C2",
    priority: "High",
    concern: "Pregnancy-related abdominal pain",
    suggestedSpecialization: "Maternal Care",
    dateSubmitted: "May 13, 2026",
    status: "Received",
  },
  {
    trackingId: "AKY-2026-003",
    patient: "John Cruz",
    ageSex: "45/M",
    bhc: "Bagumbayan Health Center",
    category: "A1",
    priority: "Normal",
    concern: "Fever and cough",
    suggestedSpecialization: "General Consultation",
    dateSubmitted: "May 12, 2026",
    status: "Completed",
  },
  {
    trackingId: "AKY-2026-004",
    patient: "David Perez",
    ageSex: "44/M",
    bhc: "San Jose Health Center",
    category: "A2",
    priority: "Normal",
    concern: "Follow-up assessment",
    suggestedSpecialization: "General Consultation",
    dateSubmitted: "May 12, 2026",
    status: "No-Show",
  },
  {
    trackingId: "AKY-2026-005",
    patient: "Antonio Santos",
    ageSex: "29/M",
    bhc: "Taliptip Health Center",
    category: "B1",
    priority: "Medium",
    concern: "Needs RHU monitoring",
    suggestedSpecialization: "General Consultation",
    dateSubmitted: "May 11, 2026",
    status: "For Monitoring",
  },
];

/* ─── Confirmation Modal ─── */
function ConfirmationModal({ action, onCancel, onConfirm }) {
  useEffect(() => {
    if (!action) return;

    function handleKeyDown(e) {
      if (e.key === "Escape") onCancel();
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [action, onCancel]);

  if (!action) return null;

  const toneMap = {
    blue: {
      iconBg: "#EFF6FF",
      iconColor: "#2563EB",
      border: "#DBEAFE",
      button: "#0B2E59",
      buttonHover: "#092347",
    },
    amber: {
      iconBg: "#FFFBEB",
      iconColor: "#D97706",
      border: "#FDE68A",
      button: "#D97706",
      buttonHover: "#B45309",
    },
    red: {
      iconBg: "#FEF2F2",
      iconColor: "#DC2626",
      border: "#FECACA",
      button: "#DC2626",
      buttonHover: "#B91C1C",
    },
    emerald: {
      iconBg: "#ECFDF5",
      iconColor: "#059669",
      border: "#A7F3D0",
      button: "#059669",
      buttonHover: "#047857",
    },
  };

  const tone = toneMap[action.tone] || toneMap.blue;

  return createPortal(
    <div className="anim-fade-in fixed inset-0 z-[10000] flex items-center justify-center bg-black/30 px-4 backdrop-blur-[2px]">
      <div className="modal-pop w-full max-w-md rounded-2xl border border-[#E8ECF0] bg-white p-6 shadow-2xl shadow-black/[0.18]">
        <div className="flex items-start gap-4">
          <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border"
            style={{
              backgroundColor: tone.iconBg,
              color: tone.iconColor,
              borderColor: tone.border,
            }}
          >
            {action.icon}
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-[#0B2E59]">
              {action.title}
            </h2>

            <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">
              {action.description}
            </p>

            <div className="mt-4 rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-4 py-3">
              <p className="font-mono text-xs font-semibold text-[#0B2E59]">
                {action.referral.trackingId}
              </p>

              <p className="mt-1 text-xs text-[#6B7280]">
                {action.referral.patient} · {action.referral.ageSex}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={action.referral.status} />
                <ArrowRight size={13} className="text-[#BCC3CD]" />
                <StatusBadge status={action.nextStatus} />
              </div>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-[#9CA3AF]">
              This confirmation helps prevent accidental status updates while
              processing multiple referrals.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-[#E8ECF0] bg-white px-4 py-2.5 text-xs font-semibold text-[#6B7280] transition-all hover:bg-[#F8FAFC] active:scale-[0.97]"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl px-4 py-2.5 text-xs font-semibold text-white shadow-md transition-all active:scale-[0.97]"
            style={{ backgroundColor: tone.button }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = tone.buttonHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = tone.button;
            }}
          >
            {action.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ─── Three-Dot Action Menu ─── */
function ActionMenu({ referral, onRequestAction }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const actionDetails = {
    checkin: {
      nextStatus: "Received",
      title: "Confirm patient check-in?",
      description:
        "This will mark the referral as received by the RHU. Use this when the referred patient has arrived or has been verified by RHU staff.",
      confirmLabel: "Confirm Check-in",
      tone: "blue",
      icon: <UserCheck size={20} />,
    },
    noshow: {
      nextStatus: "No-Show",
      title: "Mark this referral as No-Show?",
      description:
        "This will record that the patient did not arrive for the referral. This action should only be used after verifying the patient did not show up.",
      confirmLabel: "Mark as No-Show",
      tone: "red",
      icon: <UserX size={20} />,
    },
    monitor: {
      nextStatus: "For Monitoring",
      title: "Start patient monitoring?",
      description:
        "This will move the referral to monitoring status for follow-up or observation. Use this when the case still needs continued RHU or BHC coordination.",
      confirmLabel: "Start Monitoring",
      tone: "amber",
      icon: <Activity size={20} />,
    },
    lateArrival: {
      nextStatus: "Received",
      title: "Check-in late arrival?",
      description:
        "Use this when a patient previously marked as No-Show arrives later and still needs to be processed by the RHU.",
      confirmLabel: "Check-in Patient",
      tone: "blue",
      icon: <UserCheck size={20} />,
    },
  };

  const menuItems = [
    {
      key: "view",
      label: "View Details",
      icon: <Eye size={15} />,
      color: "#374151",
      type: "view",
      divider: true,
    },
  ];

  if (referral.status === "Pending") {
    menuItems.push(
      {
        key: "checkin",
        label: "Check-in Patient",
        icon: <UserCheck size={15} />,
        color: "#2563EB",
        badge: "Recommended",
        badgeColor: "#2563EB",
        type: "status",
      },
      {
        key: "noshow",
        label: "Mark as No-Show",
        icon: <UserX size={15} />,
        color: "#DC2626",
        type: "status",
      },
    );
  }

  if (referral.status === "Received") {
    menuItems.push(
      {
        key: "monitor",
        label: "Start Monitoring",
        icon: <Activity size={15} />,
        color: "#D97706",
        badge: "Next Step",
        badgeColor: "#D97706",
        type: "status",
      },
      {
        key: "feedback",
        label: "Proceed to Return Slip",
        icon: <FileText size={15} />,
        color: "#059669",
        type: "link",
        href: "/rhu/feedback",
      },
    );
  }

  if (referral.status === "For Monitoring") {
    menuItems.push({
      key: "feedback",
      label: "Proceed to Return Slip",
      icon: <FileText size={15} />,
      color: "#059669",
      badge: "Close Loop",
      badgeColor: "#059669",
      type: "link",
      href: "/rhu/feedback",
    });
  }

  if (referral.status === "Completed") {
    menuItems.push({
      key: "feedback",
      label: "View Return Slip",
      icon: <FileText size={15} />,
      color: "#059669",
      type: "link",
      href: "/rhu/feedback",
    });
  }

  if (referral.status === "No-Show") {
    menuItems.push({
      key: "lateArrival",
      label: "Check-in Late Arrival",
      icon: <UserCheck size={15} />,
      color: "#2563EB",
      badge: "If arrived",
      badgeColor: "#2563EB",
      type: "status",
    });
  }

  function updateMenuPosition() {
    if (!btnRef.current) return;

    const rect = btnRef.current.getBoundingClientRect();
    const menuWidth = 260;
    const menuHeight = 270;
    const padding = 12;

    let top = rect.bottom + 8;
    let left = rect.right - menuWidth;

    if (left < padding) left = padding;

    if (left + menuWidth > window.innerWidth - padding) {
      left = window.innerWidth - menuWidth - padding;
    }

    if (top + menuHeight > window.innerHeight - padding) {
      top = rect.top - menuHeight - 8;
    }

    if (top < padding) top = padding;

    setPosition({ top, left });
  }

  function handleOpen() {
    updateMenuPosition();
    setOpen(true);
    setClosing(false);
  }

  function handleClose() {
    setClosing(true);

    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 150);
  }

  function handleAction(item) {
    if (item.type === "view") {
      handleClose();
      return;
    }

    if (item.type === "status") {
      const details = actionDetails[item.key];

      if (!details) return;

      handleClose();

      setTimeout(() => {
        onRequestAction({
          ...details,
          referral,
        });
      }, 160);
    }
  }

  useEffect(() => {
    if (!open) return;

    function handleMouseDown(e) {
      const clickedButton = btnRef.current && btnRef.current.contains(e.target);
      const clickedMenu = menuRef.current && menuRef.current.contains(e.target);

      if (!clickedButton && !clickedMenu) {
        handleClose();
      }
    }

    function handleKeyDown(e) {
      if (e.key === "Escape") handleClose();
    }

    function handleWindowChange() {
      handleClose();
    }

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleMouseDown);
      document.addEventListener("keydown", handleKeyDown);
      window.addEventListener("scroll", handleWindowChange, true);
      window.addEventListener("resize", handleWindowChange);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleWindowChange, true);
      window.removeEventListener("resize", handleWindowChange);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? handleClose() : handleOpen())}
        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-200 active:scale-[0.97] ${
          open
            ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
            : "border-[#E8ECF0] bg-white text-[#9CA3AF] hover:border-[#D1D5DB] hover:bg-[#F8FAFC] hover:text-[#6B7280]"
        }`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <MoreVertical size={15} />
      </button>

      {(open || closing) &&
        createPortal(
          <div
            ref={menuRef}
            className={`fixed z-[9999] w-[260px] origin-top-right rounded-xl border border-[#E8ECF0] bg-white p-1.5 shadow-2xl shadow-black/[0.12] ${
              closing ? "menu-close" : "menu-open"
            }`}
            style={{
              top: position.top,
              left: position.left,
            }}
            role="menu"
          >
            <div className="mb-1.5 border-b border-[#F3F4F6] px-2.5 pb-2">
              <p className="font-mono text-[11px] font-semibold text-[#0B2E59]">
                {referral.trackingId}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-[#BCC3CD]">
                {referral.patient} · {referral.ageSex}
              </p>
            </div>

            {menuItems.map((item, index) => {
              const itemContent = (
                <>
                  <div
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-colors duration-150"
                    style={{
                      backgroundColor: `${item.color}0A`,
                      color: item.color,
                    }}
                  >
                    {item.icon}
                  </div>

                  <span
                    className="flex-1 text-[12px] font-medium"
                    style={{ color: item.color }}
                  >
                    {item.label}
                  </span>

                  {item.badge && (
                    <span
                      className="rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                      style={{
                        backgroundColor: `${item.badgeColor}10`,
                        color: item.badgeColor,
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </>
              );

              return (
                <div key={`${item.key}-${index}`}>
                  {item.type === "link" ? (
                    <Link
                      to={item.href}
                      onClick={handleClose}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all duration-150 hover:bg-[#F8FAFC] active:scale-[0.98]"
                      role="menuitem"
                    >
                      {itemContent}
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleAction(item)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all duration-150 hover:bg-[#F8FAFC] active:scale-[0.98]"
                      role="menuitem"
                    >
                      {itemContent}
                    </button>
                  )}

                  {index === 0 && (
                    <div className="my-1.5 border-t border-[#F3F4F6]" />
                  )}
                </div>
              );
            })}

            <div className="mt-1.5 rounded-lg bg-[#F8FAFC] px-2.5 py-2">
              <p className="text-[10px] leading-relaxed text-[#BCC3CD]">
                Status updates require confirmation before updating.
              </p>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/* ─── Enhanced Workflow Pipeline ─── */
function WorkflowPipeline({ counts }) {
  const steps = [
    {
      label: "Pending",
      description: "Awaiting patient arrival",
      count: counts.pending,
      color: "#64748B",
      bg: "#F8FAFC",
      border: "#E2E8F0",
      icon: <Clock size={15} />,
    },
    {
      label: "Received",
      description: "Checked in at RHU",
      count: counts.received,
      color: "#2563EB",
      bg: "#EFF6FF",
      border: "#BFDBFE",
      icon: <UserCheck size={15} />,
    },
    {
      label: "Monitoring",
      description: "For follow-up or observation",
      count: counts.monitoring,
      color: "#D97706",
      bg: "#FFFBEB",
      border: "#FDE68A",
      icon: <Activity size={15} />,
    },
    {
      label: "Completed",
      description: "Closed with return slip",
      count: counts.completed,
      color: "#059669",
      bg: "#ECFDF5",
      border: "#A7F3D0",
      icon: <CheckCircle2 size={15} />,
    },
  ];

  return (
    <section
      className="anim-fade-up overflow-hidden rounded-2xl border border-[#E8ECF0] bg-white shadow-sm shadow-black/[0.02]"
      style={stagger(0)}
    >
      <div className="flex flex-col justify-between gap-4 border-b border-[#F3F4F6] px-6 py-4 lg:flex-row lg:items-center">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
            <Activity size={17} />
          </div>

          <div>
            <h2 className="text-sm font-bold text-[#0B2E59]">
              Referral Processing Flow
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[#9CA3AF]">
              Quick status overview for RHU receiving, monitoring, and return
              slip completion.
            </p>
          </div>
        </div>

        <div className="flex w-fit items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-red-600">
            <UserX size={14} />
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-red-500">
              No-Show
            </p>
            <p className="text-sm font-bold text-red-700">{counts.noShow}</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="grid gap-4 xl:grid-cols-4">
          {steps.map((step, index) => (
            <div
              key={step.label}
              className="anim-fade-up relative"
              style={stagger(index + 1)}
            >
              <div
                className="group h-full rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/[0.04]"
                style={{
                  backgroundColor: step.bg,
                  borderColor: step.border,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm transition-transform duration-300 group-hover:scale-105"
                      style={{ color: step.color }}
                    >
                      {step.icon}
                    </div>

                    <div>
                      <p
                        className="text-[10px] font-bold uppercase tracking-[0.14em]"
                        style={{ color: step.color }}
                      >
                        Step {index + 1}
                      </p>

                      <h3 className="mt-1 text-sm font-bold text-[#0B2E59]">
                        {step.label}
                      </h3>
                    </div>
                  </div>

                  <p
                    className="text-3xl font-black leading-none tracking-tight"
                    style={{ color: step.color }}
                  >
                    {step.count}
                  </p>
                </div>

                <p className="mt-4 text-xs leading-relaxed text-[#6B7280]">
                  {step.description}
                </p>

                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/80">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: step.count > 0 ? "72%" : "12%",
                      backgroundColor: step.color,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-4 py-3">
          <p className="text-xs leading-relaxed text-[#6B7280]">
            <span className="font-semibold text-[#0B2E59]">Note:</span> This
            pipeline is a quick operational guide only. Final closure of
            referral cases should still be completed through the Feedback /
            Return Slip module.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ─── Filter Select ─── */
function FilterSelect({ label, children, value, onChange }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </label>

      <div className="relative">
        <select
          value={value}
          onChange={onChange}
          className="h-10 w-full appearance-none rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3 pr-9 text-sm text-[#374151] outline-none transition-all duration-200 focus:border-[#2563EB] focus:bg-white focus:ring-2 focus:ring-[#2563EB]/10"
        >
          {children}
        </select>

        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#BCC3CD]"
        />
      </div>
    </div>
  );
}

/* ─── Badges ─── */
function StatusBadge({ status, animate = false }) {
  const map = {
    Pending: { bg: "#F8FAFC", text: "#475569", dot: "#94A3B8" },
    Received: { bg: "#EFF6FF", text: "#1D4ED8", dot: "#3B82F6" },
    "For Monitoring": { bg: "#FFFBEB", text: "#B45309", dot: "#F59E0B" },
    Completed: { bg: "#ECFDF5", text: "#047857", dot: "#10B981" },
    "No-Show": { bg: "#FEF2F2", text: "#B91C1C", dot: "#EF4444" },
  };

  const s = map[status] || map.Pending;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
        animate ? "anim-status-pop" : ""
      }`}
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: s.dot }}
      />
      {status}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const map = {
    High: { bg: "#FEF2F2", text: "#B91C1C", icon: <AlertCircle size={11} /> },
    Medium: { bg: "#FFFBEB", text: "#B45309", icon: <Clock size={11} /> },
    Normal: {
      bg: "#F8FAFC",
      text: "#475569",
      icon: <CheckCircle2 size={11} />,
    },
  };

  const s = map[priority] || map.Normal;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {s.icon}
      {priority}
    </span>
  );
}

function CategoryBadge({ category }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-[#DBEAFE] bg-[#EFF6FF] px-2.5 py-1 font-mono text-[11px] font-bold text-[#1D4ED8]">
      {category}
    </span>
  );
}

function TerminalPill({ status }) {
  if (status === "Completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-600">
        <Check size={12} strokeWidth={3} />
        Done
      </span>
    );
  }

  if (status === "No-Show") {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-500">
        <AlertCircle size={12} />
        Missed
      </span>
    );
  }

  return null;
}

/* ─── Main ─── */
export default function IncomingReferrals() {
  const [referrals, setReferrals] = useState(INITIAL_REFERRALS);
  const [animatedIds, setAnimatedIds] = useState(new Set());
  const [pendingAction, setPendingAction] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("All Status");
  const [filterPriority, setFilterPriority] = useState("All Priority");
  const [filterSpecialization, setFilterSpecialization] =
    useState("All Specialization");

  const updateStatus = useCallback((trackingId, newStatus) => {
    setReferrals((prev) =>
      prev.map((ref) =>
        ref.trackingId === trackingId ? { ...ref, status: newStatus } : ref,
      ),
    );

    setAnimatedIds((prev) => new Set([...prev, trackingId]));

    setTimeout(() => {
      setAnimatedIds((prev) => {
        const next = new Set(prev);
        next.delete(trackingId);
        return next;
      });
    }, 500);
  }, []);

  function handleConfirmAction() {
    if (!pendingAction) return;

    updateStatus(pendingAction.referral.trackingId, pendingAction.nextStatus);
    setPendingAction(null);
  }

  const filtered = referrals.filter((referral) => {
    const query = searchTerm.toLowerCase();

    const matchSearch =
      !searchTerm ||
      referral.patient.toLowerCase().includes(query) ||
      referral.trackingId.toLowerCase().includes(query) ||
      referral.concern.toLowerCase().includes(query) ||
      referral.bhc.toLowerCase().includes(query);

    const matchStatus =
      filterStatus === "All Status" || referral.status === filterStatus;

    const matchPriority =
      filterPriority === "All Priority" || referral.priority === filterPriority;

    const matchSpecialization =
      filterSpecialization === "All Specialization" ||
      referral.suggestedSpecialization === filterSpecialization;

    return matchSearch && matchStatus && matchPriority && matchSpecialization;
  });

  const counts = {
    pending: referrals.filter((r) => r.status === "Pending").length,
    received: referrals.filter((r) => r.status === "Received").length,
    monitoring: referrals.filter((r) => r.status === "For Monitoring").length,
    completed: referrals.filter((r) => r.status === "Completed").length,
    noShow: referrals.filter((r) => r.status === "No-Show").length,
  };

  const isTerminal = (status) => status === "Completed" || status === "No-Show";

  return (
    <DashboardLayout role="rhu" title="Incoming Referrals">
      <style>{keyframes}</style>

      <ConfirmationModal
        action={pendingAction}
        onCancel={() => setPendingAction(null)}
        onConfirm={handleConfirmAction}
      />

      {/* Header */}
      <div
        className="anim-fade-up mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-start"
        style={stagger(0)}
      >
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B2E59]/[0.06] text-[#0B2E59]">
            <Stethoscope size={20} />
          </div>

          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
              Incoming Referrals
            </h1>

            <p className="mt-1 text-sm text-[#6B7280]">
              Review, verify, and update BHC-to-RHU referral records.
            </p>
          </div>
        </div>

        <Link
          to="/rhu/qr-scanner"
          className="group flex w-fit items-center gap-2.5 rounded-xl bg-[#0B2E59] px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-[#0B2E59]/20 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#092347] hover:shadow-lg hover:shadow-[#0B2E59]/30 active:scale-[0.98]"
          style={stagger(1)}
        >
          <QrCode
            size={16}
            className="transition-transform duration-300 group-hover:scale-110"
          />
          Open QR Scanner
        </Link>
      </div>

      <div className="mb-6">
        <WorkflowPipeline counts={counts} />
      </div>

      {/* Filters */}
      <div
        className="anim-fade-up mb-6 rounded-2xl border border-[#E8ECF0] bg-white p-5 shadow-sm shadow-black/[0.02]"
        style={stagger(6)}
      >
        <div className="grid gap-4 xl:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
              Search
            </label>

            <div className="flex items-center rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3 transition-all duration-200 focus-within:border-[#2563EB] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#2563EB]/10">
              <Search size={14} className="text-[#BCC3CD]" />

              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-10 flex-1 border-0 bg-transparent px-2 text-sm outline-none placeholder:text-[#BCC3CD]"
                placeholder="Patient, ID, BHC, or concern..."
              />

              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="rounded-md p-0.5 text-[#BCC3CD] transition-colors hover:bg-[#F3F4F6] hover:text-[#6B7280]"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          <FilterSelect
            label="Status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option>All Status</option>
            <option>Pending</option>
            <option>Received</option>
            <option>For Monitoring</option>
            <option>Completed</option>
            <option>No-Show</option>
          </FilterSelect>

          <FilterSelect
            label="Urgency"
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
          >
            <option>All Urgency</option>
            <option>Urgent</option>
            <option>Non-Urgen</option>
            <option>Urgent</option>
          </FilterSelect>

          <FilterSelect
            label="Specialization"
            value={filterSpecialization}
            onChange={(e) => setFilterSpecialization(e.target.value)}
          >
            <option>All Specialization</option>
            <option>Maternal Care</option>
            <option>Pediatrics</option>
            <option>General Consultation</option>
            <option>Senior Citizen Care</option>
          </FilterSelect>
        </div>
      </div>

      {/* Referral Queue */}
      <div
        className="anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white shadow-sm shadow-black/[0.02]"
        style={stagger(7)}
      >
        <div className="flex flex-col justify-between gap-4 border-b border-[#F3F4F6] px-6 py-4 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
              <Stethoscope size={16} />
            </div>

            <div>
              <h2 className="text-sm font-semibold text-[#0B2E59]">
                Referral Queue
              </h2>

              <p className="text-xs text-[#9CA3AF]">
                Process patient arrival, no-show, monitoring, and feedback.
              </p>
            </div>
          </div>

          <span className="w-fit rounded-lg bg-[#F3F4F6] px-3 py-1.5 text-[11px] font-semibold text-[#6B7280]">
            {filtered.length} of {referrals.length} records
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1160px] text-left">
            <thead>
              <tr className="border-b border-[#F3F4F6] bg-[#FAFBFC] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                <th className="px-6 py-3.5">Tracking ID</th>
                <th className="px-4 py-3.5">Patient</th>
                <th className="px-4 py-3.5">Referring HCI</th>
                <th className="px-4 py-3.5">Category</th>
                <th className="px-4 py-3.5">Priority</th>
                <th className="px-4 py-3.5">Concern</th>
                <th className="px-4 py-3.5">Suggested</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F8FAFC]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F8FAFC]">
                        <Search size={20} className="text-[#BCC3CD]" />
                      </div>

                      <p className="text-sm font-medium text-[#9CA3AF]">
                        No referrals match your filters
                      </p>

                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm("");
                          setFilterStatus("All Status");
                          setFilterPriority("All Priority");
                          setFilterSpecialization("All Specialization");
                        }}
                        className="text-xs font-semibold text-[#2563EB] underline-offset-2 hover:underline"
                      >
                        Clear all filters
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((referral, index) => {
                  const animated = animatedIds.has(referral.trackingId);
                  const terminal = isTerminal(referral.status);

                  return (
                    <tr
                      key={referral.trackingId}
                      className={`group transition-colors duration-150 hover:bg-[#FAFBFD] ${
                        terminal ? "bg-[#FAFBFC]/40" : ""
                      }`}
                      style={stagger(index)}
                    >
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className="rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-2.5 py-1.5 font-mono text-xs font-semibold text-[#0B2E59] transition-colors duration-200 group-hover:border-[#DBEAFE] group-hover:bg-[#EFF6FF]">
                          {referral.trackingId}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-4 py-4">
                        <p className="text-sm font-semibold text-[#1A1A1A]">
                          {referral.patient}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#BCC3CD]">
                          {referral.ageSex}
                        </p>
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-sm text-[#6B7280]">
                        {referral.bhc}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4">
                        <CategoryBadge category={referral.category} />
                      </td>

                      <td className="whitespace-nowrap px-4 py-4">
                        <PriorityBadge priority={referral.priority} />
                      </td>

                      <td className="max-w-[190px] truncate px-4 py-4 text-sm text-[#6B7280]">
                        {referral.concern}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4 text-sm text-[#6B7280]">
                        {referral.suggestedSpecialization}
                      </td>

                      <td className="whitespace-nowrap px-4 py-4">
                        <StatusBadge
                          status={referral.status}
                          animate={animated}
                        />
                      </td>

                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {terminal && (
                            <TerminalPill status={referral.status} />
                          )}

                          <ActionMenu
                            referral={referral}
                            onRequestAction={setPendingAction}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="flex flex-col justify-between gap-3 border-t border-[#F3F4F6] px-6 py-3.5 sm:flex-row sm:items-center">
            <p className="text-[11px] text-[#BCC3CD]">
              Showing {filtered.length} referral
              {filtered.length !== 1 ? "s" : ""}
            </p>

            <div className="flex items-center gap-1">
              {[1, 2, 3].map((page) => (
                <button
                  key={page}
                  type="button"
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold transition-all duration-200 ${
                    page === 1
                      ? "bg-[#0B2E59] text-white shadow-sm shadow-[#0B2E59]/20"
                      : "text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#374151]"
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Clinical Reminder */}
      <div
        className="anim-fade-up mt-6 flex items-start gap-3 rounded-xl border border-[#DBEAFE] bg-[#EFF6FF] px-5 py-4"
        style={stagger(8)}
      >
        <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[#DBEAFE] text-[#2563EB]">
          <FileText size={14} />
        </div>

        <div>
          <p className="text-xs font-semibold text-[#1D4ED8]">
            Clinical Reminder
          </p>

          <p className="mt-1 text-xs leading-relaxed text-[#4B5563]">
            Status-changing actions require confirmation to prevent accidental
            updates. Diagnosis, treatment notes, prescription details, and final
            referral closure should be handled through the{" "}
            <span className="font-semibold text-[#1D4ED8]">
              Feedback / Return Slip
            </span>{" "}
            module.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
