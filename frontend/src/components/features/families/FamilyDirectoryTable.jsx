import { Link, useNavigate } from "react-router";
import { ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown } from "lucide-react";
import { addressText, patientName } from "../../../services/familyRegistry";

const HEAD_CELL = "px-4 text-left align-middle";

// A header that sorts on the server, so the order holds across every page of households.
function SortHeader({ column, label, sort, onSort, className = "" }) {
  const active = sort.key === column;
  const Icon = !active ? ChevronsUpDown : sort.direction === "asc" ? ChevronUp : ChevronDown;
  return (
    <th scope="col" aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={`${HEAD_CELL} ${className}`}>
      <button type="button" onClick={() => onSort(column)} className={`-mx-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider outline-none transition-colors hover:text-ink-800 focus-visible:ring-2 focus-visible:ring-ink-400/50 ${active ? "text-ink-800" : "text-neutral-600"}`}>
        {label}<Icon size={12} aria-hidden="true" />
      </button>
    </th>
  );
}

// One ledger row per household. The whole row opens the household; the name is the real link for keyboard and screen readers.
export default function FamilyDirectoryTable({ items, base, footer, dimmed = false, sort, onSort }) {
  const navigate = useNavigate();

  return (
    <div className={`min-h-[324px] overflow-hidden rounded-card border border-neutral-200 bg-white shadow-[var(--shadow-card)] transition-opacity ${dimmed ? "opacity-60" : ""}`}>
      <table className="w-full border-separate border-spacing-0 text-left">
        <thead>
          <tr className="h-11 bg-neutral-100 text-[10px] font-bold uppercase tracking-wider text-neutral-600">
            <SortHeader column="fsn" label="FSN" sort={sort} onSort={onSort} className="hidden w-36 sm:table-cell" />
            <SortHeader column="household" label="Household" sort={sort} onSort={onSort} />
            <SortHeader column="address" label="Address" sort={sort} onSort={onSort} className="hidden md:table-cell" />
            <SortHeader column="members" label="Members" sort={sort} onSort={onSort} className="w-24 text-right sm:w-28" />
            <th scope="col" className="w-12 px-4"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const head = item.members.find((member) => member.id === item.headPatientId);
            const name = head ? `${head.lastName} Household` : "Household";
            const headName = head ? patientName(head) : "Not assigned";
            const to = `${base}/${item.id}`;
            const address = addressText(item.address);
            return (
              <tr
                key={item.id}
                onClick={(event) => { if (!event.target.closest("a")) navigate(to); }}
                className="group h-14 cursor-pointer transition-colors hover:bg-neutral-100 has-[:focus-visible]:bg-neutral-100"
              >
                <td className="hidden border-t border-neutral-200 px-4 align-middle font-mono text-xs text-neutral-600 sm:table-cell">{item.serialNumber}</td>
                <td className="max-w-0 border-t border-neutral-200 px-4 py-2 align-middle">
                  <p className="truncate font-mono text-[11px] text-neutral-500 sm:hidden">{item.serialNumber}</p>
                  <Link to={to} title={name} className="block min-h-6 truncate rounded text-sm font-semibold text-ink-800 outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50">{name}</Link>
                  <p className="truncate text-xs text-neutral-600" title={`Head: ${headName}`}>Head: {headName}</p>
                  {address && <p className="truncate text-xs text-neutral-500 md:hidden">{address}</p>}
                </td>
                <td className="hidden max-w-0 border-t border-neutral-200 px-4 align-middle text-[13px] text-neutral-600 md:table-cell"><p className="truncate" title={address}>{address || "No address recorded"}</p></td>
                <td className="border-t border-neutral-200 px-4 text-right align-middle text-sm tabular-nums text-ink-800">{item.members.length}</td>
                <td className="border-t border-neutral-200 px-4 align-middle"><ChevronRight size={16} aria-hidden="true" className="text-neutral-400 transition-colors group-hover:text-ink-800" /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {footer}
    </div>
  );
}
