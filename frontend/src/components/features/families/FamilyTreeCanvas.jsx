import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Minus, Plus } from "lucide-react";
import { patientName } from "../../../services/familyRegistry";
import { layoutHouseholdTree } from "../../../utils/familyTree";
import { fitToView, panBy, zoomAt } from "../../../utils/canvasViewport";

// Dark ink carries structure; red marks the spouse link and the head. Both come from the token ramps.
const INK = "var(--color-ink-700)";
const RED = "var(--color-brand-600)";
const RED_DEEP = "var(--color-brand-700)";
const LABEL = "var(--color-neutral-600)";
const NEARBY = 100;
const STEP = 40;

// A link between two cards: a straight line when they are neighbours, otherwise an arc above the row.
function linkPath(a, b, rank) {
  const [left, right] = a.x <= b.x ? [a, b] : [b, a];
  if (left.y === right.y && right.x - (left.x + left.width) <= NEARBY) {
    const y = left.y + left.height / 2;
    return { d: `M${left.x + left.width},${y} H${right.x}`, x: (left.x + left.width + right.x) / 2, y: y - 10 };
  }
  const top = Math.min(left.y, right.y) - 14 - rank * 12;
  const leftX = left.x + left.width / 2, rightX = right.x + right.width / 2;
  return { d: `M${leftX},${left.y} V${top} H${rightX} V${right.y}`, x: (leftX + rightX) / 2, y: top - 4 };
}

// Children are bundled only when they share exactly the same saved parents.
function parentBundles(nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const bundles = new Map();
  for (const child of nodes) {
    const parents = edges.filter((edge) => edge.type === "parent" && edge.to === child.id).map((edge) => edge.from).sort();
    if (!parents.length || parents.some((id) => !byId.has(id))) continue;
    const key = parents.join("|");
    if (!bundles.has(key)) bundles.set(key, { key, parents: parents.map((id) => byId.get(id)), children: [] });
    bundles.get(key).children.push(child);
  }
  return [...bundles.values()];
}

const describe = (edge, names) => `${names.get(edge.from)} — ${edge.type === "parent" ? "parent of" : edge.type === "spouse" ? "spouse of" : "sibling of"} — ${names.get(edge.to)}`;

const toolClass = "inline-flex h-8 items-center justify-center rounded-full border border-neutral-200 bg-white text-xs font-medium text-neutral-700 shadow-xs outline-none transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-ink-400/50";

// Pans and zooms the whole canvas. Cards are not individually draggable.
// `leading` is the view switch, so tabs and tools share one bar above the tree.
export default function FamilyTreeCanvas({ members, edges, headId, onOpenMember, leading = null, canManage = false, familyPath = "" }) {
  const layout = useMemo(() => layoutHouseholdTree(members, edges, headId), [members, edges, headId]);
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

  const byId = new Map(layout.nodes.map((node) => [node.id, node]));
  const names = new Map(members.map((member) => [member.id, patientName(member)]));
  const links = edges.filter((edge) => (edge.type === "spouse" || edge.type === "sibling") && byId.has(edge.from) && byId.has(edge.to));
  const bundles = parentBundles(layout.nodes, edges);
  const connected = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  // What an empty tree needs next: more members first, then connections between them.
  const emptyHint = !edges.length && (members.length < 2
    ? "Only one member so far. Register another member to start the tree."
    : "No connections saved yet.");

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>{leading}</div>
      <div role="group" aria-label="Tree view controls" className="flex gap-1.5">
        <button type="button" onClick={() => zoom(1.25)} aria-label="Zoom in" className={`${toolClass} w-8`}><Plus size={15} aria-hidden="true" /></button>
        <button type="button" onClick={() => zoom(0.8)} aria-label="Zoom out" className={`${toolClass} w-8`}><Minus size={15} aria-hidden="true" /></button>
        <button type="button" onClick={fit} className={`${toolClass} px-3.5`}>Reset view</button>
      </div>
    </div>
    {/* The canvas is not boxed: dots sit on the page and fade out at the sides. */}
    <div className="relative">
      <div ref={frame} role="region" aria-label="Family tree. Arrow keys move the view, plus and minus zoom, zero resets." tabIndex={0}
        // A small tree gets a short canvas; a large one fills up to 60% of the viewport and is panned.
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
            {links.map((edge, index) => {
              const path = linkPath(byId.get(edge.from), byId.get(edge.to), edge.type === "sibling" ? 1 + (index % 2) : 0);
              const spouse = edge.type === "spouse";
              return <g key={`${edge.type}:${edge.id || index}`}>
                <path d={path.d} fill="none" stroke={spouse ? RED : INK} strokeWidth={spouse ? 2 : 1.5} strokeDasharray={spouse ? undefined : "4 3"} />
                <text x={path.x} y={path.y} textAnchor="middle" fontSize="12" fontWeight={spouse ? 600 : 400} fill={spouse ? RED_DEEP : LABEL}>{spouse ? "Spouse" : "Sibling"}</text>
              </g>;
            })}
            {bundles.map(({ key, parents, children }) => {
              const parentX = parents.reduce((sum, node) => sum + node.x + node.width / 2, 0) / parents.length;
              const sourceY = Math.max(...parents.map((node) => node.y + node.height)) + 12;
              const busY = Math.min(...children.map((node) => node.y)) - 32;
              return <g key={key} fill="none" stroke={INK} strokeWidth="1.5">
                {parents.map((parent) => <path key={parent.id} d={`M${parent.x + parent.width / 2},${parent.y + parent.height} V${sourceY} H${parentX}`} />)}
                <path d={`M${parentX},${sourceY} V${busY}`} />
                {children.map((child) => <path key={child.id} d={`M${parentX},${busY} H${child.x + child.width / 2} V${child.y}`} />)}
                <text x={parentX + 10} y={busY - 12} stroke="none" fill={LABEL} fontSize="12">{children.length > 1 ? "Children" : "Child"}</text>
              </g>;
            })}
          </svg>
          {layout.nodes.map((node) => {
            const isHead = node.id === headId;
            return <button key={node.id} type="button" onClick={() => onOpenMember?.(node.id)} aria-label={`Open ${patientName(node)}`}
              style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
              className={`absolute flex flex-col justify-center rounded-card border px-3.5 text-left shadow-[var(--shadow-card)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink-400/50 focus-visible:ring-offset-2 ${isHead ? "border-ink-700 bg-ink-700 text-white" : "border-neutral-200 bg-white text-ink-800 hover:border-neutral-300"}`}>
              {isHead && <span className="absolute -top-2.5 right-3 rounded-full bg-brand-600 px-2 text-[10px] font-bold uppercase leading-4 tracking-wide text-white">Head</span>}
              <span className="block truncate text-[13px] font-semibold">{patientName(node)}</span>
              <span className={`block truncate text-xs ${isHead ? "text-neutral-300" : "text-neutral-600"}`}>{node.relationshipToHouseholdHead || "Relationship not recorded"}</span>
              <span className={`block truncate text-xs ${isHead ? "text-neutral-300" : "text-neutral-600"}`}>{node.age != null ? `${node.age} yrs` : "Age not recorded"}</span>
              {!connected.has(node.id) && layout.nodes.length > 1 && <span className="sr-only">No saved family connection</span>}
            </button>;
          })}
        </div>
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[var(--color-bg)] to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[var(--color-bg)] to-transparent" />
    </div>
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-neutral-600">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <span className="inline-flex items-center gap-2"><i aria-hidden="true" className="inline-block w-5 border-t-2" style={{ borderColor: RED }} />Spouse</span>
        <span className="inline-flex items-center gap-2"><i aria-hidden="true" className="inline-block w-5 border-t-[1.5px] border-dashed" style={{ borderColor: INK }} />Sibling</span>
        <span className="inline-flex items-center gap-2"><i aria-hidden="true" className="inline-block w-5 border-t-[1.5px]" style={{ borderColor: INK }} />Parent and child</span>
      </div>
      {emptyHint
        ? <p className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white py-1 pl-3 pr-3 shadow-xs">{emptyHint}{canManage && members.length > 1 && headId && <Link to={`${familyPath}/members/${headId}/edit`} className="font-semibold text-ink-800 underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50">Add connections</Link>}</p>
        : <p>Drag to pan. Lines show saved connections only.</p>}
    </div>
    <ul className="sr-only" aria-label="Saved family connections">{edges.map((edge, index) => <li key={`${edge.type}:${edge.from}:${edge.to}:${index}`}>{describe(edge, names)}</li>)}</ul>
  </div>;
}
