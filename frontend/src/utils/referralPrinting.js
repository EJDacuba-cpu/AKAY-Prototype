import QRCode from "qrcode";
import { getReferralQrPayload, resolveReferralTrackingId } from "../services/referrals";

// Reuse the authorized, read-only QR endpoint. Printing never regenerates a
// token or invalidates a previously issued referral slip.
export async function prepareReferralPrint(clone) {
  const referralId = clone.dataset.referralId || (clone.dataset.trackingId
    ? (await resolveReferralTrackingId(clone.dataset.trackingId)).referralId : "");
  if (!referralId) throw new Error("The saved referral is unavailable. Reload the referral and retry printing.");
  const payload = await getReferralQrPayload(referralId);
  if (!payload) throw new Error("The secure referral QR code is unavailable. Retry printing.");
  const src = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M", margin: 1, width: 312,
    color: { dark: "#0F172A", light: "#FFFFFF" },
  });
  const image = clone.ownerDocument.createElement("img");
  image.src = src;
  image.alt = "Referral verification QR code";
  image.width = 156;
  image.height = 156;
  image.style.cssText = "width:39mm;height:39mm;margin:0 auto";
  const slot = clone.querySelector("[data-print-qr]");
  if (!slot) throw new Error("The referral print template is unavailable. Reload and retry printing.");
  slot.replaceChildren(image);
}
