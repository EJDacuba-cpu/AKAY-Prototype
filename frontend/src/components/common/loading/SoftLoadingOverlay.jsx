import { useEffect } from "react";
import { PageSkeletonLoader } from "./SkeletonLoaders";
import { dispatchContentLoadingEnd, dispatchContentLoadingStart } from "../../../utils/loadingEvents";

export function DottedSpinner({ label = "Loading", size = "md" }) {
  return <span role="status" className="inline-flex items-center gap-2 text-xs text-neutral-600"><span aria-hidden="true" className={`${size === "sm" ? "size-3" : "size-4"} rounded-full border-2 border-neutral-200 border-t-ink-700 motion-safe:animate-spin`} />{label}</span>;
}

export default function SoftLoadingOverlay({
  isVisible, isLoading, visible, message = "Loading...", blocking = true,
  scope = "area", className = "", skeleton, bodyOnly = false,
  skeletonOptions, inFlow = false, children,
}) {
  const shouldShow = Boolean(isVisible ?? isLoading ?? visible);
  const viewport = scope === "viewport";
  useEffect(() => {
    if (!shouldShow) return undefined;
    if (viewport && blocking) window.dispatchEvent(new CustomEvent("akay:blocking-loading-start"));
    dispatchContentLoadingStart();
    return () => dispatchContentLoadingEnd();
  }, [shouldShow, viewport, blocking]);
  if (!shouldShow) return null;
  return <div className={`${viewport ? "fixed inset-0 z-[999] min-h-dvh overflow-auto bg-white p-5" : inFlow ? "relative min-w-0" : "absolute inset-0 z-20 overflow-auto bg-white p-4"} ${blocking ? "pointer-events-auto" : "pointer-events-none"} ${className}`}>
    {children || <PageSkeletonLoader message={message} skeleton={skeleton} bodyOnly={bodyOnly} options={skeletonOptions} />}
  </div>;
}

export function SoftLoadingArea({
  isLoading, message = "Loading...", blocking = true, scope = "area",
  minHeight = "min-h-[calc(100dvh-11rem)]", className = "", skeleton,
  bodyOnly = false, skeletonOptions, children,
}) {
  const pending = Boolean(isLoading);
  return <div className={`relative min-w-0 ${pending ? minHeight : ""} ${className}`} aria-busy={pending || undefined}>
    {pending ? <div hidden inert>{children}</div> : children}
    <SoftLoadingOverlay isVisible={pending} message={message} blocking={blocking} scope={scope} skeleton={skeleton} bodyOnly={bodyOnly} skeletonOptions={skeletonOptions} inFlow />
  </div>;
}
