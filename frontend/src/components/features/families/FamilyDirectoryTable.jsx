import { Link } from "react-router";
import { SquareArrowOutUpRight } from "lucide-react";
import FixedTable from "../../common/tables/FixedTable";
import { addressText, patientName } from "../../../services/familyRegistry";

// One ledger row per household. Uses the shared FixedTable page (10 × 56px rows)
// plus TablePagination, same as the other module lists.
export default function FamilyDirectoryTable({
  items,
  base,
  footer,
  dimmed = false,
}) {
  return (
    <div
      className={`overflow-hidden rounded-card border border-neutral-200 bg-white shadow-[var(--shadow-card)] transition-opacity ${
        dimmed ? "opacity-60" : ""
      }`}
    >
      <FixedTable minWidth="min-w-[720px]">
        <thead className="h-11 bg-neutral-100 text-[10px] font-bold uppercase tracking-wide text-neutral-600">
          <tr>
            <th scope="col" className="px-4">
              Household
            </th>
            <th scope="col" className="hidden px-3 sm:table-cell">
              FSN
            </th>
            <th scope="col" className="hidden px-3 md:table-cell">
              Address
            </th>
            <th scope="col" className="px-3 text-right">
              Members
            </th>
            <th scope="col" className="px-2 text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {items.map((item) => {
            const head = item.members.find(
              (member) => member.id === item.headPatientId,
            );
            const name = head ? `${head.lastName} Household` : "Household";
            const headName = head ? patientName(head) : "Not assigned";
            const to = `${base}/${item.id}`;
            const address = addressText(item.address);
            return (
              <tr
                key={item.id}
                className="group h-14 transition-colors hover:bg-neutral-50 has-[a:focus-visible]:bg-neutral-50"
              >
                <td className="px-4">
                  <div className="min-w-0">
                    <Link
                      to={to}
                      title={name}
                      className="block truncate rounded-sm text-sm font-semibold text-ink-800 outline-none underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ink-400/50"
                    >
                      {name}
                    </Link>
                    <p
                      className="mt-0.5 truncate text-[11px] text-neutral-600"
                      title={`Head: ${headName}`}
                    >
                      Head: {headName}
                    </p>
                  </div>
                </td>
                <td className="hidden px-3 font-mono text-xs text-neutral-500 sm:table-cell">
                  {item.serialNumber}
                </td>
                <td className="hidden max-w-0 px-3 text-sm text-neutral-600 md:table-cell">
                  <p className="truncate" title={address}>
                    {address || "No address recorded"}
                  </p>
                </td>
                <td className="px-3 text-right text-sm font-medium tabular-nums text-ink-800">
                  {item.members.length}
                </td>
                <td className="px-2 text-right">
                  <Link
                    to={to}
                    aria-label={`View ${name}`}
                    className="inline-flex items-center gap-1 rounded-sm text-[13px] font-medium text-ink-800 outline-none underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ink-400/50"
                  >
                    View
                    <SquareArrowOutUpRight size={13} strokeWidth={2.25} aria-hidden="true" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </FixedTable>
      {footer}
    </div>
  );
}
