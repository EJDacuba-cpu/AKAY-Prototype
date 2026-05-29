import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Camera,
  CheckCircle2,
  ClipboardList,
  ClipboardPaste,
  Copy,
  ExternalLink,
  FileText,
  Image,
  Info,
  Lightbulb,
  MonitorPlay,
  QrCode,
  ScanLine,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  X,
  ChevronDown,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  autoMarkNoShowReferrals,
  getReferrals,
} from "../../services/referrals";

/* ─────────────────────────────────────────────
   ANIMATIONS
───────────────────────────────────────────── */
const keyframes = `
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes modalPop {
  from { opacity: 0; transform: translateY(10px) scale(.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes scanBeam {
  0% { top: 8%; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { top: 88%; opacity: 0; }
}

@keyframes pulseRing {
  0% { transform: scale(1); opacity: 0.5; }
  100% { transform: scale(1.8); opacity: 0; }
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
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

.scan-beam {
  animation: scanBeam 2.4s cubic-bezier(.4,0,.2,1) infinite;
}

.pulse-ring {
  animation: pulseRing 2s ease-out infinite;
}

.float-anim {
  animation: float 4s ease-in-out infinite;
}
`;

const stagger = (i) => ({ animationDelay: `${i * 80}ms` });

/* ─── Tab Config ─── */
const SCANNER_TABS = [
  {
    key: "camera",
    label: "Scan with Camera",
    icon: Camera,
  },
  {
    key: "manual",
    label: "Manual Verification",
    icon: Search,
  },
];

export default function QRScanner() {
  const navigate = useNavigate();
  const [referrals, setReferrals] = useState([]);
  const [trackingInput, setTrackingInput] = useState("");
  const [selectedReferral, setSelectedReferral] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState("camera");
  const [isScanning, setIsScanning] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadReferrals() {
      try {
        await autoMarkNoShowReferrals();
        const all = await getReferrals();
        if (!alive) return;
        setReferrals(all);
        setSelectedReferral(null);
      } catch {
        if (alive) setReferrals([]);
      }
    }

    loadReferrals();

    return () => {
      alive = false;
    };
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

    const found = referrals.find(
      (item) => item.trackingId.toUpperCase() === normalized,
    );

    if (!found) {
      setError("No referral record found for this Tracking ID.");
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
      referrals.find((item) => item.status === "Pending") || referrals[0];

    if (!sample) {
      setError("No referral records available to scan.");
      setSelectedReferral(null);
      setSuccess("");
      return;
    }

    setIsScanning(true);
    setTrackingInput("");
    setError("");
    setSuccess("");

    setTimeout(() => {
      setTrackingInput(sample.trackingId);
      setIsScanning(false);
      verifyTrackingId(sample.trackingId);
    }, 2000);
  }

  function handleConfirmAction() {
    if (pendingAction?.referral?.trackingId) {
      navigate(`/rhu/referrals/${pendingAction.referral.trackingId}`);
    }
    setPendingAction(null);
  }

  function clearResults() {
    setSelectedReferral(null);
    setTrackingInput("");
    setError("");
    setSuccess("");
    setCameraOpen(false);
  }

  return (
    <DashboardLayout role="rhu" title="QR Scanner">
      <style>{keyframes}</style>

      <ConfirmationModal
        action={pendingAction}
        onCancel={() => setPendingAction(null)}
        onConfirm={handleConfirmAction}
      />

      {/* ══════════════════════════════════════
          TAB BAR
      ══════════════════════════════════════ */}
      <div
        className="anim-fade-up mb-5 flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1"
        style={stagger(1)}
      >
        {SCANNER_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[12px] font-semibold transition-all duration-200 ${
                isActive
                  ? "bg-white text-[#0B2E59] shadow-sm"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <Icon size={14} className={isActive ? "text-[#0B2E59]" : ""} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════
          MAIN TWO-COLUMN LAYOUT
      ══════════════════════════════════════ */}
      <div
        className="anim-fade-up grid gap-5 xl:grid-cols-2"
        style={stagger(2)}
      >
        {/* ══════════════════════════════════════
            LEFT: SCANNER / INPUT PANEL
        ══════════════════════════════════════ */}
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          {/* Panel Header */}
          <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-3.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0B2E59]/5 text-[#0B2E59]">
              {activeTab === "camera" ? (
                <MonitorPlay size={15} />
              ) : (
                <Search size={15} />
              )}
            </div>
            <h2 className="text-[13px] font-bold text-slate-800">
              {activeTab === "camera" ? "Webcam" : "Manual Input"}
            </h2>
            {isScanning && (
              <span className="ml-auto flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-600">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 pulse-ring" />
                Scanning
              </span>
            )}
          </div>

          {/* Panel Body */}
          <div className="p-5">
            {activeTab === "camera" ? (
              /* ── CAMERA VIEW ── */
              <div className="space-y-4">
                {/* Camera Selector */}
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <select className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 px-3 pr-8 text-[12px] text-slate-500 outline-none transition-colors focus:border-[#0B2E59]/40 focus:bg-white">
                      <option>Camera list (permission needed)</option>
                    </select>
                    <ChevronDown
                      size={14}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (!cameraOpen) {
                        setCameraOpen(true);
                        simulateQRScan();
                      } else {
                        setCameraOpen(false);
                        setIsScanning(false);
                      }
                    }}
                    disabled={isScanning}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-[12px] font-semibold transition-all duration-200 ${
                      cameraOpen && !isScanning
                        ? "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                        : "bg-[#0B2E59] text-white hover:bg-[#092347] disabled:opacity-60"
                    }`}
                  >
                    {cameraOpen && !isScanning ? (
                      <>
                        <X size={14} /> Close Camera
                      </>
                    ) : (
                      <>
                        <Camera size={14} /> Open Camera
                      </>
                    )}
                  </button>
                </div>

                {/* Scanner Viewport */}
                <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                  <div className="relative mx-auto h-[300px] w-full max-w-[100%] bg-gradient-to-b from-slate-100/80 to-slate-50/50">
                    {/* Corner brackets */}
                    <div className="absolute left-4 top-4 h-5 w-5 border-l-[3px] border-t-[3px] border-[#0B2E59] rounded-tl-md" />
                    <div className="absolute right-4 top-4 h-5 w-5 border-r-[3px] border-t-[3px] border-[#0B2E59] rounded-tr-md" />
                    <div className="absolute bottom-4 left-4 h-5 w-5 border-b-[3px] border-l-[3px] border-[#0B2E59] rounded-bl-md" />
                    <div className="absolute bottom-4 right-4 h-5 w-5 border-b-[3px] border-r-[3px] border-[#0B2E59] rounded-br-md" />

                    {/* Scan beam */}
                    {cameraOpen && (
                      <div className="scan-beam absolute left-4 right-4 h-0.5 rounded-full bg-gradient-to-r from-transparent via-[#0B2E59] to-transparent shadow-lg shadow-[#0B2E59]/30" />
                    )}

                    {/* Center content */}
                    <div className="flex h-full flex-col items-center justify-center">
                      {isScanning ? (
                        <div className="float-anim flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0B2E59]/10 to-blue-50 text-[#0B2E59]">
                          <ScanLine size={32} className="stroke-[1.5]" />
                        </div>
                      ) : cameraOpen ? (
                        <div className="text-center">
                          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/80 text-[#0B2E59]/40 shadow-sm">
                            <ScanLine size={28} className="stroke-[1.2]" />
                          </div>
                          <p className="text-[12px] font-semibold text-slate-400">
                            Camera active
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-300">
                            Point at referral QR code
                          </p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-slate-200 shadow-sm">
                            <Camera size={28} className="stroke-[1.2]" />
                          </div>
                          <p className="text-[12px] font-semibold text-slate-400">
                            Camera not active
                          </p>
                          <p className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-slate-300">
                            Click "Open Camera" to start scanning referral QR
                            codes
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Simulate button (below viewport) */}
                {!cameraOpen && (
                  <button
                    type="button"
                    onClick={simulateQRScan}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-[12px] font-semibold text-slate-600 transition-all duration-200 hover:bg-slate-100"
                  >
                    <QrCode size={14} />
                    Simulate QR Scan (Demo)
                  </button>
                )}
              </div>
            ) : (
              /* ── MANUAL INPUT VIEW ── */
              <div className="space-y-4">
                <div className="relative flex items-center rounded-lg border border-slate-200 bg-slate-50/50 px-3 transition-all duration-200 focus-within:border-[#0B2E59]/40 focus-within:bg-white focus-within:shadow-sm focus-within:shadow-[#0B2E59]/5">
                  <Search
                    size={15}
                    className="text-slate-300 transition-colors focus-within:text-[#0B2E59]/50"
                  />

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
                    placeholder="Enter Tracking ID (e.g. AKY-2026-001)"
                    className="h-12 flex-1 border-0 bg-transparent px-3 text-[13px] font-medium text-slate-700 outline-none placeholder:text-slate-300 placeholder:font-normal"
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
                      className="rounded-md p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => verifyTrackingId(trackingInput)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B2E59] px-4 py-2.5 text-[12px] font-semibold text-white transition-all duration-200 hover:bg-[#092347]"
                >
                  <Search size={14} />
                  Verify Tracking ID
                </button>

                {/* Feedback */}
                {error && (
                  <div className="anim-fade-in flex items-center gap-2.5 rounded-lg border border-red-100 bg-red-50/80 px-3.5 py-2.5">
                    <AlertCircle
                      size={14}
                      className="flex-shrink-0 text-red-500"
                    />
                    <p className="text-[11.5px] font-medium text-red-700">
                      {error}
                    </p>
                  </div>
                )}

                {success && !error && (
                  <div className="anim-fade-in flex items-center gap-2.5 rounded-lg border border-emerald-100 bg-emerald-50/80 px-3.5 py-2.5">
                    <CheckCircle2
                      size={14}
                      className="flex-shrink-0 text-emerald-500"
                    />
                    <p className="text-[11.5px] font-medium text-emerald-700">
                      {success}
                    </p>
                  </div>
                )}

                {/* Recent referrals hint */}
                <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
                  <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Available for scanning
                  </p>
                  <div className="space-y-1.5">
                    {referrals
                      .filter((r) => r.status === "Pending")
                      .slice(0, 3)
                      .map((r) => (
                        <button
                          key={r.trackingId}
                          type="button"
                          onClick={() => {
                            setTrackingInput(r.trackingId);
                            verifyTrackingId(r.trackingId);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-md border border-slate-100 bg-white px-3 py-2 text-left transition-colors hover:border-[#0B2E59]/20 hover:bg-[#0B2E59]/[0.02]"
                        >
                          <QrCode
                            size={12}
                            className="flex-shrink-0 text-slate-300"
                          />
                          <span className="flex-1 truncate font-mono text-[11px] font-semibold text-slate-600">
                            {r.trackingId}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {r.patientName || r.patient || "Patient"}
                          </span>
                        </button>
                      ))}
                    {referrals.filter((r) => r.status === "Pending").length ===
                      0 && (
                      <p className="py-2 text-center text-[11px] text-slate-300">
                        No pending referrals
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════
            RIGHT: RESULTS PANEL
        ══════════════════════════════════════ */}
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          {/* Panel Header */}
          <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-3.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <ClipboardList size={15} />
            </div>
            <h2 className="text-[13px] font-bold text-slate-800">Results</h2>
          </div>

          {/* Panel Body */}
          <div className="p-5">
            {!selectedReferral ? (
              /* ── Empty State ── */
              <div className="flex min-h-[340px] flex-col items-center justify-center text-center">
                <div className="relative mb-5">
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-50 text-slate-200">
                    <QrCode size={34} className="stroke-[1.2]" />
                  </div>
                  <div className="absolute -right-1 -bottom-1 flex h-7 w-7 items-center justify-center rounded-lg border-2 border-white bg-slate-100 text-slate-400 shadow-sm">
                    <ScanLine size={12} />
                  </div>
                </div>

                <h3 className="text-[14px] font-bold text-slate-600">
                  Scan a QR code to view
                  <br />
                  the results here.
                </h3>

                <p className="mt-2 max-w-[260px] text-[11.5px] leading-relaxed text-slate-300">
                  Use the camera scanner or manually enter a Tracking ID to
                  retrieve referral information.
                </p>
              </div>
            ) : (
              /* ── Referral Result ── */
              <div className="space-y-4">
                {/* Matched banner */}
                <div className="flex items-center gap-2.5 rounded-lg bg-emerald-50 px-3.5 py-2.5">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  <span className="text-[11.5px] font-bold text-emerald-700">
                    Referral Matched
                  </span>
                  <span className="ml-auto font-mono text-[10px] font-semibold text-emerald-600/70">
                    {selectedReferral.trackingId}
                  </span>
                </div>

                {/* Patient card */}
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0B2E59] to-[#1a4a7a] text-[10px] font-extrabold tracking-wide text-white shadow-md shadow-[#0B2E59]/20">
                      {getInitials(
                        selectedReferral.patientName ||
                          selectedReferral.patient ||
                          "Patient",
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-slate-800">
                        {selectedReferral.patientName ||
                          selectedReferral.patient ||
                          "Patient"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {selectedReferral.ageSex || "—"}
                      </p>
                    </div>
                    <StatusBadge status={selectedReferral.status} />
                  </div>
                </div>

                {/* Detail rows */}
                <div className="space-y-2">
                  <ResultRow
                    label="Referring BHC"
                    value={
                      selectedReferral.referringFacility ||
                      selectedReferral.bhc ||
                      "—"
                    }
                  />
                  <ResultRow
                    label="Chief Complaint"
                    value={
                      selectedReferral.chiefComplaint ||
                      selectedReferral.concern ||
                      "Not specified"
                    }
                  />
                  <ResultRow
                    label="Classification"
                    value={
                      selectedReferral.suggestedSpecialization ||
                      "General Consultation"
                    }
                  />
                </div>

                {/* Action button */}
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const action = getPrimaryAction(selectedReferral);
                      setPendingAction({
                        referral: selectedReferral,
                        ...action,
                      });
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B2E59] px-4 py-2.5 text-[12px] font-semibold text-white transition-all duration-200 hover:bg-[#092347]"
                  >
                    {getPrimaryAction(selectedReferral).buttonIcon}
                    {getPrimaryAction(selectedReferral).buttonLabel}
                  </button>

                  <Link
                    to="/rhu/incoming-referrals"
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[12px] font-semibold text-slate-500 transition-all duration-200 hover:bg-slate-50 hover:text-slate-700"
                  >
                    View in Incoming Referrals
                    <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Action Bar */}
          <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3">
            <button
              type="button"
              onClick={() => {
                if (selectedReferral) {
                  navigator.clipboard?.writeText(selectedReferral.trackingId);
                }
              }}
              disabled={!selectedReferral}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
            >
              <Copy size={12} />
              Copy Results
            </button>

            <button
              type="button"
              onClick={() => {
                if (selectedReferral) {
                  navigate(`/rhu/referrals/${selectedReferral.trackingId}`);
                }
              }}
              disabled={!selectedReferral}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
            >
              <ExternalLink size={12} />
              Open Link
            </button>

            <button
              type="button"
              onClick={clearResults}
              disabled={!selectedReferral && !trackingInput}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-slate-500 disabled:hover:border-slate-200"
            >
              <Trash2 size={12} />
              Clear
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

/* ─────────────────────────────────────────────
   PRIMARY ACTION
───────────────────────────────────────────── */
function getPrimaryAction(referral) {
  if (referral.status === "Pending") {
    return {
      title: "Ready for patient arrival",
      description: "Confirm patient identity and check in.",
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
      description: "Continue with clinical assessment.",
      buttonLabel: "Continue Processing",
      buttonIcon: <CheckCircle2 size={14} />,
      icon: <CheckCircle2 size={15} />,
      iconBg: "#ECFDF5",
      iconColor: "#059669",
    };
  }

  if (referral.status === "No-Show") {
    return {
      title: "Late arrival option",
      description: "Check in with late arrival notation.",
      buttonLabel: "Check-in Late Arrival",
      buttonIcon: <UserX size={14} />,
      icon: <UserX size={15} />,
      iconBg: "#FEF2F2",
      iconColor: "#DC2626",
    };
  }

  if (referral.status === "For Monitoring") {
    return {
      title: "Under monitoring",
      description: "Continue monitoring or complete referral.",
      buttonLabel: "Continue Monitoring",
      buttonIcon: <Activity size={14} />,
      icon: <Activity size={15} />,
      iconBg: "#FFFBEB",
      iconColor: "#D97706",
    };
  }

  return {
    title: "Referral completed",
    description: "View return slip and final assessment.",
    buttonLabel: "View Return Slip",
    buttonIcon: <FileText size={14} />,
    icon: <ShieldCheck size={15} />,
    iconBg: "#ECFDF5",
    iconColor: "#059669",
  };
}

/* ─────────────────────────────────────────────
   CONFIRMATION MODAL
───────────────────────────────────────────── */
function ConfirmationModal({ action, onCancel, onConfirm }) {
  if (!action) return null;

  return createPortal(
    <div className="anim-fade-in fixed inset-0 z-[10000] flex items-center justify-center bg-[#0B2E59]/20 px-4 backdrop-blur-sm">
      <div className="modal-pop w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/10">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-[#0B2E59] to-[#103d6b] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white">
              <UserCheck size={18} />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-white">
                Confirm Patient Arrival
              </h2>
              <p className="mt-0.5 text-[11px] text-white/60">
                Proceed to referral details workspace
              </p>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="px-6 py-5">
          <p className="text-[12.5px] leading-relaxed text-slate-500">
            You are about to open the referral processing workspace. Verify the
            patient details below before proceeding.
          </p>

          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B2E59] text-[10px] font-extrabold text-white">
                {getInitials(
                  action.referral.patient || action.referral.patientName,
                )}
              </div>
              <div>
                <p className="text-[13px] font-bold text-slate-800">
                  {action.referral.patientName || action.referral.patient}
                </p>
                <p className="mt-0.5 font-mono text-[11px] font-semibold text-[#0B2E59]/60">
                  {action.referral.trackingId}
                </p>
              </div>
            </div>

            {action.referral.ageSex && (
              <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  {action.referral.ageSex}
                </span>
                <StatusBadge status={action.referral.status} />
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex gap-2 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[12px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-gradient-to-r from-[#0B2E59] to-[#103d6b] px-4 py-2.5 text-[12px] font-bold text-white shadow-md shadow-[#0B2E59]/20 transition-all duration-200 hover:shadow-lg hover:shadow-[#0B2E59]/30"
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
   SMALL COMPONENTS
───────────────────────────────────────────── */
function ResultRow({ label, value }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-100 bg-white px-3.5 py-2.5">
      <p className="w-28 flex-shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="flex-1 text-[12px] font-semibold text-slate-700">{value}</p>
    </div>
  );
}

function TipItem({ text }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-blue-300" />
      <p className="text-[11px] leading-relaxed text-blue-800/60">{text}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    Pending: {
      bg: "#F8FAFC",
      text: "#475569",
      dot: "#94A3B8",
      border: "#E2E8F0",
    },
    Received: {
      bg: "#EFF6FF",
      text: "#1D4ED8",
      dot: "#3B82F6",
      border: "#BFDBFE",
    },
    "For Monitoring": {
      bg: "#FFFBEB",
      text: "#B45309",
      dot: "#F59E0B",
      border: "#FDE68A",
    },
    Completed: {
      bg: "#ECFDF5",
      text: "#047857",
      dot: "#10B981",
      border: "#A7F3D0",
    },
    "No-Show": {
      bg: "#FEF2F2",
      text: "#B91C1C",
      dot: "#EF4444",
      border: "#FECACA",
    },
  };

  const s = map[status] || map.Pending;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-bold"
      style={{
        backgroundColor: s.bg,
        color: s.text,
        borderColor: s.border,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: s.dot }}
      />
      {status}
    </span>
  );
}

function getInitials(name) {
  return (name || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}
