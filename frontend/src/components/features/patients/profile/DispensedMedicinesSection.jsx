import { useMemo, useState } from "react";

import { Button } from "../../../ui/button";
import { Input } from "../../../ui/input";
import { formatShortDate } from "../../../../utils/patientProfile";
import searchIcon from "../../../../assets/figma/search.svg";

const FILTERS = ["All", "Maternal Care", "Family Planning"];

export default function DispensedMedicinesSection({ rows = [], isLoading = false, isError = false, onRetry, onViewRecord }) {
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) =>
      (filter === "All" || row.programs.includes(filter)) &&
      (!needle || [row.name, row.quantity, row.dispensedBy, ...row.programs].join(" ").toLowerCase().includes(needle)),
    );
  }, [rows, filter, search]);

  return (
    <section aria-labelledby="dispensed-medicines-title" className="mt-6">
      <div className="mb-3">
        <h3 id="dispensed-medicines-title" className="text-base font-bold text-[#111827]">Medicines Dispensed</h3>
        <p className="mt-1 text-xs text-neutral-500">Items actually dispensed during this patient&apos;s consultations</p>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter dispensed medicines" className="flex flex-wrap gap-1.5">
          {FILTERS.map((option) => (
            <Button key={option} type="button" variant="ghost" size="sm" aria-pressed={filter === option} onClick={() => setFilter(option)} className={`h-8 rounded-lg border px-2 text-xs ${filter === option ? "border-neutral-500 bg-neutral-50 text-[#111827]" : "border-neutral-200 bg-white text-neutral-500"}`}>
              {option}{option === "All" ? ` (${rows.length})` : ""}
            </Button>
          ))}
        </div>
        <label className="relative block w-full max-w-64">
          <span className="sr-only">Search dispensed medicines</span>
          <img src={searchIcon} alt="" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search medicines or programs" className="h-8 rounded-lg border-neutral-200 pl-9 text-xs shadow-none" />
        </label>
      </div>

      {isError ? (
        <p role="alert" className="rounded-lg border border-alert-100 bg-alert-50 px-4 py-6 text-sm text-alert-700">Could not load dispensed medicines. <Button type="button" variant="link" size="sm" onClick={() => onRetry?.()} className="h-auto p-0 text-alert-700 underline">Retry</Button></p>
      ) : isLoading ? (
        <p role="status" className="border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-500">Loading dispensed medicines...</p>
      ) : visibleRows.length === 0 ? (
        <p className="border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-500">
          {rows.length === 0 ? "No medicines dispensed for this patient." : "No dispensed medicines match this filter."}
        </p>
      ) : (
        <div className="overflow-x-auto border border-neutral-200 bg-white">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="bg-neutral-50 text-xs font-medium text-neutral-500">
              <tr>
                <th scope="col" className="px-4 py-3">Date</th>
                <th scope="col" className="px-4 py-3">Medicine / Formulation</th>
                <th scope="col" className="px-4 py-3">Quantity</th>
                <th scope="col" className="px-4 py-3">Program</th>
                <th scope="col" className="px-4 py-3">Dispensed By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {visibleRows.map((row) => (
                <tr key={row.id} className="hover:bg-neutral-50/70">
                  <td className="whitespace-nowrap px-4 py-3 text-[#475569]">{formatShortDate(row.date)}</td>
                  <td className="px-4 py-3 font-semibold text-[#111827]">
                    {onViewRecord && row.recordId ? <button type="button" onClick={() => onViewRecord(row.recordId)} className="text-left hover:text-ink-700 hover:underline">{row.name}</button> : row.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[#111827]">{row.quantity || "—"}</td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{row.programs.map((program) => <span key={program} className="border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[10px] text-[#475569]">{program}</span>)}</div></td>
                  <td className="whitespace-nowrap px-4 py-3 text-[#475569]">{row.dispensedBy || "Not recorded"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
