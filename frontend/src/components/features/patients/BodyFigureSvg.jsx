import { useEffect, useId, useRef, useState } from "react";

import AnatomyFigure from "./AnatomyFigure";
import { BODY_REGIONS, getBodyRegionLabel } from "../../../utils/bodyFindings";
import { getDotPosition, getFigureKey, highlightStyle, markerStyle } from "../../../utils/bodyFigureGeometry";
import { leaderPath, placePopover } from "../../../utils/findingLink";
import { formatShortDate } from "../../../utils/patientProfile";
import { phaseReached } from "../../../utils/revealSequence";

const MAX_POPOVER_FINDINGS = 3;
const POPOVER_WIDTH = 200;
const NO_FINDINGS = {};

const AREA_FILL = {
  background: "radial-gradient(closest-side, rgba(220,38,38,0.55), rgba(220,38,38,0.18) 60%, rgba(220,38,38,0) 100%)",
  filter: "blur(6px)",
  mixBlendMode: "multiply",
};

const plural = (count) => `${count} finding${count === 1 ? "" : "s"}`;

/**
 * One recorded-findings marker: a transparent 24px button at the region's
 * normalized position with a small 7px red dot, so it never hides the
 * anatomy underneath. `data-marker-region` / `data-marker-core` let the
 * profile's finding link find the marker's visible centre.
 */
function Marker({ region, label, position, count, active, expanded, controls, onEnter, onLeave, onClick }) {
  return (
    <button
      type="button"
      data-marker-region={region}
      aria-expanded={expanded}
      aria-controls={expanded ? controls : undefined}
      aria-label={`${label}, ${plural(count)}`}
      // A native button turns Enter and Space into this click. The button
      // goes along so the caller can return focus to it later.
      onClick={(event) => onClick?.(region, event.currentTarget)}
      onMouseEnter={() => onEnter?.(region)}
      onMouseLeave={() => onLeave?.(region)}
      onFocus={() => onEnter?.(region)}
      onBlur={() => onLeave?.(region)}
      style={markerStyle(position)}
      className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600/40"
    >
      <span
        aria-hidden="true"
        data-marker-core
        className={`anatomy-dot pointer-events-none block h-[7px] w-[7px] rounded-full bg-red-600${active ? " anatomy-dot-pulse" : ""}`}
      />
    </button>
  );
}

/** Measures an element's border-box size with a ResizeObserver. */
function observeSize(el, onSize) {
  if (!el || typeof ResizeObserver === "undefined") return undefined;
  const observer = new ResizeObserver(() => onSize({ width: el.offsetWidth, height: el.offsetHeight }));
  observer.observe(el);
  return () => observer.disconnect();
}

/**
 * Read-only realistic body figure for the patient profile (front or back,
 * switched only by the flip button). Only regions of the side shown that have
 * recorded findings get a small marker and a faint red area tint.
 *
 * The caller drives the staged reveal entirely through props - this
 * component holds no hover or timing state:
 * - `activeRegion` + `phase` ("idle" | "highlight" | "line" | "popover"):
 *   the region's tint strengthens and pulses from "highlight"; with `leader`
 *   a thin line runs from the marker toward the popover from "line"; a small
 *   popover of that region's findings shows from "popover": beside the
 *   marker - on the outward side for a marker-initiated reveal (`leader`),
 *   on the right for a row-initiated one, when that side fits; otherwise on
 *   the side with more room, otherwise below (or above) it - kept inside the
 *   figure's parent container; it may overflow the figure box itself. The
 *   hover preview lists up to 3 findings plus "+N more".
 * - `pinned`: the popover (id `popoverId`) becomes a dialog listing every
 *   finding, each calling `onViewRecord(recordId)`. Once measured it takes
 *   focus and, below 1024px (`isDesktop` false), scrolls into view. Escape
 *   calls `onDismiss("escape")`; a completed click outside the popover, the
 *   markers and any `[data-reveal-row]` calls `onDismiss("outside")` - a
 *   scroll or drag never dismisses.
 * - Markers report `onMarkerEnter` / `onMarkerLeave` (hover and focus) and
 *   `onMarkerClick(region, buttonEl)` (click, Enter, Space, tap).
 * Front view: the PATIENT's right is on the viewer's left. Back view: swapped.
 */
export default function BodyFigureSvg({
  sex,
  side = "front",
  onToggleSide,
  flipHint = false,
  findingsByRegion = NO_FINDINGS,
  isDesktop = false,
  popoverId,
  activeRegion = null,
  phase = "idle",
  pinned = false,
  leader = false,
  onMarkerEnter,
  onMarkerLeave,
  onMarkerClick,
  onViewRecord,
  onDismiss,
}) {
  const figure = getFigureKey(sex);
  const ownPopoverId = useId();
  const dialogId = popoverId || ownPopoverId;
  const marked = BODY_REGIONS.filter(({ key }) => (findingsByRegion[key] || []).length > 0);

  // Layout measurement only: the figure's size and offset inside its parent
  // container (the popover's bounds, so it may overflow the figure), and the
  // popover's height.
  const layerRef = useRef(null);
  const [layout, setLayout] = useState(null);
  const [popoverEl, setPopoverEl] = useState(null);
  const [popoverSize, setPopoverSize] = useState(null);

  useEffect(() => {
    const layer = layerRef.current;
    const container = layer?.closest("figure")?.parentElement || layer;
    if (!layer) return undefined;
    function measure() {
      const fig = layer.getBoundingClientRect();
      const bounds = container.getBoundingClientRect();
      setLayout({
        width: fig.width,
        height: fig.height,
        bounds: { width: bounds.width, height: bounds.height },
        offX: fig.left - bounds.left,
        offY: fig.top - bounds.top,
      });
    }
    const stopLayer = observeSize(layer, measure);
    const stopContainer = container === layer ? undefined : observeSize(container, measure);
    return () => {
      stopLayer?.();
      stopContainer?.();
    };
  }, []);
  useEffect(() => observeSize(popoverEl, (size) => setPopoverSize({ el: popoverEl, ...size })), [popoverEl]);

  const activeFindings = activeRegion ? findingsByRegion[activeRegion] || [] : [];
  const revealed = activeFindings.length > 0 ? activeRegion : null;
  const showPopover = Boolean(revealed) && phaseReached(phase, "popover");
  const showLeader = Boolean(revealed) && leader && phaseReached(phase, "line") && Boolean(layout);

  const label = revealed ? getBodyRegionLabel(revealed, side) : "";
  // Marker centre in figure px.
  const markerPx = (() => {
    if (!revealed || !layout) return null;
    const [x, y] = getDotPosition(figure, side, revealed);
    return { x: x * layout.width, y: y * layout.height };
  })();
  const measuredHeight = popoverSize && popoverSize.el === popoverEl ? popoverSize.height : null;
  const popHeight = measuredHeight ?? 0;
  // Placed in container coordinates, then shifted back into figure
  // coordinates. The leader only needs the popover's near edge, which does
  // not move once the height is known, so it can draw before the popover.
  const placement = (() => {
    if (!markerPx) return null;
    const marker = { x: markerPx.x + layout.offX, y: markerPx.y + layout.offY };
    // A marker-initiated reveal (`leader`) opens outward, keeping limb
    // popovers off the torso; a row-initiated one opens right, away from the
    // Findings column, so the row line never runs through the popover.
    const prefer = leader ? (marker.x < layout.bounds.width / 2 ? "left" : "right") : "right";
    const { left, top, side: opens } = placePopover(
      marker,
      layout.bounds,
      { width: POPOVER_WIDTH, height: popHeight },
      undefined,
      prefer,
    );
    return { left: left - layout.offX, top: top - layout.offY, side: opens };
  })();

  const leaderLine = (() => {
    if (!showLeader || !placement) return null;
    const { left, top, side: opens } = placement;
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    let to;
    if (opens === "right" || opens === "left") {
      to = { x: opens === "right" ? left : left + POPOVER_WIDTH, y: clamp(markerPx.y, top, top + popHeight) };
    } else {
      to = { x: clamp(markerPx.x, left, left + POPOVER_WIDTH), y: opens === "below" ? top : top + popHeight };
    }
    return { d: leaderPath(markerPx, to), length: Math.hypot(to.x - markerPx.x, to.y - markerPx.y) };
  })();

  const popoverReady = Boolean(placement) && measuredHeight != null;

  // While pinned: Escape anywhere, or a completed click outside the popover,
  // every marker and every Findings row, dismisses it. A click rather than a
  // pointer press, so scrolling the page on a phone never dismisses; markers
  // and rows pin, unpin or switch through their own click handlers.
  useEffect(() => {
    if (!pinned) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") onDismiss?.("escape");
    }
    function onClick(event) {
      const target = event.target;
      if (popoverEl?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-marker-region], [data-reveal-row]")) return;
      onDismiss?.("outside");
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onClick);
    };
  }, [pinned, popoverEl, onDismiss]);

  // Once a pinned popover is measured (so visible), move focus into it, and
  // below 1024px scroll it into view. Runs again for a new popover element
  // (the pin switched to another area).
  useEffect(() => {
    if (!pinned || !popoverReady || !popoverEl) return;
    popoverEl.focus({ preventScroll: true });
    if (!isDesktop) popoverEl.scrollIntoView({ block: "nearest" });
  }, [pinned, popoverReady, popoverEl, isDesktop]);

  // Hover preview: the first few plus "+N more". Pinned: every finding.
  const listed = pinned ? activeFindings : activeFindings.slice(0, MAX_POPOVER_FINDINGS);

  return (
    <AnatomyFigure
      sex={sex}
      side={side}
      onToggleSide={onToggleSide}
      flipHint={flipHint}
      label={side === "front" ? "Front-facing body figure with recorded findings" : "Back-facing body figure with recorded findings"}
      // The parent is a size container: take its full height unless that
      // would make the 2:3 figure wider than it, then its full width.
      className="h-[min(100cqh,150cqw)] w-auto"
    >
      <div ref={layerRef} className="absolute inset-0">
        {marked.map(({ key }) => {
          const active = key === revealed && phaseReached(phase, "highlight");
          return (
            <span
              key={`area-${key}`}
              aria-hidden="true"
              style={{ ...highlightStyle(figure, side, key), ...AREA_FILL }}
              className={`anatomy-area pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full${
                active ? " anatomy-area-active anatomy-area-pulse" : ""
              }`}
            />
          );
        })}

        {marked.map(({ key }) => (
          <Marker
            key={key}
            region={key}
            label={getBodyRegionLabel(key, side)}
            position={getDotPosition(figure, side, key)}
            count={findingsByRegion[key].length}
            active={key === revealed && phase !== "idle"}
            expanded={pinned && activeRegion === key}
            controls={dialogId}
            onEnter={onMarkerEnter}
            onLeave={onMarkerLeave}
            onClick={onMarkerClick}
          />
        ))}

        {leaderLine && (
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
            <path
              key={revealed}
              d={leaderLine.d}
              fill="none"
              stroke="#DC2626"
              strokeWidth={1.25}
              strokeLinecap="round"
              className="anatomy-link-draw"
              style={{ "--link-length": leaderLine.length, strokeDasharray: leaderLine.length }}
            />
          </svg>
        )}

        {showPopover && (
          <div
            key={revealed}
            ref={setPopoverEl}
            id={dialogId}
            {...(pinned ? { role: "dialog", "aria-label": `${label} findings`, tabIndex: -1 } : { "aria-hidden": "true" })}
            className={`anatomy-fade-in absolute z-20 w-[200px] rounded-none border border-slate-200 bg-white px-2.5 py-2 text-[11px] leading-snug text-slate-700 shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600/40${
              pinned ? "" : " pointer-events-none"
            }`}
            style={
              popoverReady
                ? { left: `${placement.left}px`, top: `${placement.top}px` }
                : { left: 0, top: 0, visibility: "hidden" }
            }
          >
            <p className="text-[12px] font-semibold text-slate-900">{label}</p>
            <ul className={`mt-1 space-y-1${pinned ? " max-h-[220px] overflow-y-auto [scrollbar-width:thin]" : ""}`}>
              {listed.map((item) => {
                const text = (
                  <>
                    <span className="block truncate">
                      {item.location ? `${item.location}: ` : ""}
                      {item.finding}
                    </span>
                    <span className="block text-[10px] text-slate-500">{formatShortDate(item.visitDate, "Date not recorded")}</span>
                  </>
                );
                return (
                  <li key={`${item.recordId}-${item.id}`}>
                    {pinned ? (
                      <button
                        type="button"
                        disabled={!item.recordId}
                        onClick={() => onViewRecord?.(item.recordId)}
                        className="block w-full min-w-0 cursor-pointer rounded-none text-left hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600/40 disabled:cursor-default disabled:hover:text-inherit"
                      >
                        {text}
                      </button>
                    ) : (
                      text
                    )}
                  </li>
                );
              })}
            </ul>
            {!pinned && activeFindings.length > MAX_POPOVER_FINDINGS && (
              <p className="mt-1 text-[10px] text-slate-500">+{activeFindings.length - MAX_POPOVER_FINDINGS} more</p>
            )}
          </div>
        )}
      </div>
    </AnatomyFigure>
  );
}
