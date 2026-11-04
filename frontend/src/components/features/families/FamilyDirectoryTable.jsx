import { Link } from "react-router";
import { ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown } from "lucide-react";
import { addressText, patientName } from "../../../services/familyRegistry";
import { Button } from "../../ui/button";
import { tableBodyHeight } from "../../../utils/tablePaging";

// A header that sorts on the server, so the order holds across every page of households.
function SortHeader({ column, label, sort, onSort, className = "" }) {
  const active = sort.key === column;
  const Icon = !active
    ? ChevronsUpDown
    : sort.direction === "asc"
      ? ChevronUp
      : ChevronDown;
  return (
    <th
      scope="col"
      aria-sort={
        active
          ? sort.direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
      className={className}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`-mx-1 inline-flex items-center gap-1 rounded-full px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide outline-none transition-colors hover:text-ink-800 focus-visible:ring-2 focus-visible:ring-ink-400/50 ${
          active ? "text-ink-800" : "text-neutral-600"
        }`}
      >
        {label}
        <Icon size={12} aria-hidden="true" />
      </button>
    </th>
  );
}

// One ledger row per household; fixed commodities viewport with internal scroll
// so "Show more" batches do not grow the card height.
export default function FamilyDirectoryTable({
  items,
  base,
  footer,
  dimmed = false,
  sort,
  onSort,
}) {
  return (
    <div
      className={`overflow-hidden rounded-card border border-neutral-200 bg-white shadow-[var(--shadow-card)] transition-opacity ${
        dimmed ? "opacity-60" : ""
      }`}
    >
      <div
        className="w-full min-w-0 overflow-auto overscroll-contain"
        style={{ height: tableBodyHeight() }}
      >
        <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-0 text-left">
          <thead className="sticky top-0 z-10 h-11 bg-neutral-100 text-[10px] font-bold uppercase tracking-wide text-neutral-600">
            <tr>
              <SortHeader
                column="household"
                label="Household"
                sort={sort}
                onSort={onSort}
                className="px-4"
              />
              <SortHeader
                column="fsn"
                label="FSN"
                sort={sort}
                onSort={onSort}
                className="hidden px-3 sm:table-cell"
              />
              <SortHeader
                column="address"
                label="Address"
                sort={sort}
                onSort={onSort}
                className="hidden px-3 md:table-cell"
              />
              <SortHeader
                column="members"
                label="Members"
                sort={sort}
                onSort={onSort}
                className="px-3 text-right"
              />
              <th scope="col" className="px-2 text-right">
                <span className="sr-only">Open</span>
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
                    <Button
                      asChild
                      variant="secondary"
                      size="compact"
                      className="h-8 w-8 gap-1 px-0 sm:w-auto sm:px-3"
                    >
                      <Link to={to} aria-label={`Open ${name}`}>
                        <span className="hidden sm:inline">Open</span>
                        <ChevronRight size={14} aria-hidden="true" />
                      </Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}
