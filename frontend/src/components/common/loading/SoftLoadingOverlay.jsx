import { useEffect, useState } from "react";
import AkayLogoLoader from "./AkayLogoLoader";

const overlayToneClasses = {
  none: "bg-white/50",
  sm: "bg-white/55",
  md: "bg-white/60",
};

const loaderViewportStyle = {
  minHeight: "min(560px, calc(100dvh - 11rem))",
};

export function DottedSpinner({ label = "Loading", size = "md" }) {
  return <AkayLogoLoader label={label} size={size} showLabel={false} />;
}

function inferVariant(message, fallback = "fetch") {
  const text = String(message || "").toLowerCase();
  if (text.includes("refresh")) return "refresh";
  if (
    text.includes("sav") ||
    text.includes("submit") ||
    text.includes("cach")
  ) {
    return "save";
  }
  if (text.includes("success") || text.includes("complete")) return "success";
  return fallback;
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
  panelClassName = "",
  variant,
  size = "lg",
  children,
}) {
  const shouldShow = isVisible ?? isLoading ?? visible;
  const [isMounted, setIsMounted] = useState(Boolean(shouldShow));
  const [isActive, setIsActive] = useState(false);
  const isPageScope = scope === "page";

  useEffect(() => {
    if (shouldShow) {
      setIsMounted(true);
      if (scope === "page" && blocking) {
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
  }, [blocking, scope, shouldShow]);

  if (!isMounted) return null;

  return (
    <div
      className={`${
        isPageScope
          ? "fixed inset-0 z-[999] min-h-dvh rounded-none"
          : "absolute inset-0 z-[90] min-h-[calc(100dvh-11rem)] rounded-xl"
      } px-4 transition-opacity duration-200 ease-out ${overlayToneClasses[blur] || overlayToneClasses.sm} ${
        isActive ? "opacity-100" : "opacity-0"
      } ${blocking && isActive ? "pointer-events-auto" : "pointer-events-none"} ${className}`}
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className={`flex min-w-0 items-center justify-center py-8 ${
          isPageScope ? "h-full min-h-dvh" : "sticky top-4"
        }`}
        style={isPageScope ? undefined : loaderViewportStyle}
      >
        {children || (
          <div
            className={`flex flex-col items-center justify-center rounded-2xl border border-[#E8ECF0]/90 bg-white px-5 py-4 text-center shadow-md shadow-slate-900/[0.06] transition-transform duration-200 ease-out ${
              isActive ? "translate-y-0 scale-100" : "translate-y-1 scale-[0.98]"
            } ${panelClassName}`}
          >
            <AkayLogoLoader
              label={message}
              size={size}
              variant={variant || inferVariant(message)}
            />
          </div>
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
        variant={variant || inferVariant(message)}
      />
    </div>
  );
}
