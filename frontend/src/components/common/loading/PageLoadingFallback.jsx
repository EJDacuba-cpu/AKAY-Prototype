export default function PageLoadingFallback({
  label = "Checking session...",
  title,
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-8 py-7 shadow-sm">
          {title && (
            <p className="mb-2 text-center text-sm font-bold text-[#0F172A]">
              {title}
            </p>
          )}
          <div className="flex items-center justify-center gap-3">
            <span
              className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#B91C1C]"
              aria-hidden="true"
            />
            <span className="text-[12px] font-medium text-slate-500">
              {label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
