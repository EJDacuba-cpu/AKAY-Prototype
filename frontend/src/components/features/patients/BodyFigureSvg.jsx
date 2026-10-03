import { useState } from "react";

import { BODY_REGIONS } from "../../../utils/bodyFindings";
import { DOT_POSITIONS, FIGURE_SHAPES, FIGURE_VIEWBOX } from "../../../utils/bodyFigureGeometry";
import { formatShortDate } from "../../../utils/patientProfile";

const MAX_CALLOUT_FINDINGS = 3;
const HIT_RADIUS = 13;
const DOT_RADIUS = 5.5;
const RING_RADIUS = 9;
const BADGE_RADIUS = 6.5;

function Shape({ shape }) {
  const className = "fill-white/80 stroke-slate-300 stroke-[1.25]";
  if (shape.type === "circle") return <circle cx={shape.cx} cy={shape.cy} r={shape.r} className={className} />;
  if (shape.type === "rect") {
    return <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} className={className} />;
  }
  return <path d={shape.d} className={className} />;
}

function Marker({ region, label, count, selected, hovered, onSelect, onHoverStart, onHoverEnd }) {
  const [x, y] = DOT_POSITIONS[region];
  const select = () => onSelect(selected ? null : region);

  return (
    <g
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${label}, ${count} finding${count === 1 ? "" : "s"}`}
      onClick={select}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select();
        }
      }}
      onMouseEnter={() => onHoverStart(region)}
      onMouseLeave={() => onHoverEnd(region)}
      onFocus={() => onHoverStart(region)}
      onBlur={() => onHoverEnd(region)}
      className="cursor-pointer outline-none"
    >
      <circle cx={x} cy={y} r={HIT_RADIUS} className="fill-transparent" />
      <circle cx={x} cy={y} r={RING_RADIUS + 3} className="fill-red-600/10" />
      {(selected || hovered) && <circle cx={x} cy={y} r={RING_RADIUS} className="fill-none stroke-red-600 stroke-2" />}
      <circle cx={x} cy={y} r={DOT_RADIUS} className="fill-red-600 stroke-white stroke-[1.5]" />
      {count >= 2 && (
        <g pointerEvents="none">
          <circle cx={x + 7} cy={y - 7} r={BADGE_RADIUS} className="fill-slate-900 stroke-white stroke-[1.5]" />
          <text x={x + 7} y={y - 7} textAnchor="middle" dominantBaseline="central" className="fill-white text-[8px] font-bold">
            {count}
          </text>
        </g>
      )}
    </g>
  );
}

/**
 * Read-only front-facing body figure for the patient profile. Draws a marker
 * only on regions that have recorded findings; a marker is a toggle button
 * that selects its region. On desktop, hovering or focusing a marker shows a
 * small callout of that region's findings (decorative - the marker's own
 * label carries the count). The PATIENT's right side is on the viewer's left.
 */
export default function BodyFigureSvg({ findingsByRegion, selectedRegion, onSelectRegion, isDesktop }) {
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const { width, height } = FIGURE_VIEWBOX;
  const marked = BODY_REGIONS.filter(({ key }) => (findingsByRegion[key] || []).length > 0);

  const calloutRegion = isDesktop ? hoveredRegion : null;
  const calloutFindings = calloutRegion ? findingsByRegion[calloutRegion] || [] : [];
  const [cx, cy] = calloutRegion ? DOT_POSITIONS[calloutRegion] : [0, 0];
  const side = cx <= width / 2 ? "right" : "left";
  const calloutStyle =
    side === "right"
      ? { top: `${(cy / height) * 100}%`, left: `calc(${(cx / width) * 100}% + 14px)`, transform: "translateY(-50%)" }
      : { top: `${(cy / height) * 100}%`, right: `calc(${100 - (cx / width) * 100}% + 14px)`, transform: "translateY(-50%)" };

  return (
    <div className="relative mx-auto w-fit">
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-[300px] w-auto select-none lg:h-[340px]">
        <title>Front-facing body figure with recorded findings</title>
        <text x="14" y="18" className="fill-slate-400 text-[11px] font-semibold">R</text>
        <text x="180" y="18" className="fill-slate-400 text-[11px] font-semibold">L</text>
        <g aria-hidden="true">
          {FIGURE_SHAPES.map((shape, index) => (
            <Shape key={index} shape={shape} />
          ))}
        </g>
        {marked.map(({ key, label }) => (
          <Marker
            key={key}
            region={key}
            label={label}
            count={findingsByRegion[key].length}
            selected={selectedRegion === key}
            hovered={hoveredRegion === key}
            onSelect={onSelectRegion}
            onHoverStart={setHoveredRegion}
            onHoverEnd={(region) => setHoveredRegion((current) => (current === region ? null : current))}
          />
        ))}
      </svg>

      {calloutRegion && calloutFindings.length > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-10 w-[188px] bg-slate-900 px-2.5 py-2 text-[11px] leading-snug text-white shadow-lg"
          style={calloutStyle}
        >
          <p className="font-semibold">{calloutFindings[0].regionLabel}</p>
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
    </div>
  );
}
