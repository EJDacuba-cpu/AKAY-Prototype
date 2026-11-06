import { Button } from "../../ui/button";

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
  alwaysShow = false,
  disabled = false,
}) {
  const displayTotalPages = Math.max(Number(totalPages) || 0, 1);

  const safeCurrentPage = Math.min(
    Math.max(Number(currentPage) || 1, 1),
    displayTotalPages,
  );
  const paginationRange = getPaginationRange(safeCurrentPage, displayTotalPages);
  const isFirstPage = safeCurrentPage <= 1;
  const isLastPage = safeCurrentPage >= displayTotalPages;

  if (!alwaysShow && displayTotalPages <= 1) return null;

  return (
    <nav
      aria-label="Pagination"
      className="flex min-h-[57px] flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3 select-none"
    >
      <span className="text-xs text-neutral-600" aria-live="polite">
        Page{" "}
        <span className="font-semibold text-ink-800">{safeCurrentPage}</span> of{" "}
        {displayTotalPages}
      </span>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="secondary"
          size="compact"
          disabled={disabled || isFirstPage}
          onClick={() => !disabled && !isFirstPage && onPageChange(safeCurrentPage - 1)}
        >
          Previous
        </Button>

        {paginationRange.map((pageNumber, index) =>
          pageNumber === "..." ? (
            <span
              key={`ellipsis-${index}`}
              className="px-2 text-xs font-semibold text-neutral-400"
            >
              ...
            </span>
          ) : (
            <Button
              key={`page-${pageNumber}`}
              type="button"
              variant="secondary"
              size="compact"
              aria-current={safeCurrentPage === pageNumber ? "page" : undefined}
              disabled={disabled}
              className={
                safeCurrentPage === pageNumber
                  ? "border-ink-700 bg-ink-700 text-white hover:border-ink-700 hover:bg-ink-700 hover:text-white"
                  : undefined
              }
              onClick={() => !disabled && onPageChange(pageNumber)}
            >
              {pageNumber}
            </Button>
          ),
        )}

        <Button
          type="button"
          variant="secondary"
          size="compact"
          disabled={disabled || isLastPage}
          onClick={() => !disabled && !isLastPage && onPageChange(safeCurrentPage + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
