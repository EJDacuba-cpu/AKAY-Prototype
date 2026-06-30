import { Search } from "lucide-react";

export default function DataTableEmptyState({
  colSpan,
  icon,
  title = "No records found.",
  description = "Try adjusting your search or filter criteria.",
  minHeight = "min-h-[260px]",
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-0 text-center">
        <div className={`flex flex-col items-center justify-center ${minHeight}`}>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9]">
            {icon || <Search size={20} className="text-[#94A3B8]" />}
          </div>
          <p className="text-[13px] font-semibold text-[#334155]">{title}</p>
          {description && (
            <p className="mx-auto mt-1 max-w-sm text-[11.5px] text-[#94A3B8]">
              {description}
            </p>
          )}
        </div>
      </td>
    </tr>
  );
}
