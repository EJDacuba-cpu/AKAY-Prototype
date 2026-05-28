import { Search, RotateCcw } from "lucide-react";

export default function PatientFilters({ filters, setFilters }) {
  const hasActiveFilters =
    filters.search !== "" ||
    filters.sex !== "All" ||
    (filters.type && filters.type !== "All Patients");

  const clearFilters = () => {
    setFilters({ search: "", sex: "All", type: "All Patients" });
  };

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-[12px] font-semibold text-[#0F172A]">Filters</h2>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-[10px] font-medium text-[#0B2E59] hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="space-y-5">
        {/* Search Patient */}
        <div>
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            Search Patient
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
              placeholder="Name or ID…"
              className="h-[34px] w-full rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] pl-8 pr-3 text-[12px] text-[#0F172A] outline-none transition-all placeholder:text-[#94A3B8] focus:border-[#CBD5E1] focus:bg-white focus:ring-1 focus:ring-[#0B2E59]/10"
            />
          </div>
        </div>

        {/* Patient Type / Category */}
        <div>
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            Patient Type
          </label>
          <select
            value={filters.type || "All Patients"}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, type: e.target.value }))
            }
            className="h-[34px] w-full appearance-none rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 text-[12px] text-[#0F172A] outline-none transition-colors focus:border-[#CBD5E1] focus:bg-white focus:ring-1 focus:ring-[#0B2E59]/10"
          >
            <option value="All Patients">All Patients</option>
            <option value="Senior Citizen">Senior Citizen</option>
            <option value="Maternal">Maternal</option>
            <option value="Immunization">Immunization</option>
          </select>
        </div>

        {/* Sex */}
        <div>
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            Sex
          </label>
          <select
            value={filters.sex}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, sex: e.target.value }))
            }
            className="h-[34px] w-full appearance-none rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 text-[12px] text-[#0F172A] outline-none transition-colors focus:border-[#CBD5E1] focus:bg-white focus:ring-1 focus:ring-[#0B2E59]/10"
          >
            <option value="All">All Sex</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </div>
      </div>

      {/* Reset Button */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] py-2 text-[11px] font-medium text-[#64748B] transition-colors hover:bg-[#F8FAFC] hover:text-[#334155]"
        >
          <RotateCcw size={11} />
          Reset All Filters
        </button>
      )}
    </div>
  );
}
