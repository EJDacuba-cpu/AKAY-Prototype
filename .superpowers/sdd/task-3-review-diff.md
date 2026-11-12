# Task 3 Review Package (full)


## FILE: frontend/src/pages/rhu/RhuConsultationWorkspace.jsx
```diff
diff --git a/frontend/src/pages/rhu/RhuConsultationWorkspace.jsx b/frontend/src/pages/rhu/RhuConsultationWorkspace.jsx
index f2036042..c3bac636 100644
--- a/frontend/src/pages/rhu/RhuConsultationWorkspace.jsx
+++ b/frontend/src/pages/rhu/RhuConsultationWorkspace.jsx
@@ -91,6 +91,7 @@ import {
   getPreviousStepKey,
   getProgramFormSteps,
   getStepOrder,
+  pickErrorsForStep,
   programStepKey,
   remapServerErrorKeys,
   resolveFormStep,
@@ -105,6 +106,14 @@ import {
   restoreRhuDiagnoses,
   restoreRhuFollowUpSchedules,
 } from "../../utils/rhuCarePlan";
+import {
+  formatPrescriptionLine,
+  normalizePrescriptions,
+  prescriptionErrors,
+  prescriptionReviewGroups,
+  prescriptionsForSave,
+  restorePrescriptions,
+} from "../../utils/rhuPrescriptions";
 import {
   diagnosesOpenDsTbTreatmentCard,
   existingRegisteredTbCase,
@@ -278,6 +287,7 @@ export default function RhuConsultationWorkspace() {
   const [immunizationEntries, setImmunizationEntries] = useState([]);
   const [diagnoses, setDiagnoses] = useState([]);
   const [diagnosisDraft, setDiagnosisDraft] = useState("");
+  const [prescriptions, setPrescriptions] = useState([]);
   const [prescriptionText, setPrescriptionText] = useState("");
   const [treatmentNotes, setTreatmentNotes] = useState("");
   const [followUpSchedules, setFollowUpSchedules] = useState([]);
@@ -601,6 +611,7 @@ export default function RhuConsultationWorkspace() {
       familyPlanningData,
       immunizationData: { vaccineEntries: immunizationEntries },
       diagnoses,
+      prescriptions,
       prescriptionText,
       medication: treatmentNotes,
       followUpSchedules,
@@ -654,6 +665,7 @@ export default function RhuConsultationWorkspace() {
       familyPlanningData,
       immunizationEntries,
       diagnoses,
+      prescriptions,
       prescriptionText,
       treatmentNotes,
       followUpSchedules,
@@ -722,6 +734,7 @@ export default function RhuConsultationWorkspace() {
     if (payload.immunizationData?.vaccineEntries) setImmunizationEntries(payload.immunizationData.vaccineEntries);
     const restoredDiagnoses = restoreRhuDiagnoses(payload);
     setDiagnoses(restoredDiagnoses);
+    setPrescriptions(restorePrescriptions(payload));
     setPrescriptionText(restorePrescriptionText(payload));
     setTreatmentNotes(payload.medication || "");
     const restoredSchedules = restoreFollowUpSchedules(payload.followUpSchedules);
@@ -811,6 +824,7 @@ export default function RhuConsultationWorkspace() {
         conditions: openConditions,
       }));
       Object.assign(errors, followUpScheduleErrors({ extraSchedules: followUpSchedules }));
+      Object.assign(errors, structuredPrescriptionErrors());
     }
     if (currentStepKey === REVIEW_STEP) {
       Object.assign(errors, form4bFinalizeErrors());
@@ -819,6 +833,50 @@ export default function RhuConsultationWorkspace() {
     return errors;
   }
 
+  function setValidationErrorsAndFocus(errors) {
+    const nextErrors = Object.fromEntries(
+      Object.entries(errors || {}).filter(([, value]) => Boolean(value)),
+    );
+    setValidationErrors(nextErrors);
+    const fieldKeys = Object.keys(nextErrors);
+    if (!fieldKeys.length) return false;
+    window.requestAnimationFrame(() => {
+      const isFocusTargetVisible = (node) => {
+        if (!(node instanceof Element)) return false;
+        const style = window.getComputedStyle(node);
+        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
+          return false;
+        }
+        const rect = node.getBoundingClientRect();
+        return rect.width > 0 || rect.height > 0;
+      };
+      let element = null;
+      for (const field of fieldKeys) {
+        const matches = document.querySelectorAll(`[name="${field}"], [data-field="${field}"]`);
+        element = [...matches].find(isFocusTargetVisible) || null;
+        if (element) break;
+      }
+      if (!element) return;
+      const stage = element.closest("[data-consult-scroll], .ehr-consult__stage, .ehr-consult__form");
+      if (stage instanceof HTMLElement) {
+        const stageRect = stage.getBoundingClientRect();
+        const targetRect = element.getBoundingClientRect();
+        const footerReserve = 96;
+        const headerReserve = 24;
+        const nextTop = stage.scrollTop
+          + (targetRect.top - stageRect.top)
+          - Math.max(headerReserve, (stageRect.height - footerReserve - targetRect.height) / 2);
+        stage.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
+      } else {
+        element.scrollIntoView({ behavior: "smooth", block: "center" });
+      }
+      if (typeof element.focus === "function") {
+        element.focus({ preventScroll: true });
+      }
+    });
+    return true;
+  }
+
   function goToStepKey(key) {
     if (key === REVIEW_STEP) {
       setWizardPhase(WIZARD_REVIEW);
@@ -869,7 +927,7 @@ export default function RhuConsultationWorkspace() {
 
   function handleContinue() {
     const errors = validateCurrent();
-    if (Object.keys(errors).length) return;
+    if (setValidationErrorsAndFocus(errors)) return;
     if (wizardPhase === WIZARD_REVIEW) {
       if (!canFinalize) {
         toast.error("This account cannot finalize the consultation.");
@@ -939,6 +997,15 @@ export default function RhuConsultationWorkspace() {
     if (prefill.aog) setAog(prefill.aog);
   }
 
+  function structuredPrescriptionErrors() {
+    return prescriptionErrors(prescriptions, diagnoses);
+  }
+
+  function handlePrescriptionsChange(next) {
+    setPrescriptions(normalizePrescriptions(next));
+    clearErrorsStartingWith(["prescriptions"]);
+  }
+
   function handleDiagnosisChange(next) {
     setDiagnoses((current) => current.map((row) => (row.id === next.id ? {
       ...next,
@@ -1098,11 +1165,12 @@ export default function RhuConsultationWorkspace() {
         conditions: openConditions,
       }),
       ...followUpScheduleErrors({ extraSchedules: followUpSchedules }),
+      ...structuredPrescriptionErrors(),
     };
     if (Object.keys(errors).length) {
       const first = findFirstErrorStepKey(errors, stepOrder, stepOptions);
       if (first) goToStepKey(first);
-      setValidationErrors(errors);
+      setValidationErrorsAndFocus(errors);
       return;
     }
     const isWalkIn = visit?.source === "walk_in";
@@ -1160,6 +1228,7 @@ export default function RhuConsultationWorkspace() {
           monitoringData: {
             additionalConcern: additionalConcernPayload({ show: isReferred && showAdditionalConcern, chiefComplaint: additionalChiefComplaint, historyOfPresentIllness: additionalHistoryOfPresentIllness }),
             ...(nutritionIntent ? { nutritionIntent } : {}),
+            prescriptions: prescriptionsForSave(prescriptions),
           },
           physicalExam,
           laboratoryTests,
@@ -1247,9 +1316,9 @@ export default function RhuConsultationWorkspace() {
       if (fieldErrors.laboratoryEvidence || fieldErrors.laboratoryEvidenceConfirmed) {
         goToStepKey(NEXT_STEP);
       }
-      setValidationErrors(fieldErrors);
       const first = findFirstErrorStepKey(fieldErrors, stepOrder, stepOptions);
       if (first) goToStepKey(first);
+      setValidationErrorsAndFocus(fieldErrors);
       toast.error(error?.message || "Unable to save this consultation.");
     } finally {
       setSaving(false);
@@ -1322,6 +1391,9 @@ export default function RhuConsultationWorkspace() {
       [REVIEW_STEP]: "Confirm the consultation before saving the record.",
     },
   });
+  const stepValidationMessages = Object.values(
+    pickErrorsForStep(validationErrors, currentStepKey, stepOptions),
+  ).filter(Boolean);
 
   const reviewSections = compactReviewSections([
     {
@@ -1383,7 +1455,16 @@ export default function RhuConsultationWorkspace() {
           { label: `${entry.name} — Clinical plan`, value: entry.higherLevelReferralPlan?.clinicalPlan },
         ]),
         { label: "Actions taken", value: treatmentNotes },
-        { label: "Prescription", value: prescriptionText },
+        ...(() => {
+          const structuredPrescriptionRows = prescriptionReviewGroups(prescriptions, diagnoses).map((group) => ({
+            label: group.label,
+            value: group.orders.map((rx) => formatPrescriptionLine(rx)).filter(Boolean).join("; "),
+          }));
+          if (structuredPrescriptionRows.length) return structuredPrescriptionRows;
+          return String(prescriptionText || "").trim()
+            ? [{ label: "Prescription", value: prescriptionText }]
+            : [];
+        })(),
         ...followUpSchedules.filter((item) => item.date).map((item) => ({
           label: item.purpose || "Follow-up",
           value: [item.date, item.time].filter(Boolean).join(" · "),
@@ -1492,6 +1573,19 @@ export default function RhuConsultationWorkspace() {
           />
         )}
       </div>
+      {stepValidationMessages.length > 0 && (
+        <div
+          role="alert"
+          className="mt-3 border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-[#B91C1C]"
+        >
+          <p>Complete the required fields before continuing.</p>
+          <ul className="mt-1 list-disc space-y-0.5 pl-4">
+            {stepValidationMessages.map((message) => (
+              <li key={message}>{message}</li>
+            ))}
+          </ul>
+        </div>
+      )}
     </header>
   );
 
@@ -1537,6 +1631,7 @@ export default function RhuConsultationWorkspace() {
                   physicianName={currentUser.name || ""}
                   visitWeightKg={weight}
                   prescriptionText={prescriptionText}
+                  birthDate={patient?.birthdate || patient?.birthDate || patient?.dateOfBirth || ""}
                 />
               </fieldset>
             )}
@@ -1897,7 +1992,8 @@ export default function RhuConsultationWorkspace() {
                     treatmentNotes={treatmentNotes}
                     onTreatmentNotesChange={setTreatmentNotes}
                     prescriptionText={prescriptionText}
-                    onPrescriptionTextChange={setPrescriptionText}
+                    prescriptions={prescriptions}
+                    onPrescriptionsChange={handlePrescriptionsChange}
                     registry={registry}
                     existingTbCase={existingTbCase}
                     canConfirmTb={canConfirmTb}
```

## FILE: frontend/src/pages/rhu/RhuConsultationWorkspace.test.js
```diff
diff --git a/frontend/src/pages/rhu/RhuConsultationWorkspace.test.js b/frontend/src/pages/rhu/RhuConsultationWorkspace.test.js
index 2af46294..bbf0b9e6 100644
--- a/frontend/src/pages/rhu/RhuConsultationWorkspace.test.js
+++ b/frontend/src/pages/rhu/RhuConsultationWorkspace.test.js
@@ -70,8 +70,19 @@ test("assessment keeps previous BHC vitals distinct from editable RHU vitals", (
   assert.equal(workspace.includes("Previous BHC findings are listed below."), false);
 });
 
-test("RHU consult prescription is a textarea without catalog picker or consult dispensing", () => {
-  assert.match(carePlan, /label="Prescription"/);
+test("RHU consult prescription is structured on the diagnosis card without catalog picker or consult dispensing", () => {
+  const prescriptionsUi = readFileSync(
+    join(here, "../../components/features/health-records/wizard/RhuPrescriptionsSection.jsx"),
+    "utf8",
+  );
+  assert.match(prescriptionsUi, /Add Prescription/);
+  assert.match(prescriptionsUi, /Linked Diagnosis/);
+  assert.match(carePlan, /RhuPrescriptionsSection/);
+  assert.match(carePlan, /reconcilePrescriptionsForDiagnosisRemoval/);
+  assert.match(carePlan, /prescriptions=\{prescriptions\}/);
+  assert.match(carePlan, /onPrescriptionsChange=\{onPrescriptionsChange\}/);
+  assert.doesNotMatch(carePlan, /label="Prescription"/);
+  assert.match(carePlan, /label="Actions Taken \/ Treatment"/);
   assert.match(carePlan, /FieldTextarea/);
   assert.doesNotMatch(carePlan, /PrescribedMedicinesSection/);
   assert.doesNotMatch(workspace, /DispensedMedicinesSection/);
@@ -114,3 +125,60 @@ test("Nutrition service sets panel copy and nutritionIntent without a form step"
   }
   assert.match(workspace, /heading="Health Services"/);
 });
+
+test("workspace draft, review, and finalize keep structured prescriptions off prescriptionText", () => {
+  assert.match(workspace, /restorePrescriptions\(payload\)/);
+  assert.match(workspace, /normalizePrescriptions\(/);
+  assert.match(workspace, /prescriptionsForSave\(prescriptions\)/);
+  assert.match(workspace, /prescriptionErrors\(prescriptions, diagnoses\)/);
+  assert.match(workspace, /formatPrescriptionLine\(rx\)/);
+  assert.match(workspace, /prescriptions=\{prescriptions\}/);
+  assert.match(workspace, /onPrescriptionsChange=\{handlePrescriptionsChange\}/);
+
+  const payloadStart = workspace.indexOf("const draftPayload = useMemo");
+  const payloadEnd = workspace.indexOf("const autosave = useDraftAutosave");
+  const payload = workspace.slice(payloadStart, payloadEnd);
+  assert.match(payload, /diagnoses,\s*prescriptions,\s*prescriptionText,/);
+
+  const restoreStart = workspace.indexOf("function restoreDraft");
+  const restoreEnd = workspace.indexOf("const monitoredNames");
+  const restore = workspace.slice(restoreStart, restoreEnd);
+  assert.match(restore, /setPrescriptions\(restorePrescriptions\(payload\)\)/);
+  assert.match(restore, /setPrescriptionText\(restorePrescriptionText\(payload\)\)/);
+  assert.doesNotMatch(restore, /setPrescriptionText\([\s\S]*prescriptions/);
+
+  const saveStart = workspace.indexOf("async function saveRecord");
+  const saveEnd = workspace.indexOf("const fingerprint = JSON.stringify(recordInput)");
+  const save = workspace.slice(saveStart, saveEnd);
+  assert.match(save, /structuredPrescriptionErrors\(\)/);
+  assert.match(save, /prescriptions:\s*prescriptionsForSave\(prescriptions\)/);
+  assert.doesNotMatch(save, /setPrescriptionText\(/);
+  assert.doesNotMatch(save, /formatPrescriptionLine/);
+
+  const reviewStart = workspace.indexOf('title: "Diagnosis & Care Plan"');
+  const reviewEnd = workspace.indexOf("followUpSchedules.filter", reviewStart);
+  const review = workspace.slice(reviewStart, reviewEnd);
+  assert.match(review, /prescriptionReviewGroups\(prescriptions, diagnoses\)/);
+  assert.match(review, /formatPrescriptionLine\(rx\)/);
+  assert.match(review, /structuredPrescriptionRows\.length/);
+  assert.match(review, /label: "Prescription", value: prescriptionText/);
+  assert.doesNotMatch(review, /setPrescriptionText/);
+
+  const validateStart = workspace.indexOf("function validateCurrent");
+  const validateEnd = workspace.indexOf("function setValidationErrorsAndFocus");
+  assert.match(workspace.slice(validateStart, validateEnd), /structuredPrescriptionErrors\(\)/);
+});
+
+test("Next on Diagnosis & Care Plan surfaces validation errors instead of failing silently", () => {
+  const source = readFileSync(join(here, "RhuConsultationWorkspace.jsx"), "utf8");
+  assert.match(source, /function setValidationErrorsAndFocus\(/);
+  assert.match(source, /isFocusTargetVisible|getBoundingClientRect/);
+  const continueHandler = source.match(/function handleContinue\(\) \{[\s\S]*?\n {2}\}/);
+  assert.ok(continueHandler, "expected handleContinue");
+  assert.match(continueHandler[0], /setValidationErrorsAndFocus\(errors\)/);
+  assert.doesNotMatch(continueHandler[0], /if \(Object\.keys\(errors\)\.length\) return;/);
+  assert.match(source, /stepValidationMessages/);
+  assert.match(source, /Complete the required fields before continuing\./);
+  assert.match(source, /pickErrorsForStep\(validationErrors, currentStepKey, stepOptions\)/);
+  assert.match(source, /isReferralVisit:\s*isReferredRhuVisit\(visit\)/);
+});
```

## FILE: frontend/src/utils/rhuPrescriptions.js
```diff
```

## FILE: frontend/src/utils/rhuPrescriptions.test.js
```diff
```

## FILE: frontend/src/utils/consultationSteps.js
```diff
diff --git a/frontend/src/utils/consultationSteps.js b/frontend/src/utils/consultationSteps.js
index 30dcaf81..0bdbdcbb 100644
--- a/frontend/src/utils/consultationSteps.js
+++ b/frontend/src/utils/consultationSteps.js
@@ -464,6 +464,7 @@ export function getErrorOwnerStepKey(errorKey, options = {}) {
   if (key === "prescribedMedicines" || key.startsWith("prescribedMedicines.")) {
     return isRhuItr(options) ? NEXT_STEP : PRESCRIPTION_STEP;
   }
+  if (key === "prescriptions" || key.startsWith("prescriptions.")) return carePlanStep;
   if (key.startsWith("carePlanStop.") || key.startsWith("carePlanAction.")) return carePlanStep;
   if (key === "followUpAcknowledged" || key === "referralAcknowledged") return carePlanStep;
   // Server-only v2 next-action keys.
```

## FILE: frontend/src/utils/consultationSteps.test.js
```diff
diff --git a/frontend/src/utils/consultationSteps.test.js b/frontend/src/utils/consultationSteps.test.js
index 604e18c3..d40ceec2 100644
--- a/frontend/src/utils/consultationSteps.test.js
+++ b/frontend/src/utils/consultationSteps.test.js
@@ -164,6 +164,9 @@ test("RHU ITR Diagnosis & Care Plan owns care-plan, follow-up and prescription e
   assert.equal(getErrorOwnerStepKey("carePlanOwner", RHU_ITR_STEP_OPTIONS), null);
   assert.equal(getErrorOwnerStepKey("prescribedMedicines", RHU_ITR_STEP_OPTIONS), NEXT_STEP);
   assert.equal(getErrorOwnerStepKey("prescribedMedicines.0.quantity", RHU_ITR_STEP_OPTIONS), NEXT_STEP);
+  assert.equal(getErrorOwnerStepKey("prescriptions", RHU_ITR_STEP_OPTIONS), NEXT_STEP);
+  assert.equal(getErrorOwnerStepKey("prescriptions.rx-shared.medicineName", RHU_ITR_STEP_OPTIONS), NEXT_STEP);
+  assert.equal(getErrorOwnerStepKey("prescriptions.rx-shared.diagnosisIds", RHU_ITR_STEP_OPTIONS), NEXT_STEP);
   assert.equal(getErrorOwnerStepKey("diagnoses.0.nextAction", RHU_ITR_STEP_OPTIONS), NEXT_STEP);
   assert.equal(getErrorOwnerStepKey("followUpSchedule.entry:abc.date", RHU_ITR_STEP_OPTIONS), NEXT_STEP);
   assert.equal(getErrorOwnerStepKey("informant.relation", RHU_ITR_STEP_OPTIONS), INTERVIEW_STEP);
```

## FILE: backend/app/Services/HealthRecordDraftPayloadService.php
```diff
diff --git a/backend/app/Services/HealthRecordDraftPayloadService.php b/backend/app/Services/HealthRecordDraftPayloadService.php
index 32969e63..12b06a6f 100644
--- a/backend/app/Services/HealthRecordDraftPayloadService.php
+++ b/backend/app/Services/HealthRecordDraftPayloadService.php
@@ -103,6 +103,23 @@ class HealthRecordDraftPayloadService
         'assessmentNotes' => self::SCALAR,
         'medication' => self::SCALAR,
         'prescriptionText' => self::SCALAR,
+        // Visit-level structured orders. Incomplete rows are valid drafts.
+        // Legacy prescriptionText stays a separate scalar and is not derived from these.
+        'prescriptions' => ['*' => [
+            'id' => self::SCALAR,
+            'diagnosisIds' => ['*' => self::SCALAR],
+            'medicineName' => self::SCALAR,
+            'strength' => self::SCALAR,
+            'dose' => self::SCALAR,
+            'route' => self::SCALAR,
+            'frequency' => self::SCALAR,
+            'duration' => self::SCALAR,
+            'instructions' => self::SCALAR,
+            'authorizedQuantity' => self::SCALAR,
+            'authorizedUnit' => self::SCALAR,
+            'source' => self::SCALAR,
+            'tbCaseId' => self::SCALAR,
+        ]],
         'noInterventionPerformed' => self::SCALAR,
         'noInterventionReason' => self::SCALAR,
         'attendingStaff' => self::SCALAR,
@@ -838,6 +855,21 @@ private function rules(): array
                 'max:2147483647',
             ],
             'payload.prescriptionText' => ['nullable', 'string', 'max:5000'],
+            'payload.prescriptions' => ['nullable', 'array', 'max:50'],
+            'payload.prescriptions.*.id' => ['nullable', 'string', 'max:64'],
+            'payload.prescriptions.*.diagnosisIds' => ['nullable', 'array', 'max:20'],
+            'payload.prescriptions.*.diagnosisIds.*' => ['string', 'max:64'],
+            'payload.prescriptions.*.medicineName' => ['nullable', 'string', 'max:255'],
+            'payload.prescriptions.*.strength' => ['nullable', 'string', 'max:100'],
+            'payload.prescriptions.*.dose' => ['nullable', 'string', 'max:100'],
+            'payload.prescriptions.*.route' => ['nullable', 'string', 'max:50'],
+            'payload.prescriptions.*.frequency' => ['nullable', 'string', 'max:100'],
+            'payload.prescriptions.*.duration' => ['nullable', 'string', 'max:100'],
+            'payload.prescriptions.*.instructions' => ['nullable', 'string', 'max:2000'],
+            'payload.prescriptions.*.authorizedQuantity' => ['nullable'],
+            'payload.prescriptions.*.authorizedUnit' => ['nullable', 'string', 'max:50'],
+            'payload.prescriptions.*.source' => ['nullable', 'string', 'max:64'],
+            'payload.prescriptions.*.tbCaseId' => ['nullable', 'string', 'max:64'],
             'payload.prescribedMedicines' => ['nullable', 'array', 'max:50'],
             'payload.prescribedMedicines.*.medicineId' => ['required', 'integer'],
             'payload.prescribedMedicines.*.quantity' => ['required', 'integer', 'min:1', 'max:2147483647'],
```

## FILE: backend/tests/Unit/Services/HealthRecordDraftPayloadServiceTest.php
```diff
diff --git a/backend/tests/Unit/Services/HealthRecordDraftPayloadServiceTest.php b/backend/tests/Unit/Services/HealthRecordDraftPayloadServiceTest.php
index d2000121..aaeda311 100644
--- a/backend/tests/Unit/Services/HealthRecordDraftPayloadServiceTest.php
+++ b/backend/tests/Unit/Services/HealthRecordDraftPayloadServiceTest.php
@@ -31,6 +31,35 @@ public function test_incomplete_higher_level_referral_plan_survives_draft_flush(
         $this->assertSame($payload, $service->sanitize($service->sanitize($payload)));
     }
 
+    public function test_structured_prescriptions_keep_ids_and_diagnosis_links_in_drafts(): void
+    {
+        $payload = [
+            'consultationWorkflow' => 'rhu_itr_v1',
+            'prescriptionText' => 'legacy line',
+            'prescriptions' => [[
+                'id' => 'rx-shared',
+                'diagnosisIds' => ['diag-htn', 'diag-dm'],
+                'medicineName' => 'Losartan',
+                'strength' => '50mg',
+                'dose' => '1 tablet',
+                'route' => 'PO',
+                'frequency' => 'Once daily',
+                'duration' => '30 days',
+                'instructions' => '',
+                'authorizedQuantity' => null,
+                'authorizedUnit' => '',
+                'source' => 'itr',
+                'tbCaseId' => '',
+            ]],
+        ];
+        $service = new HealthRecordDraftPayloadService();
+        $sanitized = $service->sanitize($payload);
+        $this->assertSame($payload, $sanitized);
+        $this->assertSame('rx-shared', $sanitized['prescriptions'][0]['id']);
+        $this->assertSame(['diag-htn', 'diag-dm'], $sanitized['prescriptions'][0]['diagnosisIds']);
+        $this->assertSame('legacy line', $sanitized['prescriptionText']);
+    }
+
     public function test_rhu_diagnosis_care_plan_survives_draft_flush_before_finalization(): void
     {
         $payload = [
```
