import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { patientName } from "../../../services/mockFamilyRegistry";
import { connectionDescription, connectionKey } from "../../../services/mockFamilyWorkflows";
import { layoutFamilyTree } from "../../../utils/familyTree";

export default function FamilyTree({ registry, members, edges, headId, memberPath, canManage }) {
  const layout = layoutFamilyTree(members, edges, headId);
  const viewport = useRef(null);
  const headX = layout.nodes.find(node => node.id === headId)?.x || 0;
  useEffect(() => {
    const element = viewport.current;
    if (element && element.clientWidth < layout.width) element.scrollLeft = Math.max(0, headX - Math.max(16, (element.clientWidth - 216) / 2));
  }, [headId, headX, layout.width]);
  const byId = new Map(layout.nodes.map(node => [node.id, node]));
  const otherEdges = edges.filter(edge => !["parent", "spouse"].includes(edge.type));
  // Bundle only children with the exact same explicitly selected parents.
  const bundles = new Map();
  for (const child of layout.nodes) {
    const parents = edges.filter(edge => edge.type === "parent" && edge.to === child.id).map(edge => edge.from).sort();
    if (!parents.length) continue;
    const key = parents.join("|");
    if (!bundles.has(key)) bundles.set(key, { parents: parents.map(id => byId.get(id)), children: [] });
    bundles.get(key).children.push(child);
  }
  return <div className="space-y-4">
    <div ref={viewport} className="overflow-x-auto border border-neutral-200" role="region" aria-label="Family relationship tree" tabIndex={0}>
      <div className="relative mx-auto" style={{ width: layout.width, height: layout.height }}>
        <svg className="absolute inset-0" width={layout.width} height={layout.height} aria-hidden="true">
          {edges.filter(edge => edge.type === "spouse").map(edge => {
            let a = byId.get(edge.from), b = byId.get(edge.to);
            if (a.x > b.x) [a, b] = [b, a];
            const y = a.y + a.height / 2;
            return <g key={connectionKey(edge)}><path d={`M${a.x + a.width},${y} H${b.x}`} fill="none" stroke="#999" /><text x={(a.x + a.width + b.x) / 2} y={y - 10} textAnchor="middle" fontSize="10" fill="#666">Spouses</text></g>;
          })}
          {[...bundles.entries()].map(([key, { parents, children }]) => {
            const parentX = parents.reduce((sum, node) => sum + node.x + node.width / 2, 0) / parents.length;
            const bottom = Math.max(...parents.map(node => node.y + node.height));
            const busY = Math.min(...children.map(node => node.y)) - 32;
            const sourceY = bottom + 12;
            return <g key={key} fill="none" stroke="#999">
              {parents.map(parent => <path key={parent.id} d={`M${parent.x + parent.width / 2},${parent.y + parent.height} V${sourceY} H${parentX}`} />)}
              <path d={`M${parentX},${sourceY} V${busY}`} />
              {children.map(child => <path key={child.id} d={`M${parentX},${busY} H${child.x + child.width / 2} V${child.y}`} />)}
              <text x={parentX + 10} y={busY - 12} stroke="none" fill="#666" fontSize="10">{children.length > 1 ? "Children" : "Child"}</text>
            </g>;
          })}
        </svg>
        {layout.nodes.map(node => {
          const connected = edges.some(edge => edge.from === node.id || edge.to === node.id);
          const content = <><span className="block truncate text-sm font-semibold">{patientName(node)}</span><span className="mt-3 block text-xs text-neutral-500">{node.relationshipToHouseholdHead}</span><span className="mt-1.5 block text-xs text-neutral-700">{connected || members.length === 1 ? "Registered patient" : "Connections not yet set"}</span></>;
          const props = { className: "absolute block border border-neutral-200 bg-white p-4 text-left text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-red-600", style: { left: node.x, top: node.y, width: node.width, height: node.height } };
          return canManage ? <Link key={node.id} {...props} to={`${memberPath}/${node.id}/edit`} aria-label={`Edit connections for ${patientName(node)}`}>{content}</Link>
            : <div key={node.id} {...props}>{content}</div>;
        })}
      </div>
    </div>
    {otherEdges.length > 0 && <div className="space-y-2 text-xs text-neutral-600"><h3 className="font-medium text-neutral-900">Other connections</h3>{otherEdges.map(edge => <p key={connectionKey(edge)}>{connectionDescription(edge, registry)}</p>)}</div>}
    <ul className="sr-only" aria-label="Recorded family connections">{edges.map(edge => <li key={connectionKey(edge)}>{connectionDescription(edge, registry)}</li>)}</ul>
  </div>;
}
