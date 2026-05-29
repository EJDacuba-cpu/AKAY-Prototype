import { RotateCcw, Search, X } from "lucide-react";

export default function PatientFilters({ filters, setFilters, action = null }) {
  const hasActiveFilters =
    filters.search !== "" ||
    filters.sex !== "All" ||
    (filters.type && filters.type !== "All Patients");

  const activeFilters = [
    filters.search && { key: "search", label: filters.search },
    filters.sex !== "All" && { key: "sex", label: filters.sex },
    filters.type !== "All Patients" && { key: "type", label: filters.type },
  ].filter(Boolean);

  const clearFilters = () => {
    setFilters({ search: "", sex: "All", type: "All Patients" });
  };

  function removeFilter(key) {
    if (key === "search") setFilters((prev) => ({ ...prev, search: "" }));
    if (key === "sex") setFilters((prev) => ({ ...prev, sex: "All" }));
    if (key === "type") {
      setFilters((prev) => ({ ...prev, type: "All Patients" }));
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
        <div className="min-w-0 flex-1">
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            Search Patient / ID / Contact
          </label>

          <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]"
            />

            <input
              type="text"
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              placeholder="Search patient name, ID, or contact number..."
              className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-8 pr-3 text-[13px] text-[#0F172A] outline-none transition-all placeholder:text-[#94A3B8] focus:border-[#CBD5E1] focus:bg-white focus:ring-1 focus:ring-[#0B2E59]/10"
            />
          </div>
        </div>

        <div className="w-full xl:w-[180px]">
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            Sex
          </label>

          <select
            value={filters.sex}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, sex: e.target.value }))
            }
            className="h-10 w-full appearance-none rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 text-[12px] text-[#0F172A] outline-none transition-colors focus:border-[#CBD5E1] focus:bg-white focus:ring-1 focus:ring-[#0B2E59]/10"
          >
            <option value="All">All Sex</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </div>

        {action}
      </div>

      {activeFilters.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#F3F4F6] pt-3">
          {activeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => removeFilter(filter.key)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#DBEAFE] bg-[#EFF6FF] px-2.5 py-1 text-[11px] font-medium text-[#1D4ED8] transition-colors hover:bg-[#DBEAFE]"
            >
              {filter.label}
              <X size={10} />
            </button>
          ))}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#64748B] transition-colors hover:text-[#0B2E59]"
            >
              <RotateCcw size={11} />
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
