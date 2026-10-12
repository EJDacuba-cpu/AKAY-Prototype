import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Check } from "lucide-react";
import { Link } from "react-router";

import { barangaySignals, sortBarangays } from "../../../utils/adminDashboard";

const DEFAULT_SORT = { key: "default", direction: "asc" };

// `first` is the direction used when a column is sorted for the first time:
// names A-Z, counts most-first, and staff "None" before "Staffed".
const COLUMNS = [
  { key: "name", label: "Barangay", first: "asc", align: "left" },
  { key: "referrals", label: "Referrals", first: "desc", align: "right" },
  { key: "pending", label: "Pending", first: "desc", align: "right", signal: "pending" },
  { key: "no_show", label: "No-show", first: "desc", align: "right", signal: "noShow" },
  { key: "overdue_follow_ups", label: "Overdue F/U", first: "desc", align: "right", signal: "overdue" },
  { key: "low_stock", label: "Low stock", first: "desc", align: "right", signal: "lowStock" },
  { key: "has_staff", label: "Staff", first: "asc", align: "center" },
];

const CARD_SIGNALS = COLUMNS.filter((column) => column.signal);

const num = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export default function BarangayTable({ rows }) {
  const [sort, setSort] = useState(DEFAULT_SORT);
  const sorted = useMemo(() => sortBarangays(Array.isArray(rows) ? rows : [], sort), [rows, sort]);
  const isDefault = sort.key === "default";

  function handleSort(column) {
    setSort((current) =>
      current.key === column.key
        ? { key: column.key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key: column.key, direction: column.first },
    );
  }

  return (
    <section
      aria-labelledby="barangay-table-title"
      className="min-w-0 rounded-xl border border-[#E8ECF0] bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="barangay-table-title" className="text-sm font-bold text-[#0F172A]">
            Barangay health centers
          </h2>
          <p className="mt-0.5 text-[11px] text-[#64748B]">
            Referrals and No-show follow the selected period; the other columns are as of now.
          </p>
        </div>

        {!isDefault && (
          <button
            type="button"
            onClick={() => setSort(DEFAULT_SORT)}
            className="hidden text-xs font-semibold text-[#B91C1C] hover:text-[#7F1D1D] hover:underline md:inline"
          >
            Reset order
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-[#E8ECF0] px-4 py-6 text-center">
          <p className="text-sm text-slate-600">No active barangay health centers yet.</p>
          <Link
            to="/admin/facilities"
            className="mt-1 inline-block text-xs font-semibold text-[#B91C1C] hover:text-[#7F1D1D] hover:underline"
          >
            Manage facilities
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E8ECF0]">
                  {COLUMNS.map((column) => (
                    <HeaderCell
                      key={column.key}
                      column={column}
                      sort={sort}
                      onSort={() => handleSort(column)}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <TableRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-4 space-y-3 md:hidden">
            {sorted.map((row) => (
              <CardRow key={row.id} row={row} />
            ))}
          </ul>
        </>
      )}

      <div className="mt-4 text-right">
        <Link
          to="/admin/reports"
          className="text-xs font-semibold text-[#B91C1C] hover:text-[#7F1D1D] hover:underline"
        >
          View report
        </Link>
      </div>
    </section>
  );
}

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" };
const JUSTIFY = { left: "justify-start", right: "justify-end", center: "justify-center" };

function HeaderCell({ column, sort, onSort }) {
  const active = sort.key === column.key;
  const ariaSort = active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined;
  const Arrow = sort.direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <th scope="col" aria-sort={ariaSort} className={`px-3 py-2 font-normal ${ALIGN[column.align]}`}>
      <button
        type="button"
        onClick={onSort}
        className={`inline-flex w-full items-center gap-1 text-[10px] font-semibold uppercase tracking-widest hover:text-[#B91C1C] ${JUSTIFY[column.align]} ${
          active ? "text-[#B91C1C]" : "text-[#64748B]"
        }`}
      >
        {column.label}
        {active && <Arrow size={11} aria-hidden="true" />}
      </button>
    </th>
  );
}

function TableRow({ row }) {
  const signals = barangaySignals(row);

  return (
    <tr className="border-b border-[#E8ECF0] last:border-b-0">
      <th scope="row" className="px-3 py-2.5 text-left font-semibold text-[#0F172A]">
        {row.name}
      </th>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{num(row.referrals)}</td>
      {CARD_SIGNALS.map((column) => (
        <CountCell key={column.key} value={num(row[column.key])} warn={signals[column.signal]} />
      ))}
      <td className="px-3 py-2.5 text-center">
        <StaffMark hasStaff={!signals.noStaff} />
      </td>
    </tr>
  );
}

function CountCell({ value, warn }) {
  if (!warn) return <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{value}</td>;

  return (
    <td className="bg-amber-50 px-3 py-2.5 text-right font-semibold tabular-nums text-amber-800">
      <span className="inline-flex items-center justify-end gap-1">
        <AlertTriangle size={12} className="shrink-0" aria-hidden="true" />
        {value}
      </span>
    </td>
  );
}

function StaffMark({ hasStaff }) {
  if (!hasStaff) {
    return (
      <span className="inline-block rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-[#B91C1C]">
        None
      </span>
    );
  }

  return (
    <span className="inline-flex items-center text-emerald-700">
      <Check size={14} aria-hidden="true" />
      <span className="sr-only">Staffed</span>
    </span>
  );
}

function CardRow({ row }) {
  const signals = barangaySignals(row);
  const active = CARD_SIGNALS.filter((column) => num(row[column.key]) > 0);
  const noIssues = active.length === 0 && !signals.noStaff;

  return (
    <li className="rounded-lg border border-[#E8ECF0] p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-semibold text-[#0F172A]">{row.name}</p>
        <StaffMark hasStaff={!signals.noStaff} />
      </div>
      <p className="mt-0.5 text-[11px] text-[#64748B]">Referrals in period: {num(row.referrals)}</p>

      {noIssues && <p className="mt-2 text-xs font-semibold text-emerald-700">No issues</p>}

      {active.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {active.map((column) => (
            <li
              key={column.key}
              className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800"
            >
              <AlertTriangle size={12} className="shrink-0" aria-hidden="true" />
              {column.label}: {num(row[column.key])}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
