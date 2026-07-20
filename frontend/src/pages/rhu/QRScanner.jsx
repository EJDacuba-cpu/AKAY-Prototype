import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Html5Qrcode } from "html5-qrcode";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  Loader2,
  MonitorPlay,
  QrCode,
  RefreshCcw,
  ScanLine,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  getIncomingReferrals,
  getReferralById,
  resolveReferralQrToken,
  resolveReferralTrackingId,
  updateReferralByTrackingId,
} from "../../services/referrals";
import { linkReferralPatientToRhu } from "../../services/patientService";
import { createFacilityNotification } from "../../services/notificationService";
import {
  formatDisplayValue,
  formatFacilityName,
  formatPatientName,
  formatReferralStatus,
} from "../../utils/formatters";
import { getCurrentUser } from "../../utils/auth";
import { queryKeys } from "../../utils/queryKeys";

const keyframes = `
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scanBeam {
  0% { top: 9%; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { top: 88%; opacity: 0; }
}

.anim-fade-up {
  opacity: 0;
  animation: fadeUp .55s cubic-bezier(.22,1,.36,1) both;
}

.anim-fade-in {
  animation: fadeIn .22s ease both;
}

.scan-beam {
  animation: scanBeam 2.2s cubic-bezier(.4,0,.2,1) infinite;
}
`;

const SCANNER_TABS = [
  { key: "camera", label: "Scan with Camera", icon: Camera },
  { key: "manual", label: "Manual Verification", icon: Search },
];

const SCAN_COOLDOWN_MS = 3500;
const CHECKED_IN_STATUSES = ["Received", "For Monitoring", "Completed"];
const QR_READER_ELEMENT_ID = "rhu-qr-reader";

const stagger = (index) => ({ animationDelay: `${index * 80}ms` });

export default function QRScanner() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = getCurrentUser();

  const scannerRef = useRef(null);
  const scanLockedRef = useRef(false);
  const lastScanRef = useRef({ token: "", at: 0 });

  const [trackingInput, setTrackingInput] = useState("");
  const [selectedReferral, setSelectedReferral] = useState(null);
  const [activeTab, setActiveTab] = useState("camera");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [cameraMessage, setCameraMessage] = useState("");
  const [result, setResult] = useState({
    type: "idle",
    message: "",
  });
  const [verifying, setVerifying] = useState(false);
  const [checkInBusy, setCheckInBusy] = useState(false);

  const { data: incomingReferrals = [] } = useQuery({
    queryKey: queryKeys.incomingReferrals("rhu"),
    queryFn: () => getIncomingReferrals(),
    staleTime: 30_000,
  });

  const pendingReferrals = useMemo(
    () =>
      (Array.isArray(incomingReferrals) ? incomingReferrals : [])
        .filter((referral) => referral.status === "Pending")
        .slice(0, 3),
    [incomingReferrals],
  );

  const selectedStatus = getOfficialStatus(selectedReferral?.status);
  const alreadyCheckedIn = isCheckedIn(selectedReferral);

  const stopCamera = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;

    if (scanner) {
      try {
        await scanner.stop();
      } catch {
        // Scanner may already be stopped; cleanup should stay quiet.
      }

      try {
        await scanner.clear();
      } catch {
        // Some browsers clear the element during stop().
      }
    }

    scanLockedRef.current = false;
    setCameraOpen(false);
  }, []);

  const refreshCameraList = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameras([]);
      return [];
    }

    try {
      const devices = await Html5Qrcode.getCameras();
      setCameras(devices);

      if (!selectedDeviceId && devices[0]?.id) {
        setSelectedDeviceId(devices[0].id);
      }

      return devices;
    } catch {
      setCameras([]);
      return [];
    }
  }, [selectedDeviceId]);

  const verifyReferral = useCallback(
    async (value, source = "manual") => {
      const lookupValue =
        source === "camera"
          ? extractSecureQrToken(value)
          : String(value || "").trim();

      if (!lookupValue) {
        setSelectedReferral(null);
        setResult({
          type: "error",
          message:
            source === "camera"
              ? "The scanned code is not a valid AKAY referral QR code."
              : "Please enter a valid AKAY referral Tracking ID.",
        });
        return null;
      }

      setVerifying(true);
      setResult({ type: "loading", message: "Securely verifying referral..." });

      try {
        const resolution =
          source === "camera"
            ? await resolveReferralQrToken(lookupValue)
            : await resolveReferralTrackingId(lookupValue);
        const referral = await getReferralById(resolution.referralId);
        setSelectedReferral(referral);
        setResult({
          type: isCheckedIn(referral) ? "warning" : "success",
          message: isCheckedIn(referral)
            ? "This referral has already been checked in."
            : "Referral found.",
        });
        return referral;
      } catch (error) {
        setSelectedReferral(null);
        setResult({
          type: "error",
          message: getVerificationErrorMessage(error, source),
        });
        return null;
      } finally {
        if (source === "camera") {
          lastScanRef.current = { token: "", at: 0 };
        }
        setVerifying(false);
      }
    },
    [],
  );

  const handleDetectedQr = useCallback(
    async (rawValue) => {
      const token = extractSecureQrToken(rawValue);

      if (!token) {
        stopCamera();
        setSelectedReferral(null);
        setResult({
          type: "error",
          message: "The scanned code is not a valid AKAY referral QR code.",
        });
        return;
      }

      const now = Date.now();
      const isDuplicate =
        lastScanRef.current.token === token &&
        now - lastScanRef.current.at < SCAN_COOLDOWN_MS;

      if (scanLockedRef.current || isDuplicate) return;

      scanLockedRef.current = true;
      lastScanRef.current = { token, at: now };
      await stopCamera();
      await verifyReferral(rawValue, "camera");
    },
    [stopCamera, verifyReferral],
  );

  async function startCamera() {
    setResult({ type: "idle", message: "" });
    setCameraMessage("");
    setSelectedReferral(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraMessage("No camera device found. Please use Manual Verification.");
      return;
    }

    try {
      await stopCamera();
      const devices = await Html5Qrcode.getCameras();

      if (devices.length === 0) {
        setCameraMessage("No camera device found. Please use Manual Verification.");
        return;
      }

      setCameras(devices);
      const cameraId = selectedDeviceId || devices[0]?.id;
      if (!selectedDeviceId && cameraId) setSelectedDeviceId(cameraId);

      const scanner = new Html5Qrcode(QR_READER_ELEMENT_ID, {
        verbose: false,
      });
      scannerRef.current = scanner;
      scanLockedRef.current = false;

      await scanner.start(
        cameraId,
        {
          fps: 10,
          qrbox: { width: 240, height: 240 },
          aspectRatio: 1.7777778,
        },
        (decodedText) => {
          void handleDetectedQr(decodedText);
        },
        () => {},
      );

      setCameraOpen(true);
    } catch (error) {
      await stopCamera();
      setCameraMessage(getCameraErrorMessage(error));
    }
  }

  async function handleCheckIn() {
    if (!selectedReferral || checkInBusy) return;

    if (alreadyCheckedIn) {
      setResult({
        type: "warning",
        message: "This referral has already been checked in.",
      });
      return;
    }

    setCheckInBusy(true);
    setResult({ type: "loading", message: "Checking in patient..." });

    try {
      const linkedPatient = await linkReferralPatientToRhu(selectedReferral);
      const patientId =
        linkedPatient?.id ||
        linkedPatient?.patientId ||
        selectedReferral.patientId ||
        selectedReferral.patient_id;
      const updated = await updateReferralByTrackingId(selectedReferral.trackingId, {
        status: "Received",
        patientId,
        remarks: "Patient checked in at RHU via QR scanner.",
      });

      setSelectedReferral(updated);
      setResult({
        type: "success",
        message: "Patient checked in successfully.",
      });

      queryClient.invalidateQueries({
        queryKey: queryKeys.incomingReferrals("rhu"),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.referralDetails("rhu", selectedReferral.trackingId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.patients("rhu"),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboardSummary("rhu"),
      });

      createFacilityNotification("rhu", currentUser?.ruralHealthUnitId, {
        title: "Patient checked in",
        message: `${getReferralPatientName(updated)} is ready for referral processing.`,
        type: "referral",
        referenceId: `${updated.trackingId}-rhu-check-in`,
        link: `/rhu/referrals/${updated.trackingId}`,
        sender: "RHU QR Scanner",
      });
    } catch (error) {
      setResult({
        type: "error",
        message: getVerificationErrorMessage(error),
      });
    } finally {
      setCheckInBusy(false);
    }
  }

  function scanAgain() {
    setSelectedReferral(null);
    setTrackingInput("");
    setResult({ type: "idle", message: "" });
    setCameraMessage("");
    scanLockedRef.current = false;
    lastScanRef.current = { token: "", at: 0 };
    if (activeTab === "camera") startCamera();
  }

  function clearResults() {
    stopCamera();
    setSelectedReferral(null);
    setTrackingInput("");
    setResult({ type: "idle", message: "" });
    setCameraMessage("");
  }

  useEffect(() => {
    refreshCameraList().catch(() => setCameras([]));
  }, [refreshCameraList]);

  useEffect(
    () => () => {
      void stopCamera();
    },
    [stopCamera],
  );

  return (
    <DashboardLayout role="rhu" title="QR Scanner">
      <style>{keyframes}</style>

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
              onClick={() => {
                setActiveTab(tab.key);
                if (tab.key !== "camera") stopCamera();
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[12px] font-semibold transition-all duration-200 ${
                isActive
                  ? "bg-white text-[#0F172A] shadow-sm"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        className="anim-fade-up grid gap-5 xl:grid-cols-2"
        style={stagger(2)}
      >
        <ScannerPanel
          activeTab={activeTab}
          cameras={cameras}
          selectedDeviceId={selectedDeviceId}
          setSelectedDeviceId={setSelectedDeviceId}
          cameraOpen={cameraOpen}
          cameraMessage={cameraMessage}
          trackingInput={trackingInput}
          setTrackingInput={setTrackingInput}
          pendingReferrals={pendingReferrals}
          verifying={verifying}
          onStartCamera={startCamera}
          onStopCamera={stopCamera}
          onRetryScan={scanAgain}
          onManualVerify={() => verifyReferral(trackingInput, "manual")}
        />

        <ResultsPanel
          referral={selectedReferral}
          result={result}
          status={selectedStatus}
          verifying={verifying}
          checkInBusy={checkInBusy}
          alreadyCheckedIn={alreadyCheckedIn}
          onCheckIn={handleCheckIn}
          onScanAgain={scanAgain}
          onClear={clearResults}
          onOpenDetails={() =>
            selectedReferral?.trackingId &&
            navigate(`/rhu/referrals/${selectedReferral.trackingId}`)
          }
        />
      </div>
    </DashboardLayout>
  );
}

function ScannerPanel({
  activeTab,
  cameras,
  selectedDeviceId,
  setSelectedDeviceId,
  cameraOpen,
  cameraMessage,
  trackingInput,
  setTrackingInput,
  pendingReferrals,
  verifying,
  onStartCamera,
  onStopCamera,
  onRetryScan,
  onManualVerify,
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-3.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FEF2F2] text-[#B91C1C]">
          {activeTab === "camera" ? <MonitorPlay size={15} /> : <Search size={15} />}
        </div>
        <h2 className="text-[13px] font-bold text-slate-800">
          {activeTab === "camera" ? "Webcam Scanner" : "Manual Input"}
        </h2>
        {cameraOpen && (
          <span className="ml-auto rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#B91C1C]">
            Scanning
          </span>
        )}
      </div>

      <div className="p-5">
        {activeTab === "camera" ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <select
                  value={selectedDeviceId}
                  onChange={(event) => setSelectedDeviceId(event.target.value)}
                  className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 px-3 pr-8 text-[12px] text-slate-600 outline-none transition-colors focus:border-[#B91C1C]/40 focus:bg-white"
                >
                  {cameras.length === 0 ? (
                    <option value="">Camera list (permission needed)</option>
                  ) : (
                    cameras.map((camera, index) => (
                      <option key={camera.id || index} value={camera.id}>
                        {camera.label || `Camera ${index + 1}`}
                      </option>
                    ))
                  )}
                </select>
                <ChevronDown
                  size={14}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
              </div>

              <button
                type="button"
                onClick={cameraOpen ? onStopCamera : onStartCamera}
                className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[12px] font-semibold transition-all duration-200 ${
                  cameraOpen
                    ? "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                    : "bg-[#B91C1C] text-white hover:bg-[#991B1B]"
                }`}
              >
                {cameraOpen ? (
                  <>
                    <X size={14} /> Close Camera
                  </>
                ) : (
                  <>
                    <Camera size={14} /> Start Camera
                  </>
                )}
              </button>
            </div>

            {cameraMessage && (
              <Notice tone="error" icon={<AlertCircle size={14} />}>
                {cameraMessage}
              </Notice>
            )}

            <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-slate-200 bg-slate-950">
              <div className="relative h-[320px] w-full">
                <div
                  id={QR_READER_ELEMENT_ID}
                  className={`h-full w-full overflow-hidden bg-slate-950 [&_video]:h-full [&_video]:w-full [&_video]:object-cover ${
                    cameraOpen ? "opacity-100" : "opacity-0"
                  }`}
                />

                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute left-5 top-5 h-7 w-7 rounded-tl-md border-l-[3px] border-t-[3px] border-[#B91C1C]" />
                  <div className="absolute right-5 top-5 h-7 w-7 rounded-tr-md border-r-[3px] border-t-[3px] border-[#B91C1C]" />
                  <div className="absolute bottom-5 left-5 h-7 w-7 rounded-bl-md border-b-[3px] border-l-[3px] border-[#B91C1C]" />
                  <div className="absolute bottom-5 right-5 h-7 w-7 rounded-br-md border-b-[3px] border-r-[3px] border-[#B91C1C]" />
                  {cameraOpen && (
                    <div className="scan-beam absolute left-6 right-6 h-0.5 rounded-full bg-gradient-to-r from-transparent via-[#B91C1C] to-transparent shadow-lg shadow-[#B91C1C]/40" />
                  )}
                </div>

                {!cameraOpen && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-slate-200 shadow-sm">
                      <Camera size={28} />
                    </div>
                    <p className="text-[12px] font-semibold text-slate-500">
                      Camera not active
                    </p>
                    <p className="mt-1 max-w-[240px] text-[11px] leading-relaxed text-slate-400">
                      Start the camera and point it at an AKAY referral slip QR code.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onRetryScan}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[12px] font-semibold text-slate-600 transition-all duration-200 hover:bg-slate-50"
            >
              <RefreshCcw size={14} />
              Retry Scan
            </button>
          </div>
        ) : (
          <ManualVerification
            trackingInput={trackingInput}
            setTrackingInput={setTrackingInput}
            pendingReferrals={pendingReferrals}
            verifying={verifying}
            onManualVerify={onManualVerify}
          />
        )}
      </div>
    </div>
  );
}

function ManualVerification({
  trackingInput,
  setTrackingInput,
  pendingReferrals,
  verifying,
  onManualVerify,
}) {
  return (
    <div className="space-y-4">
      <div className="relative flex items-center rounded-lg border border-slate-200 bg-slate-50/50 px-3 transition-all duration-200 focus-within:border-[#B91C1C]/40 focus-within:bg-white">
        <Search size={15} className="text-slate-300" />
        <input
          value={trackingInput}
          onChange={(event) => setTrackingInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onManualVerify();
          }}
          placeholder="Enter Tracking ID, referral URL, or AKAY QR value"
          className="h-12 flex-1 border-0 bg-transparent px-3 text-[13px] font-medium text-slate-700 outline-none placeholder:text-slate-300 placeholder:font-normal"
        />
        {trackingInput && (
          <button
            type="button"
            onClick={() => setTrackingInput("")}
            className="rounded-md p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onManualVerify}
        disabled={verifying}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2.5 text-[12px] font-semibold text-white transition-all duration-200 hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {verifying ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        Verify Tracking ID
      </button>

      <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
        <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Pending incoming referrals
        </p>
        <div className="space-y-1.5">
          {pendingReferrals.map((referral) => (
            <button
              key={referral.trackingId || referral.id}
              type="button"
              onClick={() => setTrackingInput(referral.trackingId)}
              className="flex w-full items-center gap-2.5 rounded-md border border-slate-100 bg-white px-3 py-2 text-left transition-colors hover:border-[#B91C1C]/20 hover:bg-[#B91C1C]/[0.02]"
            >
              <QrCode size={12} className="shrink-0 text-slate-300" />
              <span className="flex-1 truncate font-mono text-[11px] font-semibold text-slate-600">
                {referral.trackingId}
              </span>
              <span className="truncate text-[10px] text-slate-400">
                {getReferralPatientName(referral)}
              </span>
            </button>
          ))}
          {pendingReferrals.length === 0 && (
            <p className="py-2 text-center text-[11px] text-slate-300">
              No pending referrals
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultsPanel({
  referral,
  result,
  status,
  verifying,
  checkInBusy,
  alreadyCheckedIn,
  onCheckIn,
  onScanAgain,
  onClear,
  onOpenDetails,
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-3.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <ClipboardList size={15} />
        </div>
        <h2 className="text-[13px] font-bold text-slate-800">Results</h2>
      </div>

      <div className="p-5">
        {!referral ? (
          <EmptyResults result={result} verifying={verifying} />
        ) : (
          <div className="space-y-4">
            <ResultNotice result={result} />

            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-slate-800">
                    {getReferralPatientName(referral)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {formatDisplayValue(referral.ageSex, "Age / Sex not recorded")}
                  </p>
                </div>
                <StatusBadge status={status} />
              </div>
            </div>

            <div className="space-y-2">
              <ResultRow label="Tracking ID" value={referral.trackingId} mono />
              <ResultRow label="Referring BHC/HCI" value={getReferringHci(referral)} />
              <ResultRow label="Destination RHU" value={getDestinationFacility(referral)} />
              <ResultRow label="Referral Category" value={getReferralCategory(referral)} />
              <ResultRow
                label="Chief Complaint"
                value={referral.chiefComplaint || referral.concern}
              />
              <ResultRow label="Referral Date/Time" value={formatReferralDateTime(referral)} />
              <ResultRow label="Urgency" value={getUrgency(referral)} />
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={onCheckIn}
                disabled={checkInBusy || alreadyCheckedIn}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2.5 text-[12px] font-semibold text-white transition-all duration-200 hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                {checkInBusy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <UserCheck size={14} />
                )}
                {alreadyCheckedIn ? "Already Checked In" : "Check-in Patient"}
              </button>

              <button
                type="button"
                onClick={onOpenDetails}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[12px] font-semibold text-slate-600 transition-all duration-200 hover:bg-slate-50"
              >
                <ExternalLink size={14} />
                View Referral Details
              </button>

              <button
                type="button"
                onClick={onScanAgain}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[12px] font-semibold text-slate-500 transition-all duration-200 hover:bg-slate-50"
              >
                <RefreshCcw size={14} />
                Scan Again
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3">
        <button
          type="button"
          onClick={onOpenDetails}
          disabled={!referral}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ExternalLink size={12} />
          Open Details
        </button>

        <button
          type="button"
          onClick={onClear}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 size={12} />
          Clear
        </button>
      </div>
    </div>
  );
}

function EmptyResults({ result, verifying }) {
  if (result.type === "error") {
    return (
      <div className="flex min-h-[340px] flex-col items-center justify-center text-center">
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-red-50 text-red-400">
          <AlertCircle size={34} />
        </div>
        <h3 className="text-[14px] font-bold text-slate-700">
          Unable to Open Referral
        </h3>
        <p className="mt-2 max-w-[280px] text-[12px] leading-relaxed text-slate-400">
          {result.message}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[340px] flex-col items-center justify-center text-center">
      <div className="relative mb-5">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-50 text-slate-200">
          {verifying || result.type === "loading" ? (
            <Loader2 size={34} className="animate-spin" />
          ) : (
            <QrCode size={34} />
          )}
        </div>
        <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-lg border-2 border-white bg-slate-100 text-slate-400 shadow-sm">
          <ScanLine size={12} />
        </div>
      </div>

      <h3 className="text-[14px] font-bold text-slate-600">
        {result.type === "loading" ? "Verifying referral..." : "Scan a QR code to view results."}
      </h3>

      <p className="mt-2 max-w-[260px] text-[11.5px] leading-relaxed text-slate-300">
        Use the camera scanner or manually enter a tracking ID to retrieve
        authorized referral information.
      </p>
    </div>
  );
}

function ResultNotice({ result }) {
  if (!result.message) return null;
  const tone = result.type === "warning" ? "warning" : result.type === "error" ? "error" : "success";
  const icon =
    tone === "success" ? (
      <CheckCircle2 size={14} />
    ) : tone === "warning" ? (
      <ShieldCheck size={14} />
    ) : (
      <AlertCircle size={14} />
    );

  return (
    <Notice tone={tone} icon={icon}>
      {result.message}
    </Notice>
  );
}

function Notice({ tone = "success", icon, children }) {
  const styles = {
    success: "border-emerald-100 bg-emerald-50/80 text-emerald-700",
    warning: "border-amber-100 bg-amber-50/80 text-amber-700",
    error: "border-red-100 bg-red-50/80 text-red-700",
  };

  return (
    <div
      className={`anim-fade-in flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-[11.5px] font-medium ${styles[tone]}`}
    >
      <span className="shrink-0">{icon}</span>
      <p>{children}</p>
    </div>
  );
}

function ResultRow({ label, value, mono = false }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-100 bg-white px-3.5 py-2.5">
      <p className="w-32 shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p
        className={`flex-1 text-[12px] font-semibold text-slate-700 ${
          mono ? "font-mono" : ""
        }`}
      >
        {formatDisplayValue(value, "Not recorded")}
      </p>
    </div>
  );
}

function StatusBadge({ status }) {
  const displayStatus = formatReferralStatus(getOfficialStatus(status));
  const map = {
    Pending: {
      bg: "#F1F5F9",
      text: "#475569",
      dot: "#94A3B8",
      border: "#CBD5E1",
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
    Done: {
      bg: "#ECFDF5",
      text: "#047857",
      dot: "#10B981",
      border: "#A7F3D0",
    },
    "No-Show": {
      bg: "#FFFBEB",
      text: "#B45309",
      dot: "#F59E0B",
      border: "#FDE68A",
    },
  };
  const style = map[displayStatus] || map.Pending;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
      style={{
        backgroundColor: style.bg,
        color: style.text,
        borderColor: style.border,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: style.dot }}
      />
      {displayStatus}
    </span>
  );
}

function extractSecureQrToken(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const match = raw.match(/^AKAY-REFERRAL:v1:([A-Za-z0-9_-]{43})$/);
  return match?.[1] || "";
}

function getVerificationErrorMessage(error = {}, source = "manual") {
  if (error.status === 429) {
    return "Too many lookup attempts. Please wait briefly and try again.";
  }
  if (error?.payload?.code === "INVALID_QR_FORMAT") {
    return "The scanned code is not a valid AKAY referral QR code.";
  }
  if (error?.payload?.code === "QR_LOOKUP_FAILED" || source === "camera") {
    return "This QR code is invalid, expired, revoked, or not assigned to your facility.";
  }
  if (error?.payload?.code === "TRACKING_LOOKUP_FAILED") {
    return "This tracking ID is invalid, unavailable, or not assigned to your facility.";
  }
  if (error.status === 403 || error.status === 404) {
    return "This referral is unavailable or not assigned to your facility.";
  }
  if (error.status === 409) return "This referral has already been checked in.";
  return "Unable to verify referral. Please try again.";
}

function getCameraErrorMessage(error = {}) {
  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    return "Camera permission is required to scan referral QR codes.";
  }
  if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
    return "No camera device found. Please use Manual Verification.";
  }
  return "Unable to start the camera. Please check browser permissions or use Manual Verification.";
}

function isCheckedIn(referral = null) {
  return CHECKED_IN_STATUSES.includes(getOfficialStatus(referral?.status));
}

function getOfficialStatus(status) {
  const raw = String(status || "Pending").trim().toLowerCase();
  if (raw.includes("receive") || raw.includes("checked") || raw.includes("arrived")) {
    return "Received";
  }
  if (raw.includes("monitor")) return "For Monitoring";
  if (raw.includes("complete")) return "Completed";
  if (raw.includes("show")) return "No-Show";
  return "Pending";
}

function getReferralPatientName(referral = {}) {
  return formatPatientName(
    referral.patientName || referral.patient || referral,
    "Patient",
  );
}

function getReferringHci(referral = {}) {
  return formatFacilityName(
    referral.referringHci ||
      referral.referringHealthCenter ||
      referral.referringBHC ||
      referral.bhcName ||
      referral.sourceFacility ||
      referral.referringFacility ||
      referral.bhc ||
      referral.barangayHealthCenter ||
      referral.barangay_health_center,
    "Not recorded",
  );
}

function getDestinationFacility(referral = {}) {
  return formatFacilityName(
    referral.destinationFacility ||
      referral.referredFacility ||
      referral.receivingFacility ||
      referral.ruralHealthUnit ||
      referral.rural_health_unit,
    "Not recorded",
  );
}

function getReferralCategory(referral = {}) {
  return formatDisplayValue(
    referral.referralCategory ||
      referral.category ||
      referral.classification ||
      referral.suggestedSpecialization,
    "Uncategorized",
  );
}

function getUrgency(referral = {}) {
  const urgency =
    referral.urgency ||
    referral.urgencyLevel ||
    referral.priorityLevel ||
    referral.priority;

  if (!urgency) return "Non-Urgent";
  if (String(urgency).toLowerCase().includes("emergency")) return "Emergency";
  if (String(urgency).toLowerCase().includes("urgent")) return "Urgent";
  if (String(urgency).toLowerCase().includes("high")) return "Emergency";
  if (String(urgency).toLowerCase().includes("medium")) return "Urgent";
  return "Non-Urgent";
}

function formatReferralDateTime(referral = {}) {
  const raw =
    referral.referralDateTime ||
    referral.referral_datetime ||
    referral.dateOfReferral ||
    referral.createdAt ||
    referral.created_at;

  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return `${date.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  })} / ${date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}
