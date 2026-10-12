import { useState } from "react";
import { hasMoreItems, nextVisibleCount } from "../utils/tablePaging";

/**
 * "Load more" for card lists: shows `batchSize` items first and grows by one batch per `loadMore()`.
 * `resetKey` (a primitive or a stable state object) goes back to the first batch when it changes.
 */
export default function useLoadMore(items, batchSize, resetKey) {
  const [stored, setStored] = useState({ key: resetKey, count: batchSize });
  let current = stored;

  // Reset while rendering (not in an effect) and store it, so going A -> B -> A starts A from its first batch again.
  if (!Object.is(stored.key, resetKey)) {
    current = { key: resetKey, count: batchSize };
    setStored(current);
  }

  const visibleCount = Math.min(Math.max(current.count, batchSize), items.length);

  function loadMore() {
    setStored({ key: resetKey, count: nextVisibleCount(visibleCount, batchSize, items.length) });
  }

  return {
    visibleItems: items.slice(0, visibleCount),
    hasMore: hasMoreItems(visibleCount, items.length),
    loadMore,
  };
}
