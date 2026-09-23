const fs = require('fs');
function edit(path, fn) { fs.writeFileSync(path, fn(fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n'))); }
function rep(s,a,b){if(!s.includes(a))throw Error(a);return s.replace(a,b);}
edit('backend/app/Http/Requests/HealthRecordRequest.php',s=>{
 s=rep(s,'use App\\Services\\ConsultationPrograms;','use App\\Services\\ConsultationPrograms;\nuse App\\Services\\VisitPurpose;');
 s=rep(s,'            ...ConsultationPrograms::rules("monitoring_data"),','            ...ConsultationPrograms::rules("monitoring_data"),\n            ...VisitPurpose::rules("monitoring_data.visitPurpose"),');
 s=rep(s,'            $monitoringData = $this->input(\'monitoring_data\', []);','            VisitPurpose::validate($validator, $this);\n            $monitoringData = $this->input(\'monitoring_data\', []);');
 return s;
});
edit('backend/app/Services/HealthRecordDraftPayloadService.php',s=>{
 s=rep(s,"        'selectedPrograms' => ['*' => self::SCALAR],", "        'visitPurpose' => [\n            'version' => self::SCALAR,\n            'services' => ['*' => self::SCALAR],\n            'overrideReason' => self::SCALAR,\n            'pregnancyConfirmed' => self::SCALAR,\n        ],\n        'selectedPrograms' => ['*' => self::SCALAR],");
 s=rep(s,"            ...ConsultationPrograms::rules('payload'),", "            ...ConsultationPrograms::rules('payload'),\n            ...VisitPurpose::rules('payload.visitPurpose'),");
 return s;
});
edit('backend/app/Http/Controllers/Api/HealthRecordController.php',s=>{
 s=rep(s,"                $auditLogger->log($request, 'created', 'health_records', \"Created health record {$record->id}.\");", `                $purpose = $record->monitoring_data['visitPurpose'] ?? null;
                if (is_array($purpose) && filled($purpose['overrideReason'] ?? null)) {
                    // The clinical reason stays on the protected record; the audit
                    // entry identifies who committed the override and when.
                    $auditLogger->log($request, 'eligibility_override', 'health_records', "BHC age eligibility override recorded on health record {$record->id}; reason stored in visitPurpose.overrideReason.");
                }
                $auditLogger->log($request, 'created', 'health_records', "Created health record {$record->id}.");`);
 return s;
});
edit('frontend/src/services/healthRecordService.js',s=>{
 const anchor='  const payload = {\n    patient_id:';
 s=rep(s,anchor,`  // A postpartum-only visit reuses obstetric history, not current pregnancy
  // observations left behind when the worker changed the purpose selection.
  const purpose = sourceMonitoringData.visitPurpose;
  if (purpose?.services?.includes("Postpartum") && !purpose.services.includes("Prenatal")) {
    for (const key of ["lmp", "pmp", "cycleDuration", "expectedDeliveryDate", "aog", "fht", "riskAssessment", "ultrasound", "immunizationThisVisit", "tetanusToxoidStatus", "tetanusDiphtheriaStatus"]) delete maternalData[key];
  }
  const payload = {
    patient_id:`);
 return s;
});
