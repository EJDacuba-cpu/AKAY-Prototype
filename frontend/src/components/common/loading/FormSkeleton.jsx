function SkeletonBar({ className = "" }) {
  return <div className={`animate-pulse rounded bg-slate-100 ${className}`} />;
}

export default function FormSkeleton({ label = "Loading details..." }) {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <p className="text-[12px] font-medium text-slate-400">{label}</p>
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <SkeletonBar className="h-4 w-44" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <SkeletonBar className="h-11 w-full rounded-xl" />
            <SkeletonBar className="h-11 w-full rounded-xl" />
            <SkeletonBar className="h-11 w-full rounded-xl" />
            <SkeletonBar className="h-11 w-full rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}
