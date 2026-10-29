/**
 * Walk a Laravel paginator until every page is in hand. Reports must not
 * silently stop at the first page or at a large per_page that the API caps.
 */
export const REPORT_PAGE_SIZE = 100;
export const REPORT_MAX_PAGES = 200;

export function getPaginatorLastPage(response) {
  const last = Number(response?.data?.last_page);
  return Number.isFinite(last) && last > 0 ? last : null;
}

export function nextReportPage(response, page, pageItemCount, perPage = REPORT_PAGE_SIZE) {
  if (page >= REPORT_MAX_PAGES) return null;
  const lastPage = getPaginatorLastPage(response);
  if (lastPage != null) return page < lastPage ? page + 1 : null;
  if (pageItemCount >= perPage) return page + 1;
  return null;
}
