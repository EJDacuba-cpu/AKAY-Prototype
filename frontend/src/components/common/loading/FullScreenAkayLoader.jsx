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
          src="/akay-logo.png"
          alt="AKAY"
          className="akay-splash-logo h-16 w-auto max-w-full object-contain sm:h-20"
          draggable="false"
        />

        <p className="mt-6 text-sm font-medium text-slate-500">{message}</p>
      </div>

      <style>{`
        .akay-splash-logo {
          animation: akaySplashBreathe 1800ms ease-in-out infinite;
          will-change: opacity;
        }

        @keyframes akaySplashBreathe {
          0%, 100% {
            opacity: 0.78;
          }
          50% {
            opacity: 1;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .akay-splash-logo {
            animation: none;
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
