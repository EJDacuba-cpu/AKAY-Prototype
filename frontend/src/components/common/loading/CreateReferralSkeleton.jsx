function SkeletonBar({ className = "" }) {
  return (
    <div
      className={`animate-pulse rounded-full bg-slate-100 ${className}`}
      aria-hidden="true"
    />
  );
}

function FormDocumentSkeleton({ children, titleWidth = "w-40" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 animate-pulse rounded-lg bg-red-50" />
          <div>
            <SkeletonBar className={`h-4 ${titleWidth}`} />
            <SkeletonBar className="mt-2 h-3 w-56" />
          </div>
        </div>
      </div>
      <div className="px-5 py-1">{children}</div>
    </div>
  );
}

function SectionDividerSkeleton({ width = "w-44" }) {
  return (
    <div className="flex items-center gap-3 pt-5 first:pt-3">
      <SkeletonBar className={`h-3 ${width}`} />
      <div className="h-px flex-1 bg-slate-100" />
    </div>
  );
}

function MetaRows({ columns = "md:grid-cols-4", count = 4 }) {
  return (
    <div className={`grid grid-cols-2 gap-x-8 gap-y-4 pt-3 ${columns}`}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index}>
          <SkeletonBar className="h-2.5 w-28" />
          <SkeletonBar className="mt-2 h-4 w-36" />
        </div>
      ))}
    </div>
  );
}

function FieldSkeleton() {
  return (
    <div>
      <SkeletonBar className="h-2.5 w-32" />
      <SkeletonBar className="mt-2 h-11 w-full rounded-xl" />
    </div>
  );
}

function NarrativeSkeleton({ tall = false }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
      <SkeletonBar className="h-3 w-11/12" />
      <SkeletonBar className="mt-3 h-3 w-4/5" />
      <SkeletonBar className={`mt-3 ${tall ? "h-16" : "h-3"} w-2/3`} />
    </div>
  );
}

export default function CreateReferralSkeleton() {
  return (
    <div className="pb-12">
      <div className="mb-3 inline-flex items-center gap-2">
        <SkeletonBar className="h-4 w-4" />
        <SkeletonBar className="h-4 w-36" />
      </div>

      <header className="mb-5 border-b border-slate-200 pb-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <SkeletonBar className="h-8 w-48 rounded-lg" />
            <SkeletonBar className="h-6 w-32 rounded-md bg-red-50" />
          </div>
          <SkeletonBar className="mt-3 h-4 w-full max-w-2xl" />
          <SkeletonBar className="mt-2 h-4 w-96 max-w-full" />
        </div>
      </header>

      <div className="space-y-4">
        <FormDocumentSkeleton
          titleWidth="w-40"
        >
          <SectionDividerSkeleton width="w-48" />
          <MetaRows />

          <SectionDividerSkeleton width="w-64" />
          <div className="grid gap-4 pt-3 pb-1 lg:grid-cols-2">
            <FieldSkeleton />
            <FieldSkeleton />
          </div>

          <SectionDividerSkeleton width="w-28" />
          <div className="grid gap-3 pt-3 pb-1 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex items-start gap-2.5">
                <SkeletonBar className="mt-0.5 h-4 w-4" />
                <div className="flex-1">
                  <SkeletonBar className="h-3 w-24" />
                  <SkeletonBar className="mt-2 h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        </FormDocumentSkeleton>

        <FormDocumentSkeleton titleWidth="w-36">
          <MetaRows columns="md:grid-cols-2" count={5} />
          <SectionDividerSkeleton width="w-44" />
          <div className="grid gap-4 pt-3 pb-1 sm:grid-cols-2">
            <FieldSkeleton />
            <FieldSkeleton />
          </div>
        </FormDocumentSkeleton>

        <FormDocumentSkeleton titleWidth="w-36">
          <SectionDividerSkeleton width="w-40" />
          <MetaRows columns="md:grid-cols-2" count={2} />

          <SectionDividerSkeleton width="w-36" />
          <div className="pt-3">
            <NarrativeSkeleton />
          </div>

          <SectionDividerSkeleton width="w-72" />
          <div className="pt-3">
            <NarrativeSkeleton />
          </div>

          <SectionDividerSkeleton width="w-36" />
          <div className="pt-3">
            <NarrativeSkeleton />
          </div>

          <SectionDividerSkeleton width="w-44" />
          <div className="pt-3 pb-1">
            <NarrativeSkeleton />
          </div>
        </FormDocumentSkeleton>

        <FormDocumentSkeleton titleWidth="w-48">
          <div className="pt-3 pb-1">
            <SkeletonBar className="h-2.5 w-36" />
            <SkeletonBar className="mt-2 h-28 w-full rounded-xl" />
          </div>
        </FormDocumentSkeleton>

        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <SkeletonBar className="h-10 w-24 rounded-xl" />
            <SkeletonBar className="h-10 w-40 rounded-xl bg-red-100" />
          </div>
        </div>
      </div>
    </div>
  );
}
