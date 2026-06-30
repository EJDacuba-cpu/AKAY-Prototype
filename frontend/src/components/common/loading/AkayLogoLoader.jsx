const LOGO_SRC = "/akay-logo-only.svg";
const BRAND_LETTERS = ["A", "K", "A", "Y"];

const sizeClasses = {
  sm: {
    logoWrap: "h-9 w-9 rounded-xl",
    logo: "h-7 w-7",
    card: "px-3 py-2.5",
    brand: "text-[10px] tracking-[0.24em]",
    label: "text-[10px]",
    gap: "mt-1.5",
  },
  md: {
    logoWrap: "h-12 w-12 rounded-2xl",
    logo: "h-9 w-9",
    card: "px-4 py-3.5",
    brand: "text-xs tracking-[0.28em]",
    label: "text-[11px]",
    gap: "mt-2",
  },
  lg: {
    logoWrap: "h-16 w-16 rounded-2xl",
    logo: "h-12 w-12",
    card: "px-5 py-4",
    brand: "text-sm tracking-[0.32em]",
    label: "text-xs",
    gap: "mt-2.5",
  },
};

const variantClasses = {
  fetch: "akay-brand-loader--fetch",
  refresh: "akay-brand-loader--refresh",
  save: "akay-brand-loader--save",
  success: "akay-brand-loader--success",
};

function normalizeLabel(value) {
  return String(value || "Loading...").replace(/\s*\.{1,3}\s*$/, "");
}

export default function AkayLogoLoader({
  label,
  message,
  variant = "fetch",
  size = "md",
  overlay = false,
  card = false,
  className = "",
  showLabel = true,
}) {
  const displayLabel = label ?? message ?? "Loading...";
  const baseLabel = normalizeLabel(displayLabel);
  const loaderSize = sizeClasses[size] || sizeClasses.md;
  const variantClass = variantClasses[variant] || variantClasses.fetch;

  const loader = (
    <div
      className={`akay-brand-loader ${variantClass} inline-flex flex-col items-center justify-center text-center ${
        card
          ? `rounded-2xl border border-[#E8ECF0]/90 bg-white ${loaderSize.card} shadow-md shadow-slate-900/[0.06]`
          : ""
      } ${className}`}
      role="status"
      aria-live="polite"
      aria-label={displayLabel || "Loading"}
    >
      <div
        className={`akay-brand-loader-logo-wrap relative flex shrink-0 items-center justify-center border border-[#FEE2E2] bg-white shadow-sm shadow-red-950/[0.04] ${loaderSize.logoWrap}`}
      >
        <img
          src={LOGO_SRC}
          alt=""
          className={`akay-brand-loader-logo object-contain ${loaderSize.logo}`}
          draggable="false"
        />
      </div>

      <div
        className={`akay-brand-loader-word ${loaderSize.gap} flex items-center justify-center font-extrabold text-[#B91C1C] ${loaderSize.brand}`}
        aria-hidden="true"
      >
        {BRAND_LETTERS.map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            className="akay-brand-loader-letter"
            style={{ animationDelay: `${index * 130}ms` }}
          >
            {letter}
          </span>
        ))}
      </div>

      {showLabel && (
        <p
          className={`mt-1.5 font-semibold leading-snug text-[#475569] ${loaderSize.label}`}
        >
          <span>{baseLabel}</span>
          <span className="akay-brand-loader-dots" aria-hidden="true">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </p>
      )}

      <style>
        {`
          .akay-brand-loader-logo-wrap {
            isolation: isolate;
          }

          .akay-brand-loader-logo-wrap::before {
            content: "";
            position: absolute;
            inset: 15%;
            z-index: -1;
            border-radius: inherit;
            background: radial-gradient(circle, rgba(185, 28, 28, 0.1), transparent 68%);
          }

          .akay-brand-loader-logo {
            filter: drop-shadow(0 5px 10px rgba(185, 28, 28, 0.08));
            animation: akayBrandLogoBreathe 2800ms ease-in-out infinite;
          }

          .akay-brand-loader-letter {
            display: inline-block;
            opacity: 0.58;
            transform: translateY(2px) scale(0.96);
            animation: akayBrandLetterGuide 1800ms ease-in-out infinite;
          }

          .akay-brand-loader-dots span {
            display: inline-block;
            opacity: 0.35;
            animation: akayBrandDotFade 1500ms ease-in-out infinite;
          }

          .akay-brand-loader-dots span:nth-child(1) {
            animation-delay: 0ms;
          }

          .akay-brand-loader-dots span:nth-child(2) {
            animation-delay: 180ms;
          }

          .akay-brand-loader-dots span:nth-child(3) {
            animation-delay: 360ms;
          }

          .akay-brand-loader--refresh .akay-brand-loader-letter {
            animation-duration: 1500ms;
          }

          .akay-brand-loader--save .akay-brand-loader-logo {
            animation-duration: 3200ms;
          }

          .akay-brand-loader--success .akay-brand-loader-letter,
          .akay-brand-loader--success .akay-brand-loader-logo {
            animation-duration: 2200ms;
          }

          @keyframes akayBrandLogoBreathe {
            0%, 100% {
              opacity: 0.96;
              transform: scale(1);
            }
            50% {
              opacity: 1;
              transform: scale(1.025);
            }
          }

          @keyframes akayBrandLetterGuide {
            0%, 100% {
              opacity: 0.58;
              transform: translateY(2px) scale(0.96);
            }
            30%, 56% {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          @keyframes akayBrandDotFade {
            0%, 100% {
              opacity: 0.28;
              transform: translateY(0);
            }
            45% {
              opacity: 1;
              transform: translateY(-1px);
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .akay-brand-loader-logo,
            .akay-brand-loader-letter,
            .akay-brand-loader-dots span {
              animation: none !important;
              opacity: 1;
              transform: none;
            }
          }
        `}
      </style>
    </div>
  );

  if (!overlay) return loader;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/60 px-4">
      {loader}
    </div>
  );
}
