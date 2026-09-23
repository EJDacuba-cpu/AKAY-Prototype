import { cn } from "../../lib/utils";

// shadcn/ui native input with AKAY tokens and accessible invalid states.
export function Input({ className, type, ...props }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-700 aria-invalid:ring-red-700/15 sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}
