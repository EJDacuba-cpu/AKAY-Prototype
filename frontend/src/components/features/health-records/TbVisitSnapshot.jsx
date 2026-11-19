import { getTbData } from "../../../utils/healthRecordPrograms";
import { formatLongDate } from "../../../utils/formatters";
import { normalizeTbData } from "./TbTreatmentCardForm";

/**
 * Compact read-only TB facts from a finalized consultation visit.
 * Not Form 4B — no dose calendar, lab grids, AE editors, or outcome pickers.
 */
export default function TbVisitSnapshot({ record }) {
  const tb = getTbData(record);
  const raw = normalizeTbData(record?.tbData || record?.tb_data);
  const outcome = String(raw.outcome?.status || "").trim();
  const outcomeDate = raw.outcome?.date || "";

  const items = [
    { label: "TB case number", value: tb.tbCaseNumber },
    { label: "Registration group", value: tb.registrationGroup },
    { label: "Anatomical site", value: tb.anatomicalSite },
    { label: "Treatment phase", value: tb.phaseLabel },
    {
      label: "Date of diagnosis",
      value: tb.dateOfDiagnosis ? formatLongDate(tb.dateOfDiagnosis, "") : "",
    },
    { label: "Attending physician", value: tb.attendingPhysician },
    {
      label: "Intensive start",
      value: tb.intensiveStart ? formatLongDate(tb.intensiveStart, "") : "",
    },
    {
      label: "Continuation end",
      value: tb.continuationEnd ? formatLongDate(tb.continuationEnd, "") : "",
    },
    { label: "Outcome", value: outcome },
    {
      label: "Outcome date",
      value: outcomeDate ? formatLongDate(outcomeDate, "") : "",
    },
  ].filter((item) => String(item.value || "").trim());

  if (items.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No TB case fields were recorded on this consultation.
      </p>
    );
  }

  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
            {item.label}
          </dt>
          <dd className="mt-1 text-sm font-medium text-[#111827]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
