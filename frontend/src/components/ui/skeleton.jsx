import { cn } from "../../lib/utils";

// shadcn-style decorative primitive; the surrounding loading region owns announcements.
export function Skeleton({ className, ...props }) {
  return <div {...props} data-slot="skeleton" aria-hidden="true" className={cn("min-w-0 max-w-full rounded-md bg-neutral-100 motion-safe:animate-pulse motion-reduce:animate-none", className)} />;
}
