// Shared class recipes for the sidebar (desktop rail + mobile drawer).
// Calm Clinical Workspace: the rail sits on the tinted shell; the active item is
// a raised white pill whose icon carries the brand red - the one red on the rail.

export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50";

export function navItemClass(active) {
  return `group relative flex h-9 w-full items-center rounded-lg text-[13px] font-medium transition-[background-color,color,box-shadow] duration-150 ${FOCUS_RING} ${
    active
      ? "bg-white text-neutral-900 shadow-xs ring-1 ring-neutral-900/[0.06] [&>svg:first-child]:text-brand-600"
      : "text-neutral-600 hover:bg-neutral-900/[0.045] hover:text-neutral-900 [&>svg:first-child]:text-neutral-500 hover:[&>svg:first-child]:text-neutral-700"
  }`;
}

// A module the account holds no permission for: listed so navigation looks the same for everyone, never a link.
export const LOCKED_NAV_ITEM_CLASS = `group relative flex h-9 w-full cursor-not-allowed items-center rounded-lg text-[13px] font-medium text-neutral-400 ${FOCUS_RING}`;

export function childLinkClass(active) {
  return `relative block rounded-md py-1.5 pl-3 pr-2 text-[12.5px] transition-colors duration-150 ${FOCUS_RING} ${
    active
      ? "font-medium text-neutral-900"
      : "font-medium text-neutral-500 hover:bg-neutral-900/[0.045] hover:text-neutral-900"
  }`;
}

export const SECTION_LABEL_CLASS =
  "px-2.5 text-[11px] font-medium leading-tight text-neutral-500";

export const SIGN_OUT_CLASS = `flex h-9 w-full items-center justify-center gap-2 rounded-lg text-[13px] font-medium text-neutral-600 transition-colors duration-150 hover:bg-neutral-900/[0.045] hover:text-alert-700 ${FOCUS_RING}`;
