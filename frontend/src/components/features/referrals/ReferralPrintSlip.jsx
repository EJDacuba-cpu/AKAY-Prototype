import ReferralQrCode, { getReferralQrValue } from "./ReferralQrCode";

export function buildReferralSlipData(referral = {}, patient = null) {
  const referralDate = getReferralDate(referral);

  return {
    trackingId: referral.trackingId || referral.tracking_id || "",
    patientName:
      referral.patientName ||
      patient?.fullName ||
      patient?.name ||
      referral.patient?.full_name ||
      referral.patient?.name ||
      [patient?.firstName, patient?.middleName, patient?.lastName]
        .filter(Boolean)
        .join(" ") ||
      "Not recorded",
    sendingFacility:
      referral.referringHci ||
      referral.referringFacility ||
      referral.referringBHC ||
      referral.bhc ||
      referral.barangayHealthCenter?.name ||
      referral.barangay_health_center?.name ||
      "Barangay Health Center",
    receivingRhu:
      referral.receivingFacility ||
      referral.destinationFacility ||
      referral.referredFacility ||
      referral.ruralHealthUnit?.name ||
      referral.rural_health_unit?.name ||
      "Rural Health Unit",
    urgency:
      referral.urgency ||
      referral.urgencyLevel ||
      referral.priorityLevel ||
      referral.priority ||
      "Normal",
    dateTimeSent: referralDate ? formatDateTime(referralDate) : "Not recorded",
    qrValue: getReferralQrValue(referral),
  };
}

export default function ReferralPrintSlip({
  referral,
  patient,
  className = "",
  printOnly = false,
}) {
  const slip = buildReferralSlipData(referral, patient);

  return (
    <section
      className={`referral-print-area mx-auto bg-white text-[#111827] ${printOnly ? "hidden print:block" : ""} ${className}`}
    >
      <style>{printStyles}</style>
      <div className="mx-auto w-[80mm] max-w-full border border-dashed border-slate-300 bg-white px-4 py-4 font-mono text-[11px] leading-tight shadow-sm print:w-full print:border-0 print:px-0 print:py-0 print:shadow-none">
        <header className="border-b border-dashed border-slate-400 pb-3 text-center">
          <h1 className="text-base font-black tracking-[0.18em] text-[#B91C1C]">
            AKAY
          </h1>
          <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-700">
            Community EHR System
          </p>
          <p className="mt-2 text-[11px] font-black uppercase">
            Referral Verification Slip
          </p>
        </header>

        <div className="space-y-1.5 border-b border-dashed border-slate-400 py-3">
          <SlipRow label="Tracking ID" value={slip.trackingId} strong mono />
          <SlipRow label="Patient" value={slip.patientName} />
          <SlipRow label="Sending Facility" value={slip.sendingFacility} />
          <SlipRow label="Receiving RHU" value={slip.receivingRhu} />
          <SlipRow label="Urgency" value={slip.urgency} strong />
          <SlipRow label="Date/Time Sent" value={slip.dateTimeSent} />
        </div>

        <div className="border-b border-dashed border-slate-400 py-3 text-center">
          <ReferralQrCode
            value={slip.qrValue}
            trackingId={slip.trackingId}
            size={156}
            className="mx-auto inline-flex rounded-md border border-slate-200 p-1 print:border-0"
            imageClassName="h-[39mm] w-[39mm]"
          />
          <p className="mt-2 text-[10px] font-black uppercase tracking-wide">
            Scan to verify referral
          </p>
          <p className="mt-1 break-all text-[8px] leading-snug text-slate-500">
            {slip.qrValue || "Verification URL unavailable"}
          </p>
        </div>

        <footer className="pt-3 text-center text-[8px] leading-snug text-slate-500">
          <p>Do not encode or share clinical details through QR.</p>
          <p className="mt-1">Present this slip to RHU receiving staff.</p>
        </footer>
      </div>
    </section>
  );
}

function SlipRow({ label, value, strong, mono }) {
  return (
    <div className="grid grid-cols-[26mm_minmax(0,1fr)] gap-2">
      <span className="uppercase text-slate-500">{label}</span>
      <span
        className={`min-w-0 break-words text-right ${strong ? "font-black" : "font-bold"} ${mono ? "font-mono tracking-wide" : ""}`}
      >
        {value || "N/A"}
      </span>
    </div>
  );
}

function getReferralDate(referral = {}) {
  const raw =
    referral.referralDateTime ||
    referral.referral_datetime ||
    referral.dateOfReferral ||
    referral.referralDate ||
    referral.dateSubmitted ||
    referral.createdAt ||
    referral.created_at ||
    referral.date;

  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed;
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const printStyles = `
  @media print {
    @page {
      size: 80mm auto;
      margin: 4mm;
    }

    body * {
      visibility: hidden !important;
    }

    .referral-print-area,
    .referral-print-area * {
      visibility: visible !important;
    }

    .referral-print-area {
      position: absolute !important;
      inset: 0 auto auto 0 !important;
      width: 80mm !important;
      margin: 0 !important;
      background: #ffffff !important;
    }
  }
`;
