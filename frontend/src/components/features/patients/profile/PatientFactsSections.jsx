import { useState } from "react";
import { ChevronDown, ChevronRight, ShieldAlert } from "lucide-react";

import { OverviewNote } from "./OverviewCard";
import MedicalConditionsGroups from "../MedicalConditionsGroups";
import { isNoAllergyText } from "../../../../utils/allergies";
import { summarizeMedicines } from "../../../../utils/medicationSummary";
import { formatShortDate } from "../../../../utils/patientProfile";

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
      style={open ? { "--share": share, minHeight: 72 } : undefined}
      className={`flex min-h-0 flex-col border-b border-neutral-100 last:border-b-0 ${open ? "grow-(--share) basis-0 flow:grow-0 flow:basis-auto" : "shrink-0"}`}
    >
      <h3 id={`${id}-title`} className="shrink-0 font-sans!">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-1.5 rounded-md py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-400/50"
        >
          <Chevron size={14} className="shrink-0 text-neutral-400" aria-hidden="true" />
          {alert && <ShieldAlert size={14} className="shrink-0 text-alert-600" aria-hidden="true" />}
          <span
            className={`text-[13px] font-semibold ${alert ? "text-alert-700" : "text-neutral-900"}`}
          >
            {title}
          </span>
          {count ? <span className="rounded-full bg-neutral-100 px-1.5 text-[11px] font-medium tabular-nums text-neutral-600">{count}</span> : null}
        </button>
      </h3>
      {open && (
        <div
          id={`${id}-panel`}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2 pl-5 [scrollbar-width:thin] flow:overflow-visible"
        >
          {children}
        </div>
      )}
    </section>
  );
}

function AllergiesBody({ text, recorded }) {
  if (recorded) return <p className="break-words rounded-lg bg-alert-50 px-2.5 py-1.5 text-[13px] font-medium leading-snug text-alert-700">{text}</p>;
  return <OverviewNote>{text ? "No known allergies" : "Allergies not recorded"}</OverviewNote>;
}

function MedicationsBody({ summary, isLoading }) {
  if (isLoading && summary.count === 0) return <OverviewNote role="status">Loading medicines...</OverviewNote>;
  if (summary.count === 0) return <OverviewNote>No medicines recorded.</OverviewNote>;
  return (
    <div className="space-y-1.5">
      {summary.visits.map((visit) => (
        <div key={visit.recordId}>
          <p className="text-xs font-medium tabular-nums text-neutral-500">
            {formatShortDate(visit.date, "Date not recorded")}
          </p>
          <ul className="divide-y divide-neutral-100">
            {visit.items.map((item) => (
              <li
                key={item.id}
                title={item.remarks || undefined}
                className="flex items-baseline justify-between gap-2 py-1 text-[13px]"
              >
                <span className="min-w-0 break-words text-neutral-900">{item.name}</span>
                {item.amount && <span className="shrink-0 tabular-nums text-neutral-500">{item.amount}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * The dropdowns beside the body figure: Medical Conditions, Findings,
 * Allergies and Medications, all open to start with. Everything shown is
 * something a health worker recorded; Medications lists the medicines
 * dispensed on the visits loaded for this profile (newest first), not what the
 * patient takes now. Findings is owned by the figure (its rows drive the
 * figure's reveal), so the caller passes it in as
 * `findings = { title, count, content }`.
 */
export default function PatientFactsSections({ background, conditions, records = [], recordsLoading = false, findings }) {
  const groups = conditions?.groups;
  const conditionCount = (groups?.confirmed.length || 0) + (groups?.legacyPending?.length || 0) + (groups?.underEvaluation.length || 0);
  const allergyText = String(background?.allergies || "").trim();
  const allergyRecorded = Boolean(allergyText) && !isNoAllergyText(allergyText);
  const medicines = summarizeMedicines(records);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CollapsibleSection id="overview-conditions" title="Medical conditions" count={conditionCount} share={3}>
        <MedicalConditionsGroups groups={groups} isLoading={conditions?.isLoading} isError={conditions?.isError} />
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
