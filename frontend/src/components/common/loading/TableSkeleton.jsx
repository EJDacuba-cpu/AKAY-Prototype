function SkeletonBar({ className = "" }) {
  return <div className={`animate-pulse rounded bg-slate-100 ${className}`} />;
}

export default function TableSkeleton({
  columns = 6,
  rows = 8,
  label = "Loading...",
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <p className="text-[12px] font-semibold text-slate-500">{label}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70">
              {Array.from({ length: columns }).map((_, index) => (
                <th key={index} className="px-5 py-3">
                  <SkeletonBar className="h-3 w-20" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: columns }).map((__, columnIndex) => (
                  <td key={columnIndex} className="px-5 py-4">
                    <SkeletonBar
                      className={
                        columnIndex === 0
                          ? "h-4 w-24"
                          : columnIndex === 1
                            ? "h-4 w-36"
                            : "h-4 w-28"
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
