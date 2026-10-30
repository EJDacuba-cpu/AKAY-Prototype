import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { isRectVisibleWithin, linkPath, toLocalPoint } from "../../../../utils/findingLink";

// A stable id per list-item element, so the path re-mounts (and re-draws)
// whenever the line starts from a different item.
const itemKeys = new WeakMap();
let nextItemKey = 0;
function keyFor(el) {
  if (!itemKeys.has(el)) {
    nextItemKey += 1;
    itemKeys.set(el, nextItemKey);
  }
  return itemKeys.get(el);
}

const round = (value) => Math.round(value * 10) / 10;
const roundPoint = ({ x, y }) => ({ x: round(x), y: round(y) });

/**
 * Where the line runs, in the container's local pixels, or null when an end is
 * missing or the item has scrolled out of its section (or the section closed).
 */
function measureLink(container, itemEl, markerRegion) {
  if (!itemEl.isConnected) return null;
  const core = container.querySelector(`[data-marker-region="${markerRegion}"] [data-marker-core]`);
  const clipEl = itemEl.closest("[id$='-panel']");
  if (!core || !clipEl) return null;

  const itemRect = itemEl.getBoundingClientRect();
  if (!isRectVisibleWithin(itemRect, clipEl.getBoundingClientRect())) return null;

  const box = container.getBoundingClientRect();
  const coreRect = core.getBoundingClientRect();
  const from = roundPoint(toLocalPoint({ x: itemRect.right, y: itemRect.top + itemRect.height / 2 }, box));
  const to = roundPoint(
    toLocalPoint({ x: coreRect.left + coreRect.width / 2, y: coreRect.top + coreRect.height / 2 }, box),
  );
  return { key: keyFor(itemEl), from, d: linkPath(from, to) };
}

const sameLink = (a, b) => a === b || (a !== null && b !== null && a.key === b.key && a.d === b.d);

/**
 * The profile's hover link: a red curve drawn from a Findings list row's
 * right edge to the centre of its body-figure marker, over the
 * `containerRef` element (which must be positioned). Geometry and drawing
 * only - the caller decides when a link applies. Re-measures on container
 * resize, on any scroll inside it, and when its content changes. Renders
 * nothing while either end is missing or the item is out of view.
 */
export default function FindingLinkOverlay({ containerRef, itemEl, markerRegion }) {
  const [link, setLink] = useState(null);
  const [measured, setMeasured] = useState({ key: null, length: 0 });
  const pathRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !itemEl || !markerRegion) {
      setLink(null);
      return undefined;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const next = measureLink(container, itemEl, markerRegion);
      setLink((current) => (sameLink(current, next) ? current : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    schedule();
    const resize = new ResizeObserver(schedule);
    resize.observe(container);
    // Sections opening or closing move (or remove) the item without resizing
    // the container.
    const mutations = new MutationObserver(schedule);
    mutations.observe(container, { childList: true, subtree: true });
    container.addEventListener("scroll", schedule, true);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      container.removeEventListener("scroll", schedule, true);
    };
  }, [containerRef, itemEl, markerRegion]);

  // The draw animation needs the path's length, so the path stays hidden
  // until it has been measured for this item.
  useLayoutEffect(() => {
    if (!link || !pathRef.current) return;
    const length = round(pathRef.current.getTotalLength());
    setMeasured((current) => (current.key === link.key && current.length === length ? current : { key: link.key, length }));
  }, [link]);

  if (!link) return null;
  const ready = measured.key === link.key && measured.length > 0;

  return (
    <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible" aria-hidden="true">
      <path
        key={link.key}
        ref={pathRef}
        d={link.d}
        fill="none"
        stroke="#DC2626"
        strokeWidth={1.5}
        className={ready ? "anatomy-link-draw" : undefined}
        style={ready ? { "--link-length": measured.length, strokeDasharray: measured.length } : { visibility: "hidden" }}
      />
      {ready && <circle cx={link.from.x} cy={link.from.y} r={3} fill="#DC2626" />}
    </svg>
  );
}
