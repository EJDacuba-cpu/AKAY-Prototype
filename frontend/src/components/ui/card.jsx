import { cn } from "../../lib/utils";

// shadcn/ui card primitives with AKAY's flat, slate-bordered presentation.
export function Card({ className, ...props }) {
  return (
    <div
      data-slot="card"
      className={cn("min-w-0 rounded-lg border border-slate-200 bg-white font-sans text-slate-900", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return <div data-slot="card-header" className={cn("space-y-2 p-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h2 data-slot="card-title" className={cn("font-sans! text-sm font-semibold", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div data-slot="card-content" className={cn("p-5 pt-0", className)} {...props} />;
}
