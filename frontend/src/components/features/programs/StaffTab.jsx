import { useState } from "react";
import { Plus, X } from "lucide-react";

import { EmptyNote, ProfileSection } from "../patients/profile/ProfileSection";

function StaffRow({ name, role, onRemove }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{name}</p>
        {role && <p className="text-xs text-gray-500">{role}</p>}
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-gray-400 transition hover:bg-[#FEF2F2] hover:text-[#B91C1C]"
        >
          <X size={13} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

function AddStaffForm({ onAdd, submitting }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (!name.trim()) return;
    await onAdd({ name: name.trim(), role: role.trim() });
    setName("");
    setRole("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-[#E5E7EB] p-3">
      <div className="min-w-[9rem] flex-1">
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
          Staff Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Juana Dela Cruz"
          className="h-9 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm text-[#1F2937] outline-none focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10"
        />
      </div>
      <div className="min-w-[8rem] flex-1">
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
          Role
        </label>
        <input
          type="text"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          placeholder="e.g. BHW"
          className="h-9 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm text-[#1F2937] outline-none focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10"
        />
      </div>
      <button
        type="submit"
        disabled={submitting || !name.trim()}
        className="inline-flex h-9 items-center gap-1 rounded-none bg-red-600 px-3 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus size={12} aria-hidden="true" />
        Add
      </button>
    </form>
  );
}

/**
 * Program staff, split into two clearly separate groups: RHU Assigned Staff
 * (owned by the RHU when the program was published - read-only here) and
 * BHC Staff (this facility's own local assignments - free-text for now,
 * since no BHC staff roster endpoint exists yet). BHC users may only add or
 * remove BHC Staff rows.
 */
export default function StaffTab({ program, onAddStaff, onRemoveStaff, mutating = false }) {
  return (
    <ProfileSection id="program-staff-rhu" title="RHU Assigned Staff" meta="Managed by the RHU">
      {program.rhuStaff.length === 0 ? (
        <EmptyNote>No RHU staff assigned to this program.</EmptyNote>
      ) : (
        <ul className="divide-y divide-gray-100">
          {program.rhuStaff.map((staff) => (
            <StaffRow key={staff.id} name={staff.name} role={staff.role} />
          ))}
        </ul>
      )}

      <div className="mt-5 border-t border-gray-100 pt-5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600 font-sans!">
          BHC Staff
        </h3>
        {program.bhcStaff.length === 0 ? (
          <EmptyNote>No BHC staff assigned yet.</EmptyNote>
        ) : (
          <ul className="mb-3 divide-y divide-gray-100">
            {program.bhcStaff.map((staff) => (
              <StaffRow
                key={staff.id}
                name={staff.name}
                role={staff.role}
                onRemove={() => onRemoveStaff(staff.id)}
              />
            ))}
          </ul>
        )}
        <AddStaffForm onAdd={onAddStaff} submitting={mutating} />
      </div>
    </ProfileSection>
  );
}
