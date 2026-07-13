import { Wifi } from "lucide-react";
import { useEffect, useState } from "react";

export default function ConnectionStatusBanner({ isOnline, restoredAt }) {
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    if (!restoredAt) return undefined;

    setShowRestored(true);
    const timer = window.setTimeout(() => setShowRestored(false), 4000);
    return () => window.clearTimeout(timer);
  }, [restoredAt]);

  if (!isOnline) return null;

  if (!showRestored) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[10000] rounded-full border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 shadow-lg shadow-slate-900/10">
      <div className="flex items-center gap-2">
        <Wifi size={13} />
        Back online
      </div>
    </div>
  );
}
