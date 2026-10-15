import { useId, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import HouseholdConnectionReview from "../../components/features/patients/HouseholdConnectionReview";
import useMockFamilyRegistry from "../../hooks/useMockFamilyRegistry";
import {
  addressText, addressValues, connectionForPatient, patientName, validateConnection,
} from "../../services/mockFamilyRegistry";
import { registrationDrafts, registrationPath } from "../../services/patientRegistrationDrafts";

const HOUSEHOLD_FIELDS = [
  ["serialNumber", "Family Serial Number"],
  ["streetAddress", "House / Street"],
  ["purokArea", "Purok"],
  ["barangay", "Barangay"],
  ["municipality", "Municipality"],
];

export default function CreateHouseholdPage({ role = "bhc", basePath = "/bhc" }) {
  const { patientId } = useParams();
  const returnPath = registrationPath(basePath, patientId);
  return <HouseholdCreationScreen key={returnPath} role={role} returnPath={returnPath} />;
}

function HouseholdCreationScreen({ role, returnPath }) {
  const id = useId();
  const navigate = useNavigate();
  const registry = useMockFamilyRegistry();
  const [draft] = useState(() => registrationDrafts.read(returnPath));
  const previousNew = draft?.householdConnection?.kind === "new" ? draft.householdConnection : null;
  const [household, setHousehold] = useState(() => previousNew?.household || {
    serialNumber: "", address: addressValues(draft?.form),
  });
  const [headChoice, setHeadChoice] = useState(previousNew && previousNew.headPatientId !== "self" ? "existing" : "self");
  const [headId, setHeadId] = useState(previousNew?.headPatientId === "self" ? "" : previousNew?.headPatientId || "");
  const [headSearch, setHeadSearch] = useState("");
  const [errors, setErrors] = useState({});
  const [review, setReview] = useState(null);
  const patient = { ...draft?.form, id: draft?.patientId };
  const savedPatient = registry.patients.find((item) => item.id === patient.id);
  const heads = registry.patients.filter((item) => !item.householdId && item.id !== patient.id)
    .filter((item) => patientName(item).toLowerCase().includes(headSearch.trim().toLowerCase()));

  function updateField(key, value) {
    setErrors((previous) => ({ ...previous, [key]: "" }));
    setHousehold((previous) => key === "serialNumber"
      ? { ...previous, serialNumber: value }
      : { ...previous, address: { ...previous.address, [key]: value } });
  }

  function reviewHousehold(event) {
    event.preventDefault();
    const candidate = {
      kind: "new", household: { ...household, serialNumber: household.serialNumber.trim() },
      headPatientId: headChoice === "self" ? "self" : headId,
      relationship: previousNew?.relationship || "",
    };
    // Relationship is collected on the next screen, after the household is valid.
    const nextErrors = validateConnection(registry, candidate, patient.id);
    delete nextErrors.relationship;
    setErrors(nextErrors);
    if (!Object.keys(nextErrors).length) setReview(candidate);
  }

  function useHousehold(connection, replacement) {
    // This updates only the handoff draft. The registry is written by Save Patient.
    registrationDrafts.stageHousehold(returnPath, registry, connection, replacement);
    navigate(returnPath, { replace: true });
  }

  return (
    <DashboardLayout role={role} title="Create Household">
      <div className="mr-auto w-full max-w-4xl space-y-5 text-gray-950">
        <Link to={returnPath} className="inline-flex items-center gap-2 text-sm font-medium text-red-700">
          <ArrowLeft size={16} /> Back to Patient Registration
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">{review ? "Review Household" : "Create New Household"}</h1>
        {!draft ? <div className="space-y-3 border-y border-gray-200 bg-white px-5 py-6">
          <p className="text-sm">No active patient registration draft. Return to registration to create a household.</p>
          <Button asChild><Link to={returnPath}>Patient Registration</Link></Button>
        </div> : review ? <div className="bg-white px-5 py-5 sm:px-6">
          <Button type="button" variant="link" size="sm" className="mb-3 px-0" onClick={() => setReview(null)}>Back to household details</Button>
          <HouseholdConnectionReview
            registry={registry} patient={patient} currentConnection={draft.householdConnection}
            savedConnection={connectionForPatient(savedPatient)} candidate={review}
            initialReplacement={draft.headReplacement}
            onConfirm={useHousehold} onCancel={() => navigate(returnPath, { replace: true })} confirmLabel="Use Household"
          />
        </div> : <form noValidate onSubmit={reviewHousehold} className="space-y-6 bg-white px-5 py-6 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {HOUSEHOLD_FIELDS.map(([key, label]) => <div key={key} className="space-y-1.5">
              <label htmlFor={`${id}-${key}`} className="block text-xs font-medium">{label} <span className="text-red-700">*</span></label>
              <Input id={`${id}-${key}`} value={key === "serialNumber" ? household.serialNumber : household.address[key]}
                onChange={(event) => updateField(key, event.target.value)} required autoComplete="off"
                aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
                className="h-10 shadow-none" />
              {errors[key] && <p id={`${id}-${key}-error`} role="alert" className="text-xs text-red-700">{errors[key]}</p>}
            </div>)}
          </div>
          <fieldset className="space-y-3 border-t border-gray-200 pt-5">
            <legend className="text-sm font-semibold">Household Head</legend>
            {[['self', `${patient.id ? 'This patient' : 'Patient being registered'} — ${patientName(patient)}`], ['existing', 'Existing unlinked patient']].map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input type="radio" name={`${id}-head-choice`} checked={headChoice === value} className="accent-red-700"
                  onChange={() => { setHeadChoice(value); setErrors((previous) => ({ ...previous, headPatientId: "" })); }} />
                {label}
              </label>
            ))}
          </fieldset>
          {headChoice === "existing" && <div className="space-y-3">
            <label htmlFor={`${id}-head-search`} className="block text-xs font-medium">Find unlinked patient</label>
            <Input id={`${id}-head-search`} type="search" value={headSearch} className="h-10 shadow-none"
              onChange={(event) => setHeadSearch(event.target.value)} placeholder="Search patient name"
              aria-describedby={errors.headPatientId ? `${id}-head-error` : undefined}
              onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
            <fieldset className="max-h-56 overflow-y-auto divide-y divide-gray-200 border-y border-gray-200">
              <legend className="sr-only">Choose existing unlinked head</legend>
              {heads.map((item) => <label key={item.id} className="flex cursor-pointer items-start gap-3 px-2 py-3 hover:bg-gray-50">
                <input type="radio" name={`${id}-head-patient`} value={item.id} checked={headId === item.id} className="mt-1 accent-red-700"
                  onChange={() => { setHeadId(item.id); setErrors((previous) => ({ ...previous, headPatientId: "" })); }} />
                <span className="text-sm"><span className="font-medium">{patientName(item)}</span><span className="mt-1 block text-xs text-gray-600">{addressText(item)}</span></span>
              </label>)}
              {!heads.length && <p role="status" className="px-2 py-4 text-sm text-gray-500">No matching unlinked patients.</p>}
            </fieldset>
            {errors.headPatientId && <p id={`${id}-head-error`} role="alert" className="text-xs text-red-700">{errors.headPatientId}</p>}
          </div>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-4">
            <Button type="button" variant="ghost" onClick={() => navigate(returnPath, { replace: true })}>Cancel</Button>
            <Button type="submit">Continue</Button>
          </div>
        </form>}
      </div>
    </DashboardLayout>
  );
}
