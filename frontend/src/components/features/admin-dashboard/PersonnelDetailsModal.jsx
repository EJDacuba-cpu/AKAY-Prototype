import { createPortal } from "react-dom";
import ModalShell, { ModalButton } from "../../common/modals/ModalShell";
import AccountStatusBadge from "../accounts/AccountStatusBadge";

export default function PersonnelDetailsModal({ facility, role, onClose }) {
  const people = facility.personnel.filter((person) => person.staff_role === role.key);

  // Escape animated/scrolling dashboard ancestors so the modal centers on the viewport.
  return createPortal(
    <ModalShell
      appearance="plain"
      title={`${role.label} personnel`}
      subtitle={facility.name}
      size="lg"
      onClose={onClose}
      footer={<ModalButton onClick={onClose}>Close</ModalButton>}
    >
      {people.length === 0 ? (
        <div className="py-6 text-center">
          <p className="font-semibold text-[var(--color-text)]">No {role.label} personnel assigned</p>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">There are no {role.label} accounts assigned to {facility.name}.</p>
        </div>
      ) : (
        <ul aria-label={`${role.label} personnel at ${facility.name}`} className="divide-y divide-[var(--color-border)]">
          {people.map((person) => (
            <li key={person.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
              <span className="min-w-0 break-words font-medium text-[var(--color-text)]">{person.name}</span>
              <AccountStatusBadge status={person.status === "active" ? "Active" : person.status === "inactive" ? "Inactive" : "Not recorded"} />
            </li>
          ))}
        </ul>
      )}
    </ModalShell>,
    document.body,
  );
}
