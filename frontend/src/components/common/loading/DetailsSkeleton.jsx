function SkeletonBar({ className = "" }) {
  return <div className={`animate-pulse rounded bg-slate-100 ${className}`} />;
}

export default function DetailsSkeleton({ label = "Loading details..." }) {
  return (
    <div className="mx-auto max-w-5xl space-y-5 py-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <SkeletonBar className="h-5 w-48" />
        <p className="mt-3 text-[12px] font-medium text-slate-400">{label}</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index}>
              <SkeletonBar className="h-3 w-24" />
              <SkeletonBar className="mt-2 h-4 w-36" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <SkeletonBar className="h-4 w-40" />
        <div className="mt-5 space-y-3">
          <SkeletonBar className="h-4 w-full" />
          <SkeletonBar className="h-4 w-11/12" />
          <SkeletonBar className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  );
}
