import { useEffect, useState } from "react";
import AkayLogoLoader from "./AkayLogoLoader";

const blurClasses = {
  none: "",
  sm: "backdrop-blur-sm",
  md: "backdrop-blur-md",
};

const loaderViewportStyle = {
  minHeight: "min(560px, calc(100dvh - 11rem))",
};

const spinnerSizes = {
  sm: {
    container: "h-6 w-6",
    dot: "h-1.5 w-1.5",
    radius: 10,
  },
  md: {
    container: "h-8 w-8",
    dot: "h-2 w-2",
    radius: 13,
  },
  lg: {
    container: "h-10 w-10",
    dot: "h-2.5 w-2.5",
    radius: 16,
  },
};

export function DottedSpinner({ label = "Loading", size = "md" }) {
  const spinnerSize = spinnerSizes[size] || spinnerSizes.md;

  return (
    <span
      className={`relative inline-block shrink-0 animate-[akayDottedSpin_900ms_linear_infinite] ${spinnerSize.container}`}
      role="status"
      aria-label={label}
    >
      {Array.from({ length: 8 }).map((_, index) => (
        <span
          key={index}
          className={`absolute left-1/2 top-1/2 rounded-full bg-[#B91C1C] ${spinnerSize.dot}`}
          style={{
            opacity: 0.28 + index * 0.08,
            transform: `rotate(${index * 45}deg) translateY(-${spinnerSize.radius}px)`,
            transformOrigin: "0 0",
          }}
        />
      ))}
      <style>
        {`
          @keyframes akayDottedSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
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
  className = "",
  panelClassName = "",
  children,
}) {
  const shouldShow = isVisible ?? isLoading ?? visible;
  const [isMounted, setIsMounted] = useState(Boolean(shouldShow));
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (shouldShow) {
      setIsMounted(true);
      const animationFrame = window.requestAnimationFrame(() => {
        setIsActive(true);
      });

      return () => window.cancelAnimationFrame(animationFrame);
    }

    setIsActive(false);
    const timer = window.setTimeout(() => setIsMounted(false), 180);
    return () => window.clearTimeout(timer);
  }, [shouldShow]);

  if (!isMounted) return null;

  return (
    <div
      className={`absolute inset-0 z-[90] min-h-[calc(100dvh-11rem)] rounded-xl bg-white/60 px-4 transition-opacity duration-200 ease-out ${blurClasses[blur] || blurClasses.sm} ${
        isActive ? "opacity-100" : "opacity-0"
      } ${blocking && isActive ? "pointer-events-auto" : "pointer-events-none"} ${className}`}
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className="sticky top-4 flex min-w-0 items-center justify-center py-8"
        style={loaderViewportStyle}
      >
        {children || (
          <div
            className={`flex flex-col items-center justify-center rounded-2xl border border-[#E8ECF0]/90 bg-white/85 px-5 py-4 text-center shadow-md shadow-slate-900/[0.06] backdrop-blur-sm transition-transform duration-200 ease-out ${
              isActive ? "translate-y-0 scale-100" : "translate-y-1 scale-[0.98]"
            } ${panelClassName}`}
          >
            <AkayLogoLoader message={message} size="lg" />
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
  minHeight = "min-h-[calc(100dvh-11rem)]",
  className = "",
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
      />
    </div>
  );
}
