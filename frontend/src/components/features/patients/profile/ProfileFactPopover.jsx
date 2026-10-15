import { useId } from "react";
import { X } from "lucide-react";

import { Button } from "../../../ui/button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "../../../ui/popover";

const LABEL_CLASS = {
  default: "max-w-24 text-[11px] font-medium leading-4 text-neutral-600",
  left: "text-[11px] font-medium leading-4 text-neutral-600",
  below: "text-[11px] font-medium leading-4 text-neutral-600",
  icon: "sr-only",
};
const LABEL_BOX = {
  left: "absolute right-full top-1/2 mr-2.5 w-20 -translate-y-1/2 text-right",
  below: "absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-center",
  icon: "",
};

/**
 * A labelled round control. Details are click-only; a known allergy stays
 * visible. With a placement the control is positioned by `style` on an arc
 * around the body figure and the label sits beside ("left") or under ("below")
 * the circle; without one it is a plain stacked control.
 */
export default function ProfileFactPopover({ label, Icon, warning, count, open, onOpenChange, side = "right", size = "md", placement, style, children }) {
  const labelId = useId();
  const titleId = useId();
  const warningId = useId();
  const small = size === "sm";
  const labelClass = LABEL_CLASS[placement || "default"];
  const labels = (
    <>
      <span id={labelId} className={labelClass}>{label}</span>
      {warning && <span id={warningId} className="block max-w-24 text-[11px] font-semibold leading-4 text-alert-700">{warning}</span>}
    </>
  );

  return (
    <div
      style={style}
      className={placement ? `absolute -translate-x-1/2 -translate-y-1/2 ${small ? "size-8" : "size-12"}` : "flex min-w-0 flex-col items-center gap-1.5 text-center"}
    >
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title={placement === "icon" ? label : undefined}
            aria-labelledby={labelId}
            aria-describedby={warning ? warningId : undefined}
            className={`relative ${small ? "size-8" : "size-12"} rounded-full border shadow-xs data-[state=open]:ring-2 data-[state=open]:ring-ink-300 data-[state=open]:ring-offset-2 ${
              warning
                ? "border-alert-200 bg-alert-50 text-alert-700 hover:bg-alert-100 hover:text-alert-800"
                : "border-neutral-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50 hover:text-ink-800"
            }`}
          >
            <Icon size={small ? 15 : 19} strokeWidth={1.7} aria-hidden="true" />
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
      {placement ? <div className={LABEL_BOX[placement]}>{labels}</div> : labels}
    </div>
  );
}
