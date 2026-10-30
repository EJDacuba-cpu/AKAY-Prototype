import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { patientName } from "../../../services/familyRegistry";
import { layoutHouseholdRegistry } from "../../../utils/familyTree";
import { fitToView, panBy, zoomAt } from "../../../utils/canvasViewport";

const INK = "var(--color-ink-700)";
const STEP = 40;

const toolClass = "inline-flex h-8 items-center justify-center rounded-full border border-neutral-200 bg-white text-xs font-medium text-neutral-700 shadow-xs outline-none transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-ink-400/50";

// Pans and zooms the whole canvas. Cards are not individually draggable.
// `leading` is the view switch, so tabs and tools share one bar above the household view.
export default function FamilyTreeCanvas({ members, headId, onOpenMember, leading = null }) {
  const layout = useMemo(() => layoutHouseholdRegistry(members, headId), [members, headId]);
  const frame = useRef(null);
  const drag = useRef(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const fit = useCallback(() => {
    const element = frame.current;
    if (element) setView(fitToView(layout, { width: element.clientWidth, height: element.clientHeight }));
  }, [layout]);
  useLayoutEffect(() => { fit(); }, [fit]);
  useEffect(() => {
    const element = frame.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fit]);

  const zoom = (factor) => {
    const element = frame.current;
    setView((current) => zoomAt(current, factor, { x: (element?.clientWidth || 0) / 2, y: (element?.clientHeight || 0) / 2 }));
  };
  const endDrag = () => { drag.current = null; setDragging(false); };

  const head = layout.nodes.find(node => String(node.id) === String(headId));
  const others = layout.nodes.filter(node => node !== head);

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>{leading}</div>
      <div role="group" aria-label="Household view controls" className="flex gap-1.5">
        <button type="button" onClick={() => zoom(1.25)} aria-label="Zoom in" className={`${toolClass} w-8`}><Plus size={15} aria-hidden="true" /></button>
        <button type="button" onClick={() => zoom(0.8)} aria-label="Zoom out" className={`${toolClass} w-8`}><Minus size={15} aria-hidden="true" /></button>
        <button type="button" onClick={fit} className={`${toolClass} px-3.5`}>Reset view</button>
      </div>
    </div>
    {/* The canvas is not boxed: dots sit on the page and fade out at the sides. */}
    <div className="relative">
      <div ref={frame} role="region" aria-label="Household Relationships. Arrow keys move the view, plus and minus zoom, zero resets." tabIndex={0}
        // A small household gets a short canvas; a large one fills up to 60% of the viewport and is panned.
        style={{ height: `clamp(200px, ${layout.height + 64}px, 60vh)`, backgroundImage: "radial-gradient(var(--color-border-strong) 1px, transparent 1px)", backgroundSize: "18px 18px" }}
        className={`relative touch-none select-none overflow-hidden rounded-card outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50 ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerDown={(event) => { if (event.button === 0) drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }; }}
        onPointerMove={(event) => {
          const state = drag.current;
          if (!state || state.id !== event.pointerId) return;
          const dx = event.clientX - state.x, dy = event.clientY - state.y;
          if (!state.moved) {
            if (Math.hypot(dx, dy) < 4) return;
            state.moved = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
          }
          state.x = event.clientX; state.y = event.clientY;
          setView((current) => panBy(current, dx, dy));
        }}
        onPointerUp={endDrag} onPointerCancel={endDrag}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const move = { ArrowLeft: [STEP, 0], ArrowRight: [-STEP, 0], ArrowUp: [0, STEP], ArrowDown: [0, -STEP] }[event.key];
          if (move) { event.preventDefault(); setView((current) => panBy(current, ...move)); }
          else if (event.key === "+" || event.key === "=") { event.preventDefault(); zoom(1.25); }
          else if (event.key === "-") { event.preventDefault(); zoom(0.8); }
          else if (event.key === "0") { event.preventDefault(); fit(); }
        }}>
        <div className="absolute left-0 top-0 origin-top-left" style={{ width: layout.width, height: layout.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          <svg className="absolute inset-0 overflow-visible" width={layout.width} height={layout.height} aria-hidden="true">
            {head && others.map(node => {
              const sourceX = head.x + head.width, sourceY = head.y + head.height / 2;
              const busX = (sourceX + node.x) / 2;
              return <path key={node.id} d={`M${sourceX},${sourceY} H${busX} V${node.y + node.height / 2} H${node.x}`} fill="none" stroke={INK} strokeWidth="1.5" />;
            })}
          </svg>
          {layout.nodes.map((node) => {
            const isHead = node === head;
            return <button key={node.id} type="button" onClick={() => onOpenMember?.(node.id)} aria-label={`Open ${patientName(node)}`}
              style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
              className={`absolute flex flex-col justify-center rounded-card border px-3.5 text-left shadow-[var(--shadow-card)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink-400/50 focus-visible:ring-offset-2 ${isHead ? "border-ink-700 bg-ink-700 text-white" : "border-neutral-200 bg-white text-ink-800 hover:border-neutral-300"}`}>
              {isHead && <span className="absolute -top-2.5 right-3 rounded-full bg-brand-600 px-2 text-[10px] font-bold uppercase leading-4 tracking-wide text-white">Head</span>}
              <span className="block truncate text-[13px] font-semibold">{patientName(node)}</span>
              <span className={`block truncate text-xs ${isHead ? "text-neutral-300" : "text-neutral-600"}`}>{isHead ? "Household head" : node.relationshipToHouseholdHead || "Relationship not recorded"}</span>
              <span className={`block truncate text-xs ${isHead ? "text-neutral-300" : "text-neutral-600"}`}>{node.age != null ? `${node.age} yrs` : "Age not recorded"}</span>
            </button>;
          })}
        </div>
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[var(--color-bg)] to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[var(--color-bg)] to-transparent" />
    </div>
    <p className="text-xs text-neutral-600">Lines show shared household membership, not biological parentage. Labels describe each member's relationship to the household head.</p>
    {!head && members.length > 0 && <p role="status" className="text-xs text-neutral-600">No household head assigned. All registered members are shown.</p>}
    {!members.length && <p role="status" className="text-sm text-neutral-600">No members registered in this household.</p>}
  </div>;
}
