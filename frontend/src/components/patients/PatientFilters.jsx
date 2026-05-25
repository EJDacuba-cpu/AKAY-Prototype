import { Search } from "lucide-react";

export default function PatientFilters({ filters, setFilters }) {
  return (
    <div className="anim-fade-up mb-6 rounded-2xl border border-[#E8ECF0] bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Search */}
        <div>
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
            Patient Name
          </label>

          <div className="flex items-center rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3">
            <Search size={14} className="text-[#BCC3CD]" />

            <input
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  search: e.target.value,
                }))
              }
              className="h-10 flex-1 border-0 bg-transparent px-2 text-sm outline-none"
              placeholder="Search patient..."
            />
          </div>
        </div>

        {/* Sex */}
        <div>
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
            Sex
          </label>

          <select
            value={filters.sex}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                sex: e.target.value,
              }))
            }
            className="h-10 w-full rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3 text-sm outline-none"
          >
            <option>All</option>
            <option>Male</option>
            <option>Female</option>
          </select>
        </div>

        {/* Patient Type */}
        <div>
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
            Patient Classification
          </label>

          <select
            value={filters.type}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                type: e.target.value,
              }))
            }
            className="h-10 w-full rounded-xl border border-[#E8ECF0] bg-[#FAFBFC] px-3 text-sm outline-none"
          >
            <option>All Patients</option>
            <option>Maternal</option>
            <option>Senior Citizen</option>
            <option>Immunization</option>
            <option>General Consultation</option>
          </select>
        </div>

        {/* Clear */}
        <div className="flex items-end pt-[19px]">
          <button
            onClick={() =>
              setFilters({
                search: "",
                sex: "All",
                type: "All Patients",
              })
            }
            className="h-10 w-full rounded-xl border border-[#E8ECF0] bg-white px-3 text-xs font-medium text-[#6B7280]"
          >
            Clear Filters
          </button>
        </div>
      </div>
    </div>
  );
}
