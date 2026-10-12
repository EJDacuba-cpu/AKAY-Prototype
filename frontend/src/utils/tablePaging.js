// One place for the table paging numbers. Changing a value here changes every list screen.
export const TABLE_PAGE_SIZE = 10;
export const TABLE_ROW_HEIGHT = 56;
export const TABLE_HEAD_HEIGHT = 44;
// Room for the horizontal scrollbar under a fixed-height table body.
export const TABLE_SCROLLBAR_ALLOWANCE = 8;

// Card lists load more instead of paging: Patients is 2 columns x 5 rows, Facilities fills 1, 2 or 3 columns.
export const PATIENTS_LOAD_BATCH = 10;
export const FACILITIES_LOAD_BATCH = 12;

export function pageCount(rowCount, pageSize = TABLE_PAGE_SIZE) {
  return Math.max(Math.ceil((Number(rowCount) || 0) / pageSize), 1);
}

export function clampPage(page, totalPages) {
  const last = Math.max(Math.floor(Number(totalPages)) || 1, 1);
  const wanted = Math.floor(Number(page)) || 1;

  return Math.min(Math.max(wanted, 1), last);
}

export function sliceRows(rows, page, pageSize = TABLE_PAGE_SIZE) {
  const safePage = clampPage(page, pageCount(rows.length, pageSize));

  return rows.slice((safePage - 1) * pageSize, safePage * pageSize);
}

export function tableBodyHeight(pageSize = TABLE_PAGE_SIZE) {
  return TABLE_HEAD_HEIGHT + pageSize * TABLE_ROW_HEIGHT + TABLE_SCROLLBAR_ALLOWANCE;
}

export function tableEmptyHeight(pageSize = TABLE_PAGE_SIZE) {
  return pageSize * TABLE_ROW_HEIGHT;
}

export function nextVisibleCount(visible, batch, total) {
  return Math.min(visible + batch, total);
}

export function hasMoreItems(visible, total) {
  return visible < total;
}
