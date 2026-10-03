import { useEffect, useState } from "react";

import AnatomyFigure from "./AnatomyFigure";
import { BODY_REGIONS, getBodyRegionLabel } from "../../../utils/bodyFindings";
import { getDotPosition, getFigureKey, markerStyle } from "../../../utils/bodyFigureGeometry";
import { formatShortDate } from "../../../utils/patientProfile";

const MAX_CALLOUT_FINDINGS = 3;
// Hover callout width; it is clamped inside the figure box by this width.
const CALLOUT_WIDTH = 188;
const NO_FINDINGS = {};

/**
 * One recorded-findings marker: an HTML toggle button at the region's
 * normalized position on the side shown. Sizes are fixed CSS pixels (32px hit
 * area, 24px halo, 11px core), so markers stay legible as the figure scales.
 * `data-marker-region` / `data-marker-core` let the profile's finding link
 * find the marker's visible centre.
 */
function Marker({ region, label, position, count, selected, highlighted, onSelect, onHoverStart, onHoverEnd }) {
  return (
    <button
      type="button"
      data-marker-region={region}
      aria-pressed={selected}
      aria-label={`${label}, ${count} finding${count === 1 ? "" : "s"}`}
      // A native button turns Enter and Space into this click.
      onClick={() => onSelect(selected ? null : region)}
      onMouseEnter={() => onHoverStart(region)}
      onMouseLeave={() => onHoverEnd(region)}
      onFocus={() => onHoverStart(region)}
      onBlur={() => onHoverEnd(region)}
      style={markerStyle(position)}
      className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600/40"
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-1/2 top-1/2 -ml-3 -mt-3 h-6 w-6 rounded-full bg-red-600/20 blur-[1px]${
          highlighted ? " anatomy-marker-pulse" : ""
        }`}
      />
      {(highlighted || selected) && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-red-600"
        />
      )}
      <span
        aria-hidden="true"
        data-marker-core
        className="pointer-events-none relative block h-[11px] w-[11px] rounded-full bg-red-600 ring-2 ring-white"
      />
      {count >= 2 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-[calc(50%+8px)] top-[calc(50%-8px)] flex h-[13px] min-w-[13px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-slate-900 px-px text-[8px] font-bold leading-none text-white"
        >
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * Read-only realistic body figure for the patient profile (front or back,
 * switched only by the flip button). Draws a marker only on regions of the
 * side shown that have recorded findings; a marker is a toggle button that
 * selects its region. On desktop, hovering or focusing a marker shows a small
 * callout of that region's findings below the marker (above it on the lower
 * body), centred on it but clamped inside the figure box. The callout is
 * decorative - the marker's own label carries the count. Hover changes are
 * also reported through `onHoverRegion(region | null)`; a marker whose region
 * is hovered or equals `linkedRegion` pulses.
 * Front view: the PATIENT's right is on the viewer's left. Back view: swapped.
 * `findingsByRegion` must be memoized by the caller: a new identity resets hover state.
 */
export default function BodyFigureSvg({
  sex,
  side = "front",
  onToggleSide,
  findingsByRegion = NO_FINDINGS,
  selectedRegion,
  onSelectRegion,
  isDesktop,
  linkedRegion,
  flipHint = false,
  onHoverRegion,
}) {
  const [hoveredRegion, setHoveredRegion] = useState(null);
  // A new set of markers (flip, mode change, new records) can unmount the
  // hovered one without a leave/blur, so hover resets with the findings.
  const [hoverScope, setHoverScope] = useState(findingsByRegion);
  if (hoverScope !== findingsByRegion) {
    setHoverScope(findingsByRegion);
    setHoveredRegion(null);
  }
  const figure = getFigureKey(sex);
  const marked = BODY_REGIONS.filter(({ key }) => (findingsByRegion[key] || []).length > 0);

  // The reported hover is always exactly the local one.
  useEffect(() => {
    onHoverRegion?.(hoveredRegion);
  }, [hoveredRegion, onHoverRegion]);

  function hoverStart(region) {
    setHoveredRegion(region);
  }
  function hoverEnd(region) {
    setHoveredRegion((current) => (current === region ? null : current));
  }

  const calloutRegion = isDesktop && hoveredRegion && findingsByRegion[hoveredRegion]?.length ? hoveredRegion : null;
  const calloutFindings = calloutRegion ? findingsByRegion[calloutRegion] : [];
  const [x, y] = calloutRegion ? getDotPosition(figure, side, calloutRegion) : [0, 0];
  const calloutStyle = calloutRegion
    ? {
        ...(y > 0.7 ? { bottom: `calc(${(1 - y) * 100}% + 16px)` } : { top: `calc(${y * 100}% + 16px)` }),
        left: `clamp(0px, calc(${x * 100}% - ${CALLOUT_WIDTH / 2}px), calc(100% - ${CALLOUT_WIDTH}px))`,
        width: `${CALLOUT_WIDTH}px`,
      }
    : null;

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
      {marked.map(({ key }) => (
        <Marker
          key={key}
          region={key}
          label={getBodyRegionLabel(key, side)}
          position={getDotPosition(figure, side, key)}
          count={findingsByRegion[key].length}
          selected={selectedRegion === key}
          highlighted={hoveredRegion === key || linkedRegion === key}
          onSelect={onSelectRegion}
          onHoverStart={hoverStart}
          onHoverEnd={hoverEnd}
        />
      ))}

      {calloutRegion && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-10 bg-slate-900 px-2.5 py-2 text-[11px] leading-snug text-white shadow-lg"
          style={calloutStyle}
        >
          <p className="font-semibold">{getBodyRegionLabel(calloutRegion, side)}</p>
          <ul className="mt-1 space-y-1">
            {calloutFindings.slice(0, MAX_CALLOUT_FINDINGS).map((item) => (
              <li key={`${item.recordId}-${item.id}`} className="text-slate-100">
                <span className="block truncate">
                  {item.location ? `${item.location}: ` : ""}
                  {item.finding}
                </span>
                <span className="block text-[10px] text-slate-400">{formatShortDate(item.visitDate, "Date not recorded")}</span>
              </li>
            ))}
          </ul>
          {calloutFindings.length > MAX_CALLOUT_FINDINGS && (
            <p className="mt-1 text-[10px] text-slate-400">+{calloutFindings.length - MAX_CALLOUT_FINDINGS} more</p>
          )}
        </div>
      )}
    </AnatomyFigure>
  );
}
