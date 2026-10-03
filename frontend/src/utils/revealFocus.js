/**
 * Which body area the Visual Health Summary is revealing, and whether that
 * reveal is pinned. `focus` is null or
 * `{ source: "row" | "marker", key: "<side>:<region>", region, side, el }`
 * (`el` is the Findings row element for a row, undefined for a marker).
 *
 * Hover reveals come and go with hover/focus; a click pins the reveal so
 * leave and blur (e.g. focus moving into the popover) never tear it down.
 * Only a second click on the same area, a dismiss (Escape, outside press,
 * opening a record) or a reset (flip, Latest/History change) unpins.
 */
export const INITIAL_REVEAL = Object.freeze({ focus: null, pinned: false });

function focusOf(source, area, el) {
  return { source, key: area.key, region: area.region, side: area.side, el };
}

export function revealFocusReducer(state, action) {
  switch (action?.type) {
    case "hover": {
      if (state.pinned) return state;
      const { focus } = state;
      if (focus && focus.source === action.source && focus.key === action.area.key && focus.el === action.el) {
        return state;
      }
      return { focus: focusOf(action.source, action.area, action.el), pinned: false };
    }
    case "leave": {
      const { focus } = state;
      if (state.pinned || !focus) return state;
      if (focus.source !== action.source || focus.key !== action.key) return state;
      if (action.el !== undefined && focus.el !== action.el) return state;
      return INITIAL_REVEAL;
    }
    case "click": {
      if (state.pinned && state.focus?.key === action.area.key) return INITIAL_REVEAL;
      const focus = focusOf(action.source, action.area, action.el);
      // An area on the other side only hints at the flip button: the figure
      // never flips on its own.
      if (action.area.side !== action.currentSide) return { focus, pinned: false };
      return { focus, pinned: true };
    }
    case "dismiss":
    case "reset":
      return INITIAL_REVEAL;
    default:
      return state;
  }
}
