export default function CenterSpinner({ label = "Loading..." }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-[#B91C1C]" />
        <p className="text-[12px] font-medium text-slate-400">{label}</p>
      </div>
    </div>
  );
}
