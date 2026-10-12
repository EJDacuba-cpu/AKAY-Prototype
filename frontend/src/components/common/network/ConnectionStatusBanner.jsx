import { Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * While the device is offline, a bar under the header says so and stays until the connection returns;
 * then a short "Back online" pill shows for 4 seconds.
 */
export default function ConnectionStatusBanner({ isOnline, restoredAt }) {
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    if (!restoredAt) return undefined;

    setShowRestored(true);
    const timer = window.setTimeout(() => setShowRestored(false), 4000);
    return () => window.clearTimeout(timer);
  }, [restoredAt]);

  if (!isOnline) {
    return (
      <div
        role="status"
        className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800"
      >
        <WifiOff size={14} aria-hidden="true" />
        You&apos;re offline. Changes can&apos;t be saved until the connection returns.
      </div>
    );
  }

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
