import { Search } from "lucide-react";

export default function PatientFilters({ filters, setFilters, action = null }) {
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
              className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] pl-8 pr-3 text-[13px] text-[#0F172A] outline-none transition-all placeholder:text-[#94A3B8] focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
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
            className="h-10 w-full appearance-none rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-2.5 text-[12px] text-[#0F172A] outline-none transition-colors focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
          >
            <option value="All">All Sex</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </div>

        {action}
      </div>
    </div>
  );
}
