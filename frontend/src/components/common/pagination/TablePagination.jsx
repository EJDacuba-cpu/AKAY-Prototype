import { ChevronLeft, ChevronRight } from "lucide-react";

function getPaginationRange(currentPage, totalPages) {
  const safeTotalPages = Math.max(Number(totalPages) || 0, 1);
  const safeCurrentPage = Math.min(
    Math.max(Number(currentPage) || 1, 1),
    Math.max(safeTotalPages, 1),
  );
  const visiblePageCount = 5;

  if (safeTotalPages <= visiblePageCount) {
    return Array.from({ length: safeTotalPages }, (_, index) => index + 1);
  }

  const siblings = 1;
  const leftSiblingIndex = Math.max(safeCurrentPage - siblings, 1);
  const rightSiblingIndex = Math.min(
    safeCurrentPage + siblings,
    safeTotalPages,
  );
  const showLeftEllipsis = leftSiblingIndex > 2;
  const showRightEllipsis = rightSiblingIndex < safeTotalPages - 1;

  if (!showLeftEllipsis && showRightEllipsis) {
    return [1, 2, 3, "...", safeTotalPages];
  }

  if (showLeftEllipsis && !showRightEllipsis) {
    return [
      1,
      "...",
      safeTotalPages - 2,
      safeTotalPages - 1,
      safeTotalPages,
    ];
  }

  return [
    1,
    "...",
    ...Array.from(
      { length: rightSiblingIndex - leftSiblingIndex + 1 },
      (_, index) => leftSiblingIndex + index,
    ),
    "...",
    safeTotalPages,
  ];
}

export default function TablePagination({
  currentPage = 1,
  totalPages = 1,
  onPageChange = () => {},
}) {
  const displayTotalPages = Math.max(Number(totalPages) || 0, 1);

  const safeCurrentPage = Math.min(
    Math.max(Number(currentPage) || 1, 1),
    displayTotalPages,
  );
  const paginationRange = getPaginationRange(safeCurrentPage, displayTotalPages);
  const isFirstPage = safeCurrentPage <= 1;
  const isLastPage = safeCurrentPage >= displayTotalPages;

  return (
    <div className="flex flex-col gap-3 border-t border-[#F1F5F9] bg-white px-4 py-3 select-none sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs font-medium text-[#6B7280]">
        Page{" "}
        <span className="font-bold text-[#B91C1C]">{safeCurrentPage}</span> of{" "}
        <span className="font-bold text-[#0F172A]">{displayTotalPages}</span>
      </span>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => !isFirstPage && onPageChange(safeCurrentPage - 1)}
          disabled={isFirstPage}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#64748B] shadow-sm transition hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#B91C1C] disabled:pointer-events-none disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>

        {paginationRange.map((pageNumber, index) =>
          pageNumber === "..." ? (
            <span
              key={`ellipsis-${index}`}
              className="px-2 text-xs font-semibold text-[#9CA3AF]"
            >
              ...
            </span>
          ) : (
            <button
              key={`page-${pageNumber}`}
              type="button"
              onClick={() => onPageChange(pageNumber)}
              data-active={safeCurrentPage === pageNumber}
              disabled={displayTotalPages <= 1}
              className="flex h-8 min-w-[32px] items-center justify-center rounded-lg border border-[#E5E7EB] bg-white px-2 text-xs font-semibold text-[#64748B] shadow-sm transition hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#B91C1C] data-[active=true]:border-[#B91C1C] data-[active=true]:bg-[#B91C1C] data-[active=true]:text-white data-[active=true]:shadow-none disabled:pointer-events-none disabled:opacity-60"
            >
              {pageNumber}
            </button>
          ),
        )}

        <button
          type="button"
          onClick={() => !isLastPage && onPageChange(safeCurrentPage + 1)}
          disabled={isLastPage}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#64748B] shadow-sm transition hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#B91C1C] disabled:pointer-events-none disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
