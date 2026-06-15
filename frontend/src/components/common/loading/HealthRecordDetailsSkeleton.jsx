function SkeletonBar({ className = "" }) {
  return (
    <div
      className={`animate-pulse rounded-full bg-slate-100 ${className}`}
      aria-hidden="true"
    />
  );
}

function ActionSkeleton() {
  return (
    <div className="h-9 w-28 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
  );
}

function DetailPair({ wide = false }) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <SkeletonBar className="h-2.5 w-28" />
      <SkeletonBar className="mt-2 h-4 w-full max-w-64" />
    </div>
  );
}

function SideCardSkeleton({ titleWidth = "w-36", rows = 4, large = false }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm shadow-black/[0.02]">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="h-8 w-8 animate-pulse rounded-lg bg-red-50" />
        <SkeletonBar className={`h-4 ${titleWidth}`} />
      </div>

      {large ? (
        <div className="space-y-6">
          <div>
            <div className="mb-4 border-b border-slate-100 pb-2">
              <SkeletonBar className="h-3 w-40" />
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <DetailPair />
              <DetailPair />
              <DetailPair wide />
              <DetailPair wide />
            </div>
          </div>
          <div>
            <div className="mb-4 border-b border-slate-100 pb-2">
              <SkeletonBar className="h-3 w-28" />
            </div>
            <SkeletonBar className="h-20 w-full rounded-xl" />
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {Array.from({ length: rows }).map((_, index) => (
            <DetailPair key={index} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function HealthRecordDetailsSkeleton({
  showActions = true,
  backLabelWidth = "w-36",
}) {
  return (
    <div className="space-y-6">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2">
          <SkeletonBar className="h-4 w-4" />
          <SkeletonBar className={`h-4 ${backLabelWidth}`} />
        </div>

        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <SkeletonBar className="h-6 w-64 max-w-full rounded-lg" />
              <SkeletonBar className="h-6 w-28" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <SkeletonBar className="h-3 w-24" />
              <SkeletonBar className="h-3 w-32" />
              <SkeletonBar className="h-3 w-44" />
            </div>
          </div>

          {showActions && (
            <div className="flex shrink-0 flex-wrap gap-2">
              <ActionSkeleton />
              <ActionSkeleton />
              <ActionSkeleton />
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SideCardSkeleton titleWidth="w-32" large />
        </div>
        <div className="space-y-6">
          <SideCardSkeleton titleWidth="w-36" rows={4} />
          <SideCardSkeleton titleWidth="w-28" rows={4} />
        </div>
      </div>
    </div>
  );
}
