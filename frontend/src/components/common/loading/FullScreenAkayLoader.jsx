const AKAY_LETTERS = ["A", "K", "A", "Y"];

export default function FullScreenAkayLoader({
  message = "Loading system...",
}) {
  

  return (
    <div
      className="fixed inset-0 z-[9999] flex min-h-dvh items-center justify-center bg-white px-6"
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div className="flex flex-col items-center text-center">
        <img
          src="/akay-logo-splash.svg"
          alt=""
          className="h-24 w-24 object-contain sm:h-28 sm:w-28"
          draggable="false"
        />

        <h1
          className="mt-6 flex items-center justify-center gap-2 text-2xl font-extrabold text-[#B91C1C] sm:gap-2.5 sm:text-[28px]"
          aria-label="AKAY"
        >
          {AKAY_LETTERS.map((letter, index) => (
            <span
              key={`${letter}-${index}`}
              className="akay-splash-letter"
              aria-hidden="true"
            >
              {letter}
            </span>
          ))}
        </h1>

        <p className="mt-3 text-sm font-medium text-slate-500">{message}</p>

      </div>

      <style>{`
        .akay-splash-letter {
          display: inline-block;
          animation: akaySplashLetterWave 1800ms ease-in-out infinite;
          transform-origin: center;
          will-change: transform, opacity;
        }

        .akay-splash-letter:nth-child(2) {
          animation-delay: 120ms;
        }

        .akay-splash-letter:nth-child(3) {
          animation-delay: 240ms;
        }

        .akay-splash-letter:nth-child(4) {
          animation-delay: 360ms;
        }

        @keyframes akaySplashLetterWave {
          0%, 72%, 100% {
            opacity: 0.72;
            transform: translateY(0);
          }
          36% {
            opacity: 1;
            transform: translateY(-1.5px);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .akay-splash-letter {
            animation: none;
            transform: none;
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
