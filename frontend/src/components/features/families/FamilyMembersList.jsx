import { ActionMenu } from "../../common";
import { patientName } from "../../../services/familyRegistry";
import { formatLongDate } from "../../../utils/formatters";
import { HEAD_TRANSFER_MESSAGE } from "../../../utils/householdTransfer";

const COLUMNS = "sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_2.5rem]";

// Ledger rows under a column header, one Actions menu per member. Members arrive already ordered (head first).
export default function FamilyMembersList({ members, headId, canTransfer, onTransfer, patientPath = "/bhc/patients" }) {
  if (!members.length) return <p className="rounded-card border border-neutral-200 bg-white px-6 py-10 text-center text-sm text-neutral-500" role="status">No members registered in this household.</p>;
  return <div role="table" aria-label="Household members" className="overflow-hidden rounded-card border border-neutral-200 bg-white shadow-[var(--shadow-card)]">
    <div role="row" className={`hidden h-11 items-center gap-x-4 bg-neutral-100 px-4 text-[10px] font-bold uppercase tracking-wider text-neutral-600 sm:grid ${COLUMNS}`}>
      <span role="columnheader">Member</span><span role="columnheader">Relationship to head</span><span role="columnheader">Date of birth</span><span role="columnheader" className="sr-only">Actions</span>
    </div>
    <ul role="rowgroup" className="divide-y divide-neutral-200">
      {members.map((member) => {
        const name = patientName(member);
        const isHead = member.id === headId;
        const actions = [
          { label: "View Patient Details", to: `${patientPath}/${member.id}?tab=patient-info` },
          ...(canTransfer ? [{
            label: "Transfer Household", onClick: () => onTransfer(member), disabled: isHead,
            title: HEAD_TRANSFER_MESSAGE, reason: isHead ? HEAD_TRANSFER_MESSAGE : undefined,
          }] : []),
        ];
        return <li key={member.id} role="row" className={`grid min-h-14 items-center gap-x-4 gap-y-0.5 px-4 py-2 text-sm ${COLUMNS}`}>
          <p role="cell" className="flex min-w-0 items-center gap-2"><span className="truncate font-semibold text-ink-800">{name}</span>{isHead && <span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-800">Head</span>}</p>
          <p role="cell" className="min-w-0 truncate text-neutral-600">{isHead ? <span aria-label="Household head">—</span> : member.relationshipToHouseholdHead || "Relationship not recorded"}</p>
          <p role="cell" className="min-w-0 truncate text-neutral-600">{formatLongDate(member.birthDate, "Date of birth not recorded")}{member.age != null && member.birthDate ? ` · ${member.age} yrs` : ""}</p>
          <div role="cell" className="flex items-center sm:justify-end"><ActionMenu showHeader={false} title={name} triggerLabel={`Actions for ${name}`} actions={actions} /></div>
        </li>;
      })}
    </ul>
  </div>;
}
