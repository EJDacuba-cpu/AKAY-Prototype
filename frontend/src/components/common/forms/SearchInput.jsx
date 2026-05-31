import { Search } from "lucide-react";

export default function SearchInput({
  placeholder = "Search...",
  value,
  onChange,
  className = "",
}) {
  return (
    <div className={className}>
      <label
        className="
          mb-1.5 block

          text-[10px]
          font-semibold
          uppercase
          tracking-wider

          text-[#9CA3AF]
        "
      >
        Search
      </label>

      <div
        className="
          flex items-center

          rounded-lg

          border border-[#E5E7EB]

          bg-[#F8FAFC]

          px-3

          transition-all duration-200

          focus-within:border-[#FCA5A5]
          focus-within:bg-white
          focus-within:ring-2
          focus-within:ring-[#B91C1C]/10
        "
      >
        <Search size={14} className="text-[#BCC3CD]" />

        <input
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="
            h-10 flex-1

            border-0
            bg-transparent

            px-2

            text-sm
            text-[#0F172A]

            outline-none

            placeholder:text-[#BCC3CD]
          "
        />
      </div>
    </div>
  );
}
