import { ArrowLeft } from "lucide-react";
import { RefreshingIndicator, ReferralIndicatorBadge } from "../../common";
import { formatDisplayValue } from "../../../utils/formatters";

export default function RecordHeaderCard({
  title,
  recordId,
  hasLinkedReferral = false,
  referralStatus,
  isUpdating = false,
  onBack,
  backLabel = "Back to Health Records",
  actions,
  patientName,
  serviceType,
  displayDate,
  displayTime,
  practitioner,
}) {
  return (
    <>
      <div className="print:hidden mb-6 overflow-hidden rounded-card border border-[#E5E7EB] bg-white shadow-card">
        <div className="p-5">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 transition hover:text-[#0F172A]"
          >
            <ArrowLeft size={15} /> {backLabel}
          </button>

          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold text-[#0F172A]">{title}</h1>
                {hasLinkedReferral && (
                  <ReferralIndicatorBadge hasReferral status={referralStatus} />
                )}
                {isUpdating && (
                  <RefreshingIndicator label="Updating health record details..." />
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className="font-mono text-[11px] font-semibold text-slate-600">
                  Record #{recordId}
                </span>
              </div>
            </div>

            {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
          </div>
        </div>

        <div className="border-t border-slate-100 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MetadataItem label="Patient Full Name" value={patientName} />
            <MetadataItem label="Service Type" value={serviceType} />
            <MetadataItem label="Date of Visit" value={displayDate} />
            <MetadataItem
              label="Time of Visit"
              value={displayTime || "Not recorded"}
            />
            <MetadataItem label="Name of Practitioner" value={practitioner} />
          </div>
        </div>
      </div>

      {/* Print-only identity header */}
      <div className="hidden print:block mb-4 border-b-2 border-[#B91C1C] pb-3">
        <div className="text-center">
          <h1 className="text-base font-black tracking-[0.18em] text-[#B91C1C]">
            AKAY
          </h1>
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-700">
            Community EHR System
          </p>
          <p className="mt-1 text-[11px] font-black uppercase">{title}</p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-black">
          <div>
            <span className="font-bold">Patient:</span>{" "}
            {formatDisplayValue(patientName, "Not recorded")}
          </div>
          <div>
            <span className="font-bold">Record #:</span> {recordId}
          </div>
          <div>
            <span className="font-bold">Date of Visit:</span>{" "}
            {formatDisplayValue(displayDate, "Not recorded")}
          </div>
          <div>
            <span className="font-bold">Time of Visit:</span>{" "}
            {formatDisplayValue(displayTime, "Not recorded")}
          </div>
          <div>
            <span className="font-bold">Practitioner:</span>{" "}
            {formatDisplayValue(practitioner, "Not recorded")}
          </div>
          <div>
            <span className="font-bold">Service Type:</span>{" "}
            {formatDisplayValue(serviceType, "Not recorded")}
          </div>
        </div>

        <p className="mt-2 text-[9px] text-slate-500">
          Printed on{" "}
          {new Date().toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </>
  );
}

function MetadataItem({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-semibold text-slate-700">
        {formatDisplayValue(value, "Not recorded")}
      </p>
    </div>
  );
}
