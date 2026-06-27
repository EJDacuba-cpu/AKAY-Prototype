const LOGO_SRC = "/akay-logo-only.png";

const sizeClasses = {
  sm: {
    wrap: "h-10 w-10 rounded-xl",
    image: "h-8 w-8",
    halo: "rounded-2xl",
  },
  md: {
    wrap: "h-12 w-12 rounded-2xl",
    image: "h-9 w-9",
    halo: "rounded-2xl",
  },
  lg: {
    wrap: "h-14 w-14 rounded-2xl",
    image: "h-11 w-11",
    halo: "rounded-2xl",
  },
};

export default function AkayLogoLoader({
  size = "md",
  message = "Loading...",
  className = "",
  showMessage = true,
}) {
  const loaderSize = sizeClasses[size] || sizeClasses.md;

  return (
    <div
      className={`inline-flex flex-col items-center justify-center text-center ${className}`}
      role="status"
      aria-label={message || "Loading"}
    >
      <div className={`relative shrink-0 ${loaderSize.wrap}`}>
        <span
          className={`absolute inset-0 bg-[#B91C1C]/[0.06] motion-safe:animate-[akayLogoHalo_2200ms_ease-in-out_infinite] ${loaderSize.halo}`}
          aria-hidden="true"
        />
        <span
          className={`absolute inset-1 border border-[#E8ECF0] bg-white/95 shadow-sm shadow-slate-900/[0.04] motion-safe:animate-[akayLogoPulse_2200ms_ease-in-out_infinite] ${loaderSize.halo}`}
          aria-hidden="true"
        />
        <span className="relative flex h-full w-full items-center justify-center">
          <img
            src={LOGO_SRC}
            alt=""
            className={`object-contain motion-safe:animate-[akayLogoFloat_2200ms_ease-in-out_infinite] ${loaderSize.image}`}
            draggable="false"
          />
        </span>
      </div>

      {showMessage && (
        <span className="mt-2.5 text-[11px] font-semibold text-[#475569]">
          {message}
        </span>
      )}

      <style>
        {`
          @keyframes akayLogoPulse {
            0%, 100% {
              opacity: 0.96;
              transform: scale(1);
            }
            50% {
              opacity: 1;
              transform: scale(1.018);
            }
          }

          @keyframes akayLogoFloat {
            0%, 100% {
              opacity: 0.94;
              transform: scale(1);
            }
            50% {
              opacity: 1;
              transform: scale(1.03);
            }
          }

          @keyframes akayLogoHalo {
            0%, 100% {
              opacity: 0.45;
              transform: scale(0.94);
            }
            50% {
              opacity: 0.68;
              transform: scale(1.04);
            }
          }

          @media (prefers-reduced-motion: reduce) {
            [class*="akayLogo"] {
              animation: none !important;
            }
          }
        `}
      </style>
    </div>
  );
}
