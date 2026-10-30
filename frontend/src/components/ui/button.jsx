import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

// shadcn/ui button with AKAY Clinic Ledger variants.
// default = navy-ink chrome (admin / non-clinical). brand = clinical primary pill.
// destructive stays visually distinct from brand (alert red, not register red).
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-primary)] text-white shadow-xs hover:bg-[var(--color-primary-hover)]",
        ghost: "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
        link: "text-[var(--color-primary)] underline-offset-4 hover:underline",
        brand:
          "rounded-full bg-brand-600 text-[13px] font-medium text-white shadow-xs hover:bg-brand-700 focus-visible:ring-ink-400/50 focus-visible:ring-offset-0",
        secondary:
          "rounded-full border border-neutral-200 bg-white text-[13px] font-medium text-neutral-700 shadow-xs hover:border-neutral-300 hover:bg-neutral-50 focus-visible:ring-ink-400/50 focus-visible:ring-offset-0",
        filter:
          "rounded-full border border-neutral-200 bg-white text-[13px] font-medium text-neutral-700 shadow-xs hover:border-neutral-300 hover:bg-neutral-50 focus-visible:ring-ink-400/50 focus-visible:ring-offset-0 aria-pressed:border-brand-200 aria-pressed:bg-brand-50 aria-pressed:text-brand-800 aria-pressed:hover:border-brand-200 aria-pressed:hover:bg-brand-50",
        destructive:
          "rounded-full bg-[var(--color-danger)] text-[13px] font-medium text-white shadow-xs hover:bg-[var(--color-danger-hover)] focus-visible:ring-ink-400/50 focus-visible:ring-offset-0",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        compact: "h-8 px-3.5 text-[12px]",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
