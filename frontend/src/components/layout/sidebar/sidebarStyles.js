// Shared class recipes for the sidebar (desktop rail + mobile drawer).
// Medical EHR minimalism: sharp corners, borders over shadows, red-600 accent.

export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-300";

export function navItemClass(active) {
  return `group relative flex h-9 w-full items-center border-l-4 text-[13px] transition-colors duration-150 ${FOCUS_RING} ${
    active
      ? "border-l-red-600 bg-red-50 font-semibold text-red-700"
      : "border-l-transparent font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
  }`;
}

export function childLinkClass(active) {
  return `relative block py-1.5 pl-4 pr-2 text-[12px] transition-colors duration-150 ${FOCUS_RING} ${
    active
      ? "font-semibold text-red-700"
      : "font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900"
  }`;
}

export const SECTION_LABEL_CLASS =
  "px-2 text-[10px] font-semibold uppercase leading-tight tracking-wider text-gray-500";

export const SIGN_OUT_CLASS =
  "flex h-9 w-full items-center justify-center gap-2 border border-gray-200 bg-white text-[12px] font-semibold text-red-600 transition-colors duration-150 hover:border-red-200 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300";
