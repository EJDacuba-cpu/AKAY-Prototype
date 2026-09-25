import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Button } from "../../ui/button";
import PatientBackgroundTab from "../patients/PatientBackgroundTab";
import { updatePatientMedicalBackground } from "../../../services/patientService";

export default function ConsultationHistoryCheck({ patient, canEdit }) {
  const [decision, setDecision] = useState("");
  const [background, setBackground] = useState(null);
  const [saving, setSaving] = useState(false);
  const cache = useQueryClient();
  const current = background || patient?.medicalBackground || {};
  const recorded = current.allergies || current.hospitalizations || current.surgeries || current.currentDiseases?.length || Object.values(current.familyHistory || {}).some(Boolean) || Object.values(current.personalSocial || {}).some(Boolean);
  async function save(next) {
    setSaving(true);
    try { const updated = await updatePatientMedicalBackground(patient.id, next); setBackground(updated.medicalBackground); cache.invalidateQueries({ queryKey: ["patients"] }); cache.invalidateQueries({ queryKey: ["patient-details", "bhc"] }); toast.success("Health history updated."); }
    catch (error) { toast.error(error.message); throw error; }
    finally { setSaving(false); }
  }
  if (!patient || !canEdit) return null;
  return <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
    {!recorded && !decision ? <><h3 className="font-semibold">Health History Incomplete</h3><p className="mt-1 text-sm text-slate-600">Some baseline information has not yet been recorded.</p><div className="mt-3 flex gap-2"><Button type="button" size="sm" onClick={() => setDecision("yes")}>Complete Now</Button><Button type="button" size="sm" variant="ghost" onClick={() => setDecision("no")}>Continue Consultation</Button></div></> : <fieldset><legend className="text-sm font-semibold">Does the patient history need an update?</legend><div className="mt-2 flex gap-5">{["yes", "no"].map(value => <label key={value} className="flex items-center gap-2 text-sm"><input type="radio" name="historyUpdate" checked={decision === value} onChange={() => setDecision(value)} />{value === "yes" ? "Yes" : "No"}</label>)}</div></fieldset>}
    {decision === "yes" && <div className="mt-4 space-y-4">{["medical", "family", "social"].map(section => <PatientBackgroundTab key={section} section={section} background={current} sharedDraft={current} onDraftChange={setBackground} saving={saving} onSave={save} startEditing compact />)}</div>}
  </section>;
}
