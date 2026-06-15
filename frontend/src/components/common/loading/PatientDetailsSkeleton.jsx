function SkeletonBar({ className = "" }) {
  return (
    <div
      className={`animate-pulse rounded-full bg-slate-100 ${className}`}
      aria-hidden="true"
    />
  );
}

function SkeletonChip({ width = "w-28" }) {
  return (
    <div className="inline-flex h-8 items-center gap-2 rounded-lg bg-slate-100 px-3">
      <SkeletonBar className="h-3 w-3 bg-slate-200" />
      <SkeletonBar className={`h-3 ${width} bg-slate-200`} />
    </div>
  );
}

function CardHeaderSkeleton({ subtitle = true }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-red-50" />
          <SkeletonBar className="h-4 w-40" />
        </div>
        {subtitle && <SkeletonBar className="mt-2 h-3 w-52" />}
      </div>
    </div>
  );
}

function DetailRows({ count = 6 }) {
  return (
    <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index}>
          <SkeletonBar className="h-2.5 w-24" />
          <SkeletonBar className="mt-2 h-4 w-36" />
        </div>
      ))}
    </div>
  );
}

export default function PatientDetailsSkeleton({
  backLabelWidth = "w-28",
  latestLabelWidth = "w-36",
  recordsTabWidth = "w-28",
  showActionButton = true,
}) {
  return (
    <div className="space-y-6">
      <div className="mb-6">
        <div className="mb-6 inline-flex items-center gap-2">
          <SkeletonBar className="h-4 w-4" />
          <SkeletonBar className={`h-4 ${backLabelWidth}`} />
        </div>

        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 space-y-4">
            <SkeletonBar className="h-9 w-72 max-w-full rounded-lg" />

            <div className="flex flex-wrap items-center gap-2">
              <SkeletonChip width="w-24" />
              <SkeletonChip width="w-32" />
              <SkeletonChip width="w-36" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SkeletonBar className={`h-4 ${latestLabelWidth}`} />
              <SkeletonBar className="h-4 w-64 max-w-full" />
            </div>
          </div>

          {showActionButton && (
            <div className="h-10 w-32 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
          )}
        </div>
      </div>

      <div className="mb-6 flex overflow-x-auto border-b border-slate-200">
        <div className="border-b-2 border-[#B91C1C] px-5 py-3">
          <SkeletonBar className="h-4 w-36 bg-red-100" />
        </div>
        <div className="border-b-2 border-transparent px-5 py-3">
          <SkeletonBar className={`h-4 ${recordsTabWidth}`} />
        </div>
        <div className="border-b-2 border-transparent px-5 py-3">
          <SkeletonBar className="h-4 w-32" />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm shadow-black/[0.02]">
          <CardHeaderSkeleton />

          <div className="mt-6 space-y-8">
            <div>
              <div className="mb-4 border-b border-slate-100 pb-2">
                <SkeletonBar className="h-3 w-40" />
              </div>
              <DetailRows count={6} />
            </div>
          </div>
        </section>

        <aside>
          <section className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm shadow-black/[0.02]">
            <CardHeaderSkeleton subtitle={false} />

            <div className="mt-6 space-y-5">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index}>
                  <SkeletonBar className="h-2.5 w-28" />
                  <SkeletonBar className="mt-2 h-4 w-full" />
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
