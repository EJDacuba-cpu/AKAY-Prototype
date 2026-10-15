import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "../../lib/utils";

// shadcn/ui Popover, using AKAY's tokens and the same Radix pattern as its menus.
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({ className, align = "center", sideOffset = 10, ...props }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={16}
        hideWhenDetached
        className={cn(
          "z-50 w-80 max-w-[calc(100vw-2rem)] max-h-[min(28rem,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain rounded-xl border border-neutral-200 bg-white p-4 font-sans text-sm text-neutral-900 shadow-lg outline-none [scrollbar-width:thin]",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
