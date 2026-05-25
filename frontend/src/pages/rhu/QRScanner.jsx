import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  Info,
  QrCode,
  ScanLine,
  Search,
  ShieldCheck,
  UserCheck,
  UserX,
  X,
} from "lucide-react";

import DashboardLayout from "../../layouts/DashboardLayout";

/* ─────────────────────────────────────────────
   ANIMATIONS
───────────────────────────────────────────── */
const keyframes = `
@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes modalPop {
  from {
    opacity: 0;
    transform: translateY(10px) scale(.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes scanLine {
  0% {
    transform: translateY(0);
    opacity: 0;
  }

  15% {
    opacity: 1;
  }

  85% {
    opacity: 1;
  }

  100% {
    transform: translateY(230px);
    opacity: 0;
  }
}

.anim-fade-up {
  opacity: 0;
  animation: fadeUp .55s cubic-bezier(.22,1,.36,1) both;
}

.anim-fade-in {
  animation: fadeIn .22s ease both;
}

.modal-pop {
  animation: modalPop .22s cubic-bezier(.22,1,.36,1) both;
}

.scan-line {
  animation: scanLine 2s ease-in-out infinite;
}
`;

const stagger = (i) => ({
  animationDelay: `${i * 70}ms`,
});

/* ─────────────────────────────────────────────
   DEMO DATA
───────────────────────────────────────────── */
const referralsData = [
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

export default function QRScanner() {
  const [trackingInput, setTrackingInput] = useState("");
  const [selectedReferral, setSelectedReferral] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setSelectedReferral(null);
  }, []);

  /* ─────────────────────────────────────────────
     VERIFY QR / TRACKING
  ───────────────────────────────────────────── */
  function verifyTrackingId(value) {
    const normalized = value.trim().toUpperCase();

    if (!normalized) {
      setError("Please enter or scan a Tracking ID.");
      setSelectedReferral(null);
      setSuccess("");
      return;
    }

    const found = referralsData.find(
      (item) => item.trackingId.toUpperCase() === normalized,
    );

    if (!found) {
      setError("No referral record found.");
      setSelectedReferral(null);
      setSuccess("");
      return;
    }

    setTrackingInput(found.trackingId);
    setSelectedReferral(found);

    setError("");
    setSuccess("Referral record retrieved successfully.");
  }

  function simulateQRScan() {
    const sample =
      referralsData.find((item) => item.status === "Pending") ||
      referralsData[0];

    setTrackingInput(sample.trackingId);
    verifyTrackingId(sample.trackingId);
  }

  function handleConfirmAction() {
    setSuccess("Demo mode only. Status update simulated successfully.");

    setPendingAction(null);
  }

  return (
    <DashboardLayout role="rhu" title="QR Scanner">
      <style>{keyframes}</style>

      <ConfirmationModal
        action={pendingAction}
        onCancel={() => setPendingAction(null)}
        onConfirm={handleConfirmAction}
      />

      {/* HEADER */}
      <div
        className="anim-fade-up mb-8 flex items-center gap-3.5"
        style={stagger(0)}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B2E59]/[0.06] text-[#0B2E59]">
          <QrCode size={20} />
        </div>

        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
            QR Scanner
          </h1>

          <p className="mt-1 text-sm text-[#6B7280]">
            Scan or manually verify referral Tracking IDs before RHU processing.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* LEFT SIDE */}
        <div className="space-y-6">
          {/* SCANNER */}
          <section
            className="anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-6 shadow-sm"
            style={stagger(1)}
          >
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
                <ScanLine size={18} />
              </div>

              <div>
                <h2 className="text-sm font-bold text-[#0B2E59]">
                  Scan Referral QR
                </h2>

                <p className="text-xs text-[#9CA3AF]">
                  Camera integration placeholder for prototype.
                </p>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-[#BFDBFE] bg-[#F8FAFC] p-6">
              <div className="scan-line absolute left-6 right-6 top-6 h-0.5 bg-[#2563EB]/40" />

              <div className="flex min-h-[270px] flex-col items-center justify-center text-center">
                <div className="mb-5 flex h-24 w-24 items-center justify-center rounded-2xl border border-[#E8ECF0] bg-white text-[#0B2E59] shadow-sm">
                  <QrCode size={46} />
                </div>

                <h3 className="text-sm font-bold text-[#0B2E59]">
                  QR camera scanner coming soon
                </h3>

                <p className="mt-2 max-w-sm text-xs leading-relaxed text-[#6B7280]">
                  Use simulated scanning or manual verification during frontend
                  demo.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={simulateQRScan}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B2E59] px-4 py-3 text-xs font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#092347]"
            >
              <QrCode size={15} />
              Simulate QR Scan
            </button>
          </section>

          {/* MANUAL VERIFY */}
          <section
            className="anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-6 shadow-sm"
            style={stagger(2)}
          >
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
                <Search size={18} />
              </div>

              <div>
                <h2 className="text-sm font-bold text-[#0B2E59]">
                  Manual Verification
                </h2>

                <p className="text-xs text-[#9CA3AF]">
                  Verify referral using Tracking ID.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 md:flex-row">
              <div className="flex flex-1 items-center rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3 focus-within:border-[#2563EB] focus-within:bg-white">
                <Search size={15} className="text-[#BCC3CD]" />

                <input
                  value={trackingInput}
                  onChange={(e) => {
                    setTrackingInput(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      verifyTrackingId(trackingInput);
                    }
                  }}
                  placeholder="Example: AKY-2026-001"
                  className="h-12 flex-1 border-0 bg-transparent px-3 text-sm outline-none placeholder:text-[#BCC3CD]"
                />

                {trackingInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setTrackingInput("");
                      setSelectedReferral(null);
                      setError("");
                      setSuccess("");
                    }}
                    className="rounded-md p-1 text-[#BCC3CD] hover:bg-[#F3F4F6]"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => verifyTrackingId(trackingInput)}
                className="rounded-xl bg-[#0B2E59] px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#092347]"
              >
                Verify
              </button>
            </div>

            {error && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                <AlertCircle size={16} className="mt-0.5 text-red-600" />

                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            {success && !error && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <CheckCircle2 size={16} className="mt-0.5 text-emerald-600" />

                <p className="text-xs text-emerald-700">{success}</p>
              </div>
            )}
          </section>

          {/* SECURITY INFO */}
          <section
            className="anim-fade-up rounded-2xl border border-blue-100 bg-blue-50/70 p-5"
            style={stagger(3)}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                <ShieldCheck size={15} />
              </div>

              <p className="text-xs leading-relaxed text-[#4B5563]">
                QR verification helps prevent incorrect patient retrieval before
                RHU status processing.
              </p>
            </div>
          </section>
        </div>

        {/* RIGHT SIDE */}
        <aside className="space-y-6">
          {!selectedReferral ? (
            <EmptyPreview />
          ) : (
            <ReferralPreview
              referral={selectedReferral}
              onRequestAction={setPendingAction}
            />
          )}

          <StatusGuide />
        </aside>
      </div>
    </DashboardLayout>
  );
}

/* ─────────────────────────────────────────────
   REFERRAL PREVIEW
───────────────────────────────────────────── */
function ReferralPreview({ referral, onRequestAction }) {
  const action = getPrimaryAction(referral);

  return (
    <section className="anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B2E59] text-xs font-bold text-white">
            {getInitials(referral.patient)}
          </div>

          <div>
            <h2 className="text-sm font-bold text-[#0B2E59]">Referral Found</h2>

            <p className="mt-0.5 font-mono text-xs text-[#6B7280]">
              {referral.trackingId}
            </p>
          </div>
        </div>

        <StatusBadge status={referral.status} />
      </div>

      <div className="space-y-3">
        <DetailItem
          label="Patient"
          value={`${referral.patient} · ${referral.ageSex}`}
        />

        <DetailItem label="Referring BHC" value={referral.bhc} />

        <DetailItem label="Concern" value={referral.concern} />

        <DetailItem
          label="Suggested Service"
          value={referral.suggestedSpecialization}
        />
      </div>

      <div className="mt-6 rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] p-4">
        <div className="mb-4 flex items-start gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{
              backgroundColor: action.iconBg,
              color: action.iconColor,
            }}
          >
            {action.icon}
          </div>

          <div>
            <p className="text-xs font-bold text-[#0B2E59]">{action.title}</p>

            <p className="mt-1 text-[11px] leading-relaxed text-[#6B7280]">
              {action.description}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            onRequestAction({
              referral,
              ...action,
            })
          }
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B2E59] px-4 py-2.5 text-xs font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#092347]"
        >
          {action.buttonIcon}
          {action.buttonLabel}
        </button>

        <Link
          to="/rhu/incoming-referrals"
          className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-[#E8ECF0] bg-white px-4 py-2.5 text-xs font-semibold text-[#0B2E59] hover:bg-[#F8FAFC]"
        >
          View in Incoming Referrals
          <ArrowRight size={13} />
        </Link>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   PRIMARY ACTION
───────────────────────────────────────────── */
function getPrimaryAction(referral) {
  if (referral.status === "Pending") {
    return {
      title: "Ready for patient arrival confirmation",
      description: "Verify patient details before confirming RHU arrival.",
      buttonLabel: "Confirm Patient Arrival",
      buttonIcon: <UserCheck size={14} />,
      icon: <UserCheck size={15} />,
      iconBg: "#EFF6FF",
      iconColor: "#2563EB",
    };
  }

  if (referral.status === "Received") {
    return {
      title: "Patient already checked in",
      description: "Referral already received by RHU personnel.",
      buttonLabel: "Already Received",
      buttonIcon: <CheckCircle2 size={14} />,
      icon: <CheckCircle2 size={15} />,
      iconBg: "#ECFDF5",
      iconColor: "#059669",
    };
  }

  if (referral.status === "No-Show") {
    return {
      title: "Late arrival available",
      description: "Patient may still be checked in after verification.",
      buttonLabel: "Check-in Late Arrival",
      buttonIcon: <UserX size={14} />,
      icon: <UserX size={15} />,
      iconBg: "#FEF2F2",
      iconColor: "#DC2626",
    };
  }

  return {
    title: "Referral already completed",
    description: "View RHU return slip or final assessment.",
    buttonLabel: "View Return Slip",
    buttonIcon: <FileText size={14} />,
    icon: <Activity size={15} />,
    iconBg: "#FFFBEB",
    iconColor: "#D97706",
  };
}

/* ─────────────────────────────────────────────
   CONFIRMATION MODAL
───────────────────────────────────────────── */
function ConfirmationModal({ action, onCancel, onConfirm }) {
  if (!action) return null;

  return createPortal(
    <div className="anim-fade-in fixed inset-0 z-[10000] flex items-center justify-center bg-black/30 px-4 backdrop-blur-[2px]">
      <div className="modal-pop w-full max-w-md rounded-2xl border border-[#E8ECF0] bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EFF6FF] text-[#2563EB]">
            <UserCheck size={20} />
          </div>

          <div className="flex-1">
            <h2 className="text-base font-bold text-[#0B2E59]">
              Confirm patient arrival?
            </h2>

            <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">
              This is a frontend demo only. No database changes will be saved.
            </p>

            <div className="mt-4 rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-4 py-3">
              <p className="font-mono text-xs font-semibold text-[#0B2E59]">
                {action.referral.trackingId}
              </p>

              <p className="mt-1 text-xs text-[#6B7280]">
                {action.referral.patient} · {action.referral.ageSex}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-[#E8ECF0] bg-white px-4 py-2.5 text-xs font-semibold text-[#6B7280]"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-[#0B2E59] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#092347]"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ─────────────────────────────────────────────
   EMPTY PREVIEW
───────────────────────────────────────────── */
function EmptyPreview() {
  return (
    <section className="anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-6 shadow-sm">
      <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#EFF6FF] text-[#2563EB]">
          <ClipboardList size={28} />
        </div>

        <h2 className="text-sm font-bold text-[#0B2E59]">
          No referral selected
        </h2>

        <p className="mt-2 max-w-xs text-xs leading-relaxed text-[#6B7280]">
          Scan or verify a Tracking ID to preview referral details.
        </p>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   STATUS GUIDE
───────────────────────────────────────────── */
function StatusGuide() {
  const items = [
    {
      status: "Pending",
      text: "Awaiting patient arrival.",
    },
    {
      status: "Received",
      text: "Already checked in.",
    },
    {
      status: "No-Show",
      text: "Patient did not arrive.",
    },
    {
      status: "Completed",
      text: "Referral already completed.",
    },
  ];

  return (
    <section className="anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
          <Info size={15} />
        </div>

        <div>
          <h2 className="text-sm font-bold text-[#0B2E59]">QR Action Guide</h2>

          <p className="text-xs text-[#9CA3AF]">
            Quick operational status reference.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.status}
            className="rounded-xl border border-[#F3F4F6] bg-[#FAFBFC] px-4 py-3"
          >
            <StatusBadge status={item.status} />

            <p className="mt-2 text-xs text-[#6B7280]">{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   SMALL COMPONENTS
───────────────────────────────────────────── */
function DetailItem({ label, value }) {
  return (
    <div className="rounded-xl border border-[#F3F4F6] bg-[#FAFBFC] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </p>

      <p className="mt-1 text-[13px] font-semibold text-[#1A1A1A]">{value}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    Pending: {
      bg: "#F8FAFC",
      text: "#475569",
      dot: "#94A3B8",
    },

    Received: {
      bg: "#EFF6FF",
      text: "#1D4ED8",
      dot: "#3B82F6",
    },

    "For Monitoring": {
      bg: "#FFFBEB",
      text: "#B45309",
      dot: "#F59E0B",
    },

    Completed: {
      bg: "#ECFDF5",
      text: "#047857",
      dot: "#10B981",
    },

    "No-Show": {
      bg: "#FEF2F2",
      text: "#B91C1C",
      dot: "#EF4444",
    },
  };

  const s = map[status] || map.Pending;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
      style={{
        backgroundColor: s.bg,
        color: s.text,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: s.dot,
        }}
      />

      {status}
    </span>
  );
}

function getInitials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("");
}
