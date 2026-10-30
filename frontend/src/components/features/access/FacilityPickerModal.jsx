import { useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import ModalShell from "../../common/modals/ModalShell";

const TITLES = { bhc: "Choose Barangay Health Center", rhu: "Choose Rural Health Unit" };

/**
 * Search-and-pick list of facilities. Mount it only while open so the search starts empty.
 * `loading` shows placeholder rows while the facility lists are still being fetched.
 */
export default function FacilityPickerModal({ tier, facilities, loading, selectedId, onSelect, onClose }) {
  const [query, setQuery] = useState("");
  const searchRef = useRef(null);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? facilities.filter(f => [f.name, f.barangay, f.municipality].some(v => String(v || "").toLowerCase().includes(needle))) : facilities;
  }, [facilities, query]);

  return (
    <ModalShell title={TITLES[tier]} subtitle="Search by name, then select the facility." size="md" onClose={onClose} initialFocusRef={searchRef}>
      <div className="relative">
        <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          // The picker lives inside the account form; Enter must not submit it.
          onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }}
          placeholder="Search facilities"
          aria-label="Search facilities"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-700/10"
        />
      </div>
      <div className="mt-3 h-72 overflow-y-auto rounded-lg border border-slate-200" aria-busy={loading}>
        {loading
          ? <ul aria-label="Loading facilities" className="divide-y divide-slate-100">{Array.from({ length: 6 }, (_, i) => <li key={i} className="px-3 py-3"><span className="block h-4 w-2/3 animate-pulse rounded bg-slate-200 motion-reduce:animate-none" /></li>)}</ul>
          : matches.length
            ? <ul className="divide-y divide-slate-100">{matches.map(f => {
              const selected = String(f.id) === String(selectedId);
              return (
                <li key={f.id}>
                  <button type="button" onClick={() => onSelect(f)} className={`flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm hover:bg-slate-50 ${selected ? "bg-red-50 font-semibold text-red-800" : "text-slate-800"}`}>
                    <span className="min-w-0"><span className="block truncate">{f.name}</span>{f.barangay && <span className="block truncate text-xs font-normal text-slate-500">{f.barangay}</span>}</span>
                    {selected && <Check size={16} aria-hidden="true" className="shrink-0" />}
                  </button>
                </li>
              );
            })}</ul>
            : <p className="p-4 text-sm text-slate-500">{facilities.length ? "No facilities match your search." : "There are no active facilities yet."}</p>}
      </div>
    </ModalShell>
  );
}
