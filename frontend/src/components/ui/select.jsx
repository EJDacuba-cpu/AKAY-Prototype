import { cn } from "../../lib/utils";

// Native select styled like Input, so selects and inputs on one form share height, radius, and focus.
export function Select({ className, ...props }) {
  return (
    <select
      data-slot="select"
      className={cn(
        "flex h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm outline-none transition-colors focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-700 aria-invalid:ring-red-700/15 sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}
