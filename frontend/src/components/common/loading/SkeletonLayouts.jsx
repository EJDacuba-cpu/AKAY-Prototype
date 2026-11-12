import { createContext, useContext } from "react";
import { Skeleton } from "../../ui/skeleton";
import { TABLE_SKELETON_PROFILES } from "./skeletonProfiles";
import { resolveSkeletonVariant } from "./skeletonVariant";

const Nested = createContext(false);
const sheet = "min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white";
const repeat = (count, render) => Array.from({ length: count }, (_, i) => render(i));
const Block = ({ className = "", ...props }) => <Skeleton {...props} className={`h-3 ${className}`} />;
const Action = ({ small = false }) => <Block className={`${small ? "h-8 w-24" : "h-9 w-28"} rounded-full`} />;

function Root({ message = "Loading...", children, className = "" }) {
  return <div role="status" aria-live="polite" aria-busy="true" className={`min-w-0 ${className}`}>
    <span className="sr-only">{message}</span>
    <div aria-hidden="true" className="min-w-0 space-y-4">{children}</div>
  </div>;
}

function Heading({ actions = 1 }) {
  const nested = useContext(Nested);
  if (nested) return null;
  return <div data-slot="skeleton-heading" className="flex flex-wrap items-start justify-between gap-4">
    <div className="min-w-0 space-y-2"><Block className="h-5 w-48" /><Block className="w-80" /></div>
    <div className="flex flex-wrap gap-2">{repeat(actions, i => <Action key={i} />)}</div>
  </div>;
}

function Toolbar({ action = true, tabs = 0, force = false }) {
  const nested = useContext(Nested);
  if (nested && !force) return null;
  return <div data-slot="skeleton-toolbar" className="flex flex-wrap items-center justify-between gap-3">
    {tabs > 0 && <div data-slot="skeleton-tabs" className="flex flex-wrap gap-2">{repeat(tabs, i => <Action key={i} />)}</div>}
    <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <Block className="h-9 w-full rounded-full sm:w-72" />
      <Block className="h-9 w-24 rounded-full" />{action && <Action />}
    </div>
  </div>;
}

function RecordToolbar() {
  return <div data-slot="skeleton-toolbar" className="flex flex-wrap gap-2"><Block className="h-9 w-full rounded-full sm:w-64" />{repeat(4, i => <Block key={i} className="h-9 w-32 rounded-full" />)}<Action /></div>;
}

function Footer() {
  return <div className="flex items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3">
    <Block className="w-28" /><div className="flex gap-2"><Block className="h-8 w-8 rounded-full" /><Block className="h-8 w-16 rounded-full" /><Block className="h-8 w-8 rounded-full" /></div>
  </div>;
}

function TableBody({ columns = 5, rows = 10, rowHeight = 56, headHeight = 44, minWidth = 760, mobileCards = true, desktopBreakpoint = "md", footer = true }) {
  const count = Array.isArray(columns) ? columns.length : columns;
  const cardClass = desktopBreakpoint === "lg" ? "grid gap-px bg-neutral-200 md:grid-cols-2 lg:hidden" : "divide-y divide-neutral-200 md:hidden";
  const tableClass = mobileCards ? (desktopBreakpoint === "lg" ? "hidden overflow-x-auto lg:block" : "hidden overflow-x-auto md:block") : "overflow-x-auto";
  return <div className={sheet}>
    <div className={tableClass}>
      <table className="w-full table-fixed border-collapse" style={{ minWidth }}>
        {Array.isArray(columns) && <colgroup>{columns.map((width, i) => <col key={i} style={{ width: `${width}%` }} />)}</colgroup>}
        <thead className="bg-neutral-100" style={{ height: headHeight }}><tr>{repeat(count, i => <th key={i} className="px-4"><Block className={i === count - 1 ? "ml-auto w-8" : "w-20"} /></th>)}</tr></thead>
        <tbody className="divide-y divide-neutral-100">{repeat(rows, row => <tr key={row} style={{ height: rowHeight }}>{repeat(count, col => <td key={col} className="px-4 py-2">
          {col === count - 1 ? <Block className="ml-auto size-6 rounded-full" /> : <div className="space-y-2"><Block className={col === 0 ? "w-40" : "w-24"} />{col === 0 && <Block className="h-2.5 w-24" />}</div>}
        </td>)}</tr>)}</tbody>
      </table>
    </div>
    {mobileCards && <div className={cardClass}>{repeat(Math.min(rows, 5), i => <div key={i} className="space-y-4 bg-white p-4">
      <div className="flex justify-between gap-3"><Block className="h-4 w-48" /><Block className="size-7 rounded-full" /></div>
      <div className="grid grid-cols-2 gap-3">{repeat(Math.min(count - 1, 4), j => <div className="space-y-2" key={j}><Block className="h-2.5 w-16" /><Block className="w-24" /></div>)}</div>
    </div>)}</div>}
    {footer && <Footer />}
  </div>;
}

export function TableSkeleton({ message = "Loading records...", profile = "table", bodyOnly = false, ...options }) {
  const nested = useContext(Nested) || bodyOnly;
  const { action = true, toolbar = false, ...tableOptions } = options;
  return <Nested.Provider value={nested}><Root message={message}>
    <Heading actions={0} />{profile === "health-records" && toolbar ? <RecordToolbar /> : <Toolbar action={action} force={toolbar} />}
    <TableBody {...TABLE_SKELETON_PROFILES[profile]} {...tableOptions} />
  </Root></Nested.Provider>;
}

function Info({ fields = 6, columns = "sm:grid-cols-2 lg:grid-cols-3", narrative = false }) {
  return <section className={`${sheet} p-4`}><Block className="h-4 w-40" />
    <div className={`mt-5 grid gap-x-6 gap-y-5 ${columns}`}>{repeat(fields, i => <div key={i} className="min-w-0 space-y-2"><Block className="h-2.5 w-24" /><Block className="h-4 w-40" /></div>)}</div>
    {narrative && <div className="mt-5 space-y-2"><Block className="w-full" /><Block className="w-4/5" /><Block className="w-3/5" /></div>}
  </section>;
}

function Chart({ height = "h-56" }) {
  return <section className={`${sheet} p-4`}><div className="flex justify-between gap-4"><Block className="h-4 w-40" /><Block className="w-16" /></div>
    <div className={`mt-5 flex items-end gap-3 border-b border-l border-neutral-200 px-4 ${height}`}>{[45, 68, 54, 80, 65, 88, 72].map((height, i) => <Block key={i} className="flex-1 rounded-t-md rounded-b-none" style={{ height }} />)}</div>
    <div className="mt-3 flex justify-between gap-2">{repeat(4, i => <Block key={i} className="h-2 w-12" />)}</div>
  </section>;
}

function Rows({ count = 4 }) {
  return <section className={`${sheet} p-4`}><Block className="h-4 w-36" /><div className="mt-4 divide-y divide-neutral-100">{repeat(count, i => <div key={i} className="flex items-center gap-3 py-3"><Block className="size-8 rounded-full" /><div className="min-w-0 flex-1 space-y-2"><Block className="w-40" /><Block className="h-2.5 w-60" /></div><Block className="w-16" /></div>)}</div></section>;
}

function Kpis({ count = 4, className = "sm:grid-cols-2" }) {
  return <div className={`grid gap-3 ${className}`}>{repeat(count, i => <div key={i} className={`${sheet} p-4`}><div className="flex justify-between gap-4"><Block className="w-24" /><Block className="size-9 rounded-lg" /></div><Block className="mt-3 h-7 w-20" /><Block className="mt-2 h-2.5 w-36" /></div>)}</div>;
}

function Welcome() {
  return <div className={`${sheet} h-full min-h-48 space-y-4 p-5`}><Block className="size-9 rounded-full" /><Block className="h-7 w-64" /><Block className="w-48" /><div className="flex gap-4"><Block className="w-32" /><Block className="w-20" /></div></div>;
}

export function DashboardSkeleton({ message = "Loading dashboard...", role = "rhu" }) {
  return <Root message={message}>
    <div className="grid gap-4 lg:grid-cols-12">
      {role === "bhc" ? <><div className="lg:col-span-7"><Kpis /></div><div className="lg:col-span-5"><Welcome /></div></> : <><div className="lg:col-span-5"><Welcome /></div><div className="lg:col-span-7"><Kpis /></div></>}
    </div>
    {role === "bhc" && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{repeat(4, i => <div key={i} className={`${sheet} flex items-center gap-3 p-4`}><Block className="size-9 rounded-full" /><Block className="h-4 w-36" /></div>)}</div>}
    <div className="grid gap-4 lg:grid-cols-12"><div className="lg:col-span-7"><Chart /></div><div className="space-y-4 lg:col-span-5"><Rows count={3} />{role === "bhc" && <Rows count={2} />}</div></div>
    {role === "admin" && <div className="grid gap-4 lg:grid-cols-12"><div className="lg:col-span-4"><Rows count={3} /></div><div className="lg:col-span-8"><Rows count={4} /></div></div>}
    {role === "rhu" && <div className="grid gap-4 lg:grid-cols-12"><div className="lg:col-span-4"><Rows count={3} /></div><div className="lg:col-span-5"><Rows count={4} /></div><div className="lg:col-span-3"><Rows count={2} /></div></div>}
  </Root>;
}

function PatientDirectory({ message, options }) {
  if (options.view === "monitoring") return <Root message={message}><Heading actions={0} /><Rows count={5} /></Root>;
  return <Root message={message}><Heading actions={0} /><Toolbar action={options.canRegister !== false} />
    <div className="@container/directory-results"><div className="grid grid-cols-1 gap-4 @min-[560px]/directory-results:grid-cols-2">{repeat(options.rows || 6, i => <div key={i} className={`${sheet} space-y-4 p-4`}>
      <div className="flex justify-between gap-3"><Block className="w-24" /><Block className="h-5 w-20 rounded-full" /></div>
      <div className="space-y-2"><Block className="h-4 w-52" /><Block className="w-32" /></div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3">{repeat(4, j => <div key={j} className="space-y-2"><Block className="h-2 w-16" /><Block className="w-24" /></div>)}</div>
      <div className="flex justify-end border-t border-neutral-200 pt-3"><Action small /></div>
    </div>)}</div></div>
  </Root>;
}

export function PatientDetailsSkeleton({ message = "Loading patient details..." }) {
  return <Root message={message}>
    <div className={`${sheet} flex flex-wrap items-center gap-4 p-4`}><Block className="size-8 rounded-lg" /><div className="min-w-0 flex-1 space-y-2"><Block className="h-5 w-60" /><Block className="w-80" /></div><div className="flex gap-3">{repeat(3, i => <Block key={i} className="h-8 w-24 rounded-full" />)}</div><Action /></div>
    <div data-slot="skeleton-tabs" className="flex flex-wrap gap-2 border-b border-neutral-200 pb-3">{repeat(5, i => <Action key={i} small />)}</div>
    <div className="anatomy-board grid min-w-0 grid-cols-1 gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_224px]">
      <section className={`${sheet} patient-overview-anatomy p-4`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{repeat(4, i => <div className="space-y-2" key={i}><Block className="h-2.5 w-16" /><Block className="h-6 w-20" /></div>)}</div>
        <div className="mt-5 flex justify-between"><Action small /><Action small /></div>
        <div className="mx-auto mt-5 flex h-80 w-40 flex-col items-center gap-2"><Block className="size-14 rounded-full" /><Block className="h-36 w-28 rounded-3xl" /><div className="flex gap-3"><Block className="h-24 w-9 rounded-full" /><Block className="h-24 w-9 rounded-full" /></div></div>
      </section>
      <div className="patient-overview-clinical flex min-w-0 flex-col gap-4"><Rows count={3} /><Rows count={3} /></div>
    </div>
  </Root>;
}

export function FacilitiesSkeleton({ message = "Loading facilities...", canManage = true }) {
  return <Root message={message}><Heading actions={0} /><Toolbar tabs={2} action={canManage} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{repeat(8, i => <article key={i} className={`${sheet} flex flex-col gap-4 p-4`}>
      <div className="flex justify-between gap-3"><div className="min-w-0 space-y-2"><Block className="h-4 w-40" /><Block className="w-48" /></div><Block className="h-6 w-16 rounded-full" /></div>
      <div className="space-y-3 rounded-lg border border-dashed border-neutral-200 p-3"><Block className="h-2.5 w-24" /><Block className="h-4 w-36" /><div className="flex gap-2"><Block className="h-5 w-20 rounded-full" /><Block className="h-5 w-24 rounded-full" /></div></div>
      {canManage && <div className="flex justify-end"><Action small /></div>}
    </article>)}</div>
  </Root>;
}

export function MedicineInventorySkeleton(props) { return <TableSkeleton profile="medicine" {...props} />; }
export function HealthRecordsSkeleton(props) { return <TableSkeleton profile="health-records" {...props} />; }

function MedicineDetails({ message }) {
  return <Root message={message}><Block className="h-4 w-44" /><Heading actions={3} />
    <Info fields={5} columns="grid-cols-2 lg:grid-cols-5" /><Info fields={2} />
    <section className={sheet}><div className="p-4"><Block className="h-4 w-40" /></div><TableBody columns={6} rows={3} minWidth={980} mobileCards footer={false} /></section>
    <section className={sheet}><div className="flex flex-wrap justify-between gap-3 p-4"><Block className="h-4 w-36" /><Action /></div><TableBody columns={5} rows={4} minWidth={800} mobileCards footer /></section>
  </Root>;
}

export function ReportsSkeleton({ message = "Loading reports...", category = "overview", role = "bhc", cardCount = 4, chartCount = 2 }) {
  const overview = role === "rhu" && category === "overview";
  return <Root message={message}><Heading actions={0} />
    <div className="flex flex-wrap items-end justify-end gap-2">{repeat(3, i => <Action key={i} small />)}<Block className="h-9 w-32 rounded-full" /><Block className="h-9 w-32 rounded-full" /><Action small /><Action small /></div>
    {overview ? <div className="grid gap-4 md:grid-cols-12"><div className="md:col-span-3"><Kpis count={2} className="grid-cols-2 md:grid-cols-1" /></div><div className="md:col-span-6"><Chart /></div><div className="md:col-span-3"><Kpis count={2} className="grid-cols-2 md:grid-cols-1" /></div></div> : <Kpis count={cardCount} className="sm:grid-cols-2 xl:grid-cols-4" />}
    {chartCount > 0 && <div className="grid gap-4 md:grid-cols-12">{repeat(chartCount, i => <div key={i} className={overview ? (i === 0 ? "md:col-span-5" : "md:col-span-7") : i > 1 ? "md:col-span-12" : i === 0 ? "md:col-span-8" : "md:col-span-4"}><Chart /></div>)}</div>}
    <TableBody columns={3} rows={5} minWidth={640} mobileCards={false} footer={false} />
  </Root>;
}

function AdminReports({ message }) {
  return <Root message={message}><Heading actions={2} />
    <div className="grid gap-4 lg:grid-cols-12"><section className={`${sheet} p-4 lg:col-span-5`}><Block className="h-4 w-36" /><Block className="mx-auto my-8 size-44 rounded-full" /><div className="space-y-4">{repeat(3, i => <div key={i} className="flex justify-between gap-4"><Block className="w-32" /><Block className="w-16" /></div>)}</div></section>
      <div className="space-y-4 lg:col-span-7"><Info fields={3} /><Info fields={2} /></div>
    </div><TableBody columns={4} rows={4} minWidth={640} mobileCards={false} />
  </Root>;
}

function Calendar({ rows = 5 }) {
  return <section className={sheet}><div className="flex flex-wrap items-center justify-between gap-3 p-4"><Block className="h-4 w-40" /><div className="flex gap-2"><Block className="size-8 rounded-full" /><Action small /><Block className="size-8 rounded-full" /></div></div>
    <div className="grid grid-cols-7 border-y border-neutral-200 bg-neutral-50">{repeat(7, i => <div key={i} className="p-3"><Block className="mx-auto h-2.5 w-10" /></div>)}</div>
    <div className="grid grid-cols-7">{repeat(rows * 7, i => <div key={i} className="min-w-0 border-b border-r border-neutral-100 p-2"><Block className="h-2.5 w-5" /><Block className="mt-3 h-14 w-full sm:h-20" /></div>)}</div>
  </section>;
}

export function FollowUpsSkeleton({ message = "Loading follow-ups...", view = "list", calendarSpan }) {
  const calendar = !["list", "table"].includes(view);
  return <Root message={message}><Heading actions={0} /><Toolbar action={false} />
    <div className="flex flex-wrap justify-between gap-3"><Block className="h-4 w-48" /><div className="flex gap-2"><Action small /><Action small /><Action small /></div></div>
    {calendar ? <Calendar rows={view === "week" || calendarSpan === "week" ? 1 : 5} /> : <TableBody columns={4} rows={10} minWidth={640} mobileCards={false} />}
  </Root>;
}

function DoctorCalendar({ message }) {
  return <Root message={message}><Heading actions={0} /><div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]"><Calendar /><div className="space-y-4"><div className={`${sheet} space-y-4 p-4`}><Block className="h-4 w-40" /><Block className="h-10 w-full rounded-full" /><Action /></div><Rows count={4} /></div></div></Root>;
}

export function FormSkeleton({ message = "Loading form...", profile = "form", fields = 8, step = "personal" }) {
  const account = profile === "account-form";
  const assignment = profile === "assignment-form";
  return <Root message={message}>
    {account && <div data-slot="skeleton-tabs" className="flex gap-2 rounded-full bg-neutral-50 p-1">{repeat(4, i => <Block key={i} className="h-10 flex-1 rounded-full" />)}</div>}
    <Heading actions={0} />
    <div className={assignment ? "grid gap-4 lg:grid-cols-2" : "space-y-4"}>
      <section className={`${sheet} p-5`}><Block className="h-4 w-40" /><div className={`mt-5 grid gap-x-5 gap-y-5 ${account && step === "facility" ? "md:grid-cols-3" : "sm:grid-cols-2"}`}>
        {repeat(account && step === "facility" ? 3 : assignment ? 6 : fields, i => <div key={i} className="space-y-2"><Block className="w-24" /><Block className={account && step === "facility" ? "h-44 w-full rounded-xl" : "h-10 w-full rounded-lg"} /></div>)}
      </div>{!account && !assignment && <div className="mt-5 space-y-2"><Block className="w-32" /><Block className="h-24 w-full rounded-lg" /></div>}</section>
      {assignment && <section className={`${sheet} p-5`}><Block className="h-4 w-32" /><div className="mt-5 space-y-5">{repeat(8, i => <div className="flex items-center gap-3" key={i}><Block className="size-4 rounded" /><Block className="w-64" /></div>)}</div></section>}
    </div>
    <div className="flex justify-between gap-3 border-t border-neutral-200 pt-4"><Action /><Action /></div>
  </Root>;
}

/** Matches BHC/RHU patient registration: back link, title, two-column panels. */
export function PatientRegistrationSkeleton({ message = "Loading registration..." }) {
  const panel = (titleWidth, fields, columns = "sm:grid-cols-2 xl:grid-cols-3") => (
    <section data-slot="registration-skeleton-panel" className={`${sheet} space-y-4 p-4`}>
      <div className="space-y-2"><Block className={`h-4 ${titleWidth}`} /><Block className="h-2.5 w-56" /></div>
      <div className={`grid gap-3 ${columns}`}>{repeat(fields, i => <div key={i} className="space-y-2"><Block className="h-2.5 w-20" /><Block className="h-10 w-full rounded-lg" /></div>)}</div>
    </section>
  );
  return <Root message={message} className="patient-registration">
    <div data-slot="registration-skeleton-header" className="mb-4 ml-0 mr-auto w-full max-w-7xl min-w-0 space-y-2">
      <Block className="h-4 w-36" />
      <Block className="h-5 w-48" />
      <Block className="h-3 w-80 max-w-full" />
    </div>
    <div data-slot="registration-skeleton-columns" className="ml-0 mr-auto grid w-full max-w-7xl min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        {panel("w-44", 6)}
        {panel("w-40", 4, "sm:grid-cols-2")}
        {panel("w-36", 3, "sm:grid-cols-2")}
      </div>
      <div className="min-w-0 space-y-4">
        {panel("w-40", 2, "grid-cols-1")}
        {panel("w-36", 3, "grid-cols-1")}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><Action /><Action /></div>
      </div>
    </div>
  </Root>;
}

export function HealthRecordFormSkeleton(props) { return <FormSkeleton {...props} fields={6} />; }

function FormFields({ count = 2, columns = "sm:grid-cols-2", multiline = false }) {
  return <section className={`${sheet} p-5`}><Block className="h-4 w-40" /><div className={`mt-5 grid gap-5 ${columns}`}>{repeat(count, i => <div className="space-y-2" key={i}><Block className="w-28" /><Block className={`${multiline ? "h-28" : "h-10"} w-full rounded-lg`} /></div>)}</div></section>;
}

function ReferralForm({ message }) {
  return <Root message={message}><div data-slot="skeleton-referral-form" className="space-y-4"><Block className="h-4 w-44" /><Heading actions={0} />
    <Info fields={4} columns="grid-cols-2 md:grid-cols-4" /><FormFields count={2} columns="lg:grid-cols-2" />
    <div className="flex flex-wrap gap-3">{repeat(3, i => <Action key={i} />)}</div>
    <Info fields={6} columns="grid-cols-2" /><FormFields count={2} /><Info fields={4} columns="grid-cols-2" />
    <FormFields count={3} columns="grid-cols-1" multiline />
    <div className="flex justify-end gap-3"><Action /><Action /></div>
  </div></Root>;
}

function FeedbackForm({ message, selected = false }) {
  return <Root message={message}><Block className="h-4 w-44" /><Heading actions={0} />
    {!selected ? <FormFields columns="lg:grid-cols-2" /> : <>
      <Info fields={4} columns="sm:grid-cols-2 lg:grid-cols-4" />
      <div data-slot="skeleton-tabs" className="grid grid-cols-4 gap-2">{repeat(4, i => <Block key={i} className="h-10 w-full rounded-full" />)}</div>
      <FormFields count={3} columns="lg:grid-cols-3" /><FormFields count={2} columns="grid-cols-1" multiline />
      <FormFields columns="lg:grid-cols-2" /><FormFields count={1} columns="grid-cols-1" multiline />
      <div className="flex justify-end gap-3"><Action /><Action /></div>
    </>}
  </Root>;
}

function FamilyForm({ message }) {
  return <Root message={message}><Block className="h-4 w-44" /><Heading actions={0} />
    <FormFields count={1} columns="grid-cols-1" /><FormFields count={4} columns="sm:grid-cols-2 xl:grid-cols-4" />
    <FormFields count={1} columns="grid-cols-1" /><div className="flex justify-end gap-3"><Action /><Action /></div>
  </Root>;
}

function ReferralSlip({ message }) {
  return <Root message={message}><Block className="h-4 w-44" /><Heading actions={1} />
    <Info fields={6} columns="sm:grid-cols-2 lg:grid-cols-3" />
    <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]"><Info fields={6} columns="sm:grid-cols-2" narrative /><div className={`${sheet} min-h-96 space-y-6 p-5`}><Block className="mx-auto h-5 w-40" /><Block className="h-80 w-full" /></div></div>
    <div className={`${sheet} flex items-center justify-between gap-4 p-5`}><Block className="h-4 w-48" /><Block className="size-5" /></div>
  </Root>;
}

export function DetailsSkeleton({ message = "Loading details...", profile = "details", view, role = "bhc" }) {
  const slip = profile === "referral-slip";
  const referral = profile === "referral-details" || slip;
  const followUp = view === "follow-up";
  if (profile === "record-details" && !followUp) return <Root message={message}>
    <Block className="h-4 w-44" /><Heading actions={1} /><Info fields={6} />
    <Info fields={2} columns="sm:grid-cols-2" /><Info fields={9} />
    <section className={`${sheet} space-y-5 p-5`}><Block className="h-4 w-40" />{repeat(3, i => <div key={i} className="space-y-3"><Block className="w-28" /><Block className="w-full" /><Block className="w-4/5" /></div>)}</section>
    <Info fields={3} columns="sm:grid-cols-2" narrative />
  </Root>;
  return <Root message={message}><Block className="h-4 w-44" /><Heading actions={referral && role === "bhc" ? 2 : 1} />
    <Info fields={followUp ? 6 : referral ? 3 : 6} columns={followUp ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" : "sm:grid-cols-2 lg:grid-cols-3"} />
    {followUp && <div data-slot="skeleton-tabs" className="flex gap-2"><Action /><Action /></div>}
    {referral && role === "bhc" && view !== "waiting" && <div className={`${sheet} flex flex-col gap-5 p-5 sm:flex-row`}><Block className="size-32 shrink-0 rounded-lg" /><div className="flex-1 space-y-4"><Block className="h-4 w-60" /><Block className="w-full" /><div className="flex gap-2"><Action /><Action /></div></div></div>}
    <Info fields={profile === "monitoring-handoff" ? 2 : 6} columns="sm:grid-cols-2" narrative />
    <Info fields={slip ? 4 : 3} columns="sm:grid-cols-2" narrative />
  </Root>;
}

function FamilyDetails({ message, options }) {
  const actions = Number(options.canManage !== false) + Number(options.canRegister !== false);
  return <Root message={message}><Block className="h-4 w-44" /><Heading actions={actions} />
    <div data-slot="skeleton-tabs" className="flex flex-wrap justify-between gap-3"><div className="flex gap-2"><Action small /><Action small /></div>{options.view !== "list" && <div className="flex gap-2"><Block className="size-8 rounded-full" /><Block className="size-8 rounded-full" /><Action small /></div>}</div>
    {options.view === "list" ? <TableBody columns={5} rows={4} minWidth={720} mobileCards={false} footer={false} /> : <div data-slot="skeleton-family-tree" className={`${sheet} min-h-[420px] p-5`}>
      <div className="mx-auto w-52 space-y-3 rounded-xl border border-neutral-200 p-4"><Block className="mx-auto size-9 rounded-full" /><Block className="mx-auto w-36" /><Block className="mx-auto w-24" /></div>
      <div className="mx-auto h-12 w-px bg-neutral-200" /><div className="mx-auto max-w-lg border-t border-neutral-200" />
      <div className="mx-auto grid max-w-xl grid-cols-2 gap-4 pt-6 sm:grid-cols-3">{repeat(3, i => <div key={i} className="space-y-3 rounded-xl border border-neutral-200 p-3"><Block className="mx-auto size-8 rounded-full" /><Block className="w-full" /><Block className="w-20" /></div>)}</div>
    </div>}
  </Root>;
}

function Notifications({ message, bodyOnly }) {
  return <Root message={message}>{!bodyOnly && <Heading actions={1} />}
    <div className={bodyOnly ? "min-w-0" : "grid min-w-0 gap-4 lg:grid-cols-[12rem_minmax(0,1fr)]"}>
      {!bodyOnly && <div className={`${sheet} flex gap-2 overflow-hidden p-2 lg:flex-col`}>{repeat(7, i => <Block key={i} className="h-9 w-36 shrink-0 rounded-full" />)}</div>}
      <div className={sheet}>{!bodyOnly && <div className="flex flex-wrap justify-between gap-3 border-b border-neutral-200 p-4"><Block className="h-8 w-52 rounded-full" /><div className="flex flex-wrap gap-2"><Action small /><Action small /></div></div>}{repeat(6, i => <div className="flex min-w-0 items-start gap-3 border-b border-neutral-100 p-4" key={i}><Block className="size-4 rounded" /><div className="min-w-0 flex-1 space-y-2"><Block className="w-44" /><Block className="w-full" /><Block className="h-2.5 w-32" /></div><Block className="w-16" /></div>)}</div>
    </div>
  </Root>;
}

function ProfileReferralList({ message }) { return <Root message={message}><Rows count={3} /></Root>; }
function Tcl({ message, options }) {
  return <Root message={message}><Heading actions={0} /><Toolbar action={false} />
    <TableBody {...TABLE_SKELETON_PROFILES.tcl} {...options} />
    <div className="grid gap-4 xl:grid-cols-2"><TableBody columns={5} rows={5} minWidth={780} mobileCards={false} footer={false} /><TableBody columns={5} rows={5} minWidth={780} mobileCards={false} footer={false} /></div>
  </Root>;
}
export function ModuleSkeleton({ message = "Loading..." }) { return <Root message={message}><Heading /><Info fields={6} narrative /></Root>; }

export function PageSkeletonLoader({ message = "Loading...", skeleton, bodyOnly = false, className = "", options = {} }) {
  const name = resolveSkeletonVariant(skeleton);
  let content;
  if (name === "profile-referrals" && options.view === "list") content = <ProfileReferralList message={message} />;
  else if (name === "tcl") content = <Tcl message={message} options={options} />;
  else if (TABLE_SKELETON_PROFILES[name]) content = <TableSkeleton message={message} profile={name} {...options} />;
  else if (name.endsWith("-dashboard") || name === "dashboard") content = <DashboardSkeleton message={message} role={name === "dashboard" ? options.role : name.split("-")[0]} />;
  else if (name === "patients") content = <PatientDirectory message={message} options={options} />;
  else if (name === "patient-details") content = <PatientDetailsSkeleton message={message} {...options} />;
  else if (name === "facilities") content = <FacilitiesSkeleton message={message} {...options} />;
  else if (name === "medicine-details") content = <MedicineDetails message={message} />;
  else if (name === "reports") content = <ReportsSkeleton message={message} {...options} />;
  else if (name === "admin-reports") content = <AdminReports message={message} />;
  else if (name === "follow-ups") content = <FollowUpsSkeleton message={message} {...options} />;
  else if (name === "doctor-calendar") content = <DoctorCalendar message={message} />;
  else if (name === "notifications") content = <Notifications message={message} bodyOnly={bodyOnly} />;
  else if (name === "family-details") content = <FamilyDetails message={message} options={options} />;
  else if (name === "referral-form") content = <ReferralForm message={message} />;
  else if (name === "feedback-form") content = <FeedbackForm message={message} {...options} />;
  else if (name === "family-form") content = <FamilyForm message={message} />;
  else if (name === "referral-slip") content = <ReferralSlip message={message} />;
  else if (name === "patient-registration") content = <PatientRegistrationSkeleton message={message} />;
  else if (["form", "assignment-form", "account-form"].includes(name)) content = <FormSkeleton message={message} profile={name} {...options} />;
  else if (["details", "record-details", "referral-details", "monitoring-handoff"].includes(name)) content = <DetailsSkeleton message={message} profile={name} {...options} />;
  else content = <ModuleSkeleton message={message} />;
  return <Nested.Provider value={bodyOnly}><div className={`min-w-0 ${className}`}>{content}</div></Nested.Provider>;
}
