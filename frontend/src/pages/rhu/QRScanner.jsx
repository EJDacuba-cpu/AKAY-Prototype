import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Html5Qrcode } from "html5-qrcode";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
  QrCode,
  RefreshCcw,
  Search,
  ShieldCheck,
  UserCheck,
  X,
} from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  getIncomingReferrals,
  getReferralById,
  resolveReferralQrToken,
  resolveReferralTrackingId,
  refreshReferralWorkflowData,
  updateReferralByTrackingId,
} from "../../services/referrals";
import {
  formatDisplayValue,
  formatFacilityName,
  formatPatientName,
  formatReferralStatus,
} from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";
import { getReferralAttention } from "../../utils/referralAttention";

const keyframes = `
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
const CHECKED_IN_STATUSES = ["Received", "Completed"];
const QR_READER_ELEMENT_ID = "rhu-qr-reader";

export default function QRScanner() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
      const updated = await updateReferralByTrackingId(selectedReferral.trackingId, {
        status: "Received",
        remarks: "Patient checked in at RHU via QR scanner.",
      });

      setSelectedReferral(updated);
      setResult({
        type: "success",
        message: "Patient checked in successfully.",
      });

      await refreshReferralWorkflowData(queryClient, selectedReferral.trackingId);
    } catch (error) {
      if (error.status === 409 && selectedReferral.id) {
        const latest = await getReferralById(selectedReferral.id).catch(() => null);
        if (latest) setSelectedReferral(latest);
      }
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

      <div className="mx-auto max-w-[1440px] space-y-4">
        <div
          role="tablist"
          aria-label="Verification method"
          className="inline-flex max-w-full items-center gap-1 rounded-full bg-neutral-100 p-1"
        >
          {SCANNER_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setActiveTab(tab.key);
                  if (tab.key !== "camera") stopCamera();
                }}
                className={`inline-flex h-8 items-center justify-center gap-2 rounded-full px-4 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink-400/50 ${
                  isActive
                    ? "bg-white text-ink-800 shadow-xs"
                    : "text-neutral-600 hover:text-ink-800"
                }`}
              >
                <Icon size={14} aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="overflow-hidden rounded-card border border-neutral-200 bg-white shadow-[var(--shadow-card)] xl:grid xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
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
            hasResult={Boolean(selectedReferral)}
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
      </div>
    </DashboardLayout>
  );
}

// One red action per screen: the main button is red until a referral is on screen,
// then the result's Check-in takes over and the scan controls step back.
const PILL =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink-400/50 disabled:cursor-not-allowed";
const PILL_PRIMARY = `${PILL} bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60`;
const PILL_SECONDARY = `${PILL} border border-neutral-200 bg-white text-ink-800 hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-60`;
const PILL_GHOST = `${PILL} text-neutral-600 hover:bg-neutral-100 hover:text-ink-800`;

const SCAN_CORNERS = [
  "left-5 top-5 rounded-tl-md border-l-[3px] border-t-[3px]",
  "right-5 top-5 rounded-tr-md border-r-[3px] border-t-[3px]",
  "bottom-5 left-5 rounded-bl-md border-b-[3px] border-l-[3px]",
  "bottom-5 right-5 rounded-br-md border-b-[3px] border-r-[3px]",
];

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
  hasResult,
  onStartCamera,
  onStopCamera,
  onRetryScan,
  onManualVerify,
}) {
  const isCamera = activeTab === "camera";

  return (
    <section aria-labelledby="scanner-heading" className="min-w-0 p-5">
      <div className="mb-4 flex min-h-8 items-center gap-3">
        <h2 id="scanner-heading" className="text-sm font-bold text-ink-800">
          {isCamera ? "Scan referral QR" : "Enter tracking ID"}
        </h2>
        {cameraOpen && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-2.5 py-1 text-[11px] font-semibold text-ink-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
            Scanning
          </span>
        )}
      </div>

      {isCamera ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <select
                value={selectedDeviceId}
                aria-label="Camera"
                onChange={(event) => setSelectedDeviceId(event.target.value)}
                className="h-10 w-full appearance-none rounded-full border border-neutral-200 bg-white pl-4 pr-10 text-[13px] text-ink-800 outline-none transition-colors hover:border-neutral-300 focus-visible:ring-2 focus-visible:ring-ink-400/50"
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
                aria-hidden="true"
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500"
              />
            </div>

            <button
              type="button"
              onClick={cameraOpen ? onStopCamera : onStartCamera}
              className={!cameraOpen && !hasResult ? PILL_PRIMARY : PILL_SECONDARY}
            >
              {cameraOpen ? (
                <>
                  <X size={14} aria-hidden="true" /> Close Camera
                </>
              ) : (
                <>
                  <Camera size={14} aria-hidden="true" /> Start Camera
                </>
              )}
            </button>
          </div>

          {cameraMessage && (
            <Notice tone="error" icon={<AlertCircle size={14} />}>
              {cameraMessage}
            </Notice>
          )}

          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-ink-900">
            <div
              id={QR_READER_ELEMENT_ID}
              className={`absolute inset-0 h-full w-full overflow-hidden [&_video]:h-full [&_video]:w-full [&_video]:object-cover ${
                cameraOpen ? "opacity-100" : "opacity-0"
              }`}
            />

            <div className="pointer-events-none absolute inset-0">
              {SCAN_CORNERS.map((corner) => (
                <div
                  key={corner}
                  className={`absolute h-7 w-7 transition-colors ${corner} ${
                    cameraOpen ? "border-white/90" : "border-white/25"
                  }`}
                />
              ))}
              {cameraOpen && (
                <div className="scan-beam absolute left-6 right-6 h-0.5 rounded-full bg-gradient-to-r from-transparent via-white to-transparent motion-reduce:hidden" />
              )}
            </div>

            {!cameraOpen && (
              <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                <Camera size={26} aria-hidden="true" className="mb-3 text-white/70" />
                <p className="text-[13px] font-semibold text-white">Camera is off</p>
                <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-neutral-300">
                  Start the camera and point it at the QR code on an AKAY referral slip.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-neutral-600">Hold the code steady inside the frame.</p>
            <button type="button" onClick={onRetryScan} className={`${PILL_GHOST} h-9 px-4`}>
              <RefreshCcw size={14} aria-hidden="true" />
              Retry Scan
            </button>
          </div>
        </div>
      ) : (
        <ManualVerification
          trackingInput={trackingInput}
          setTrackingInput={setTrackingInput}
          pendingReferrals={pendingReferrals}
          verifying={verifying}
          hasResult={hasResult}
          onManualVerify={onManualVerify}
        />
      )}
    </section>
  );
}

function ManualVerification({
  trackingInput,
  setTrackingInput,
  pendingReferrals,
  verifying,
  hasResult,
  onManualVerify,
}) {
  return (
    <div className="space-y-4">
      <div className="flex h-11 items-center rounded-full border border-neutral-200 bg-white pl-4 pr-2 transition-colors focus-within:border-ink-400 focus-within:ring-2 focus-within:ring-ink-400/30">
        <Search size={15} aria-hidden="true" className="shrink-0 text-neutral-500" />
        <input
          value={trackingInput}
          aria-label="Tracking ID"
          onChange={(event) => setTrackingInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onManualVerify();
          }}
          placeholder="Enter Tracking ID, referral URL, or AKAY QR value"
          className="h-full min-w-0 flex-1 border-0 bg-transparent px-3 text-sm font-medium text-ink-800 outline-none placeholder:font-normal placeholder:text-neutral-500"
        />
        {trackingInput && (
          <button
            type="button"
            aria-label="Clear tracking ID"
            onClick={() => setTrackingInput("")}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-500 outline-none transition-colors hover:bg-neutral-100 hover:text-ink-800 focus-visible:ring-2 focus-visible:ring-ink-400/50"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onManualVerify}
        disabled={verifying}
        className={`${hasResult ? PILL_SECONDARY : PILL_PRIMARY} w-full`}
      >
        {verifying ? (
          <Loader2 size={14} aria-hidden="true" className="animate-spin" />
        ) : (
          <Search size={14} aria-hidden="true" />
        )}
        Verify Tracking ID
      </button>

      <div className="pt-1">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-600">
          Pending incoming referrals
        </p>
        <div className="space-y-2">
          {pendingReferrals.map((referral) => (
            <button
              key={referral.trackingId || referral.id}
              type="button"
              onClick={() => setTrackingInput(referral.trackingId)}
              className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-left outline-none transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-ink-400/50"
            >
              <QrCode size={14} aria-hidden="true" className="shrink-0 text-neutral-500" />
              <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-ink-800">
                {referral.trackingId}
              </span>
              <span className="truncate text-xs text-neutral-600">
                {getReferralPatientName(referral)}
              </span>
            </button>
          ))}
          {pendingReferrals.length === 0 && (
            <p className="rounded-xl border border-dashed border-neutral-200 py-4 text-center text-xs text-neutral-600">
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
    <section
      aria-labelledby="result-heading"
      aria-live="polite"
      className="min-w-0 border-t border-neutral-200 p-5 xl:border-l xl:border-t-0"
    >
      <div className="mb-4 flex min-h-8 items-center gap-3">
        <h2 id="result-heading" className="text-sm font-bold text-ink-800">
          Result
        </h2>
        {referral && (
          <button type="button" onClick={onClear} className={`${PILL_GHOST} ml-auto h-8 px-3`}>
            <X size={13} aria-hidden="true" />
            Clear
          </button>
        )}
      </div>

      {!referral ? (
        <EmptyResults result={result} verifying={verifying} />
      ) : (
        <div className="space-y-4">
          <ResultNotice result={result} />

          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="break-words text-lg font-bold leading-tight text-ink-800">
                {getReferralPatientName(referral)}
              </p>
              <p className="mt-1 text-[13px] text-neutral-600">
                {formatDisplayValue(referral.ageSex, "Age / Sex not recorded")}
              </p>
            </div>
            <StatusBadge status={status} />
          </div>

          <dl className="divide-y divide-neutral-100 border-y border-neutral-100">
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
          </dl>

          <div className="space-y-2">
            <button
              type="button"
              onClick={onCheckIn}
              disabled={checkInBusy || alreadyCheckedIn}
              className={`${PILL_PRIMARY} w-full disabled:bg-neutral-200 disabled:text-neutral-600 disabled:opacity-100`}
            >
              {checkInBusy ? (
                <Loader2 size={14} aria-hidden="true" className="animate-spin" />
              ) : (
                <UserCheck size={14} aria-hidden="true" />
              )}
              {alreadyCheckedIn ? "Already Checked In" : "Check-in Patient"}
            </button>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" onClick={onOpenDetails} className={PILL_SECONDARY}>
                <ExternalLink size={14} aria-hidden="true" />
                View Referral Details
              </button>
              <button type="button" onClick={onScanAgain} className={PILL_SECONDARY}>
                <RefreshCcw size={14} aria-hidden="true" />
                Scan Again
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function EmptyResults({ result, verifying }) {
  if (result.type === "error") {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-red-700">
          <AlertCircle size={26} aria-hidden="true" />
        </div>
        <h3 className="text-sm font-semibold text-ink-800">Unable to open referral</h3>
        <p className="mt-1.5 max-w-[300px] text-[13px] leading-relaxed text-neutral-600">
          {result.message}
        </p>
      </div>
    );
  }

  const loading = verifying || result.type === "loading";

  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-ink-500">
        {loading ? (
          <Loader2 size={26} aria-hidden="true" className="animate-spin" />
        ) : (
          <QrCode size={26} aria-hidden="true" />
        )}
      </div>

      <h3 className="text-sm font-semibold text-ink-800">
        {loading ? "Verifying referral..." : "Scan a QR code to view the referral"}
      </h3>

      <p className="mt-1.5 max-w-[280px] text-[13px] leading-relaxed text-neutral-600">
        Use the camera or enter a tracking ID. The referral appears here for you to check in.
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
    success: "border-emerald-100 bg-emerald-50/80 text-emerald-800",
    warning: "border-amber-100 bg-amber-50/80 text-amber-800",
    error: "border-red-100 bg-red-50/80 text-red-800",
  };

  return (
    <div
      className={`anim-fade-in flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs font-medium ${styles[tone]}`}
    >
      <span aria-hidden="true" className="shrink-0">{icon}</span>
      <p>{children}</p>
    </div>
  );
}

function ResultRow({ label, value, mono = false }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-3 py-2.5">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className={`break-words text-[13px] font-medium text-ink-800 ${mono ? "font-mono" : ""}`}>
        {formatDisplayValue(value, "Not recorded")}
      </dd>
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
    Completed: {
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
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
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
    // QRS-10 FINAL - QR validity is enforced by REVOCATION only. No expiry or
    // TTL exists, and none is keyed to the referral date, No-Show status, or a
    // reschedule. Claiming "expired" described a control the system does not
    // have and never will.
    return "This QR code is invalid, revoked, or not assigned to your facility.";
  }
  if (error?.payload?.code === "TRACKING_LOOKUP_FAILED") {
    return "This tracking ID is invalid, unavailable, or not assigned to your facility.";
  }
  if (error.status === 403 || error.status === 404) {
    return "This referral is unavailable or not assigned to your facility.";
  }
  if (error.status === 409) {
    return "Referral Status Changed. This referral was updated by another user; the latest status will now be loaded.";
  }
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
  if (raw.includes("monitor")) return "Received";
  if (raw.includes("complete")) return "Completed";
  if (raw.includes("show")) return "No-Show";
  return String(status || "Pending").trim();
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
  return getReferralAttention(referral);
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
