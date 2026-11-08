import { useCallback, useLayoutEffect, useRef } from "react";
import { printDocument } from "../utils/printDocument";

// Retry callbacks always read the latest query/filter state, including after a
// refetch. Print preparation never changes a clinical record.
export default function usePrintDocument(selector, options = {}) {
  const latest = useRef(options);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useLayoutEffect(() => { latest.current = options; });
  return useCallback(() => printDocument(selector, {
    title: latest.current.title,
    prepare: (clone) => latest.current.prepare?.(clone),
    validate: () => {
      if (!mounted.current) throw new Error("The selected document is no longer open. Open it again to print.");
      if (latest.current.loading) throw new Error("Required document data is still loading. Wait, then retry printing.");
      if (latest.current.error) throw new Error("Required document data could not be loaded. Retry printing to reload it.");
      latest.current.validate?.();
    },
    onRetry: async () => {
      await latest.current.onRetry?.();
      // Query refetch promises resolve before batched observer notifications.
      // Yield a task so those notifications reach React before the runner's
      // animation frame takes a new document snapshot.
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  }), [selector]);
}
