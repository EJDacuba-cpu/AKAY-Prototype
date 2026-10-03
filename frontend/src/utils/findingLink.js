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
