const fs = require('fs');
function edit(path, fn) { fs.writeFileSync(path, fn(fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n'))); }
function rep(s,a,b){if(!s.includes(a))throw Error(a);return s.replace(a,b);}
edit('frontend/src/pages/bhc/ConsultationWorkspace.jsx',s=>{
 s=rep(s,'import PurposeOfVisitModal','import PregnancyConfirmation from "../../components/features/health-records/PregnancyConfirmation";\nimport PurposeOfVisitModal');
 s=rep(s,'teenagePrenatal, TEENAGE_PREGNANCY_MESSAGE, VISIT_SERVICES','teenagePrenatal, VISIT_SERVICES');
 const a=s.indexOf('<fieldset><legend className="mb-3 text-sm font-semibold">Pregnancy Confirmed by BHW?');
 const b=s.indexOf('</FormSection>}',a);
 if(a<0||b<0)throw Error('confirmation');
 s=s.slice(0,a)+'<PregnancyConfirmation value={visitPurpose.pregnancyConfirmed} onChange={answer => setVisitPurpose(current => ({ ...current, pregnancyConfirmed: answer }))} />'+s.slice(b);
 s=rep(s,'    isDraftRouteEligible &&\n    Boolean(selectedPatientId)', '    isDraftRouteEligible &&\n    !(purposeOpen && !visitPurpose) &&\n    Boolean(selectedPatientId)');
 s=rep(s,'  function applyVisitPurpose(next) {\n    const programs', '  function applyVisitPurpose(next) {\n    if (!teenagePrenatal(next, selectedPatient, dateOfVisit)) next = { ...next, pregnancyConfirmed: "" };\n    const programs');
 s=rep(s,'pregnancyConfirmed: prenatalSelected ? visitPurpose.pregnancyConfirmed : ""', 'pregnancyConfirmed: teenagePrenatal(visitPurpose, selectedPatient, dateOfVisit) ? visitPurpose.pregnancyConfirmed : ""');
 s=rep(s,'  const { data: selectedPatientDetails } = useQuery({', '  const { data: selectedPatientDetails, error: selectedPatientError, refetch: reloadSelectedPatient } = useQuery({');
 s=rep(s,'      {purposeOpen && !isResolvingClinicalMode && selectedPatient &&', '      {purposeOpen && !selectedPatient && <div className="rounded-xl bg-white p-6"><p>{selectedPatientError ? "Unable to load the patient. Please retry." : "Loading patient eligibility..."}</p>{selectedPatientError && <button type="button" onClick={() => reloadSelectedPatient()}>Retry</button>}</div>}\n      {purposeOpen && !isResolvingClinicalMode && selectedPatient &&');
 s=rep(s,'        ...(purposeFlow ? [{ label: "Purpose of Visit", value: visitPurpose.services.map(key => VISIT_SERVICES[key]).join(" + ") }, { label: "Pregnancy Confirmed by BHW?", value: visitPurpose.pregnancyConfirmed || "Not answered" }] :', '        ...(purposeFlow ? [{ label: "Purpose of Visit", value: visitPurpose.services.map(key => VISIT_SERVICES[key]).join(" + ") }, ...(teenagePrenatal(visitPurpose, selectedPatient, dateOfVisit) ? [{ label: "Pregnancy Confirmed by BHW?", value: visitPurpose.pregnancyConfirmed || "Not answered" }] : [])] :');
 return s;
});
edit('frontend/src/pages/bhc/HealthRecordDetails.jsx',s=>s.replaceAll('HealthRecordClinicalDetails','BhcConsultationDetails'));
