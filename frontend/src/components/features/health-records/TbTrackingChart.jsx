import { normalizeTbData } from "./TbTreatmentCardForm";
import TbDoseCalendar from "./TbDoseCalendar";

/**
 * Read-only TB tracking chart for an active BHC program: adherence and monthly
 * doses from tb_data.doseCalendar. Not an editor.
 */
export default function TbTrackingChart({ tbData, caseNumber = "" }) {
  const data = normalizeTbData(tbData || {});
  const calendar = data.doseCalendar || { months: [], adherencePercent: 0 };
  const months = Array.isArray(calendar.months) ? calendar.months : [];
  const monthlyDoses = months.reduce(
    (sum, month) => sum + (Number(month.monthlyTotal) || 0),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {caseNumber ? (
          <div className="border border-[#E5E7EB] bg-white px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Case no.</p>
            <p className="mt-0.5 text-sm font-semibold text-[#111827]">{caseNumber}</p>
          </div>
        ) : null}
        <div className="border border-[#E5E7EB] bg-white px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Adherence</p>
          <p className="mt-0.5 text-sm font-semibold text-[#111827]">{calendar.adherencePercent || 0}%</p>
        </div>
        <div className="border border-[#E5E7EB] bg-white px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Monthly doses</p>
          <p className="mt-0.5 text-sm font-semibold text-[#111827]">{monthlyDoses}</p>
        </div>
      </div>
      <TbDoseCalendar value={calendar} onChange={() => {}} readOnly />
    </div>
  );
}
