import { useEffect, useState } from "react";
import {
  PageSkeletonLoader,
  inferLoadingSkeletonVariant,
} from "./SkeletonLoaders";
import {
  dispatchContentLoadingEnd,
  dispatchContentLoadingStart,
} from "../../../utils/loadingEvents";

const overlayToneClasses = {
  none: "bg-white/82",
  sm: "bg-white/88",
  md: "bg-white/94",
};

export function DottedSpinner({ label = "Loading", size = "md" }) {
  const sizeClass = size === "sm" ? "h-3 w-3" : "h-4 w-4";

  return (
    <span className="inline-flex items-center gap-2 text-[12px] font-medium text-slate-500">
      <span
        className={`${sizeClass} animate-spin rounded-full border-2 border-slate-200 border-t-[#B91C1C]`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

export default function SoftLoadingOverlay({
  isVisible,
  isLoading,
  visible,
  message = "Loading...",
  blocking = true,
  blur = "sm",
  scope = "area",
  className = "",
  variant,
  children,
}) {
  const shouldShow = isVisible ?? isLoading ?? visible;
  const [isMounted, setIsMounted] = useState(Boolean(shouldShow));
  const [isActive, setIsActive] = useState(false);
  const isViewportScope = scope === "viewport";

  useEffect(() => {
    if (shouldShow) {
      setIsMounted(true);
      if (isViewportScope && blocking) {
        window.dispatchEvent(new CustomEvent("akay:blocking-loading-start"));
      }

      const animationFrame = window.requestAnimationFrame(() => {
        setIsActive(true);
      });

      return () => window.cancelAnimationFrame(animationFrame);
    }

    setIsActive(false);
    const timer = window.setTimeout(() => setIsMounted(false), 180);
    return () => window.clearTimeout(timer);
  }, [blocking, isViewportScope, shouldShow]);

  useEffect(() => {
    if (!shouldShow) return undefined;

    dispatchContentLoadingStart();
    return () => dispatchContentLoadingEnd();
  }, [shouldShow]);

  if (!isMounted) return null;

  return (
    <div
      className={`${
        isViewportScope
          ? "fixed inset-0 z-[999] min-h-dvh rounded-none"
          : "absolute inset-0 z-20 min-h-full rounded-xl"
      } overflow-hidden transition-opacity duration-200 ease-out ${overlayToneClasses[blur] || overlayToneClasses.sm} ${
        isActive ? "opacity-100" : "opacity-0"
      } ${blocking && isActive ? "pointer-events-auto" : "pointer-events-none"} ${className}`}
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className={`min-w-0 transition-transform duration-200 ease-out ${
          isViewportScope ? "h-full min-h-dvh p-5" : "sticky top-4 p-4"
        } ${isActive ? "translate-y-0" : "translate-y-1"}`}
      >
        {children || (
          <PageSkeletonLoader
            message={message}
            variant={variant || inferLoadingSkeletonVariant(message)}
          />
        )}
      </div>
    </div>
  );
}

export function SoftLoadingArea({
  isLoading,
  message = "Loading...",
  blocking = true,
  blur = "sm",
  scope = "area",
  minHeight = "min-h-[calc(100dvh-11rem)]",
  className = "",
  variant,
  children,
}) {
  return (
    <div className={`relative min-w-0 ${minHeight} ${className}`}>
      {children}
      <SoftLoadingOverlay
        isVisible={isLoading}
        message={message}
        blocking={blocking}
        blur={blur}
        scope={scope}
        variant={variant || inferLoadingSkeletonVariant(message)}
      />
    </div>
  );
}
