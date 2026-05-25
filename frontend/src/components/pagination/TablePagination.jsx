import { ChevronLeft, ChevronRight } from "lucide-react";

export default function TablePagination({
  currentPage = 1,
  totalPages = 1,
  onPageChange = () => {}, // Fallback function para iwas crash
}) {
  // FUNCTION PARA BUOIN ANG ARRAY NA MAY NUMERO AT ELLIPSES (...)
  const getPaginationRange = () => {
    const totalPageNumbers = 5; // Bilang ng buttons na gustong ipakita kasama ang ...

    // Siguraduhin na kahit 0 o mas mababa ang totalPages, may minimum na [1] para sa button
    const safeTotalPages = Math.max(totalPages, 1);

    // Kung maliit lang ang kabuuang pages, ipakita na lang lahat (e.g., 1, 2, 3)
    if (safeTotalPages <= totalPageNumbers) {
      return Array.from({ length: safeTotalPages }, (_, i) => i + 1);
    }

    const siblings = 1; // Bilang ng katabing numero sa kaliwa at kanan ng active page
    const leftSiblingIndex = Math.max(currentPage - siblings, 1);
    const rightSiblingIndex = Math.min(currentPage + siblings, safeTotalPages);

    const showLeftEllipsis = leftSiblingIndex > 2;
    const showRightEllipsis = rightSiblingIndex < safeTotalPages - 1;

    // Case 1: May "..." lang sa kanan (Nasa simulaing mga pahina ang user)
    if (!showLeftEllipsis && showRightEllipsis) {
      let leftItemCount = 3;
      let leftRange = Array.from({ length: leftItemCount }, (_, i) => i + 1);
      return [...leftRange, "...", safeTotalPages];
    }

    // Case 2: May "..." lang sa kaliwa (Nasa hulihang mga pahina na ang user)
    if (showLeftEllipsis && !showRightEllipsis) {
      let rightItemCount = 3;
      let rightRange = Array.from(
        { length: rightItemCount },
        (_, i) => safeTotalPages - rightItemCount + i + 1,
      );
      return [1, "...", ...rightRange];
    }

    // Case 3: May "..." sa parehong kaliwa at kanan (Nasa gitnang pahina ang user)
    if (showLeftEllipsis && showRightEllipsis) {
      let middleRange = Array.from(
        { length: rightSiblingIndex - leftSiblingIndex + 1 },
        (_, i) => leftSiblingIndex + i,
      );
      return [1, "...", ...middleRange, "...", safeTotalPages];
    }
  };

  // Kung walang valid na total pages, default natin sa 1 ang text
  const displayTotalPages = Math.max(totalPages, 1);
  const paginationRange = getPaginationRange();

  return (
    <div className="flex items-center justify-between border-t border-[#F3F4F6] px-5 py-4 bg-white rounded-b-2xl select-none">
      {/* Kaliwang Bahagi: Text Indicator */}
      <span className="text-xs font-medium text-[#6B7280]">
        Page <span className="font-semibold text-[#0B2E59]">{currentPage}</span>{" "}
        of{" "}
        <span className="font-semibold text-[#0B2E59]">
          {displayTotalPages}
        </span>
      </span>

      {/* Kanang Bahagi: Pagination Controls */}
      <div className="flex items-center gap-1.5">
        {/* Previous Button */}
        <button
          type="button"
          onClick={() => currentPage > 1 && onPageChange?.(currentPage - 1)}
          disabled={currentPage === 1} // Naka-disable kung nasa page 1
          className="
            flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8ECF0] bg-white text-[#6B7280] transition shadow-sm
            hover:bg-[#F9FAFB] hover:text-[#0B2E59]
            disabled:pointer-events-none disabled:opacity-40
          "
        >
          <ChevronLeft size={14} />
        </button>

        {/* Dynamic Page Numbers & Ellipses */}
        {paginationRange &&
          paginationRange.map((pageNumber, index) => {
            // Kung ito ay ellipses "...", i-render bilang text lang (hindi clickable)
            if (pageNumber === "...") {
              return (
                <span
                  key={`ellipsis-${index}`}
                  className="px-2 text-xs font-semibold text-[#9CA3AF]"
                >
                  ...
                </span>
              );
            }

            // Kung numero, i-render bilang clickable button
            return (
              <button
                key={`page-${pageNumber}`}
                type="button"
                onClick={() => onPageChange?.(pageNumber)}
                data-active={currentPage === pageNumber}
                disabled={displayTotalPages <= 1} // Naka-disable ang page number button kung 1 page lang lahat
                className="
                flex h-8 min-w-[32px] items-center justify-center rounded-lg border border-[#E8ECF0] bg-white px-2 text-xs font-semibold text-[#6B7280] transition shadow-sm
                hover:bg-[#F9FAFB] hover:text-[#0B2E59]
                data-[active=true]:border-[#0B2E59] data-[active=true]:bg-[#0B2E59] data-[active=true]:text-white data-[active=true]:shadow-none
                disabled:opacity-60 disabled:pointer-events-none
              "
              >
                {pageNumber}
              </button>
            );
          })}

        {/* Next Button */}
        <button
          type="button"
          onClick={() =>
            currentPage < displayTotalPages && onPageChange?.(currentPage + 1)
          }
          disabled={currentPage === displayTotalPages || displayTotalPages <= 1} // Naka-disable kung nasa dulo o kung 1 page lang talaga
          className="
            flex h-8 w-8 items-center justify-center rounded-lg border border-[#E8ECF0] bg-white text-[#6B7280] transition shadow-sm
            hover:bg-[#F9FAFB] hover:text-[#0B2E59]
            disabled:pointer-events-none disabled:opacity-40
          "
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
