import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Plus, X } from "lucide-react";
import toast from "react-hot-toast";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { Button } from "../../components/ui/button";
import { FamilySelect, PatientPicker } from "../../components/features/families/FamilyFields";
import useAccess from "../../hooks/useAccess";
import useMockFamilyRegistry from "../../hooks/useMockFamilyRegistry";
import { HEAD_RELATIONSHIP, RELATIONSHIPS, patientName } from "../../services/mockFamilyRegistry";
import { connectionRows, familyMembers, saveFamilyMember } from "../../services/mockFamilyWorkflows";

const types = [
  ["spouse", "Spouse / partner of"], ["child", "Son / daughter of"], ["parent", "Parent of"],
  ["sibling", "Sibling of"], ["relative", "Other relative of"], ["non-relative", "Non-relative of"],
].map(([value, label]) => ({ value, label }));

export default function FamilyMemberForm({ role = "bhc" }) {
  const { householdId, memberId } = useParams();
  return <MemberEditor key={`${householdId}-${memberId || "new"}`} role={role} householdId={householdId} memberId={memberId} />;
}

function MemberEditor({ role, householdId, memberId }) {
  const registry = useMockFamilyRegistry();
  const access = useAccess();
  const navigate = useNavigate();
  const household = registry.households.find(item => item.id === householdId);
  const current = registry.patients.find(item => item.id === memberId && item.householdId === householdId);
  const members = familyMembers(registry, householdId);
  const [draft, setDraft] = useState(() => ({ patientId: memberId || "", relationship: current?.relationshipToHouseholdHead || "", connections: current ? connectionRows(registry, householdId, memberId) : [{ type: "", relativeId: "" }] }));
  const [errors, setErrors] = useState({});
  const patient = registry.patients.find(item => item.id === draft.patientId);
  const isHead = household?.headPatientId === draft.patientId;
  const returnPath = `/${role}/families/${householdId}`;
  const title = memberId ? "Edit Member Connections" : "Add Member";

  function updateRow(index, key, value) {
    setDraft(previous => ({ ...previous, connections: previous.connections.map((row, i) => i === index ? { ...row, [key]: value } : row) }));
    setErrors(previous => ({ ...previous, connections: "", [`connection-${index}`]: "" }));
  }
  function save(event) {
    event.preventDefault();
    if (!access.can("families.manage")) return;
    try {
      saveFamilyMember(householdId, draft);
      toast.success("Member connections saved.");
      navigate(returnPath, { replace: true });
    } catch (error) { setErrors(error.errors || { form: error.message }); }
  }

  return <DashboardLayout role={role} title={title} contentClassName="bg-white px-5 py-7 sm:px-8 lg:px-10">
    <div className="max-w-4xl space-y-7 text-neutral-900">
      <Link to={returnPath} className="inline-flex items-center gap-2 text-sm text-neutral-600"><ArrowLeft size={16} />Back to Family</Link>
      <h1 className="text-3xl font-normal tracking-tight">{title}</h1>
      {!household || (memberId && !current) ? <p>This family member is not available in the current mock session.</p> : !household.headPatientId ? <p>Assign a household head in <Link to={`/${role}/families/${householdId}/edit`} className="text-red-700 underline">Edit Family</Link> first.</p> : <form noValidate onSubmit={save} className="space-y-7">
        {memberId ? <div><h2 className="text-xl font-semibold">{patientName(current)}</h2><p className="mt-2 text-sm text-neutral-500">{current.birthDate} · {current.sex}</p></div>
          : <PatientPicker patients={registry.patients.filter(item => !item.householdId)} selectedId={draft.patientId} error={errors.patientId} onSelect={patientId => { setDraft(previous => ({ ...previous, patientId })); setErrors(previous => ({ ...previous, patientId: "" })); }} />}
        {errors.patientId && memberId && <p role="alert" className="text-sm text-red-700">{errors.patientId}</p>}
        <>
          {isHead ? <p className="text-sm">Relationship to head: {HEAD_RELATIONSHIP}</p> : <FamilySelect label="Relationship to household head" value={draft.relationship} options={RELATIONSHIPS.map(value => ({ value, label: value }))} error={errors.relationship} onChange={event => { setDraft(previous => ({ ...previous, relationship: event.target.value })); setErrors(previous => ({ ...previous, relationship: "" })); }} />}
          <section className="space-y-5 border-t border-neutral-200 pt-6">
            <h2 className="text-lg font-semibold">Member connections</h2>
            <p className="text-sm text-neutral-500">{patient ? patientName(patient) : "The selected patient"} is the:</p>
            {draft.connections.map((row, index) => <div key={index} className="grid items-start gap-4 sm:grid-cols-[1fr_1fr_auto]">
              <FamilySelect label={`Connection ${index + 1}`} value={row.type} options={types} error={errors[`connection-${index}`]} onChange={event => updateRow(index, "type", event.target.value)} />
              <FamilySelect label="Related household member" value={row.relativeId} options={members.filter(item => item.id !== draft.patientId).map(item => ({ value: item.id, label: patientName(item) }))} onChange={event => updateRow(index, "relativeId", event.target.value)} />
              <Button type="button" variant="ghost" size="icon" className="sm:mt-7" aria-label={`Remove connection ${index + 1}`} onClick={() => setDraft(previous => ({ ...previous, connections: previous.connections.filter((_, i) => i !== index) }))}><X size={17} /></Button>
            </div>)}
            {errors.connections && <p role="alert" className="text-sm text-red-700">{errors.connections}</p>}
            <Button type="button" variant="link" className="px-0" onClick={() => setDraft(previous => ({ ...previous, connections: [...previous.connections, { type: "", relativeId: "" }] }))}><Plus size={16} />Add another connection</Button>
          </section>
        </>
        <div className="space-y-4 border-t border-neutral-200 pt-5">
          {memberId && <p className="text-xs text-neutral-500">{isHead ? "To change the household head, assign a replacement in Edit Family first." : "To move this member, use Change Household in Edit Patient or Add Family."}</p>}
          {errors.form && <p role="alert" className="text-sm text-red-700">{errors.form}</p>}
          <div className="flex justify-end gap-3"><Button asChild variant="ghost"><Link to={returnPath}>Cancel</Link></Button><Button type="submit">{memberId ? "Save Changes" : "Save Member"}</Button></div>
        </div>
      </form>}
    </div>
  </DashboardLayout>;
}
