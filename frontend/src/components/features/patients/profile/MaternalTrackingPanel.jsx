import { Card } from "../../../ui/card";
import { Button } from "../../../ui/button";
import { formatShortDate } from "../../../../utils/patientProfile";
import calendarIcon from "../../../../assets/figma/tracking-icon.svg";

function Fact({ label, value, date = false }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-50 py-1.5 text-xs last:border-b-0">
      <dt className="text-[#6B7280]">{label}</dt>
      <dd className="m-0 text-right font-semibold text-[#111827]">{value ? (date ? formatShortDate(value) : value) : <span className="font-normal text-slate-400">Not recorded</span>}</dd>
    </div>
  );
}

export default function MaternalTrackingPanel({ summary, status, onViewRecords }) {
  const isPrenatal = status === "Prenatal";
  return (
    <section aria-labelledby="maternal-tracking-title" className="border-t border-[#E5E7EB] bg-[#FCFDFD] px-4 py-5 @lg:px-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 id="maternal-tracking-title" className="text-sm font-bold text-[#111827]">Maternal Care Tracking</h3>
        <div role="group" aria-label="Tracking view" className="inline-flex rounded-full border border-slate-300 bg-slate-200 p-[3px] text-xs">
          <Button type="button" variant="ghost" size="sm" disabled title="Graph view requires a defined graph design and data series" className="h-7 rounded-full px-3 text-slate-500">Graph</Button>
          <Button type="button" variant="ghost" size="sm" aria-pressed="true" className="h-7 rounded-full bg-white px-4 font-semibold text-slate-900 shadow-sm hover:bg-white">Table</Button>
        </div>
      </div>

      <Card className="rounded-none border-[#E5E7EB] p-4 shadow-none">
        <div className="grid gap-5 @lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <dl className="min-w-0 @lg:border-r @lg:border-[#E5E7EB] @lg:pr-6">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.05em] text-[#6B7280]">Pregnancy facts</p>
            <Fact label="G/P" value={summary.gp} />
            <Fact label="AOG" value={isPrenatal ? summary.aog : ""} />
            <Fact label="EDD" value={summary.edd} date />
            <Fact label="TPAL" value={summary.tpal} />
            <Fact label="Last Visit" value={summary.lastVisit} date />
          </dl>
          <div className="min-w-0 self-center">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold">
              <span>Pregnancy Progress</span>
              <span className="text-red-600">{isPrenatal ? summary.progressLabel || "Not available" : "Not applicable"}</span>
            </div>
            {!isPrenatal || summary.progress === null ? (
              <p className="border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 text-xs text-[#6B7280]">{isPrenatal ? "Progress needs recorded LMP and EDD dates." : "Pregnancy progress is not applicable after delivery."}</p>
            ) : (
              <div role="progressbar" aria-label="Pregnancy progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={summary.progress} className="h-3 bg-[#E5E7EB]">
                <div className="h-full bg-[#DC2626]" style={{ width: `${summary.progress}%` }} />
              </div>
            )}
            <div className="mt-2 flex items-start justify-between border-t border-[#F3F4F6] pt-1 text-[10px] font-bold text-[#111827]">
              <span>LMP {summary.lmp ? formatShortDate(summary.lmp) : "not recorded"}</span>
              <span>EDD {summary.edd ? formatShortDate(summary.edd) : "not recorded"}</span>
            </div>
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 @lg:grid-cols-5">
          {summary.doses.map((row) => (
            <div key={row.dose} className="min-w-0 border border-[#E5E7EB] bg-white p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-[#6B7280]">Dose {row.dose}</p>
              <h4 className="mt-2 text-xs font-bold text-[#111827]">Tetanus TT / Td</h4>
              {row.tt || row.td ? (
                <div className="mt-2 space-y-1 text-[11px] text-[#475569]">
                  {row.tt && <p><span className="font-semibold text-[#15803D]">TT given</span> · {formatShortDate(row.tt)}</p>}
                  {row.td && <p><span className="font-semibold text-[#15803D]">Td given</span> · {formatShortDate(row.td)}</p>}
                </div>
              ) : <p className="mt-2 text-[11px] italic text-slate-400">Not recorded</p>}
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-5">
        <h4 className="mb-3 text-sm font-bold text-[#111827]">Prenatal Laboratory Result</h4>
        <div className="overflow-x-auto border border-[#E5E7EB] bg-white">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="bg-[#F8FAFC] text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
              <tr><th scope="col" className="px-4 py-3">Test</th><th scope="col" className="px-4 py-3">Result</th><th scope="col" className="px-4 py-3">Date</th></tr>
            </thead>
            <tbody className="divide-y divide-[#F3F4F6]">
              {summary.labs.map((lab) => (
                <tr key={lab.label}>
                  <th scope="row" className="px-4 py-3 font-semibold text-[#111827]">{lab.label}</th>
                  <td className={`px-4 py-3 ${lab.value ? "font-medium text-[#111827]" : "italic text-slate-400"}`}>{lab.value || "Not recorded"}</td>
                  <td className="px-4 py-3 text-[#64748B]">
                    {lab.date ? <span className="inline-flex items-center gap-1.5"><img src={calendarIcon} alt="" />{formatShortDate(lab.date)}</span> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Button type="button" variant="link" size="sm" onClick={onViewRecords} className="mt-3 h-auto rounded-none p-0 text-xs">View maternal health records</Button>
    </section>
  );
}
