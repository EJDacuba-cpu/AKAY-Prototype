import { apiRequest, unwrapList } from "./apiClient";
import { nextReportPage, REPORT_PAGE_SIZE } from "../utils/paginatedFetch.js";

export async function fetchAllReportPages(path, { params = {}, mapItem } = {}) {
  const items = [];
  const map = typeof mapItem === "function" ? mapItem : (item) => item;

  for (let page = 1; ; page += 1) {
    const query = new URLSearchParams(
      Object.entries({
        ...params,
        per_page: String(REPORT_PAGE_SIZE),
        page: String(page),
      }).filter(([, value]) => value !== undefined && value !== ""),
    );
    const response = await apiRequest(`${path}?${query}`);
    const raw = unwrapList(response);
    items.push(...raw.map(map));
    if (nextReportPage(response, page, raw.length, REPORT_PAGE_SIZE) == null) break;
  }

  return items;
}
