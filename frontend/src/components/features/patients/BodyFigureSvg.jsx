import { useEffect, useRef, useState } from "react";

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
function Marker({ region, label, position, count, active, expanded, onEnter, onLeave, onClick }) {
  return (
    <button
      type="button"
      data-marker-region={region}
      aria-expanded={expanded}
      aria-label={`${label}, ${plural(count)}`}
      // A native button turns Enter and Space into this click.
      onClick={() => onClick?.(region)}
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
 *   popover of that region's findings shows from "popover", on the side of
 *   the marker with more room and kept inside the figure.
 * - `pinned`: the popover becomes a dialog whose finding rows call
 *   `onViewRecord(recordId)`; Escape or a pointer press outside the popover
 *   and markers calls `onDismiss()`.
 * - Markers report `onMarkerEnter` / `onMarkerLeave` (hover and focus) and
 *   `onMarkerClick` (click, Enter, Space, tap) with their region.
 * Front view: the PATIENT's right is on the viewer's left. Back view: swapped.
 */
export default function BodyFigureSvg({
  sex,
  side = "front",
  onToggleSide,
  flipHint = false,
  findingsByRegion = NO_FINDINGS,
  isDesktop,
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
  const marked = BODY_REGIONS.filter(({ key }) => (findingsByRegion[key] || []).length > 0);

  // Layout measurement only: the figure layer's size and the popover's height.
  const layerRef = useRef(null);
  const [box, setBox] = useState(null);
  const [popoverEl, setPopoverEl] = useState(null);
  const [popoverSize, setPopoverSize] = useState(null);

  useEffect(() => observeSize(layerRef.current, setBox), []);
  useEffect(() => observeSize(popoverEl, (size) => setPopoverSize({ el: popoverEl, ...size })), [popoverEl]);

  const activeFindings = activeRegion ? findingsByRegion[activeRegion] || [] : [];
  const revealed = activeFindings.length > 0 ? activeRegion : null;
  const showPopover = Boolean(revealed) && phaseReached(phase, "popover");
  // Lines are desktop-only; on touch the popover simply appears.
  const showLeader = Boolean(revealed) && leader && Boolean(isDesktop) && phaseReached(phase, "line") && Boolean(box);

  const label = revealed ? getBodyRegionLabel(revealed, side) : "";
  const markerPx = (() => {
    if (!revealed || !box) return null;
    const [x, y] = getDotPosition(figure, side, revealed);
    return { x: x * box.width, y: y * box.height };
  })();
  const measuredHeight = popoverSize && popoverSize.el === popoverEl ? popoverSize.height : null;
  // The popover's horizontal placement does not depend on its height, so the
  // leader can be drawn before the popover itself has rendered.
  const placement = markerPx ? placePopover(markerPx, box, { width: POPOVER_WIDTH, height: measuredHeight ?? 0 }) : null;

  const leaderLine = (() => {
    if (!showLeader || !placement) return null;
    const edgeX = placement.side === "right" ? placement.left : placement.left + POPOVER_WIDTH;
    const spanBottom = placement.top + (measuredHeight ?? 0);
    const edgeY = measuredHeight == null ? markerPx.y : Math.min(Math.max(markerPx.y, placement.top), spanBottom);
    const to = { x: edgeX, y: edgeY };
    return { d: leaderPath(markerPx, to), length: Math.hypot(to.x - markerPx.x, to.y - markerPx.y) };
  })();

  const popoverReady = Boolean(placement) && measuredHeight != null;

  // While pinned: Escape anywhere, or a press outside the popover and every
  // marker, dismisses it.
  useEffect(() => {
    if (!pinned) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") onDismiss?.();
    }
    function onPointerDown(event) {
      const target = event.target;
      if (popoverEl?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-marker-region]")) return;
      onDismiss?.();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [pinned, popoverEl, onDismiss]);

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
            <ul className="mt-1 space-y-1">
              {activeFindings.slice(0, MAX_POPOVER_FINDINGS).map((item) => {
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
            {activeFindings.length > MAX_POPOVER_FINDINGS && (
              <p className="mt-1 text-[10px] text-slate-500">+{activeFindings.length - MAX_POPOVER_FINDINGS} more</p>
            )}
          </div>
        )}
      </div>
    </AnatomyFigure>
  );
}
