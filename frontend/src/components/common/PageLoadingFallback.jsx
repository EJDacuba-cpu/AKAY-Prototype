import { useEffect } from "react";
import {
  PageSkeletonLoader,
} from "./loading/SkeletonLoaders";
import {
  dispatchContentLoadingEnd,
  dispatchContentLoadingStart,
} from "../../utils/loadingEvents";

export default function PageLoadingFallback({
  message = "Loading...",
  minHeight = "min-h-[calc(100dvh-9rem)]",
  variant,
}) {
  useEffect(() => {
    dispatchContentLoadingStart();
    return () => dispatchContentLoadingEnd();
  }, []);

  return (
    <div
      className={`relative ${minHeight} overflow-hidden rounded-xl bg-[#F8FAFC]`}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="px-1 py-4 sm:px-0">
        <PageSkeletonLoader message={message} variant={variant} />
      </div>
    </div>
  );
}
