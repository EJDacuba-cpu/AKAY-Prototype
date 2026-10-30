import { useState } from "react";
import { TABLE_PAGE_SIZE, clampPage, pageCount, sliceRows } from "../utils/tablePaging";

/**
 * Client-side paging for a list that is already fully loaded.
 * `resetKey` (a primitive or a stable state object such as the filters) sends the list back to page 1 when it changes.
 * The page is clamped on every render, so a shrinking list also falls back to its last page.
 */
export default function usePagedRows(rows, resetKey, pageSize = TABLE_PAGE_SIZE) {
  const [stored, setStored] = useState({ key: resetKey, page: 1 });
  let current = stored;

  // Reset while rendering (not in an effect) and store it, so going A -> B -> A starts A from page 1 again.
  if (!Object.is(stored.key, resetKey)) {
    current = { key: resetKey, page: 1 };
    setStored(current);
  }

  const totalPages = pageCount(rows.length, pageSize);
  const page = clampPage(current.page, totalPages);

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
