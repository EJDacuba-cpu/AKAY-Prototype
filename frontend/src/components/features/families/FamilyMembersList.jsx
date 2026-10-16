import { Link } from "react-router";
import { patientName } from "../../../services/familyRegistry";
import { formatLongDate } from "../../../utils/formatters";

// Compact horizontal rows. Members arrive already ordered (head first).
export default function FamilyMembersList({ members, headId, canManage, familyPath }) {
  if (!members.length) return <p className="py-8 text-sm text-neutral-500" role="status">No members registered in this household.</p>;
  return <ul className="divide-y divide-neutral-200 border-y border-neutral-200" aria-label="Household members">
    {members.map((member) => {
      const name = patientName(member);
      return <li key={member.id} className="grid items-center gap-x-4 gap-y-1 py-3 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_auto]">
        <p className="min-w-0 truncate font-medium">{name}{member.id === headId && <span className="ml-2 text-xs font-normal text-red-700">Head</span>}</p>
        <p className="min-w-0 truncate text-neutral-600">{member.relationshipToHouseholdHead || "Relationship not recorded"}</p>
        <p className="min-w-0 truncate text-neutral-600">{formatLongDate(member.birthDate, "Date of birth not recorded")}{member.age != null && member.birthDate ? ` · ${member.age} yrs` : ""}</p>
        <div className="flex items-center gap-4 sm:justify-end">
          {canManage && <Link to={`${familyPath}/members/${member.id}/edit`} className="text-xs text-neutral-600 underline">Edit connections<span className="sr-only"> for {name}</span></Link>}
          <Link to={`/bhc/patients/${member.id}?tab=patient-info`} className="font-medium text-red-700 underline">View Details<span className="sr-only"> for {name}</span></Link>
        </div>
      </li>;
    })}
  </ul>;
}
