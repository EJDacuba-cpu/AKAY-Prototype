/**
 * Geometry for the profile's hover link from a Recorded Findings list item to
 * its body-figure marker. Pure functions; the overlay measures the DOM.
 */

/**
 * A cubic Bezier from `from` to `to` that leaves and arrives horizontally:
 * both control points sit half the horizontal distance in from each end.
 */
export function linkPath(from, to) {
  const dx = to.x - from.x;
  const c1 = { x: from.x + dx * 0.5, y: from.y };
  const c2 = { x: to.x - dx * 0.5, y: to.y };
  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${to.x} ${to.y}`;
}

/**
 * True when the rect has height and its vertical centre lies inside the clip
 * box (e.g. a list item still in view within its scrolling panel).
 */
export function isRectVisibleWithin(rect, clip) {
  if (!rect || !clip || !(rect.height > 0)) return false;
  const centre = (rect.top + rect.bottom) / 2;
  return centre >= clip.top && centre <= clip.bottom;
}

/** A viewport (client) point relative to a container's top-left corner. */
export function toLocalPoint(clientPoint, containerRect) {
  return { x: clientPoint.x - containerRect.left, y: clientPoint.y - containerRect.top };
}

const clamp = (value, max) => Math.min(Math.max(value, 0), Math.max(max, 0));

/**
 * Where to put a popover beside a marker. `marker` is the marker centre in px
 * inside the figure box. It opens on the side with more room, vertically
 * centred on the marker, and is clamped to stay inside the box.
 * @returns {{ left: number, top: number, side: "right" | "left" }}
 */
export function placePopover(marker, figure, popover, gap = 14) {
  const side = figure.width - marker.x >= marker.x ? "right" : "left";
  const rawLeft = side === "right" ? marker.x + gap : marker.x - gap - popover.width;
  return {
    left: clamp(rawLeft, figure.width - popover.width),
    top: clamp(marker.y - popover.height / 2, figure.height - popover.height),
    side,
  };
}

/** A straight leader line from a marker centre to a popover edge point. */
export function leaderPath(from, to) {
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
}
