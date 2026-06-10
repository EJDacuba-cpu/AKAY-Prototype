import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode } from "lucide-react";

export function buildReferralVerificationUrl(trackingId) {
  const encodedTrackingId = encodeURIComponent(String(trackingId || "").trim());
  const path = encodedTrackingId ? `/referrals/verify/${encodedTrackingId}` : "";

  if (!path) return "";
  if (typeof window === "undefined" || !window.location?.origin) return path;

  return `${window.location.origin}${path}`;
}

export function getReferralQrValue(referral = {}) {
  return buildReferralVerificationUrl(
    referral.trackingId || referral.tracking_id || referral.id,
  );
}

export default function ReferralQrCode({
  value,
  trackingId,
  size = 160,
  className = "",
  imageClassName = "",
}) {
  const qrValue = value || buildReferralVerificationUrl(trackingId);
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    let active = true;

    async function renderQr() {
      if (!qrValue) {
        setDataUrl("");
        return;
      }

      try {
        const nextDataUrl = await QRCode.toDataURL(qrValue, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: size,
          color: {
            dark: "#0F172A",
            light: "#FFFFFF",
          },
        });

        if (active) setDataUrl(nextDataUrl);
      } catch (error) {
        console.error("Failed to render referral QR code:", error);
        if (active) setDataUrl("");
      }
    }

    renderQr();

    return () => {
      active = false;
    };
  }, [qrValue, size]);

  return (
    <div
      className={`flex items-center justify-center bg-white ${className}`}
      aria-label={qrValue ? "Referral verification QR code" : "QR code unavailable"}
      title={qrValue || "QR code unavailable"}
    >
      {dataUrl ? (
        <img
          src={dataUrl}
          width={size}
          height={size}
          alt="Referral verification QR code"
          className={imageClassName}
        />
      ) : (
        <div
          className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-300"
          style={{ width: size, height: size }}
        >
          <QrCode size={Math.max(28, Math.round(size * 0.32))} />
        </div>
      )}
    </div>
  );
}
