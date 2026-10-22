import { ActionMenu } from "../../common";
import { patientName } from "../../../services/familyRegistry";
import { formatLongDate } from "../../../utils/formatters";
import { HEAD_TRANSFER_MESSAGE } from "../../../utils/householdTransfer";

// Compact horizontal rows with one Actions menu per member. Members arrive already ordered (head first).
export default function FamilyMembersList({ members, headId, canManage, canTransfer, onTransfer, familyPath, patientPath = "/bhc/patients" }) {
  if (!members.length) return <p className="py-8 text-sm text-neutral-500" role="status">No members registered in this household.</p>;
  return <ul className="divide-y divide-neutral-200 border-y border-neutral-200" aria-label="Household members">
    {members.map((member) => {
      const name = patientName(member);
      const isHead = member.id === headId;
      const actions = [
        { label: "View Patient Details", to: `${patientPath}/${member.id}?tab=patient-info` },
        ...(canManage ? [{ label: "Edit Connections", to: `${familyPath}/members/${member.id}/edit` }] : []),
        ...(canTransfer ? [{
          label: "Transfer Household", onClick: () => onTransfer(member), disabled: isHead,
          title: HEAD_TRANSFER_MESSAGE,
        }] : []),
      ];
      return <li key={member.id} className="grid items-center gap-x-4 gap-y-1 py-3 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_auto]">
        <p className="min-w-0 truncate font-medium">{name}{isHead && <span className="ml-2 text-xs font-normal text-red-700">Head</span>}</p>
        <p className="min-w-0 truncate text-neutral-600">{member.relationshipToHouseholdHead || "Relationship not recorded"}</p>
        <p className="min-w-0 truncate text-neutral-600">{formatLongDate(member.birthDate, "Date of birth not recorded")}{member.age != null && member.birthDate ? ` · ${member.age} yrs` : ""}</p>
        <div className="flex items-center sm:justify-end"><ActionMenu showHeader={false} title={name} triggerLabel={`Actions for ${name}`} actions={actions} /></div>
      </li>;
    })}
  </ul>;
}
