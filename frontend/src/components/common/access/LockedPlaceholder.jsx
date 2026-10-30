/** Static stand-in blurred behind a locked module when no sample render of the real component exists. */
export default function LockedPlaceholder({ lines = 3, className = "min-h-32" }) {
  return (
    <div className={`space-y-3 rounded-xl border border-slate-200 bg-white p-5 ${className}`}>
      <div className="h-4 w-1/3 rounded bg-slate-200" />
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className="h-3 rounded bg-slate-100" style={{ width: `${90 - index * 15}%` }} />
      ))}
    </div>
  );
}
