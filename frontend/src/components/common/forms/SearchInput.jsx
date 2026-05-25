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

          rounded-xl

          border border-[#E8ECF0]

          bg-[#FAFBFC]

          px-3

          transition-all duration-200

          focus-within:border-[#2563EB]
          focus-within:bg-white
          focus-within:ring-2
          focus-within:ring-[#2563EB]/10
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
            text-[#1A1A1A]

            outline-none

            placeholder:text-[#BCC3CD]
          "
        />
      </div>
    </div>
  );
}
