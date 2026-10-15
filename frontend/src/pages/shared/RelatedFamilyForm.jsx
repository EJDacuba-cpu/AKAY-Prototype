import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { Button } from "../../components/ui/button";
import { FamilySelect, PatientPicker } from "../../components/features/families/FamilyFields";
import useAccess from "../../hooks/useAccess";
import useMockFamilyRegistry from "../../hooks/useMockFamilyRegistry";
import { patientName } from "../../services/mockFamilyRegistry";
import { RELATED_TYPES, familyMembers, saveRelatedLink } from "../../services/mockFamilyWorkflows";

export default function RelatedFamilyForm({ role = "bhc" }) {
  const { householdId } = useParams();
  const registry = useMockFamilyRegistry();
  const access = useAccess();
  const navigate = useNavigate();
  const household = registry.households.find(item => item.id === householdId && !item.archivedAt);
  const [draft, setDraft] = useState({ memberId: "", relativeId: "", type: "" });
  const [errors, setErrors] = useState({});
  const returnPath = `/${role}/families/${householdId}`;
  const candidates = registry.patients.filter(patient => {
    const other = registry.households.find(item => item.id === patient.householdId);
    return other && !other.archivedAt && other.id !== householdId;
  });

  function change(key, value) {
    setDraft(previous => ({ ...previous, [key]: value }));
    setErrors(previous => ({ ...previous, [key]: "", form: "" }));
  }
  function save(event) {
    event.preventDefault();
    if (!access.can("families.manage")) return;
    try {
      saveRelatedLink(householdId, draft);
      toast.success("Related family linked.");
      navigate(returnPath, { replace: true });
    } catch (error) { setErrors(error.errors || { form: error.message }); }
  }

  return <DashboardLayout role={role} title="Link Related Family" contentClassName="bg-white px-5 py-7 sm:px-8 lg:px-10">
    <div className="max-w-4xl space-y-7 text-neutral-900">
      <Link to={returnPath} className="inline-flex items-center gap-2 text-sm text-neutral-600"><ArrowLeft size={16} />Back to Family</Link>
      <h1 className="text-3xl font-normal tracking-tight">Link Related Family</h1>
      {!household ? <p role="status">This family is not available in the current mock session.</p> : <form noValidate onSubmit={save} className="space-y-7">
        <FamilySelect label="Member of this household" value={draft.memberId} error={errors.memberId}
          options={familyMembers(registry, householdId).map(member => ({ value: member.id, label: patientName(member) }))}
          onChange={event => change("memberId", event.target.value)} />
        <PatientPicker label="Relative in another household" patients={candidates} selectedId={draft.relativeId} error={errors.relativeId}
          emptyText="No matching patients in other households."
          describe={patient => ({ note: registry.households.find(item => item.id === patient.householdId)?.serialNumber })}
          onSelect={patientId => change("relativeId", patientId)} />
        <FamilySelect label="Relationship" value={draft.type} error={errors.type}
          options={RELATED_TYPES.map(([value, label]) => ({ value, label }))}
          onChange={event => change("type", event.target.value)} />
        <div className="space-y-3 border-t border-neutral-200 pt-5">
          {errors.form && <p role="alert" className="text-sm text-red-700">{errors.form}</p>}
          <div className="flex justify-end gap-3"><Button asChild variant="ghost"><Link to={returnPath}>Cancel</Link></Button><Button type="submit">Save Link</Button></div>
        </div>
      </form>}
    </div>
  </DashboardLayout>;
}
