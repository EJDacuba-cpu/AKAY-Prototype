import { useId, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { FamilyField, FamilySelect, PatientPicker } from "../../components/features/families/FamilyFields";
import useMockFamilyRegistry from "../../hooks/useMockFamilyRegistry";
import useAccess from "../../hooks/useAccess";
import { addressValues, nextSerialNumber, patientName, RELATIONSHIPS } from "../../services/mockFamilyRegistry";
import { familyMembers, newFamilyHeadStatus, saveFamily, saveNewFamily } from "../../services/mockFamilyWorkflows";

const fields = [["serialNumber", "Family Serial Number"], ["streetAddress", "House / Street"], ["purokArea", "Purok"], ["barangay", "Barangay"], ["municipality", "Municipality"]];

export default function FamilyForm({ role = "bhc" }) {
  const { householdId } = useParams();
  return <FamilyEditor key={householdId || "new"} role={role} householdId={householdId} />;
}

function FamilyEditor({ role, householdId }) {
  const registry = useMockFamilyRegistry();
  const access = useAccess();
  const navigate = useNavigate();
  const id = useId();
  const current = registry.households.find(item => item.id === householdId);
  const [draft, setDraft] = useState(() => ({ serialNumber: current?.serialNumber || nextSerialNumber(registry), address: addressValues(current?.address), headPatientId: current?.headPatientId || "", relationships: {} }));
  const [errors, setErrors] = useState({});
  const returnPath = `/${role}/families${householdId ? `/${householdId}` : ""}`;
  const members = familyMembers(registry, householdId);
  const title = householdId ? "Edit Family" : "Add Family";
  const changingHead = current && draft.headPatientId !== current.headPatientId;

  function change(key, value) {
    setDraft(previous => key === "serialNumber" ? { ...previous, serialNumber: value } : { ...previous, address: { ...previous.address, [key]: value } });
    setErrors(previous => ({ ...previous, [key]: "" }));
  }
  function save(event) {
    event.preventDefault();
    if (!access.can("families.manage")) return;
    try {
      const savedId = householdId ? saveFamily(draft, householdId) : saveNewFamily(draft);
      toast.success(householdId ? "Family updated." : "Family created.");
      navigate(`/${role}/families/${savedId}`, { replace: true });
    } catch (error) { setErrors(error.errors || { form: error.message }); }
  }

  // Add Family starts from the head: choosing them prefills the address they currently have.
  const newHeadPicker = <PatientPicker label="Choose household head" patients={registry.patients} selectedId={draft.headPatientId} error={errors.headPatientId} emptyText="No matching patients."
    describe={patient => { const status = newFamilyHeadStatus(registry, patient); return { disabled: !status.ok, note: status.reason || status.notice }; }}
    onSelect={patientId => {
      const head = registry.patients.find(patient => patient.id === patientId);
      setDraft(previous => ({ ...previous, headPatientId: patientId, address: addressValues(head) }));
      setErrors({});
    }} />;

  return <DashboardLayout role={role} title={title} contentClassName="bg-white px-5 py-7 sm:px-8 lg:px-10">
    <div className="max-w-4xl space-y-7 text-neutral-900">
      <Link to={returnPath} className="inline-flex items-center gap-2 text-sm text-neutral-600"><ArrowLeft size={16} />{householdId ? "Back to Family" : "Back to Families"}</Link>
      <h1 className="text-3xl font-normal tracking-tight">{title}</h1>
      {householdId && !current ? <p>This family is not available in the current mock session.</p> : <form noValidate onSubmit={save} className="space-y-7">
        {!householdId && newHeadPicker}
        <div className="grid gap-5 sm:grid-cols-2">
          {fields.map(([key, label]) => <FamilyField key={key} id={`${id}-${key}`} label={label} required error={errors[key]}>
            <Input id={`${id}-${key}`} required value={key === "serialNumber" ? draft.serialNumber : draft.address[key]} onChange={event => change(key, event.target.value)} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${id}-${key}-error` : undefined} className="shadow-none" />
          </FamilyField>)}
        </div>
        {householdId && <p className="text-sm text-neutral-500">Saving an address correction updates all linked members.</p>}
        {householdId && <section className="space-y-4 border-t border-neutral-200 pt-6">
          <h2 className="text-lg font-semibold">Household head</h2>
          {members.length ? <FamilySelect label="Select household head" value={draft.headPatientId} options={members.map(member => ({ value: member.id, label: patientName(member) }))} error={errors.headPatientId} onChange={event => { setDraft(previous => ({ ...previous, headPatientId: event.target.value, relationships: {} })); setErrors({}); }} />
            : <PatientPicker label="Choose an existing unlinked patient" patients={registry.patients.filter(patient => !patient.householdId)} selectedId={draft.headPatientId} error={errors.headPatientId} onSelect={patientId => { setDraft(previous => ({ ...previous, headPatientId: patientId })); setErrors(previous => ({ ...previous, headPatientId: "" })); }} />}
          {changingHead && members.filter(member => member.id !== draft.headPatientId).map(member => <FamilySelect key={member.id} label={`${patientName(member)} — relationship to new head`} value={draft.relationships[member.id] || ""} options={RELATIONSHIPS.map(value => ({ value, label: value }))} error={errors[member.id]} onChange={event => setDraft(previous => ({ ...previous, relationships: { ...previous.relationships, [member.id]: event.target.value } }))} />)}
        </section>}
        <div className="space-y-3 border-t border-neutral-200 pt-5">
          {errors.form && <p role="alert" className="text-sm text-red-700">{errors.form}</p>}
          <div className="flex justify-end gap-3"><Button asChild variant="ghost"><Link to={returnPath}>Cancel</Link></Button><Button type="submit">Save Family</Button></div>
        </div>
      </form>}
    </div>
  </DashboardLayout>;
}
