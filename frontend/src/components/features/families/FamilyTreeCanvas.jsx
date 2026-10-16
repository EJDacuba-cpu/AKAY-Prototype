import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { patientName } from "../../../services/familyRegistry";
import { formatLongDate } from "../../../utils/formatters";
import { layoutHouseholdTree } from "../../../utils/familyTree";
import { fitToView, panBy, zoomAt } from "../../../utils/canvasViewport";

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

// Pans and zooms the whole canvas. Cards are not individually draggable.
export default function FamilyTreeCanvas({ members, edges, headId, onOpenMember }) {
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

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-neutral-500">Drag to move around. Lines show saved connections only.</p>
      <div className="flex gap-2" role="group" aria-label="Tree view controls">
        <button type="button" onClick={() => zoom(1.25)} aria-label="Zoom in" className="inline-flex h-9 w-9 items-center justify-center border border-neutral-200 text-neutral-900 outline-none hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-red-600"><ZoomIn size={17} aria-hidden="true" /></button>
        <button type="button" onClick={() => zoom(0.8)} aria-label="Zoom out" className="inline-flex h-9 w-9 items-center justify-center border border-neutral-200 text-neutral-900 outline-none hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-red-600"><ZoomOut size={17} aria-hidden="true" /></button>
        <button type="button" onClick={fit} className="inline-flex h-9 items-center gap-2 border border-neutral-200 px-3 text-sm text-neutral-900 outline-none hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-red-600"><Maximize2 size={15} aria-hidden="true" />Reset view</button>
      </div>
    </div>
    <div ref={frame} role="region" aria-label="Family tree. Arrow keys move the view, plus and minus zoom, zero resets." tabIndex={0}
      className={`relative h-[60vh] min-h-[360px] touch-none select-none overflow-hidden border border-neutral-200 bg-white outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
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
            return <g key={`${edge.type}:${edge.id || index}`}>
              <path d={path.d} fill="none" stroke="#999" strokeDasharray={edge.type === "sibling" ? "4 3" : undefined} />
              <text x={path.x} y={path.y} textAnchor="middle" fontSize="10" fill="#666">{edge.type === "spouse" ? "Spouse" : "Sibling"}</text>
            </g>;
          })}
          {bundles.map(({ key, parents, children }) => {
            const parentX = parents.reduce((sum, node) => sum + node.x + node.width / 2, 0) / parents.length;
            const sourceY = Math.max(...parents.map((node) => node.y + node.height)) + 12;
            const busY = Math.min(...children.map((node) => node.y)) - 32;
            return <g key={key} fill="none" stroke="#999">
              {parents.map((parent) => <path key={parent.id} d={`M${parent.x + parent.width / 2},${parent.y + parent.height} V${sourceY} H${parentX}`} />)}
              <path d={`M${parentX},${sourceY} V${busY}`} />
              {children.map((child) => <path key={child.id} d={`M${parentX},${busY} H${child.x + child.width / 2} V${child.y}`} />)}
              <text x={parentX + 10} y={busY - 12} stroke="none" fill="#666" fontSize="10">{children.length > 1 ? "Children" : "Child"}</text>
            </g>;
          })}
        </svg>
        {layout.nodes.map((node) => <button key={node.id} type="button" onClick={() => onOpenMember?.(node.id)} aria-label={`Open ${patientName(node)}`}
          style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
          className={`absolute block border bg-white p-4 text-left text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${node.id === headId ? "border-red-700" : "border-neutral-200"}`}>
          <span className="block truncate text-sm font-semibold">{patientName(node)}</span>
          <span className="mt-2 block truncate text-xs text-neutral-500">{node.relationshipToHouseholdHead || "Relationship not recorded"}</span>
          <span className="mt-1.5 block truncate text-xs text-neutral-700">{formatLongDate(node.birthDate, "Date of birth not recorded")}</span>
          {!connected.has(node.id) && layout.nodes.length > 1 && <span className="sr-only">No saved family connection</span>}
        </button>)}
      </div>
    </div>
    <ul className="sr-only" aria-label="Saved family connections">{edges.map((edge, index) => <li key={`${edge.type}:${edge.from}:${edge.to}:${index}`}>{describe(edge, names)}</li>)}</ul>
  </div>;
}
