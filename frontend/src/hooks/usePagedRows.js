import { useState } from "react";
import { TABLE_PAGE_SIZE, clampPage, pageCount, sliceRows } from "../utils/tablePaging";

/**
 * Client-side paging for a list that is already fully loaded.
 * `resetKey` (a primitive or a stable state object such as the filters) sends the list back to page 1 when it changes.
 * The page is derived rather than synced in an effect, so a shrinking list also falls back to its last page.
 */
export default function usePagedRows(rows, resetKey, pageSize = TABLE_PAGE_SIZE) {
  const [stored, setStored] = useState({ key: resetKey, page: 1 });
  const totalPages = pageCount(rows.length, pageSize);
  const page = Object.is(stored.key, resetKey) ? clampPage(stored.page, totalPages) : 1;

  function setPage(next) {
    setStored({ key: resetKey, page: clampPage(next, totalPages) });
  }

  return {
    page,
    setPage,
    totalPages,
    pageRows: sliceRows(rows, page, pageSize),
    startIndex: (page - 1) * pageSize,
  };
}
