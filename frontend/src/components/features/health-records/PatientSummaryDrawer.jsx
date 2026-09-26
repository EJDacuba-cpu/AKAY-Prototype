import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import Drawer from "../../common/drawer/Drawer";
import PatientBackgroundTab from "../patients/PatientBackgroundTab";
import SummarySection from "../patients/SummarySection";
import usePatientSummary, { patientSummaryQueryKey } from "../../../hooks/usePatientSummary";
import { updatePatientMedicalBackground } from "../../../services/patientService";
import { formatLongDate, formatPatientName } from "../../../utils/formatters";
import { getRecordDateValue, getServiceTypeLabel } from "../../../utils/healthRecordPrograms";
import { queryKeys } from "../../../utils/queryKeys";
import { buildConsultationProfileState } from "../../../utils/profileNavigation";

export default function PatientSummaryDrawer({ patientId, open, onClose, basePath = "/bhc" }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [editing, setEditing] = useState(false);

  // Same-tab navigation: the consultation stays mounted behind the profile
  // (see App), and its scroll offset rides along so Back lands in place.
  function openFullProfile() {
    const scrollTop =
      document.querySelector(".akay-content-scroll")?.scrollTop || 0;
    navigate(`${basePath}/patients/${patientId}`, {
      state: buildConsultationProfileState(location, scrollTop),
    });
  }
  const [draft, setDraft] = useState(null);
  const [section, setSection] = useState("medical");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const { data, isPending, error, refetch, latest, maternalSummary: maternal } = usePatientSummary(patientId, { enabled: open });
  async function saveBackground(background) {
    setSaving(true);
    setSaveError("");
    try {
      const patient = await updatePatientMedicalBackground(patientId, background);
      client.setQueryData(patientSummaryQueryKey(patientId), current => ({ ...current, patient }));
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.patientDetails("bhc", patientId) }),
        client.invalidateQueries({ queryKey: queryKeys.patients("bhc") }),
      ]);
      return true;
    } catch {
      setSaveError("Unable to save medical background. Your edits are still available; please retry.");
      return false;
    } finally { setSaving(false); }
  }
  const background = data?.patient.medicalBackground;
  return <Drawer open={open} onClose={saving ? undefined : onClose} title="Patient Summary" widthClassName="w-full sm:w-[400px]">
    <div className="flex min-h-full flex-col p-4">
      {isPending ? <p role="status" className="text-sm text-slate-500">Loading patient summary...</p> : error ? <div role="alert"><p>Unable to load patient summary.</p><button type="button" onClick={() => refetch()} className="mt-2 text-sm text-red-700">Retry</button></div> : <>
        <p className="text-xs font-semibold">{formatPatientName(data.patient)} · #{patientId}</p>
        {!editing && <>
          <SummarySection title="Past Medical History" rows={[
            ["Current Diseases", background.currentDiseases.length ? <span className="flex flex-wrap gap-1">{background.currentDiseases.map((disease, index) => <span key={index} className="rounded-full bg-red-100 px-2 py-1 text-[11px] text-red-700">{disease.name}</span>)}</span> : "Not recorded"],
            ["Allergies", background.allergies], ["Hospitalizations", background.hospitalizations], ["Surgeries", background.surgeries],
          ]} />
          <SummarySection title="Family History" rows={[["Similar Illness", background.familyHistory.similarIllness], ["Chronic Illness", background.familyHistory.chronicIllness], ["Hereditary Illness", background.familyHistory.hereditaryIllness]]} />
          <SummarySection title="Latest Consultation" rows={latest ? [["Date", formatLongDate(getRecordDateValue(latest))], ["Program", getServiceTypeLabel(latest)], ["Chief Complaint", latest.chiefComplaint], ["Initial Diagnosis", latest.diagnosis], ["Medicine / Treatment", latest.medication || latest.treatmentNotes], ["Outcome", latest.outcome]] : [["Consultation", "No consultation recorded yet"]]} />
        </>}
        {maternal && <SummarySection title="Maternal / Prenatal" rows={[["Latest Immunization", maternal.latestImmunization ? `${maternal.latestImmunization[0].toUpperCase()} · ${formatLongDate(maternal.latestImmunization[1])}` : "No immunization record yet"], ["Latest Ultrasound", maternal.latestUltrasoundDate ? formatLongDate(maternal.latestUltrasoundDate) : "No ultrasound record yet"]]} />}
        {editing && <div className="mt-5">
          <div className="mb-3 flex gap-2">{[["medical", "Past Medical History"], ["family", "Family History"]].map(([key, label]) => <button key={key} type="button" onClick={() => setSection(key)} className={`rounded border px-2 py-2 text-xs ${section === key ? "border-red-200 text-red-700" : "border-slate-200 text-slate-500"}`}>{label}</button>)}</div>
          {["medical", "family"].map(key => <div key={key} hidden={section !== key}><PatientBackgroundTab section={key} background={background} saving={saving} onSave={saveBackground} compact startEditing sharedDraft={draft} onDraftChange={setDraft} onEditingDone={() => setEditing(false)} /></div>)}
          {saveError && <p role="alert" className="mt-2 text-xs text-red-700">{saveError}</p>}
        </div>}
        {!editing && <div className="sticky bottom-0 mt-auto space-y-2 border-t border-slate-100 bg-white pb-1 pt-4">
          <button type="button" onClick={() => { setDraft(structuredClone(background)); setEditing(true); setSection("medical"); }} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs">Update Medical Background ↑</button>
          <button type="button" onClick={openFullProfile} className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-center text-xs">View Full Profile</button>
        </div>}
      </>}
    </div>
  </Drawer>;
}
