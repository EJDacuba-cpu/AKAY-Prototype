import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  FileText,
  QrCode,
  Search,
  UserCheck,
  UserX,
  ArrowRight,
  AlertCircle,
  X,
  Check,
  Activity,
  Stethoscope,
  MoreVertical,
  RotateCcw,
  ClipboardList,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import DashboardLayout from "../../components/layout/DashboardLayout";
import WorkflowActionButton from "../../components/features/referrals/WorkflowActionButton";
import { getReferrals, updateReferralStatus } from "../../services/referrals";

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
  .anim-fade-up { opacity: 0; animation: fadeUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) both; }
  .anim-fade-in { animation: fadeIn 0.25s ease both; }
  .anim-status-pop { animation: statusPop 0.35s cubic-bezier(0.22, 1, 0.36, 1) both; }
  .menu-open { animation: menuOpen 0.2s cubic-bezier(0.22, 1, 0.36, 1) both; }
  .menu-close { animation: menuClose 0.15s cubic-bezier(0.55, 0, 1, 0.45) both; }
  .modal-pop { animation: modalPop 0.22s cubic-bezier(0.22, 1, 0.36, 1) both; }
`;

const stagger = (i) => ({ animationDelay: `${i * 65}ms` });

/* ─── Tab Configuration (Concise Labels) ─── */
const REFERRAL_TABS = [
  { key: "All Status", label: "All", icon: ClipboardList },
  { key: "Pending", label: "Pending", icon: Clock },
  { key: "Received", label: "Received", icon: UserCheck },
  { key: "For Monitoring", label: "Monitoring", icon: Activity },
  { key: "Completed", label: "Completed", icon: CheckCircle2 },
  { key: "No-Show", label: "No-Show", icon: UserX },
];

/* ─── Status Action Definitions ─── */
const STATUS_ACTION_DEFS = {
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

/* ─── Confirmation Modal ─── */
function ConfirmationModal({ action, onCancel, onConfirm }) {
  useEffect(() => {
    if (!action) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
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
      <div className="modal-pop w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
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
            <h2 className="text-base font-bold text-slate-900">
              {action.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              {action.description}
            </p>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="font-mono text-xs font-semibold text-[#0B2E59]">
                {action.referral.trackingId}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {action.referral.patient} · {action.referral.ageSex}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={action.referral.status} />
                <ArrowRight size={13} className="text-slate-300" />
                <StatusBadge status={action.nextStatus} />
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
              This confirmation helps prevent accidental status updates.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 transition-all hover:bg-slate-50 active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg px-4 py-2.5 text-xs font-semibold text-white shadow-md transition-all active:scale-[0.97]"
            style={{ backgroundColor: tone.button }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = tone.buttonHover)
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = tone.button)
            }
          >
            {action.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ─── Secondary Action Menu ─── */
function ActionMenu({ referral }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const menuItems = [
    {
      key: "view",
      label: "View Details",
      icon: <Eye size={15} />,
      color: "#374151",
    },
    {
      key: "feedback",
      label: "Create Feedback",
      icon: <FileText size={15} />,
      color: "#059669",
    },
    {
      key: "copy",
      label: copied ? "Copied!" : "Copy Tracking ID",
      icon: copied ? <Check size={15} /> : <Copy size={15} />,
      color: copied ? "#059669" : "#374151",
    },
  ];

  function updateMenuPosition() {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuWidth = 240;
    const padding = 12;
    let top = rect.bottom + 8;
    let left = rect.right - menuWidth;
    if (left < padding) left = padding;
    if (left + menuWidth > window.innerWidth - padding)
      left = window.innerWidth - menuWidth - padding;
    if (top + 200 > window.innerHeight - padding) top = rect.top - 200 - 8;
    if (top < padding) top = padding;
    setPosition({ top, left });
  }

  function handleOpen() {
    setCopied(false);
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

  function handleCopyId() {
    navigator.clipboard.writeText(referral.trackingId).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        handleClose();
      }, 900);
    });
  }

  const navigate = useNavigate();

  function handleAction(item) {
    if (item.key === "copy") {
      handleCopyId();
      return;
    }

    if (item.key === "feedback") {
      handleClose();
      navigate(`/rhu/feedback/${referral.trackingId}`);
      return;
    }

    handleClose();
  }

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e) {
      if (
        btnRef.current &&
        !btnRef.current.contains(e.target) &&
        menuRef.current &&
        !menuRef.current.contains(e.target)
      )
        handleClose();
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
        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-200 active:scale-[0.97] ${open ? "border-blue-200 bg-blue-50 text-blue-600" : "border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-600"}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <MoreVertical size={15} />
      </button>
      {(open || closing) &&
        createPortal(
          <div
            ref={menuRef}
            className={`fixed z-[9999] w-[240px] origin-top-right rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-black/[0.12] ${closing ? "menu-close" : "menu-open"}`}
            style={{ top: position.top, left: position.left }}
            role="menu"
          >
            <div className="mb-1.5 border-b border-slate-100 px-2.5 pb-2">
              <p className="font-mono text-[11px] font-semibold text-[#0B2E59]">
                {referral.trackingId}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-slate-400">
                {referral.patient} · {referral.ageSex}
              </p>
            </div>
            {menuItems.map((item) => (
              <button
                key={item.key}
                onClick={() => handleAction(item)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all duration-150 hover:bg-slate-50 active:scale-[0.98]"
                role="menuitem"
              >
                <div
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
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
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

/* ─── Direct Workflow Actions ─── */
function ReferralActions({ referral, onRequestAction, onContinueMonitoring }) {
  function requestStatusAction(actionKey) {
    const def = STATUS_ACTION_DEFS[actionKey];
    if (!def) return;
    onRequestAction({ ...def, referral });
  }

  const actionsByStatus = {
    Pending: (
      <>
        <WorkflowActionButton
          icon={UserCheck}
          label="Check-in"
          color="blue"
          onClick={() => requestStatusAction("checkin")}
        />
        <WorkflowActionButton
          icon={UserX}
          label="No-Show"
          color="red"
          onClick={() => requestStatusAction("noshow")}
        />
      </>
    ),
    Received: (
      <>
        <WorkflowActionButton
          icon={Activity}
          label="Monitor"
          color="amber"
          onClick={() => requestStatusAction("monitor")}
        />
        <WorkflowActionButton
          icon={FileText}
          label="Feedback"
          color="emerald"
          to={`/rhu/feedback/${referral.trackingId}`}
        />
      </>
    ),
    "For Monitoring": (
      <>
        <WorkflowActionButton
          icon={Activity}
          label="Continue"
          color="amber"
          onClick={() => onContinueMonitoring(referral)}
        />
        <WorkflowActionButton
          icon={FileText}
          label="Feedback"
          color="emerald"
          to={`/rhu/feedback/${referral.trackingId}`}
        />
      </>
    ),
    Completed: (
      <WorkflowActionButton
        icon={FileText}
        label="Slip"
        color="emerald"
        to={`/rhu/feedback/${referral.trackingId}`}
      />
    ),
    "No-Show": (
      <WorkflowActionButton
        icon={UserCheck}
        label="Late"
        color="blue"
        onClick={() => requestStatusAction("lateArrival")}
      />
    ),
  };

  return (
    <div className="flex items-center justify-end gap-1.5">
      {actionsByStatus[referral.status]}
      <ActionMenu referral={referral} />
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
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-semibold ${animate ? "anim-status-pop" : ""}`}
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
      className="inline-flex items-center gap-1 rounded-md border border-slate-100 px-2 py-0.5 text-[10px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {s.icon}
      {priority}
    </span>
  );
}

function CategoryBadge({ category }) {
  return (
    <span className="inline-flex items-center rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-700">
      {category}
    </span>
  );
}

/* ─── Main ─── */
export default function IncomingReferrals() {
  const [referrals, setReferrals] = useState([]);
  const [animatedIds, setAnimatedIds] = useState(new Set());
  const [pendingAction, setPendingAction] = useState(null);
  const [actionToast, setActionToast] = useState(null);

  const [filterStatus, setFilterStatus] = useState("All Status");
  const [filters, setFilters] = useState({
    search: "",
    priority: "All Priority",
    specialization: "All Specialization",
  });

  /* Toast auto-dismiss */
  useEffect(() => {
    if (!actionToast) return;
    const timer = setTimeout(() => setActionToast(null), 3500);
    return () => clearTimeout(timer);
  }, [actionToast]);

  /* Data Fetching & Sync */
  useEffect(() => {
    let isMounted = true;
    async function loadReferrals() {
      try {
        const all = await getReferrals();
        if (!isMounted) return;
        setReferrals(all);
      } catch {}
    }
    loadReferrals();
    function handleStorageEvent(e) {
      if (!e || e.key !== "referrals") return;
      loadReferrals();
    }
    window.addEventListener("storage", handleStorageEvent);
    const interval = setInterval(loadReferrals, 5000);
    return () => {
      isMounted = false;
      window.removeEventListener("storage", handleStorageEvent);
      clearInterval(interval);
    };
  }, []);

  const updateStatus = useCallback(async (trackingId, newStatus) => {
    try {
      const all = await getReferrals();
      const target = all.find((r) => r.trackingId === trackingId);
      if (!target?.id) {
        setReferrals((prev) =>
          prev.map((ref) =>
            ref.trackingId === trackingId ? { ...ref, status: newStatus } : ref,
          ),
        );
      } else {
        await updateReferralStatus(target.id, newStatus);
        const refreshed = await getReferrals();
        setReferrals(refreshed);
      }
    } catch {
      setReferrals((prev) =>
        prev.map((ref) =>
          ref.trackingId === trackingId ? { ...ref, status: newStatus } : ref,
        ),
      );
    }
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
  function handleContinueMonitoring(referral) {
    setActionToast(
      `Monitoring confirmed for ${referral.patient} (${referral.trackingId})`,
    );
  }

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };
  const handleTabChange = (statusKey) => {
    setFilterStatus(statusKey);
  };

  const clearFilters = () => {
    setFilters({
      search: "",
      priority: "All Priority",
      specialization: "All Specialization",
    });
    setFilterStatus("All Status");
  };
  const hasActiveFilters =
    filters.search !== "" ||
    filters.priority !== "All Priority" ||
    filters.specialization !== "All Specialization" ||
    filterStatus !== "All Status";

  // Base filter (Search, Priority, Spec) - used for tab counts
  const baseFiltered = useMemo(() => {
    return referrals.filter((referral) => {
      const q = filters.search.toLowerCase();
      const matchSearch =
        !filters.search ||
        (referral.patient || "").toLowerCase().includes(q) ||
        (referral.trackingId || "").toLowerCase().includes(q) ||
        (referral.concern || "").toLowerCase().includes(q) ||
        (referral.bhc || "").toLowerCase().includes(q);
      const matchPriority =
        filters.priority === "All Priority" ||
        referral.priority === filters.priority;
      const matchSpec =
        filters.specialization === "All Specialization" ||
        referral.suggestedSpecialization === filters.specialization;
      return matchSearch && matchPriority && matchSpec;
    });
  }, [referrals, filters]);

  // Tab Counts
  const tabCounts = REFERRAL_TABS.reduce((acc, tab) => {
    acc[tab.key] =
      tab.key === "All Status"
        ? baseFiltered.length
        : baseFiltered.filter((r) => r.status === tab.key).length;
    return acc;
  }, {});

  // Fully filtered referrals (includes status tab filter)
  const filtered = useMemo(() => {
    return baseFiltered.filter(
      (referral) =>
        filterStatus === "All Status" || referral.status === filterStatus,
    );
  }, [baseFiltered, filterStatus]);

  return (
    <DashboardLayout role="rhu" title="Incoming Referrals">
      <style>{keyframes}</style>

      <ConfirmationModal
        action={pendingAction}
        onCancel={() => setPendingAction(null)}
        onConfirm={handleConfirmAction}
      />

      {/* Action Toast */}
      {actionToast && (
        <div className="anim-fade-in mb-4 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 size={13} className="text-emerald-600" />
          </div>
          <p className="text-xs font-semibold text-emerald-700">
            {actionToast}
          </p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TOP NAVIGATION: TABS + ACTIONS
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mb-6 flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {REFERRAL_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = filterStatus === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[11px] font-semibold transition-all ${
                  isActive
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:bg-slate-200/50 hover:text-slate-700"
                }`}
              >
                <Icon size={12} className={isActive ? "text-[#0B2E59]" : ""} />
                {tab.label}
                <span
                  className={`rounded-full px-1.5 py-px text-[9px] font-bold leading-none ${
                    isActive
                      ? "bg-[#0B2E59]/10 text-[#0B2E59]"
                      : "bg-slate-300/70 text-slate-600"
                  }`}
                >
                  {tabCounts[tab.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* Top Right Action Buttons */}
        <div className="flex items-center gap-2">
          <Link
            to="/rhu/qr-scanner"
            className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-[#0B2E59] px-4 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#092347] active:bg-[#071D3A]"
          >
            <QrCode size={14} strokeWidth={2.5} /> QR Scanner
          </Link>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          TWO-COLUMN LAYOUT: TABLE (LEFT) + SIDEBAR (RIGHT)
          ═══════════════════════════════════════════════════════════════ */}
      <div className="flex items-start gap-6">
        {/* ── Left Table Content ── */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Stethoscope size={16} />
              </div>
              <div>
                <h2 className="text-[13px] font-bold text-slate-900">
                  Referral Queue
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Process patient arrival, monitoring, and feedback
                </p>
              </div>
            </div>
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
              {filtered.length} records
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-3">Tracking ID</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Referring HCI</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Concern</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-24 text-center">
                      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                        <Search size={20} className="text-slate-400" />
                      </div>
                      <p className="text-[13px] font-semibold text-slate-700">
                        No referrals match your filters
                      </p>
                      <p className="mt-1 text-[11.5px] text-slate-400">
                        Try adjusting your search or filters
                      </p>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="mt-3 text-[11px] font-semibold text-[#0B2E59] hover:underline"
                        >
                          Clear all filters
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filtered.map((referral) => {
                    const animated = animatedIds.has(referral.trackingId);
                    const isTerminal =
                      referral.status === "Completed" ||
                      referral.status === "No-Show";
                    return (
                      <tr
                        key={referral.trackingId}
                        className={`group transition-colors hover:bg-slate-50/50 ${isTerminal ? "bg-slate-50/30" : ""}`}
                      >
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-semibold text-[#0B2E59]">
                            {referral.trackingId}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">
                          <p className="text-[12.5px] font-semibold text-slate-800">
                            {referral.patient}
                          </p>
                          <p className="mt-0.5 text-[10.5px] text-slate-400">
                            {referral.ageSex}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-[12px] text-slate-600">
                          {referral.bhc}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">
                          <CategoryBadge category={referral.category} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">
                          <PriorityBadge priority={referral.priority} />
                        </td>
                        <td className="max-w-[180px] truncate px-4 py-4 text-[12px] text-slate-600">
                          {referral.concern}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">
                          <StatusBadge
                            status={referral.status}
                            animate={animated}
                          />
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <ReferralActions
                            referral={referral}
                            onRequestAction={setPendingAction}
                            onContinueMonitoring={handleContinueMonitoring}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Right Filter Sidebar ── */}
        <aside className="w-[340px] shrink-0 space-y-5">
          {/* Filters Panel */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-[12px] font-semibold text-slate-900">
                Filters
              </h2>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-[10px] font-medium text-[#0B2E59] hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Search Referrals
                </label>
                <div className="relative">
                  <Search
                    size={13}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={filters.search}
                    onChange={(e) =>
                      handleFilterChange("search", e.target.value)
                    }
                    placeholder="Patient, ID, BHC, or concern..."
                    className="h-[34px] w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-[12px] text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:ring-1 focus:ring-[#0B2E59]/10"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Urgency / Priority
                </label>
                <select
                  value={filters.priority}
                  onChange={(e) =>
                    handleFilterChange("priority", e.target.value)
                  }
                  className="h-[34px] w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[12px] text-slate-800 outline-none transition-colors focus:border-slate-300 focus:bg-white focus:ring-1 focus:ring-[#0B2E59]/10"
                >
                  <option>All Priority</option>
                  <option>High</option>
                  <option>Medium</option>
                  <option>Normal</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Specialization
                </label>
                <select
                  value={filters.specialization}
                  onChange={(e) =>
                    handleFilterChange("specialization", e.target.value)
                  }
                  className="h-[34px] w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[12px] text-slate-800 outline-none transition-colors focus:border-slate-300 focus:bg-white focus:ring-1 focus:ring-[#0B2E59]/10"
                >
                  <option>All Specialization</option>
                  <option>Maternal Care</option>
                  <option>Pediatrics</option>
                  <option>General Consultation</option>
                  <option>Senior Citizen Care</option>
                </select>
              </div>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800"
              >
                <RotateCcw size={11} /> Reset All Filters
              </button>
            )}
          </div>
        </aside>
      </div>
    </DashboardLayout>
  );
}
