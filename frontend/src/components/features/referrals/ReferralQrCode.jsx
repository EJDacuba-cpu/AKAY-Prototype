import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { AlertCircle, LoaderCircle, QrCode } from "lucide-react";
import { getReferralQrPayload } from "../../../services/referrals";

export default function ReferralQrCode({
  value,
  referralId,
  refreshKey = 0,
  size = 160,
  className = "",
  imageClassName = "",
}) {
  const [qrValue, setQrValue] = useState(value || "");
  const [dataUrl, setDataUrl] = useState("");
  const [loadState, setLoadState] = useState(value ? "ready" : "idle");

  useEffect(() => {
    let active = true;

    if (value) {
      setQrValue(value);
      setLoadState("ready");
      return () => {
        active = false;
      };
    }

    if (!referralId) {
      setQrValue("");
      setLoadState("idle");
      return () => {
        active = false;
      };
    }

    setQrValue("");
    setLoadState("loading");
    getReferralQrPayload(referralId)
      .then((payload) => {
        if (active) {
          setQrValue(payload);
          setLoadState(payload ? "ready" : "error");
        }
      })
      .catch(() => {
        if (active) {
          setQrValue("");
          setLoadState("error");
        }
      });

    return () => {
      active = false;
    };
  }, [value, referralId, refreshKey]);

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
      } catch {
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
      aria-label={
        qrValue
          ? "Referral verification QR code"
          : loadState === "loading"
            ? "Loading secure referral QR code"
            : "QR code unavailable"
      }
      title={qrValue ? "Secure referral QR code" : "QR code unavailable"}
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
          {loadState === "loading" ? (
            <LoaderCircle
              size={Math.max(24, Math.round(size * 0.24))}
              className="animate-spin"
            />
          ) : loadState === "error" ? (
            <AlertCircle size={Math.max(24, Math.round(size * 0.24))} />
          ) : (
            <QrCode size={Math.max(28, Math.round(size * 0.32))} />
          )}
        </div>
      )}
    </div>
  );
}
