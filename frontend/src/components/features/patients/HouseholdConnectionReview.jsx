import { useId, useState } from "react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import {
  HEAD_RELATIONSHIP, RELATIONSHIPS, addressText, headDeparture,
  householdForConnection, patientName, relationshipForConnection,
  validateConnection, validateHeadReplacement,
} from "../../../services/familyRegistry";
import { isAcceptedLabel, labelOptions } from "../../../utils/relationshipLabels";
import { relationshipLinkOffer } from "../../../utils/relationshipLink";

export const householdSelectClass = "h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-950 outline-none focus-visible:border-red-700 focus-visible:ring-2 focus-visible:ring-red-700/15 aria-invalid:border-red-700";

// `live` BHC registration offers the specific labels; `saved` keeps an older saved label visible.
export function RelationshipField({ value, onChange, error, label = "Patient's relationship to household head", live = false, saved }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-gray-950">{label} <span className="text-red-700">*</span></label>
      {value === HEAD_RELATIONSHIP ? (
        <Input id={id} readOnly value={value} className="h-10 bg-gray-50 shadow-none" />
      ) : (
        <select id={id} value={value || ""} onChange={(event) => onChange(event.target.value)}
          className={householdSelectClass} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}>
          <option value="">Select relationship</option>
          {live
            ? labelOptions(saved ?? value).map((option) => <option key={option.value} value={option.value} disabled={option.legacy}>{option.label}</option>)
            : RELATIONSHIPS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      )}
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

// Inline review is shared by the registration search and the creation screen.
// The parent receives nothing until confirmation, so Cancel keeps its draft.
export default function HouseholdConnectionReview({
  registry, patient, currentConnection, savedConnection, candidate,
  initialReplacement, onConfirm, onCancel, confirmLabel, live = false,
}) {
  const id = useId();
  const [relationship, setRelationship] = useState(candidate?.relationship || "");
  const [replacementHeadId, setReplacementHeadId] = useState(initialReplacement?.headPatientId || "");
  const [relationships, setRelationships] = useState(initialReplacement?.relationships || {});
  const [errors, setErrors] = useState({});
  const [recordLink, setRecordLink] = useState(false);
  const isAllowed = live ? isAcceptedLabel : undefined;
  const nextConnection = candidate ? { ...candidate, relationship } : null;
  const target = householdForConnection(registry, nextConnection);
  const current = householdForConnection(registry, currentConnection || savedConnection);
  const departure = headDeparture(registry, patient.id, nextConnection);
  const nextRelationship = relationshipForConnection(registry, nextConnection, patient.id);
  const isChanging = current && target && (current.id !== target.id || current.serialNumber !== target.serialNumber || addressText(current.address) !== addressText(target.address));
  const headName = target
    ? nextConnection.kind === "new" && nextConnection.headPatientId === "self"
      ? patientName(patient)
      : patientName(registry.patients.find((item) => item.id === (nextConnection.kind === "new" ? nextConnection.headPatientId : target.headPatientId)))
    : "";
  const savedPatient = registry.patients.find((item) => item.id === patient.id);
  const savedLabel = savedPatient && nextConnection?.kind === "existing" && savedPatient.householdId === nextConnection.householdId ? savedPatient.relationshipToHouseholdHead : "";
  // Staff must tick this; a label alone never creates a connection.
  const offer = live && nextConnection?.kind === "existing" ? relationshipLinkOffer(nextRelationship, headName) : null;
  const detailsError = Object.entries(errors).find(([key]) => key !== "relationship" && key !== "replacementHeadId" && !departure?.members.some((item) => item.id === key))?.[1];

  function confirm() {
    const connection = nextConnection ? { ...nextConnection, relationship: nextRelationship, ...(offer && recordLink ? { relationshipLink: { type: offer.type } } : {}) } : null;
    const replacement = departure?.members.length
      ? { householdId: departure.household.id, headPatientId: replacementHeadId, relationships }
      : null;
    const replacementErrors = validateHeadReplacement(registry, patient.id, connection, replacement, isAllowed);
    const nextErrors = {
      ...validateConnection(registry, connection, patient.id, undefined, isAllowed),
      ...Object.fromEntries(Object.entries(replacementErrors).map(([key, value]) => [key === "headPatientId" ? "replacementHeadId" : key, value])),
    };
    setErrors(nextErrors);
    if (!Object.keys(nextErrors).length) {
      try {
        onConfirm(connection, replacement);
      } catch (error) {
        setErrors(error.errors || { household: error.message });
      }
    }
  }

  return (
    <div className="space-y-4 border-t border-gray-200 pt-4 text-gray-950">
      <h3 className="text-sm font-semibold">{!target ? "Remove household connection?" : isChanging ? "Change household?" : "Selected household"}</h3>
      {isChanging && <div className="text-xs text-gray-600">
        <p className="font-medium text-gray-950">Current: {current.serialNumber}</p>
        <p>{addressText(current.address)}</p>
      </div>}
      {target ? <>
        <div className="text-sm">
          <p className="font-semibold">{target.serialNumber} <span className="ml-2 font-medium">{headName}</span></p>
          <p className="mt-1 text-xs text-gray-600">{addressText(target.address)}</p>
          {detailsError && <p role="alert" className="mt-1 text-xs text-red-700">{detailsError}</p>}
        </div>
        <RelationshipField live={live} saved={savedLabel} value={nextRelationship} error={errors.relationship} onChange={(value) => { setRelationship(value); setRecordLink(false); setErrors((previous) => ({ ...previous, relationship: "" })); }} />
        {offer && <label className="flex items-start gap-2 text-xs text-gray-950">
          <input type="checkbox" className="mt-0.5" checked={recordLink} onChange={(event) => setRecordLink(event.target.checked)} />
          <span>{offer.text}<span className="block text-gray-500">Optional. Saved with the patient only if you tick this.</span></span>
        </label>}
      </> : <p className="text-sm text-gray-600">The Family Serial Number will be cleared. The current address stays editable.</p>}
      {departure?.members.length > 0 && <div className="space-y-3 border-t border-gray-200 pt-4">
        <div className="space-y-1.5">
          <label htmlFor={`${id}-head`} className="block text-xs font-medium">Replacement head for {departure.household.serialNumber} *</label>
          <select id={`${id}-head`} className={householdSelectClass} value={replacementHeadId}
            aria-invalid={Boolean(errors.replacementHeadId)} aria-describedby={errors.replacementHeadId ? `${id}-head-error` : undefined}
            onChange={(event) => { setReplacementHeadId(event.target.value); setRelationships({}); setErrors({}); }}>
            <option value="">Select a remaining member</option>
            {departure.members.map((item) => <option key={item.id} value={item.id}>{patientName(item)}</option>)}
          </select>
          {errors.replacementHeadId && <p id={`${id}-head-error`} role="alert" className="text-xs text-red-700">{errors.replacementHeadId}</p>}
        </div>
        {replacementHeadId && departure.members.filter((item) => item.id !== replacementHeadId).map((item) => (
          <RelationshipField key={item.id} live={live} saved={item.relationshipToHouseholdHead} label={`${patientName(item)} — relationship to new head`}
            value={relationships[item.id]} error={errors[item.id]}
            onChange={(value) => { setRelationships((previous) => ({ ...previous, [item.id]: value })); setErrors((previous) => ({ ...previous, [item.id]: "" })); }} />
        ))}
      </div>}
      <p className="text-xs text-gray-500">Changes apply after Save Patient.</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="button" size="sm" onClick={confirm}>{confirmLabel || (!target ? "Remove Connection" : isChanging ? "Confirm Change" : "Confirm Connection")}</Button>
      </div>
    </div>
  );
}
