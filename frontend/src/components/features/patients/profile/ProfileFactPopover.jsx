import { useId } from "react";
import { X } from "lucide-react";

import { Button } from "../../../ui/button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "../../../ui/popover";

/** A labelled round control. Details are click-only; a known allergy stays visible. */
export default function ProfileFactPopover({ label, Icon, warning, count, open, onOpenChange, side = "right", children }) {
  const labelId = useId();
  const titleId = useId();
  const warningId = useId();

  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-labelledby={labelId}
            aria-describedby={warning ? warningId : undefined}
            className={`relative size-12 rounded-full border shadow-xs data-[state=open]:ring-2 data-[state=open]:ring-ink-300 data-[state=open]:ring-offset-2 ${
              warning
                ? "border-alert-200 bg-alert-50 text-alert-700 hover:bg-alert-100 hover:text-alert-800"
                : "border-neutral-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50 hover:text-ink-800"
            }`}
          >
            <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
            {count > 0 && (
              <span aria-hidden="true" className="absolute -right-1 -top-1 min-w-4 rounded-full bg-ink-700 px-1 text-[10px] leading-4 tabular-nums text-white">
                {count}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent side={side} aria-labelledby={titleId}>
          <header className="mb-3 flex items-center justify-between gap-3">
            <h3 id={titleId} className="font-sans! text-sm font-semibold">{label}</h3>
            <PopoverClose asChild>
              <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Close ${label.toLowerCase()}`}>
                <X size={16} aria-hidden="true" />
              </Button>
            </PopoverClose>
          </header>
          {children}
        </PopoverContent>
      </Popover>
      <span id={labelId} className="max-w-24 text-[11px] font-medium leading-4 text-neutral-600">{label}</span>
      {warning && <span id={warningId} className="max-w-24 text-[11px] font-semibold leading-4 text-alert-700">{warning}</span>}
    </div>
  );
}
