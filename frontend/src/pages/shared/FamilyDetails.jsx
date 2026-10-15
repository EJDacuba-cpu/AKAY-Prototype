import { useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, GitFork, List, Pencil, Plus } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { Button } from "../../components/ui/button";
import FamilyTree from "../../components/features/families/FamilyTree";
import useMockFamilyRegistry from "../../hooks/useMockFamilyRegistry";
import useAccess from "../../hooks/useAccess";
import { addressText, patientName } from "../../services/mockFamilyRegistry";
import { familyMembers, familyName, familyConnections, connectionDescription, connectionKey } from "../../services/mockFamilyWorkflows";

export default function FamilyDetails({ role = "bhc" }) {
  const { householdId } = useParams();
  const registry = useMockFamilyRegistry();
  const access = useAccess();
  const [view, setView] = useState("tree");
  const household = registry.households.find(item => item.id === householdId);
  const base = `/${role}/families`;
  const members = familyMembers(registry, householdId);
  const edges = familyConnections(registry, householdId);
  const head = registry.patients.find(item => item.id === household?.headPatientId);
  const canManage = access.can("families.manage");
  const name = household ? familyName(registry, household) : "Family not found";
  return <DashboardLayout role={role} title={name} contentClassName="bg-white px-5 py-7 sm:px-8 lg:px-10">
    <div className="mx-auto max-w-[1440px] space-y-7 text-neutral-900">
      <Link to={base} className="inline-flex items-center gap-2 text-sm text-neutral-600"><ArrowLeft size={16} />Back to Families</Link>
      {!household ? <p role="status">This family is not available in the current mock session.</p> : <>
        <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-normal tracking-tight">{name}</h1><p className="mt-2 text-sm text-neutral-500">Family Serial Number · {household.serialNumber}</p></div>
          {canManage && <div className="flex flex-wrap gap-3"><Button asChild variant="ghost" className="rounded-none border border-neutral-200 text-neutral-900"><Link to={`${base}/${householdId}/edit`}><Pencil size={17} />Edit Family</Link></Button><Button asChild className="rounded-none"><Link to={`${base}/${householdId}/members/new`}><Plus size={18} />Add Member</Link></Button></div>}
        </header>
        <dl className="grid gap-5 border-y border-neutral-200 py-5 sm:grid-cols-[1fr_2fr_auto]">
          <div><dt className="text-xs text-neutral-500">Household head</dt><dd className="mt-2 text-sm">{head ? patientName(head) : "Not assigned"}</dd></div>
          <div><dt className="text-xs text-neutral-500">Address</dt><dd className="mt-2 text-sm">{addressText(household.address)}</dd></div>
          <div><dt className="text-xs text-neutral-500">Members</dt><dd className="mt-2 text-sm">{members.length} {members.length === 1 ? "member" : "members"}</dd></div>
        </dl>
        <div role="tablist" aria-label="Family view" className="flex gap-7 border-b border-neutral-200">
          {[["tree", "Family Tree", GitFork], ["list", "Member List", List]].map(([key, label, Icon]) => <button key={key} type="button" role="tab" id={`family-tab-${key}`} aria-selected={view === key} aria-controls={`family-panel-${key}`} tabIndex={view === key ? 0 : -1} onClick={() => setView(key)} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "tree" : event.key === "End" ? "list" : view === "tree" ? "list" : "tree"; setView(next); document.getElementById(`family-tab-${next}`)?.focus(); } }} className={`inline-flex items-center gap-2 border-b-2 pb-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${view === key ? "border-red-700 text-red-700" : "border-transparent text-neutral-500"}`}><Icon size={17} />{label}</button>)}
        </div>
        <section role="tabpanel" id={`family-panel-${view}`} aria-labelledby={`family-tab-${view}`} className="space-y-5">
          <div><h2 className="text-xl font-semibold">{view === "tree" ? "Family relationships" : "Household members"}</h2><p className="mt-2 text-sm text-neutral-500">Relationships are shown relative to household head {head ? patientName(head) : "not yet assigned"}.</p></div>
          {view === "tree" ? <FamilyTree registry={registry} members={members} edges={edges} headId={head?.id} canManage={canManage} memberPath={`${base}/${householdId}/members`} />
            : <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr className="border-b border-neutral-200 text-xs text-neutral-500"><th className="py-3 pr-5 font-medium">Patient</th><th className="py-3 pr-5 font-medium">Relationship to head</th><th className="py-3 pr-5 font-medium">Connections</th><th className="py-3 font-medium"><span className="sr-only">Actions</span></th></tr></thead><tbody>{members.map(member => <tr key={member.id} className="border-b border-neutral-200 align-top"><td className="py-4 pr-5"><p className="font-medium">{patientName(member)}</p><p className="mt-1 text-xs text-neutral-500">{member.birthDate}</p></td><td className="py-4 pr-5">{member.relationshipToHouseholdHead}</td><td className="space-y-2 py-4 pr-5 text-xs text-neutral-500">{edges.filter(edge => edge.from === member.id || edge.to === member.id).map(edge => <p key={connectionKey(edge)}>{connectionDescription(edge, registry)}</p>)}</td><td className="py-4 text-right">{canManage && <Link className="font-medium text-red-700" to={`${base}/${householdId}/members/${member.id}/edit`}>Edit connections<span className="sr-only"> for {patientName(member)}</span></Link>}{role !== "admin" && access.can("patients.register") && <Link className="mt-3 block text-xs text-neutral-600 underline" to={`/${role}/patients/${member.id}`}>Edit Patient</Link>}</td></tr>)}</tbody></table>{!members.length && <p className="py-8 text-sm text-neutral-500">No members connected. Assign a head in Edit Family.</p>}</div>}
        </section>
      </>}
    </div>
  </DashboardLayout>;
}
