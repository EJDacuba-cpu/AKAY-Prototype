import { Link } from "react-router";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "../../ui/accordion";
import { formatLongDate } from "../../../utils/formatters";
import { formatDisplayTime, getRecordDateValue, getRecordVisitTypeValue } from "./recordDetailsHelpers";
import { recordDetailsPresentation, relatedVisitSummary, taskStateLabel } from "./recordDetailsPresentation";

export function ReportingCategories({ record, print = false }) {
  return <div className={print ? "bhc-print-grid bhc-print-grid-3" : "grid gap-4 sm:grid-cols-3"}>
    {recordDetailsPresentation(record).reporting.map(({ label, names }) => <div key={label}>
      <h3 className={print ? "bhc-print-k" : "mb-1 text-sm font-semibold text-neutral-900"}>{label}</h3>
      {names.length ? <ul className={print ? "bhc-print-list" : "space-y-1 text-sm text-neutral-800"}>{names.map((name) => <li key={name}>{name}</li>)}</ul>
        : <p className={print ? "bhc-print-muted" : "text-sm text-neutral-500"}>No entries recorded.</p>}
    </div>)}
  </div>;
}

export function ClinicalOutcomes({ record, print = false }) {
  const { outcomes } = recordDetailsPresentation(record);
  return outcomes.length ? <ul className={print ? "bhc-print-list" : "divide-y divide-neutral-100 text-sm"}>
    {outcomes.map((item) => <li key={item.key} className={print ? undefined : "flex flex-wrap justify-between gap-2 py-2"}>
      <span>{item.name}</span>{print ? " · " : null}<span>{item.plan}</span>
      {item.referralDetails && <p className={print ? "bhc-print-prose" : "w-full text-neutral-600"}>{item.referralDetails}</p>}
    </li>)}
  </ul> : <p className={print ? "bhc-print-muted" : "text-sm text-neutral-500"}>No clinical outcome recorded.</p>;
}

export function FollowUpRecordInformation({ record, linkedReferral, print = false }) {
  const { schedules, legacy, related } = recordDetailsPresentation(record, linkedReferral);
  const heading = print ? "bhc-print-k" : "text-sm font-semibold text-neutral-900";
  const muted = print ? "bhc-print-muted" : "text-sm text-neutral-500";
  const visits = <ol className={print ? "bhc-print-list" : "divide-y divide-neutral-100 text-sm"}>
    {related.map((row) => <li key={row.id} className={print ? undefined : "py-2"}>
      {print ? `Record #${row.id}` : <Link className="font-medium text-neutral-900 underline underline-offset-4 focus-visible:outline-2" to={`/bhc/health-records/${row.id}`}>Record #{row.id}</Link>}
      {" · "}{row.relationshipOnly ? "Related consultation" : getRecordVisitTypeValue(row) === "follow_up_visit" ? "Follow-up Visit" : "Initial Consultation"}
      {" · "}{formatLongDate(getRecordDateValue(row), "Date not recorded")}
      {relatedVisitSummary(row) ? ` · ${relatedVisitSummary(row)}` : ""}
    </li>)}
  </ol>;
  return <div className={print ? undefined : "space-y-4"}>
    <h3 className={heading}>Follow-up schedules</h3>
    {schedules.length ? <ul className={print ? "bhc-print-list" : "divide-y divide-neutral-100 text-sm"}>
      {schedules.map((row) => <li key={row.id} className={print ? undefined : "py-2"}>
        {formatLongDate(row.date, "Date not recorded")}{row.time ? ` · ${formatDisplayTime(row.time, row.time)}` : ""}
        {" · "}{taskStateLabel(row.state)}{row.reason ? ` · ${row.reason}` : ""}
        {row.completedRecordId && <span>{" · Completed follow-up: "}{print ? `Record #${row.completedRecordId}` : <Link className="underline underline-offset-4" to={`/bhc/health-records/${row.completedRecordId}`}>Record #{row.completedRecordId}</Link>}</span>}
      </li>)}
    </ul> : <p className={muted}>No follow-up schedule recorded for this record.</p>}
    {legacy.length > 0 && <section aria-label="Legacy Recorded Information">
      <h3 className={heading}>Legacy Recorded Information</h3>
      <p className={muted}>Historical values only; these do not indicate a current outcome or active task.</p>
      <dl className={print ? "bhc-print-grid bhc-print-grid-2" : "mt-2 grid gap-2 text-sm sm:grid-cols-2"}>
        {legacy.map((item) => <div key={item.label}><dt className={muted}>{item.label}</dt><dd>{item.value}</dd></div>)}
      </dl>
    </section>}
    {related.length > 0 && (print ? <section><h3 className={heading}>Related Visits</h3>{visits}</section>
      : <Accordion type="single" collapsible><AccordionItem value="related-visits" className="border-neutral-200">
        <AccordionTrigger className="rounded-none px-0 py-2 text-neutral-900 hover:bg-transparent">Related Visits ({related.length})</AccordionTrigger>
        <AccordionContent className="px-0 pb-0">{visits}</AccordionContent>
      </AccordionItem></Accordion>)}
  </div>;
}
