import { Link } from "react-router";
import { MapPin, Users } from "lucide-react";
import { addressText, patientName } from "../../../services/familyRegistry";
import { Button } from "../../ui/button";

// Preview of the selected household beside the directory, from the list row already in memory.
export default function FamilySummaryPanel({ item, base, showTitle = false }) {
  const head = item.members.find((member) => member.id === item.headPatientId);
  const name = head ? `${head.lastName} Household` : "Household";
  const address = addressText(item.address);
  const others = item.members.filter((member) => member.id !== item.headPatientId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <div className="min-w-0">
          {showTitle && <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Family Summary</p>}
          <h2 className="mt-1 text-base font-bold leading-tight text-ink-800 [overflow-wrap:anywhere]">{name}</h2>
          <p className="mt-1 font-mono text-xs text-neutral-600">{item.serialNumber}</p>
        </div>
        <dl className="space-y-3 text-[13px]">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Household head</dt>
            <dd className="mt-0.5 font-medium text-ink-800">{head ? patientName(head) : "Not assigned"}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500"><MapPin size={12} aria-hidden="true" />Address</dt>
            <dd className="mt-0.5 text-neutral-700 [overflow-wrap:anywhere]">{address || "No address recorded"}</dd>
          </div>
        </dl>
        <section aria-labelledby="family-summary-members">
          <h3 id="family-summary-members" className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500"><Users size={12} aria-hidden="true" />Members ({item.members.length})</h3>
          {others.length ? (
            <ul className="mt-2 divide-y divide-neutral-200 border-y border-neutral-200">
              {others.map((member) => (
                <li key={member.id} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                  <span className="min-w-0 truncate font-medium text-ink-800">{patientName(member)}</span>
                  <span className="shrink-0 text-xs text-neutral-500">{member.relationshipToHouseholdHead || "Not recorded"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] text-neutral-500">{head ? "The head is the only member so far." : "No members registered."}</p>
          )}
        </section>
      </div>
      <div className="border-t border-neutral-200 bg-white px-4 py-3">
        <Button asChild variant="brand" className="w-full">
          <Link to={`${base}/${item.id}`}>Open Family</Link>
        </Button>
      </div>
    </div>
  );
}
