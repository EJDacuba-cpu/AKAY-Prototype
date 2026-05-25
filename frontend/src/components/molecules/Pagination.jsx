/**
 * Pagination Component - Navigate through paginated data
 * @component
 *
 * @param {number} currentPage - Current page number
 * @param {number} totalPages - Total number of pages
 * @param {Function} onPageChange - Page change handler
 * @param {boolean} [showPageNumbers=true] - Show individual page numbers
 * @param {string} [className] - Additional CSS classes
 *
 * @example
 * <Pagination
 *   currentPage={page}
 *   totalPages={10}
 *   onPageChange={setPage}
 * />
 */
export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  showPageNumbers = true,
  className = "",
}) {
  const pageNumbers = [];

  if (showPageNumbers) {
    // Calculate range of pages to show
    const range = 2;
    let start = Math.max(1, currentPage - range);
    let end = Math.min(totalPages, currentPage + range);

    if (start > 1) pageNumbers.push(1, "...");
    for (let i = start; i <= end; i++) pageNumbers.push(i);
    if (end < totalPages) pageNumbers.push("...", totalPages);
  }

  return (
    <div
      className={`
        flex items-center justify-center
        gap-2
        ${className}
      `}
    >
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
      >
        Previous
      </button>

      {showPageNumbers &&
        pageNumbers.map((page, idx) => (
          <button
            key={idx}
            onClick={() => typeof page === "number" && onPageChange(page)}
            disabled={page === "..."}
            className={`
              rounded-lg
              px-3
              py-2
              text-sm
              font-medium
              ${
                page === currentPage
                  ? "bg-[#0B2E59] text-white"
                  : "border border-slate-300 hover:bg-slate-50 disabled:cursor-default"
              }
            `}
          >
            {page}
          </button>
        ))}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
      >
        Next
      </button>
    </div>
  );
}
