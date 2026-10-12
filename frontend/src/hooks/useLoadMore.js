import { useState } from "react";
import { hasMoreItems, nextVisibleCount } from "../utils/tablePaging";

/**
 * "Load more" for card lists: shows `batchSize` items first and grows by one batch per `loadMore()`.
 * `resetKey` (a primitive or a stable state object) goes back to the first batch when it changes.
 */
export default function useLoadMore(items, batchSize, resetKey) {
  const [stored, setStored] = useState({ key: resetKey, count: batchSize });
  const requested = Object.is(stored.key, resetKey) ? stored.count : batchSize;
  const visibleCount = Math.min(Math.max(requested, batchSize), items.length);

  function loadMore() {
    setStored({ key: resetKey, count: nextVisibleCount(visibleCount, batchSize, items.length) });
  }

  return {
    visibleItems: items.slice(0, visibleCount),
    hasMore: hasMoreItems(visibleCount, items.length),
    loadMore,
  };
}
