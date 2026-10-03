import { useState } from "react";
import { ChevronDown, ChevronRight, ShieldAlert } from "lucide-react";

import { OverviewNote } from "./OverviewCard";
import { NO_ALLERGY_PATTERN } from "../PatientAlertChips";
import { summarizeMedicines } from "../../../../utils/medicationSummary";
import { formatShortDate } from "../../../../utils/patientProfile";

const CONDITION_STATUS_TONE = {
  Active: "border-red-200 bg-red-50 text-red-700",
  Controlled: "border-amber-200 bg-amber-50 text-amber-700",
  Resolved: "border-green-200 bg-green-50 text-green-700",
};

const CHIP = "shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

/**
 * One dropdown of the facts column. The header is the toggle; open sections
 * split the column height by `share` and scroll inside, a closed one is just
 * its header, so opening or closing never moves anything beside the column.
 */
function CollapsibleSection({ id, title, count, alert = false, share, children }) {
  const [open, setOpen] = useState(true);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <section
      aria-labelledby={`${id}-title`}
      style={open ? { flexGrow: share, minHeight: 72 } : undefined}
      className={`flex min-h-0 flex-col border-b border-gray-100 last:border-b-0 ${open ? "basis-0" : "shrink-0"}`}
    >
      <h3 id={`${id}-title`} className="shrink-0 font-sans!">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-1.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-600/40"
        >
          <Chevron size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
          {alert && <ShieldAlert size={13} className="shrink-0 text-red-700" aria-hidden="true" />}
          <span
            className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${alert ? "text-red-700" : "text-slate-500"}`}
          >
            {title}
          </span>
          {count ? <span className="text-[11px] tabular-nums text-slate-400">{count}</span> : null}
        </button>
      </h3>
      {open && (
        <div
          id={`${id}-panel`}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2 pl-5 [scrollbar-width:thin]"
        >
          {children}
        </div>
      )}
    </section>
  );
}

function ConditionsBody({ diseases }) {
  if (diseases.length === 0) return <OverviewNote>No documented conditions yet.</OverviewNote>;
  return (
    <ul className="divide-y divide-gray-100">
      {diseases.map((disease, index) => {
        const meta = [
          disease.firstRecorded && `First noted ${formatShortDate(disease.firstRecorded)}`,
          disease.lastConfirmed && `Confirmed ${formatShortDate(disease.lastConfirmed)}`,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <li key={`${disease.name}-${index}`} className="py-1 first:pt-0">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 break-words text-sm font-semibold text-slate-900">{disease.name}</span>
              {disease.status && (
                <span className={`${CHIP} ${CONDITION_STATUS_TONE[disease.status] || "border-slate-200 bg-slate-50 text-slate-600"}`}>
                  {disease.status}
                </span>
              )}
            </div>
            {meta && <p className="mt-0.5 text-[11px] text-slate-500">{meta}</p>}
          </li>
        );
      })}
    </ul>
  );
}

function AllergiesBody({ text, recorded }) {
  if (recorded) return <p className="break-words text-[13px] font-semibold leading-snug text-red-700">{text}</p>;
  return <OverviewNote>{text ? "No known allergies" : "Allergies not recorded"}</OverviewNote>;
}

function MedicationsBody({ summary, isLoading }) {
  if (isLoading && summary.count === 0) return <OverviewNote role="status">Loading medicines...</OverviewNote>;
  if (summary.count === 0) return <OverviewNote>No medicines recorded.</OverviewNote>;
  return (
    <div className="space-y-1.5">
      {summary.visits.map((visit) => (
        <div key={visit.recordId}>
          <p className="text-[11px] font-semibold tabular-nums text-slate-500">
            {formatShortDate(visit.date, "Date not recorded")}
          </p>
          <ul className="divide-y divide-gray-100">
            {visit.items.map((item) => (
              <li
                key={item.id}
                title={item.remarks || undefined}
                className="flex items-baseline justify-between gap-2 py-0.5 text-xs"
              >
                <span className="min-w-0 break-words text-slate-900">{item.name}</span>
                {item.amount && <span className="shrink-0 tabular-nums text-slate-500">{item.amount}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * The dropdowns beside the body figure: Current Conditions, Findings,
 * Allergies and Medications, all open to start with. Everything shown is
 * something a health worker recorded; Medications lists the medicines
 * dispensed on the visits loaded for this profile (newest first), not what the
 * patient takes now. Findings is owned by the figure (its rows drive the
 * figure's reveal), so the caller passes it in as
 * `findings = { title, count, content }`.
 */
export default function PatientFactsSections({ background, records = [], recordsLoading = false, findings }) {
  const diseases = Array.isArray(background?.currentDiseases) ? background.currentDiseases : [];
  const allergyText = String(background?.allergies || "").trim();
  const allergyRecorded = Boolean(allergyText) && !NO_ALLERGY_PATTERN.test(allergyText);
  const medicines = summarizeMedicines(records);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CollapsibleSection id="overview-conditions" title="Current Conditions" count={diseases.length} share={3}>
        <ConditionsBody diseases={diseases} />
      </CollapsibleSection>
      {findings && (
        <CollapsibleSection id="overview-findings" title={findings.title} count={findings.count} share={2.5}>
          {findings.content}
        </CollapsibleSection>
      )}
      <CollapsibleSection id="overview-allergies" title="Allergies" alert={allergyRecorded} share={1.5}>
        <AllergiesBody text={allergyText} recorded={allergyRecorded} />
      </CollapsibleSection>
      <CollapsibleSection id="overview-medications" title="Medications" count={medicines.count} share={3}>
        <MedicationsBody summary={medicines} isLoading={recordsLoading} />
      </CollapsibleSection>
    </div>
  );
}
