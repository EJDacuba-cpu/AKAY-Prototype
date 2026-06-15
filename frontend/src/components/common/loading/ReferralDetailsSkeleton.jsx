function SkeletonBar({ className = "" }) {
  return (
    <div
      className={`animate-pulse rounded-full bg-slate-100 ${className}`}
      aria-hidden="true"
    />
  );
}

function HeaderDetailSkeleton() {
  return (
    <div className="min-w-0">
      <SkeletonBar className="h-2.5 w-28" />
      <SkeletonBar className="mt-2 h-4 w-full max-w-40" />
    </div>
  );
}

function InfoChipSkeleton({ width = "w-28" }) {
  return (
    <div className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1">
      <SkeletonBar className="h-3 w-3 bg-slate-200" />
      <SkeletonBar className={`h-3 ${width} bg-slate-200`} />
    </div>
  );
}

function TabSkeleton({ active, width }) {
  return (
    <div
      className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 ${
        active ? "border-[#B91C1C]" : "border-transparent"
      }`}
    >
      <SkeletonBar className={`h-3.5 w-3.5 ${active ? "bg-red-100" : ""}`} />
      <SkeletonBar className={`h-3.5 ${width} ${active ? "bg-red-100" : ""}`} />
    </div>
  );
}

function NarrativeBlockSkeleton({ height = "h-16" }) {
  return (
    <div>
      <SkeletonBar className="mb-2 h-2.5 w-40" />
      <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
        <SkeletonBar className="h-3 w-11/12" />
        <SkeletonBar className="mt-3 h-3 w-4/5" />
        <SkeletonBar className={`mt-3 ${height} w-2/3 rounded-lg`} />
      </div>
    </div>
  );
}

export default function ReferralDetailsSkeleton() {
  return (
    <div>
      <div className="mb-3 inline-flex items-center gap-2">
        <SkeletonBar className="h-4 w-4" />
        <SkeletonBar className="h-4 w-28" />
      </div>

      <header className="mb-5 border-b border-slate-200 pb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <SkeletonBar className="h-8 w-72 max-w-full rounded-lg" />
              <SkeletonBar className="h-6 w-24" />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <InfoChipSkeleton width="w-20" />
              <InfoChipSkeleton width="w-28" />
              <InfoChipSkeleton width="w-36" />
            </div>
          </div>

          <div className="mb-5 flex justify-end">
            <div className="h-10 w-40 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
          </div>
        </div>

        <div className="mt-4 grid gap-x-6 gap-y-3 border-t border-slate-100 pt-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 7 }).map((_, index) => (
            <HeaderDetailSkeleton key={index} />
          ))}
        </div>
      </header>

      <div className="mb-5 border-b border-slate-200">
        <nav className="-mb-px flex overflow-x-auto" aria-hidden="true">
          <TabSkeleton active width="w-32" />
          <TabSkeleton width="w-28" />
        </nav>
      </div>

      <main className="min-w-0">
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-start gap-2.5 border-b border-slate-100 pb-3">
              <div className="flex h-8 w-8 shrink-0 animate-pulse items-center justify-center rounded-lg bg-red-50" />
              <div>
                <SkeletonBar className="h-4 w-36" />
                <SkeletonBar className="mt-2 h-3 w-72 max-w-full" />
              </div>
            </div>

            <div className="space-y-4">
              <NarrativeBlockSkeleton />
              <NarrativeBlockSkeleton />
              <NarrativeBlockSkeleton />
              <NarrativeBlockSkeleton />
              <NarrativeBlockSkeleton />
              <NarrativeBlockSkeleton height="h-10" />
              <NarrativeBlockSkeleton height="h-8" />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
