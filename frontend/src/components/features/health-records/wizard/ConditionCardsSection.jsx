import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, ClipboardList, Hospital, Pencil, Plus, Save, Trash2 } from "lucide-react";

import { ModalShell } from "../../../common";
import { Button } from "../../../ui/button";
import { Card } from "../../../ui/card";
import { Input } from "../../../ui/input";
import { FieldError } from "../fields/ClinicalFields";
import { CONDITION_OUTCOMES, conditionCardErrors } from "../../../../utils/conditionCards";
import { DIAGNOSIS_LIMITS } from "../../../../utils/diagnoses";
import { entryDestinations, newReportingEntry, REPORT_DESTINATIONS, toggleDestination } from "../../../../utils/reportingEntries";

const REPORTS = {
  morbidity: { label: "Morbidity Report", description: "Include this health problem in morbidity reporting." },
  notifiable: { label: "Notifiable Disease Report", description: "Include this suspected case in notifiable disease reporting." },
  surveillance: { label: "Community-Based Surveillance", description: "Include this health problem in community surveillance." },
};

function OutcomeBadge({ value }) {
  const referred = value === "refer_to_rhu";
  return <span className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${referred ? "bg-red-100 text-red-700" : value === "managed_at_bhc" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600"}`}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{CONDITION_OUTCOMES[value] || "Choose outcome"}</span>;
}

function ConditionModal({ entry, entries, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({ ...entry, reportIn: entryDestinations(entry), clinicalOutcome: entry.clinicalOutcome || "" }));
  const [errors, setErrors] = useState({});
  const nameRef = useRef(null);
  const key = `reportingEntry.${draft.id}`;
  function save() {
    const next = [...entries.filter((item) => item.id !== draft.id), draft];
    const checked = conditionCardErrors(next);
    const own = Object.fromEntries(Object.entries(checked).filter(([field]) => field.startsWith(`${key}.`)));
    if (Object.keys(own).length) {
      setErrors(own);
      nameRef.current?.focus();
      return;
    }
    onSave({ ...draft, name: draft.name.trim() });
  }
  return createPortal(
    <ModalShell
      title={entries.some((item) => item.id === entry.id) ? "Edit Clinical Condition & Classification" : "Add Clinical Condition & Classification"}
      subtitle="Record the reported health problem, reporting classifications, and clinical outcome."
      size="2xl" onClose={onClose} initialFocusRef={nameRef}
      panelClassName="rounded-none [&>header]:bg-[#EFF4FF] [&>header]:text-[#0B1C30] [&>header_h2]:text-[#0B1C30] [&>header_p]:text-[#545F73] [&>header_button]:text-[#545F73] [&>footer]:bg-[#EFF4FF]"
      bodyClassName="space-y-5"
      footer={<><Button type="button" variant="outline" className="rounded-none" onClick={onClose}>Cancel</Button><Button type="button" className="rounded-none bg-[#DC2626] hover:bg-red-700" onClick={save}><Save size={15} />Save Condition</Button></>}
    >
      <div>
        <label htmlFor={`${draft.id}-name`} className="mb-2 block text-sm font-semibold text-[#0B1C30]">Reported Health Problem / Suspected Case <span className="text-red-600">*</span></label>
        <Input id={`${draft.id}-name`} ref={nameRef} value={draft.name || ""} maxLength={150} autoComplete="off" aria-invalid={Boolean(errors[`${key}.name`] || errors[`${key}.duplicate`])} className="rounded-none" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
        <FieldError error={errors[`${key}.name`] || errors[`${key}.duplicate`]} />
      </div>
      <fieldset className="border-t border-[#E5EEFF] pt-4">
        <legend className="float-left mb-1 w-full text-sm font-semibold text-[#0B1C30]">Reporting Classification (check all applicable)</legend>
        <p className="clear-both text-xs text-[#545F73]">Choose the existing reports this health problem belongs to.</p>
        <div className="mt-3 space-y-2">
          {REPORT_DESTINATIONS.map((destination) => <label key={destination} className="flex cursor-pointer items-start gap-3 p-2 hover:bg-slate-50"><input type="checkbox" checked={entryDestinations(draft).includes(destination)} onChange={(event) => setDraft((current) => toggleDestination(current, destination, event.target.checked))} className="mt-1 h-4 w-4 accent-[#B70011]" /><span><span className="block text-sm font-semibold text-[#0B1C30]">{REPORTS[destination].label}</span><span className="mt-1 block text-xs text-[#545F73]">{REPORTS[destination].description}</span></span></label>)}
        </div>
        <FieldError error={errors[`${key}.reportIn`]} />
      </fieldset>
      <fieldset className="border-t border-[#E5EEFF] pt-4">
        <legend className="float-left mb-1 w-full text-sm font-semibold text-[#0B1C30]">Clinical Outcome <span className="text-red-600">*</span></legend>
        <p className="clear-both text-xs text-[#545F73]">Choose local BHC care or referral to an RHU.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {Object.entries(CONDITION_OUTCOMES).map(([value, label]) => {
            const selected = draft.clinicalOutcome === value;
            const Icon = value === "refer_to_rhu" ? Hospital : Building2;
            return <label key={value} className={`cursor-pointer border p-3 ${selected ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}><span className="flex items-center gap-2 text-sm font-bold text-[#0B1C30]"><Icon size={16} />{label}<input type="radio" name={`${draft.id}-outcome`} value={value} checked={selected} onChange={() => setDraft((current) => ({ ...current, clinicalOutcome: value }))} className="ml-auto h-4 w-4 accent-[#B70011]" /></span><span className="mt-2 block text-xs leading-5 text-[#545F73]">{value === "refer_to_rhu" ? "Uses the shared RHU referral on Care and Outcome." : "Uses the shared BHC return schedule on Care and Outcome."}</span></label>;
          })}
        </div>
        <FieldError error={errors[`${key}.clinicalOutcome`]} />
      </fieldset>
    </ModalShell>, document.body,
  );
}

/** Read-only summary: condition changes belong to the preceding wizard screen. */
export function ConditionSummaryPanel({ entries = [] }) {
  const groups = [
    ...Object.entries(CONDITION_OUTCOMES).map(([value, label]) => ({ label, entries: entries.filter((entry) => entry.clinicalOutcome === value) })),
    { label: "Outcome not selected", entries: entries.filter((entry) => !Object.hasOwn(CONDITION_OUTCOMES, entry.clinicalOutcome || "")) },
  ];
  return (
    <aside aria-label="Added conditions" className="mt-4 min-h-0 min-w-0 lg:sticky lg:top-3 lg:mt-0 lg:max-h-[calc(100dvh-13rem)]">
      <Card className="flex h-[400px] max-h-full flex-col overflow-hidden rounded-none">
        <div className="shrink-0 border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-[#111827]">Added Conditions</h2>
          <p className="mt-1 text-xs leading-5 text-[#6B7280]">Use Previous to edit or remove conditions.</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
        {entries.length === 0 && <p className="p-4 text-xs text-[#6B7280]">No conditions added yet.</p>}
        {groups.filter((group) => group.entries.length > 0).map((group) => (
          <section key={group.label} aria-label={group.label} className="border-b border-slate-200 px-4 py-3 last:border-b-0">
            <h3 className="text-xs font-semibold text-[#374151]">{group.label}</h3>
            <ul className="mt-2 space-y-2">
              {group.entries.map((entry) => <li key={entry.id} className="break-words border-l-2 border-slate-200 pl-2 text-sm text-[#111827]">{entry.name}</li>)}
            </ul>
          </section>
        ))}
        </div>
      </Card>
    </aside>
  );
}

export default function ConditionCardsSection({ entries = [], errors = {}, disabled = false, onChange, heading = null }) {
  const [editing, setEditing] = useState(null);
  function updateEntry(entry) {
    onChange(entries.some((item) => item.id === entry.id) ? entries.map((item) => item.id === entry.id ? entry : item) : [...entries, entry]);
  }
  function save(entry) {
    updateEntry(entry);
    setEditing(null);
  }
  return <section aria-label="Clinical conditions and reporting" className="space-y-4" data-field="diagnoses" tabIndex={errors.diagnoses ? -1 : undefined}>
    <div className="flex items-start justify-between gap-3">
      {heading || (entries.length > 0 && <p className="text-xs text-[#708095]">{entries.length} condition{entries.length === 1 ? "" : "s"} in this consultation</p>)}
      <Button type="button" disabled={disabled || entries.length >= DIAGNOSIS_LIMITS.count} onClick={() => setEditing(newReportingEntry())} className="ml-auto shrink-0 rounded-none bg-[#DC2626] hover:bg-red-700"><Plus size={15} />Add Condition</Button>
    </div>
    {heading && entries.length > 0 && <p className="text-xs text-[#708095]">{entries.length} condition{entries.length === 1 ? "" : "s"} in this consultation</p>}
    {entries.length === 0 ? (
      <div className="flex min-h-64 flex-col items-center justify-center px-4 py-12 text-center">
        <ClipboardList size={32} className="mb-3 text-slate-400" aria-hidden="true" />
        <p role="status" className="text-sm font-semibold text-[#0B1C30]">No conditions added yet</p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-[#708095]">Select Add Condition to record a health problem or suspected case.</p>
      </div>
    ) : (
      <div className="grid items-start gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
        {entries.map((entry) => {
          const key = `reportingEntry.${entry.id}`;
          const cardErrors = Object.entries(errors).filter(([field]) => field.startsWith(`${key}.`));
          return <Card key={entry.id} data-field={cardErrors[0]?.[0]} tabIndex={cardErrors.length ? -1 : undefined} className="@container min-w-0 rounded-none border-slate-200 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <OutcomeBadge value={entry.clinicalOutcome} />
              <div className="flex shrink-0 gap-1">
                <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={`Edit ${entry.name}`} onClick={() => setEditing(entry)} className="h-7 w-7 rounded-none text-slate-500"><Pencil size={14} /></Button>
                <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={`Remove ${entry.name}`} onClick={() => onChange(entries.filter((item) => item.id !== entry.id))} className="h-7 w-7 rounded-none text-slate-500 hover:text-red-600"><Trash2 size={14} /></Button>
              </div>
            </div>
            <h3 className="mt-3 break-words text-lg font-bold leading-6 text-[#0B1C30]">{entry.name}</h3>
            <div className="mt-3 flex flex-wrap gap-1.5">{entryDestinations(entry).map((destination) => <span key={destination} className={`px-1.5 py-1 text-[10px] font-medium tracking-wide ${destination === "notifiable" ? "bg-red-100 text-red-700" : "bg-[#EFF4FF] text-[#545F73]"}`}>{REPORTS[destination].label}</span>)}</div>
            {cardErrors.map(([field, message]) => <FieldError key={field} error={message} />)}
          </Card>;
        })}
      </div>
    )}
    {errors.diagnoses && <div role="alert"><FieldError error={errors.diagnoses} /></div>}
    {editing && !disabled && <ConditionModal key={editing.id} entry={editing} entries={entries} onSave={save} onClose={() => setEditing(null)} />}
  </section>;
}
