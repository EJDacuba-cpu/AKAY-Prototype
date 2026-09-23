const fs = require('fs');
function edit(path, fn) { let text = fs.readFileSync(path, 'utf8'); text = fn(text.replace(/\r\n/g, '\n')); fs.writeFileSync(path, text); }
function replace(text, from, to) { if (!text.includes(from)) throw new Error('Missing anchor: '+from.slice(0,100)); return text.replace(from,to); }
edit('frontend/src/utils/consultationSteps.js', s => {
 s=replace(s,'export function buildConsultationSteps({ selectedPrograms, primaryProgram } = {})','export function buildConsultationSteps({ selectedPrograms, primaryProgram, generalSelected = true, purposeFlow = false } = {})');
 s=replace(s,'{ key: INTERVIEW_STEP, phase: "form", label: "Interview" },\n    { key: ASSESSMENT_STEP, phase: "form", label: "Clinical Assessment" },','{ key: INTERVIEW_STEP, phase: "form", label: purposeFlow ? "Vital Signs" : "Interview" },\n    ...(generalSelected ? [{ key: ASSESSMENT_STEP, phase: "form", label: purposeFlow ? "General Consultation" : "Clinical Assessment" }] : []),');
 s=replace(s,'export function getFormSequence(programSteps = [])','export function getFormSequence(programSteps = [], generalSelected = true)');
 s=replace(s,'    ASSESSMENT_STEP,\n    ...programSteps.map','    ...(generalSelected ? [ASSESSMENT_STEP] : []),\n    ...programSteps.map');
 s=replace(s,'export function getStepOrder(programSteps = []) {\n  return [...getFormSequence(programSteps),','export function getStepOrder(programSteps = [], generalSelected = true) {\n  return [...getFormSequence(programSteps, generalSelected),');
 return s;
});
edit('frontend/src/pages/bhc/ConsultationWorkspace.jsx', s => {
 s='import PurposeOfVisitModal from "../../components/features/health-records/PurposeOfVisitModal";\nimport { purposePrograms, purposeErrors, teenagePrenatal, TEENAGE_PREGNANCY_MESSAGE, VISIT_SERVICES } from "../../utils/visitPurpose";\n'+s;
 s=replace(s,'  const [selectedPrograms, setSelectedPrograms] = useState([]);','  const [visitPurpose, setVisitPurpose] = useState(null);\n  const [purposeOpen, setPurposeOpen] = useState(routeContext.kind === "new");\n  const [selectedPrograms, setSelectedPrograms] = useState([]);');
 s=replace(s,'  const isImmunization = recordTypeKey', '  const purposeFlow = Boolean(visitPurpose);\n  const generalSelected = purposeFlow ? visitPurpose.services.includes("General") : true;\n  const prenatalSelected = !purposeFlow || visitPurpose.services.includes("Prenatal");\n  const postpartumSelected = Boolean(visitPurpose?.services.includes("Postpartum"));\n  const isImmunization = recordTypeKey');
 s=replace(s,'buildConsultationSteps({ selectedPrograms, primaryProgram })','buildConsultationSteps({ selectedPrograms, primaryProgram, generalSelected, purposeFlow })');
 s=replace(s,'    [selectedPrograms, primaryProgram],','    [selectedPrograms, primaryProgram, generalSelected, purposeFlow],');
 s=replace(s,'() => getProgramFormSteps(selectedPrograms, primaryProgram),','() => getProgramFormSteps(selectedPrograms, primaryProgram).map(step => step.classification === "Maternal" && postpartumSelected ? { ...step, label: prenatalSelected ? "Prenatal / Postpartum" : "Postpartum", headerDescription: "Record maternal care provided during this visit." } : step),');
 s=replace(s,'    [selectedPrograms, primaryProgram],','    [selectedPrograms, primaryProgram, postpartumSelected, prenatalSelected],');
 s=replace(s,'getFormSequence(programFormSteps);','getFormSequence(programFormSteps, generalSelected);');
 s=replace(s,'getStepOrder(programFormSteps);','getStepOrder(programFormSteps, generalSelected);');
 s=replace(s,'      selectedPrograms,\n      primaryProgram,','      ...(visitPurpose ? { visitPurpose } : {}),\n      selectedPrograms,\n      primaryProgram,');
 s=replace(s,'    const payload = draft.payload || {};','    const payload = draft.payload || {};\n    setVisitPurpose(payload.visitPurpose || null);\n    setPurposeOpen(false);');
 s=replace(s,'    const errors = {};\n\n    const requiresFollowUp', '    const errors = {};\n    if (visitPurpose) {\n      const purposeError = purposeErrors(visitPurpose, selectedPatient, dateOfVisit);\n      if (purposeError) errors.visitPurpose = purposeError;\n    }\n\n    const requiresFollowUp');
 s=s.replaceAll('!isImmunization && !isFamilyPlanning && !isHypertensionDiabetic && !isMaternal && !isTb && !chiefComplaint.trim()', '(purposeFlow ? generalSelected : !isImmunization && !isFamilyPlanning && !isHypertensionDiabetic && !isMaternal && !isTb) && !chiefComplaint.trim()');
 s=s.replaceAll('!isImmunization && !isFamilyPlanning && !isHypertensionDiabetic && !isMaternal && !isTb && !summaryOfPresentIllness.trim()', '(purposeFlow ? generalSelected : !isImmunization && !isFamilyPlanning && !isHypertensionDiabetic && !isMaternal && !isTb) && !summaryOfPresentIllness.trim()');
 s=replace(s,'if (stepKey === INTERVIEW_STEP && !chiefComplaint.trim())','if (!purposeFlow && stepKey === INTERVIEW_STEP && !chiefComplaint.trim())');
 // In the new flow CC/HPI live in General, after vitals. Keep legacy error ownership unchanged.
 s=replace(s,'    const errors = deferUntilProgramDecision(getClinicalValidationErrors(), stepKey);','    const errors = purposeFlow ? getClinicalValidationErrors() : deferUntilProgramDecision(getClinicalValidationErrors(), stepKey);\n    if (purposeFlow && stepKey === INTERVIEW_STEP) { delete errors.chiefComplaint; delete errors.summaryOfPresentIllness; }\n    if (purposeFlow && stepKey === ASSESSMENT_STEP && (errors.chiefComplaint || errors.summaryOfPresentIllness)) { setValidationErrorsAndFocus(errors); return false; }');
 s=replace(s,'  function revealErrorStep(errors) {','  function revealErrorStep(errors) {\n    if (errors.visitPurpose) { setPurposeOpen(true); return true; }\n    if (purposeFlow && (errors.chiefComplaint || errors.summaryOfPresentIllness)) { setValidationErrorsAndFocus(errors); goToStepKey(ASSESSMENT_STEP); return true; }');
 s=replace(s,'  async function handleSave(event) {','  async function handleSave(event) {');
 s=replace(s,'    if (saving) return;\n    closeDateTimePopovers();','    if (saving || purposeOpen) return;\n    closeDateTimePopovers();');
 s=s.replaceAll('      !isFollowUpVisitMode &&\n      effectiveHealthRecordType ===', '      !purposeFlow && !isFollowUpVisitMode &&\n      effectiveHealthRecordType ===');
 s=replace(s,'    const finalChiefComplaint =\n', '    const finalChiefComplaint = purposeFlow ? (generalSelected ? chiefComplaint : "") :\n');
 s=replace(s,'      chiefComplaint: finalChiefComplaint,\n      summaryOfPresentIllness,\n      physicalExam,\n      diagnosis,', '      chiefComplaint: finalChiefComplaint,\n      summaryOfPresentIllness: purposeFlow && !generalSelected ? "" : summaryOfPresentIllness,\n      physicalExam: purposeFlow && !generalSelected ? "" : physicalExam,\n      diagnosis: purposeFlow && !generalSelected ? "" : diagnosis,');
 s=replace(s,'      monitoringData: {\n        ...(consultationMode', '      monitoringData: {\n        ...(visitPurpose ? { visitPurpose: { ...visitPurpose, pregnancyConfirmed: prenatalSelected ? visitPurpose.pregnancyConfirmed : "" } } : {}),\n        ...(consultationMode');
 // Treatment is encounter-wide; mirror only existing program bindings.
 s=replace(s,'    : consultationSteps\n        .filter((step) => step.kind === "program")','    : programFormSteps');
 s=replace(s,'  const treatmentValue = treatmentBindings[0]?.value || "";\n  const handleTreatmentChange = (value) =>\n    treatmentBindings.forEach((binding) => binding.set(value));','  const treatmentValue = medication || treatmentBindings[0]?.value || "";\n  const handleTreatmentChange = (value) => {\n    setMedication(value);\n    treatmentBindings.forEach((binding) => binding.set(value));\n  };');
 s=replace(s,'{treatmentBindings.length > 0 && (','{(purposeFlow || treatmentBindings.length > 0) && (');
 // Purpose modal updates the existing program/category contract, never forks a draft.
 const anchor='  function handleProgramSelect(option) {';
 s=replace(s,anchor,`  function applyVisitPurpose(next) {
    const programs = purposePrograms(next.services);
    const primary = programs.includes(primaryProgram) ? primaryProgram : programs[0] || "";
    setVisitPurpose(next);
    setSelectedPrograms(programs);
    setPrimaryProgram(primary);
    setConsultationMode(programs.length ? "program" : "general");
    setHealthRecordType(PROGRAM_CLASSIFICATIONS[primary] || "General Consultation");
    if (programs.includes("Hypertension") || programs.includes("Diabetes")) {
      setHypertensionDiabeticData(current => ({ ...current, conditionType: programs.includes("Hypertension") && programs.includes("Diabetes") ? "both" : programs.includes("Diabetes") ? "dm" : "hpn" }));
    }
    setPurposeOpen(false);
    setWizardPhase(WIZARD_FORM);
    setFormStep(INTERVIEW_STEP);
    setValidationErrors({});
  }

`+anchor);
 // Main form is gated behind the modal; modal waits until patient/draft resolution.
 s=replace(s,'      <ConsultationWorkspaceBody>','      {purposeOpen && !isResolvingClinicalMode && selectedPatient && <PurposeOfVisitModal value={visitPurpose} patient={selectedPatient} visitDate={dateOfVisit} onProceed={applyVisitPurpose} onCancel={() => { if (visitPurpose) setPurposeOpen(false); else navigate(buildPatientProfilePath); }} />}\n      {purposeFlow && !purposeOpen && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm font-medium">Purpose of Visit: {visitPurpose.services.map(key => VISIT_SERVICES[key]).join(" + ")}</p><button type="button" className="text-sm font-semibold text-red-700" onClick={() => setPurposeOpen(true)}>Change purpose</button></div>}\n      <div hidden={purposeOpen}>\n      <ConsultationWorkspaceBody>');
 // Use existing return path instead of inventing one (replaced below after inspection if needed).
 s=replace(s,'navigate(buildPatientProfilePath)', 'navigate(`/bhc/patients/${selectedPatientId}`)');
 s=replace(s,'      <SuccessModal\n', '      </div>\n      <SuccessModal\n');
 const start=s.indexOf('            <div className="anim-fade-up grid gap-4 pb-1 sm:grid-cols-2" style={stagger(3)}>');
 const end=s.indexOf('\n            {/* Vital Signs:',start);
 if(start<0||end<0)throw Error('general fields missing');
 const general=s.slice(start,end).replace('required={consultationMode === "general"}', 'required');
 s=s.slice(0,start)+'            {!purposeFlow && <>\n'+general+'\n            </>}\n'+s.slice(end);
 s=replace(s,'{usesConsultationSteps && activeFormStep === ASSESSMENT_STEP && (\n          <>','{usesConsultationSteps && generalSelected && activeFormStep === ASSESSMENT_STEP && (\n          <>\n            {purposeFlow && <>\n'+general+'\n            </>}');
 s=replace(s,'{isGeneralOnly && reportingDecisions}','{(purposeFlow ? generalSelected : isGeneralOnly) && reportingDecisions}');
 s=replace(s,'            <FormSection\n              title="Programs & Services"','            {!purposeFlow && <FormSection\n              title="Programs & Services"');
 s=replace(s,'                error={validationErrors.healthRecordType}\n              />\n            </FormSection>','                error={validationErrors.healthRecordType}\n              />\n            </FormSection>}');
 // Maternal: reuse shared fields; prenatal-specific sections are not postpartum observations.
 const maternalStart=s.indexOf('        {!patientGateLocked && isMaternal &&');
 const maternalEnd=s.indexOf('            {/* Treatment and medicines move',maternalStart);
 let m=s.slice(maternalStart,maternalEnd);
 m=replace(m,'            {showMaternalPatientWarning && <MaternalClassificationWarning />}','            {showMaternalPatientWarning && <MaternalClassificationWarning />}\n            {teenagePrenatal(visitPurpose, selectedPatient, dateOfVisit) && <FormSection title="Pregnancy Confirmation" subtitle="Record the BHW confirmation for this visit."><fieldset><legend className="mb-3 text-sm font-semibold">Pregnancy Confirmed by BHW?</legend><div className="flex gap-6">{["Yes", "No"].map(answer => <label key={answer} className="flex items-center gap-2"><input type="radio" name="pregnancyConfirmed" checked={visitPurpose.pregnancyConfirmed === answer} onChange={() => setVisitPurpose(current => ({ ...current, pregnancyConfirmed: answer }))} />{answer}</label>)}</div></fieldset>{visitPurpose.pregnancyConfirmed === "Yes" && <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{TEENAGE_PREGNANCY_MESSAGE}</p>}</FormSection>}');
 m=replace(m,'title="Pregnancy / Obstetric Information"','title={postpartumSelected && !prenatalSelected ? "Postpartum / Obstetric Information" : "Pregnancy / Obstetric Information"}');
 m=replace(m,'subtitle="Record the patient\'s pregnancy and obstetric information for this prenatal consultation."','subtitle={postpartumSelected && !prenatalSelected ? "Record obstetric history relevant to this postpartum visit." : "Record pregnancy and obstetric information for this prenatal consultation."}');
 m=replace(m,'                  <div>\n                    <p className={MATERNAL_EYEBROW_CLASS}>Pregnancy Information','                  {prenatalSelected && <div>\n                    <p className={MATERNAL_EYEBROW_CLASS}>Pregnancy Information');
 m=replace(m,'                  </div>\n\n                  <div className="grid gap-4 sm:grid-cols-2">','                  </div>}\n\n                  <div className="grid gap-4 sm:grid-cols-2">');
 m=replace(m,'                  <div>\n                    <p className={MATERNAL_EYEBROW_CLASS}>Current Prenatal','                  {prenatalSelected && <div>\n                    <p className={MATERNAL_EYEBROW_CLASS}>Current Prenatal');
 m=replace(m,'                  </div>\n                </div>\n              </LockedFormContent>','                  </div>}\n                </div>\n              </LockedFormContent>');
 for(const title of ['Medical History','Immunization This Visit','Ultrasound']) {
   const a=m.indexOf('            <FormSection\n              title="'+title+'"');
   const b=m.indexOf('            </FormSection>',a)+'            </FormSection>'.length;
   if(a<0)throw Error(title);
   m=m.slice(0,a)+'            {prenatalSelected && <>\n'+m.slice(a,b)+'\n            </>}'+m.slice(b);
 }
 s=s.slice(0,maternalStart)+m+s.slice(maternalEnd);
 // Review: omit hidden general sections and surface purpose and confirmation.
 s=replace(s,'      title: "Interview",\n      stepKey: INTERVIEW_STEP,','      title: purposeFlow ? "Visit" : "Interview",\n      stepKey: INTERVIEW_STEP,');
 s=replace(s,'        { label: "Chief Complaint", value: chiefComplaint },\n        { label: "History of Present Illness", value: summaryOfPresentIllness },','        ...(purposeFlow ? [{ label: "Purpose of Visit", value: visitPurpose.services.map(key => VISIT_SERVICES[key]).join(" + ") }, { label: "Pregnancy Confirmed by BHW?", value: visitPurpose.pregnancyConfirmed || "Not answered" }] : [{ label: "Chief Complaint", value: chiefComplaint }, { label: "History of Present Illness", value: summaryOfPresentIllness }]),');
 s=replace(s,'      rows: [\n        { label: "Physical Exam", value: physicalExam },','      rows: [\n        ...(purposeFlow ? [{ label: "Chief Complaint", value: chiefComplaint }, { label: "History of Present Illness", value: summaryOfPresentIllness }] : []),\n        { label: "Physical Exam", value: physicalExam },');
 s=replace(s,'          sections={reviewSections}','          sections={reviewSections.filter(section => generalSelected || section.key !== ASSESSMENT_STEP)}');
 return s;
});
