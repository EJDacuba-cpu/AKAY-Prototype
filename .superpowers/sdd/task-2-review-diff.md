# Task 2 Review Package (post-fix)


## FILE: frontend/src/components/features/health-records/wizard/RhuPrescriptionsSection.jsx
```
import { Button } from "../../../ui/button";
import {
  emptyPrescription,
  formatPrescriptionLine,
  normalizePrescriptions,
  prescriptionErrors,
  prescriptionsForDiagnosis,
} from "../../../../utils/rhuPrescriptions";

const MAX_PRESCRIPTIONS = 50;

const controlClass = "mt-1 min-h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-ink-400 aria-invalid:border-red-700";

const TEXT_FIELDS = [
  ["medicineName", "Medicine Name", 255],
  ["strength", "Strength", 100],
  ["dose", "Dose", 100],
  ["route", "Route", 50],
  ["frequency", "Frequency", 100],
  ["duration", "Duration", 100],
];

function fieldMessages(id, errors) {
  const prefix = `prescriptions.${id}.`;
  return Object.entries(errors)
    .filter(([key, message]) => key.startsWith(prefix) && message)
    .map(([key, message]) => ({ key, message }));
}

function RxField({ label, required, error, children }) {
  return (
    <label className="block min-w-0 text-xs font-medium text-neutral-700">
      <span>{label}{required ? " *" : ""}</span>
      {children}
      {error ? <span role="alert" className="mt-1 block text-red-700">{error}</span> : null}
    </label>
  );
}

function PrescriptionEditor({
  draft,
  diagnoses,
  errors,
  disabled,
  onChange,
  onToggleDiagnosis,
  onSave,
  onCancel,
}) {
  const key = `prescriptions.${draft.id}`;
  const errorFor = (field) => errors[`${key}.${field}`] || "";
  return (
    <div className="grid min-w-0 gap-3 border border-neutral-200 bg-white p-3 sm:grid-cols-2">
      <fieldset className="min-w-0 sm:col-span-2" data-field={`${key}.diagnosisIds`}>
        <legend className="text-xs font-medium text-neutral-700">Linked Diagnosis *</legend>
        <div className="mt-1 space-y-1">
          {diagnoses.map((entry) => (
            <label key={entry.id} className="flex min-w-0 items-start gap-2 py-1 text-xs text-[#0B1C30]">
              <input
                type="checkbox"
                name={`${key}.diagnosisIds`}
                value={entry.id}
                checked={draft.diagnosisIds.includes(entry.id)}
                disabled={disabled}
                aria-invalid={Boolean(errorFor("diagnosisIds")) || undefined}
                className="mt-1 shrink-0 accent-[#B70011]"
                onChange={(event) => onToggleDiagnosis(entry.id, event.target.checked)}
              />
              <span className="min-w-0 break-words">{entry.name}</span>
            </label>
          ))}
        </div>
        {errorFor("diagnosisIds") ? <span role="alert" className="mt-1 block text-xs text-red-700">{errorFor("diagnosisIds")}</span> : null}
      </fieldset>
      {TEXT_FIELDS.map(([field, label, maxLength]) => (
        <RxField key={field} label={label} required error={errorFor(field)}>
          <input
            name={`${key}.${field}`}
            data-field={`${key}.${field}`}
            value={draft[field] || ""}
            maxLength={maxLength}
            disabled={disabled}
            aria-invalid={Boolean(errorFor(field)) || undefined}
            className={controlClass}
            onChange={(event) => onChange(field, event.target.value)}
          />
        </RxField>
      ))}
      <RxField label="Instructions" error={errorFor("instructions")}>
        <textarea
          name={`${key}.instructions`}
          data-field={`${key}.instructions`}
          value={draft.instructions || ""}
          maxLength={2000}
          rows={2}
          disabled={disabled}
          aria-invalid={Boolean(errorFor("instructions")) || undefined}
          className={controlClass}
          onChange={(event) => onChange("instructions", event.target.value)}
        />
      </RxField>
      <RxField label="Authorized Quantity" error={errorFor("authorizedQuantity")}>
        <input
          name={`${key}.authorizedQuantity`}
          data-field={`${key}.authorizedQuantity`}
          inputMode="numeric"
          value={draft.authorizedQuantity ?? ""}
          disabled={disabled}
          aria-invalid={Boolean(errorFor("authorizedQuantity")) || undefined}
          className={controlClass}
          onChange={(event) => onChange("authorizedQuantity", event.target.value)}
        />
      </RxField>
      <RxField label="Authorized Unit" error={errorFor("authorizedUnit")}>
        <input
          name={`${key}.authorizedUnit`}
          data-field={`${key}.authorizedUnit`}
          value={draft.authorizedUnit || ""}
          maxLength={50}
          disabled={disabled}
          aria-invalid={Boolean(errorFor("authorizedUnit")) || undefined}
          className={controlClass}
          onChange={(event) => onChange("authorizedUnit", event.target.value)}
        />
      </RxField>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="button" variant="secondary" size="compact" disabled={disabled} className="rounded-none" onClick={onSave}>
          Save Prescription
        </Button>
        <Button type="button" variant="ghost" size="compact" disabled={disabled} className="rounded-none" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function commitPrescriptionDraft(prescriptions, draft, mode) {
  const next = emptyPrescription(draft);
  const latest = Array.isArray(prescriptions) ? prescriptions : [];
  const exists = latest.some((item) => item.id === next.id);
  if (mode === "edit" && !exists) return { cancelled: true, prescriptions: latest };
  if (!exists && latest.length >= MAX_PRESCRIPTIONS) return { cancelled: true, prescriptions: latest };
  const merged = exists
    ? latest.map((item) => (item.id === next.id ? next : item))
    : [...latest, next];
  return { cancelled: false, prescriptions: merged };
}

export default function RhuPrescriptionsSection({
  diagnosisId,
  diagnoses = [],
  prescriptions = [],
  onPrescriptionsChange,
  errors = {},
  disabled = false,
  editor = null,
  onEditorChange,
}) {
  const ownsEditor = editor?.ownerDiagnosisId === diagnosisId && Boolean(editor?.draft);
  const draft = ownsEditor ? editor.draft : null;
  const linked = prescriptionsForDiagnosis(prescriptions, diagnosisId);
  const shownErrors = ownsEditor ? { ...errors, ...(editor.localErrors || {}) } : errors;
  const atCap = prescriptions.length >= MAX_PRESCRIPTIONS;

  function updateList(next) {
    onPrescriptionsChange?.(normalizePrescriptions(next));
  }

  function openEditor(next) {
    onEditorChange?.(next);
  }

  function startAdd() {
    if (disabled || ownsEditor || atCap) return;
    openEditor({
      draft: emptyPrescription({ diagnosisIds: diagnosisId ? [diagnosisId] : [] }),
      mode: "add",
      ownerDiagnosisId: diagnosisId,
      localErrors: {},
    });
  }

  function startEdit(rx) {
    if (disabled || ownsEditor || rx?.source === "tb_form4b_ref") return;
    openEditor({
      draft: emptyPrescription(rx),
      mode: "edit",
      ownerDiagnosisId: diagnosisId,
      localErrors: {},
    });
  }

  function cancel() {
    if (editor?.ownerDiagnosisId === diagnosisId) onEditorChange?.(null);
  }

  function save() {
    if (!ownsEditor) return;
    const next = emptyPrescription(draft);
    const found = prescriptionErrors([next], diagnoses);
    const own = Object.fromEntries(
      Object.entries(found).filter(([key]) => key.startsWith(`prescriptions.${next.id}.`)),
    );
    if (Object.keys(own).length) {
      onEditorChange?.({ ...editor, localErrors: own });
      return;
    }
    const result = commitPrescriptionDraft(prescriptions, next, editor.mode);
    if (!result.cancelled) updateList(result.prescriptions);
    onEditorChange?.(null);
  }

  function removePrescription(id) {
    updateList(prescriptions.filter((item) => item.id !== id));
    if (editor?.draft?.id === id) onEditorChange?.(null);
  }

  function changeDraft(field, value) {
    if (!ownsEditor) return;
    onEditorChange?.({ ...editor, draft: { ...editor.draft, [field]: value } });
  }

  function toggleDiagnosis(id, checked) {
    if (!ownsEditor) return;
    const diagnosisIds = editor.draft.diagnosisIds.filter((item) => item !== id);
    if (checked) diagnosisIds.push(id);
    onEditorChange?.({ ...editor, draft: { ...editor.draft, diagnosisIds } });
  }

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-2 border-t border-[#E5EEFF] pt-3">
      <legend className="pt-1 text-xs font-semibold text-[#0B1C30]">Prescriptions</legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[#545F73]">Record the medicines for this diagnosis.</p>
        <Button type="button" variant="secondary" size="compact" disabled={disabled || ownsEditor || atCap} className="rounded-none" onClick={startAdd}>
          Add Prescription
        </Button>
      </div>
      {errors.prescriptions ? <p role="alert" className="text-xs text-red-700">{errors.prescriptions}</p> : null}
      {!linked.length && !draft ? <p className="text-xs text-[#545F73]">No prescriptions for this diagnosis.</p> : null}
      <ul className="space-y-1">
        {linked.map((rx) => (
          rx.id === draft?.id ? (
            <li key={rx.id}>
              <PrescriptionEditor
                draft={draft}
                diagnoses={diagnoses}
                errors={shownErrors}
                disabled={disabled}
                onChange={changeDraft}
                onToggleDiagnosis={toggleDiagnosis}
                onSave={save}
                onCancel={cancel}
              />
            </li>
          ) : (
            <li key={rx.id} className="min-w-0 space-y-1 py-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 flex-1 break-words text-xs text-[#0B1C30]">{formatPrescriptionLine(rx)}</p>
                <div className="flex gap-1">
                  {rx.source !== "tb_form4b_ref" ? (
                    <Button type="button" variant="ghost" size="compact" disabled={disabled || ownsEditor} className="rounded-none" onClick={() => startEdit(rx)}>
                      Edit Prescription
                    </Button>
                  ) : null}
                  <Button type="button" variant="ghost" size="compact" disabled={disabled} className="rounded-none" onClick={() => removePrescription(rx.id)}>
                    Remove Prescription
                  </Button>
                </div>
              </div>
              {fieldMessages(rx.id, errors).map((item) => (
                <p key={item.key} role="alert" className="text-xs text-red-700">{item.message}</p>
              ))}
            </li>
          )
        ))}
      </ul>
      {draft && !linked.some((rx) => rx.id === draft.id) ? (
        <PrescriptionEditor
          draft={draft}
          diagnoses={diagnoses}
          errors={shownErrors}
          disabled={disabled}
          onChange={changeDraft}
          onToggleDiagnosis={toggleDiagnosis}
          onSave={save}
          onCancel={cancel}
        />
      ) : null}
    </fieldset>
  );
}

```

## FILE: frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.jsx
```
diff --git a/frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.jsx b/frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.jsx
index aecda452..6cc59c4f 100644
--- a/frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.jsx
+++ b/frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.jsx
@@ -1,6 +1,7 @@
-import { useId } from "react";
+import { useEffect, useId, useState } from "react";
 import { Trash2 } from "lucide-react";
 import { LaboratoryEvidencePicker, SupportingLaboratoryTestsPicker } from "../LaboratoryEvidence";
+import RhuPrescriptionsSection from "./RhuPrescriptionsSection";
 
 import { DatePickerField, TimePickerField } from "../../../common/forms/DatePickerField";
 import { Button } from "../../../ui/button";
@@ -8,6 +9,7 @@ import { Input } from "../../../ui/input";
 import { FieldError, FieldInput, FieldTextarea, RadioChoiceGroup } from "../fields/ClinicalFields";
 import NextStepsSection from "./NextStepsSection";
 import { createDiagnosisId, DIAGNOSIS_LIMITS } from "../../../../utils/diagnoses";
+import { reconcilePrescriptionsForDiagnosisRemoval } from "../../../../utils/rhuPrescriptions";
 import { entryPurposeKey } from "../../../../utils/followUpSchedules";
 import {
   applyRhuNextAction,
@@ -38,7 +40,7 @@ function DiagnosisChoiceGroup({ options, disabled, ...props }) {
   const id = useId();
   const nextAction = props.name.endsWith(".nextAction");
   if (nextAction) return (
-    <fieldset disabled={disabled} className="rhu-diagnosis-segments min-w-0">
+    <fieldset disabled={disabled} className="rhu-diagnosis-segments min-w-0" data-field={props.name}>
       <RadioChoiceGroup {...props} options={options} />
     </fieldset>
   );
@@ -281,15 +283,21 @@ function DiagnosisCard({
   registry, existingTbCase, canConfirmTb, onChange, onFollowUpChange, onRemove,
   tbCaseRegistration, onTbCaseRegistrationChange, visit,
   visitWeightKg, prescriptionText,
+  prescriptions = [], diagnoses = [], onPrescriptionsChange, removalError = "",
+  prescriptionEditor = null, onPrescriptionEditorChange,
 }) {
   const action = diagnosisNextAction(entry);
   const confirmed = diagnosisActivateConfirmed(entry, conditions);
   const existing = matchingMonitorableCondition(entry.name, conditions);
   const key = `diagnoses.${entry.id}`;
-  const showWalkInActions = !isReferralVisit;
+  // Referral hides walk-in Next Action by default. Show it only when a restored
+  // draft still carries a walk-in action the clinician must change (not auto-cleared).
+  const legacyReferralWalkInAction = isReferralVisit
+    && (action === "rhu_follow_up" || action === "manage_to_bhc" || action === "refer_higher_level");
+  const showWalkInActions = !isReferralVisit || legacyReferralWalkInAction;
   const presumptive = isPresumptiveTb(entry);
   return (
-    <div className="rhu-diagnosis-card" data-field={errors[`${key}.nextAction`] ? `${key}.nextAction` : undefined}>
+    <div className="rhu-diagnosis-card" data-field={showWalkInActions && errors[`${key}.nextAction`] ? `${key}.nextAction` : undefined}>
       <div className="flex items-start gap-2">
         <div className="min-w-0 flex-1">
           <p className="text-[15px] font-semibold text-[#0B1C30]">{entry.name}</p>
@@ -303,6 +311,7 @@ function DiagnosisCard({
           <Trash2 size={14} />
         </Button>
       </div>
+      {removalError ? <div role="alert"><FieldError error={removalError} /></div> : null}
       <label className="flex cursor-pointer items-start gap-3 px-1 py-1">
         <input
           type="checkbox"
@@ -351,6 +360,16 @@ function DiagnosisCard({
             disabled={disabled}
             onChange={(supportingLaboratoryTests) => onChange({ ...entry, supportingLaboratoryTests })}
           />
+          <RhuPrescriptionsSection
+            diagnosisId={entry.id}
+            diagnoses={diagnoses}
+            prescriptions={prescriptions}
+            onPrescriptionsChange={onPrescriptionsChange}
+            errors={errors}
+            disabled={disabled}
+            editor={prescriptionEditor}
+            onEditorChange={onPrescriptionEditorChange}
+          />
         </div>
       </div>
       {showWalkInActions ? (
@@ -494,7 +513,8 @@ export default function RhuDiagnosisCarePlanSection({
   treatmentNotes = "",
   onTreatmentNotesChange,
   prescriptionText = "",
-  onPrescriptionTextChange,
+  prescriptions = [],
+  onPrescriptionsChange,
   registry = {},
   existingTbCase = null,
   canConfirmTb = false,
@@ -506,6 +526,51 @@ export default function RhuDiagnosisCarePlanSection({
   errors = {},
   disabled = false,
 }) {
+  const [removalErrors, setRemovalErrors] = useState({});
+  const [prescriptionEditor, setPrescriptionEditor] = useState(null);
+
+  useEffect(() => {
+    setPrescriptionEditor((current) => {
+      if (!current) return current;
+      const ownerExists = diagnoses.some((entry) => entry.id === current.ownerDiagnosisId);
+      const orderExists = current.mode !== "edit" || prescriptions.some((item) => item.id === current.draft?.id);
+      return ownerExists && orderExists ? current : null;
+    });
+  }, [diagnoses, prescriptions]);
+
+  useEffect(() => {
+    setRemovalErrors((current) => {
+      let changed = false;
+      const next = {};
+      for (const [id, message] of Object.entries(current)) {
+        const result = reconcilePrescriptionsForDiagnosisRemoval(prescriptions, id);
+        if (!result.blocked) {
+          changed = true;
+          continue;
+        }
+        next[id] = result.error;
+        if (result.error !== message) changed = true;
+      }
+      return changed ? next : current;
+    });
+  }, [prescriptions]);
+
+  function removeDiagnosis(id) {
+    const result = reconcilePrescriptionsForDiagnosisRemoval(prescriptions, id);
+    if (result.blocked) {
+      setRemovalErrors((current) => ({ ...current, [id]: result.error }));
+      return;
+    }
+    setRemovalErrors((current) => {
+      if (!current[id]) return current;
+      const next = { ...current };
+      delete next[id];
+      return next;
+    });
+    onPrescriptionsChange?.(result.prescriptions);
+    onRemoveDiagnosis?.(id);
+  }
+
   function addDiagnosis() {
     const name = String(diagnosisDraft || "").trim().slice(0, DIAGNOSIS_LIMITS.name);
     if (!name || diagnoses.length >= DIAGNOSIS_LIMITS.count) return;
@@ -566,9 +631,15 @@ export default function RhuDiagnosisCarePlanSection({
               visit={visit}
               visitWeightKg={visitWeightKg}
               prescriptionText={prescriptionText}
+              prescriptions={prescriptions}
+              diagnoses={diagnoses}
+              onPrescriptionsChange={onPrescriptionsChange}
+              prescriptionEditor={prescriptionEditor}
+              onPrescriptionEditorChange={setPrescriptionEditor}
+              removalError={removalErrors[entry.id] || ""}
               onChange={(next) => onChangeDiagnosis?.(next)}
               onFollowUpChange={onFollowUpChange}
-              onRemove={() => onRemoveDiagnosis?.(entry.id)}
+              onRemove={() => removeDiagnosis(entry.id)}
             />
           ))}
           <FollowUpConditionReferences references={conditionReferences} />
@@ -594,15 +665,6 @@ export default function RhuDiagnosisCarePlanSection({
               placeholder="What was done at this visit?"
               onChange={(event) => onTreatmentNotesChange?.(event.target.value)}
             />
-            <FieldTextarea
-              label="Prescription"
-              name="prescriptionText"
-              value={prescriptionText}
-              error={errors.prescriptionText}
-              rows={4}
-              placeholder="Medicine names, how to take them, and for how long"
-              onChange={(event) => onPrescriptionTextChange?.(event.target.value)}
-            />
           </>
         )}
       />
```

## FILE: frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.test.js
```
diff --git a/frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.test.js b/frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.test.js
index 0abba956..88f12773 100644
--- a/frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.test.js
+++ b/frontend/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.test.js
@@ -3,17 +3,27 @@ import { after, test } from "node:test";
 import { mkdtempSync, rmSync } from "node:fs";
 import { tmpdir } from "node:os";
 import { join, resolve, sep } from "node:path";
-import { createElement } from "react";
+import { createElement, act, useState } from "react";
 import { renderToStaticMarkup } from "react-dom/server";
+import { Window } from "happy-dom";
 import { createServer } from "vite";
 import react from "@vitejs/plugin-react";
 
+const dom = new Window({ url: "http://localhost/" });
+for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Event", "CustomEvent", "Node"]) {
+  Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? dom : dom[key] });
+}
+globalThis.IS_REACT_ACT_ENVIRONMENT = true;
+const { createRoot } = await import("react-dom/client");
+
 const cacheDir = mkdtempSync(join(tmpdir(), "akay-rhu-care-plan-"));
 const server = await createServer({ cacheDir, configFile: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] },
   server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
 const { default: CarePlan } = await server.ssrLoadModule("/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.jsx");
+const { commitPrescriptionDraft } = await server.ssrLoadModule("/src/components/features/health-records/wizard/RhuPrescriptionsSection.jsx");
 after(async () => {
   await server.close();
+  await dom.happyDOM.close();
   if (!resolve(cacheDir).startsWith(resolve(tmpdir()) + sep)) throw new Error("Unexpected test cache directory");
   rmSync(cacheDir, { recursive: true, force: true });
 });
@@ -32,7 +42,10 @@ test("TB assessment remains while Treatment Decision and its disposition fields
   assert.doesNotMatch(html, /treatmentDecision|Treatment Decision|Disposition reason|Form 4B is required/);
   assert.match(html, /Register Treatment · Form 4B/);
   assert.match(html, /Actions Taken \/ Treatment/);
-  assert.match(html, /Prescription/);
+  assert.match(html, /name="actionsTaken"/);
+  assert.match(html, /Add Prescription/);
+  assert.doesNotMatch(html, /name="prescriptionText"/);
+  assert.doesNotMatch(html, />Prescription </);
   assert.equal((html.match(/name="diagnoses.tb.nextAction"/g) || []).length, 4);
   for (const label of ["No Further Follow-up Scheduled", "Schedule RHU Follow-up", "Manage to BHC", "Refer to Higher-Level Facility"]) {
     assert.ok(html.includes(label), label);
@@ -95,3 +108,360 @@ test("higher-level plan shows inline errors and saved details only when selected
     assert.doesNotMatch(render({ ...entry, nextAction }), /name="diagnoses.tb.higherLevelReferralPlan/);
   }
 });
+
+test("referral visits hide empty Next Action but surface restored walk-in actions", () => {
+  const emptyReferral = render(
+    { id: "tb", name: "TB", nextAction: "", tbManagement: { diagnosisType: "tb_disease", drugResistance: "drug_susceptible" } },
+    { isReferralVisit: true },
+  );
+  assert.doesNotMatch(emptyReferral, /name="diagnoses.tb.nextAction"/);
+  assert.doesNotMatch(emptyReferral, /data-field="diagnoses.tb.nextAction"/);
+  const legacy = render(
+    {
+      id: "tb",
+      name: "TB",
+      nextAction: "rhu_follow_up",
+      tbManagement: { diagnosisType: "tb_disease", drugResistance: "drug_susceptible" },
+    },
+    {
+      isReferralVisit: true,
+      errors: { "diagnoses.tb.nextAction": "Referral visits keep follow-up and monitoring on the Return Slip." },
+    },
+  );
+  assert.match(legacy, /name="diagnoses.tb.nextAction"/);
+  assert.match(legacy, /Return Slip/);
+});
+
+const htn = { id: "htn", name: "Hypertension", nextAction: "none" };
+const dm = { id: "dm", name: "Diabetes", nextAction: "none" };
+const losartan = {
+  id: "rx-losartan",
+  diagnosisIds: ["htn", "dm"],
+  medicineName: "Losartan",
+  strength: "50 mg",
+  dose: "1 tablet",
+  route: "PO",
+  frequency: "Once daily",
+  duration: "30 days",
+  instructions: "",
+  authorizedQuantity: 30,
+  authorizedUnit: "tablet",
+  source: "itr",
+};
+const metformin = {
+  id: "rx-metformin",
+  diagnosisIds: ["dm"],
+  medicineName: "Metformin",
+  strength: "500 mg",
+  dose: "1 tablet",
+  route: "PO",
+  frequency: "BID",
+  duration: "30 days",
+  instructions: "",
+  authorizedQuantity: null,
+  authorizedUnit: "",
+  source: "itr",
+};
+
+function cardHtml(html, name) {
+  const start = html.indexOf(`>${name}<`);
+  assert.ok(start >= 0, name);
+  const next = html.indexOf('class="rhu-diagnosis-card"', start);
+  return html.slice(start, next === -1 ? undefined : next);
+}
+
+test("each diagnosis card lists its prescriptions after Supporting Laboratory Tests", () => {
+  const html = render(htn, {
+    diagnoses: [htn, dm],
+    prescriptions: [losartan, metformin],
+    errors: { "prescriptions.rx-metformin.medicineName": "Enter the medicine name." },
+  });
+  for (const name of ["Hypertension", "Diabetes"]) {
+    const card = cardHtml(html, name);
+    const lab = card.indexOf("Supporting Laboratory Tests");
+    const prescriptions = card.indexOf(">Prescriptions<");
+    assert.ok(lab >= 0 && prescriptions > lab, `${name} prescriptions follow supporting labs`);
+    assert.match(card, /Add Prescription/);
+  }
+  const hypertension = cardHtml(html, "Hypertension");
+  const diabetes = cardHtml(html, "Diabetes");
+  assert.match(hypertension, /Losartan 50 mg/);
+  assert.doesNotMatch(hypertension, /Metformin/);
+  assert.match(diabetes, /Losartan 50 mg/);
+  assert.match(diabetes, /Metformin/);
+  assert.match(diabetes, /Enter the medicine name/);
+  assert.match(html, /Actions Taken \/ Treatment/);
+  assert.match(html, /name="actionsTaken"/);
+  assert.doesNotMatch(html, /name="prescriptionText"/);
+  assert.doesNotMatch(html, />Prescription </);
+  assert.doesNotMatch(html, /role="dialog"|type="submit"/);
+});
+
+function diagnosisCard(container, name) {
+  const card = [...container.querySelectorAll(".rhu-diagnosis-card")].find((node) => node.querySelector("p")?.textContent === name);
+  assert.ok(card, name);
+  return card;
+}
+
+function buttonsNamed(root, text) {
+  return [...root.querySelectorAll("button")].filter((node) => node.textContent.trim() === text);
+}
+
+async function clickButton(root, text) {
+  const button = [...root.querySelectorAll("button")].find((node) => node.textContent.trim() === text);
+  assert.ok(button, text);
+  await act(async () => { button.click(); });
+  return button;
+}
+
+async function setField(field, value) {
+  await act(async () => {
+    const proto = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
+    Object.getOwnPropertyDescriptor(proto, "value").set.call(field, value);
+    field.dispatchEvent(new Event("input", { bubbles: true }));
+  });
+}
+
+async function mountCarePlan(props) {
+  const container = document.createElement("div");
+  document.body.appendChild(container);
+  const root = createRoot(container);
+  const calls = { removed: [], prescriptions: [] };
+  function Host() {
+    const [prescriptions, setPrescriptions] = useState(props.prescriptions || []);
+    const [diagnoses, setDiagnoses] = useState(props.diagnoses);
+    return createElement(CarePlan, {
+      canConfirmTb: true,
+      ...props,
+      diagnoses,
+      prescriptions,
+      onPrescriptionsChange: (next) => {
+        calls.prescriptions.push(next);
+        setPrescriptions(next);
+      },
+      onRemoveDiagnosis: (id) => {
+        calls.removed.push(id);
+        setDiagnoses((current) => current.filter((row) => row.id !== id));
+      },
+    });
+  }
+  await act(async () => { root.render(createElement(Host)); });
+  return {
+    container,
+    calls,
+    async close() {
+      await act(async () => root.unmount());
+      container.remove();
+    },
+  };
+}
+
+test("Add Prescription saves one visit-level order and keeps field errors beside the form", async () => {
+  const app = await mountCarePlan({ diagnoses: [htn, dm], prescriptions: [] });
+  try {
+    await clickButton(diagnosisCard(app.container, "Hypertension"), "Add Prescription");
+    const form = diagnosisCard(app.container, "Hypertension");
+    assert.match(form.textContent, /Linked Diagnosis/);
+    assert.match(form.textContent, /Medicine Name/);
+    assert.match(form.textContent, /Authorized Quantity/);
+    const linked = [...form.querySelectorAll('input[name$=".diagnosisIds"]')];
+    assert.equal(linked.find((input) => input.value === "htn")?.checked, true);
+    assert.equal(linked.find((input) => input.value === "dm")?.checked, false);
+    await clickButton(form, "Save Prescription");
+    assert.match(form.textContent, /Enter the medicine name/);
+    assert.equal(app.calls.prescriptions.length, 0);
+
+    await setField(form.querySelector('[name$=".medicineName"]'), "Amlodipine");
+    await setField(form.querySelector('[name$=".strength"]'), "5 mg");
+    await setField(form.querySelector('[name$=".dose"]'), "1 tablet");
+    await setField(form.querySelector('[name$=".route"]'), "PO");
+    await setField(form.querySelector('[name$=".frequency"]'), "Once daily");
+    await setField(form.querySelector('[name$=".duration"]'), "30 days");
+    await setField(form.querySelector('[name$=".instructions"]'), "With breakfast");
+    await setField(form.querySelector('[name$=".authorizedQuantity"]'), "14");
+    await setField(form.querySelector('[name$=".authorizedUnit"]'), "tablet");
+    const diabetes = linked.find((input) => input.value === "dm");
+    await act(async () => { diabetes.click(); });
+    await clickButton(form, "Save Prescription");
+
+    assert.equal(app.calls.prescriptions.length, 1);
+    const [saved] = app.calls.prescriptions[0];
+    assert.equal(saved.medicineName, "Amlodipine");
+    assert.deepEqual(saved.diagnosisIds, ["htn", "dm"]);
+    assert.equal(saved.authorizedQuantity, 14);
+    assert.equal(saved.authorizedUnit, "tablet");
+    assert.equal(saved.source, "itr");
+    assert.match(diagnosisCard(app.container, "Hypertension").textContent, /Amlodipine 5 mg/);
+    assert.match(diagnosisCard(app.container, "Diabetes").textContent, /Amlodipine 5 mg/);
+    assert.doesNotMatch(app.container.textContent, /Enter the medicine name/);
+  } finally {
+    await app.close();
+  }
+});
+
+test("editing and removing a prescription keeps its id until the order is removed", async () => {
+  const app = await mountCarePlan({
+    diagnoses: [htn],
+    prescriptions: [{ ...losartan, diagnosisIds: ["htn"] }],
+  });
+  try {
+    const card = diagnosisCard(app.container, "Hypertension");
+    await clickButton(card, "Edit Prescription");
+    await setField(card.querySelector('[name$=".strength"]'), "100 mg");
+    await clickButton(card, "Save Prescription");
+    assert.equal(app.calls.prescriptions.at(-1)[0].id, "rx-losartan");
+    assert.equal(app.calls.prescriptions.at(-1)[0].strength, "100 mg");
+    assert.match(card.textContent, /Losartan 100 mg/);
+
+    await clickButton(card, "Remove Prescription");
+    assert.equal(app.calls.prescriptions.at(-1).length, 0);
+    assert.doesNotMatch(card.textContent, /Losartan/);
+  } finally {
+    await app.close();
+  }
+});
+
+test("a diagnosis cannot be removed while it is the only link on a prescription", async () => {
+  const app = await mountCarePlan({
+    diagnoses: [htn],
+    prescriptions: [{ ...losartan, diagnosisIds: ["htn"] }],
+  });
+  try {
+    const card = diagnosisCard(app.container, "Hypertension");
+    await act(async () => { card.querySelector('[aria-label="Remove Hypertension"]').click(); });
+    assert.deepEqual(app.calls.removed, []);
+    assert.match(card.textContent, /Remove or relink Losartan before removing this diagnosis/);
+    assert.match(card.textContent, /Losartan/);
+
+    await clickButton(card, "Remove Prescription");
+    await act(async () => { card.querySelector('[aria-label="Remove Hypertension"]').click(); });
+    assert.deepEqual(app.calls.removed, ["htn"]);
+  } finally {
+    await app.close();
+  }
+});
+
+test("removing one linked diagnosis keeps the shared prescription on the other diagnosis", async () => {
+  const app = await mountCarePlan({
+    diagnoses: [htn, dm],
+    prescriptions: [losartan],
+  });
+  try {
+    const card = diagnosisCard(app.container, "Hypertension");
+    await act(async () => { card.querySelector('[aria-label="Remove Hypertension"]').click(); });
+    assert.deepEqual(app.calls.removed, ["htn"]);
+    assert.deepEqual(app.calls.prescriptions.at(-1)[0].diagnosisIds, ["dm"]);
+    assert.equal(app.calls.prescriptions.at(-1)[0].id, "rx-losartan");
+    assert.match(diagnosisCard(app.container, "Diabetes").textContent, /Losartan 50 mg/);
+    assert.equal(app.container.querySelector('[aria-label="Remove Hypertension"]'), null);
+  } finally {
+    await app.close();
+  }
+});
+
+test("only one prescription editor is open for the visit", async () => {
+  const app = await mountCarePlan({
+    diagnoses: [htn, dm],
+    prescriptions: [losartan],
+  });
+  try {
+    const hypertension = diagnosisCard(app.container, "Hypertension");
+    await clickButton(hypertension, "Edit Prescription");
+    await setField(hypertension.querySelector('[name$=".strength"]'), "100 mg");
+    assert.equal(buttonsNamed(app.container, "Save Prescription").length, 1);
+
+    const diabetes = diagnosisCard(app.container, "Diabetes");
+    await clickButton(diabetes, "Edit Prescription");
+    assert.equal(buttonsNamed(app.container, "Save Prescription").length, 1);
+    assert.equal(diagnosisCard(app.container, "Hypertension").querySelector('[name$=".strength"]'), null);
+    const strength = diagnosisCard(app.container, "Diabetes").querySelector('[name$=".strength"]');
+    assert.equal(strength?.value, "50 mg");
+
+    await setField(strength, "25 mg");
+    await clickButton(diagnosisCard(app.container, "Diabetes"), "Save Prescription");
+    const saved = app.calls.prescriptions.at(-1);
+    assert.equal(saved.length, 1);
+    assert.equal(saved[0].id, "rx-losartan");
+    assert.equal(saved[0].strength, "25 mg");
+    assert.equal(saved[0].medicineName, "Losartan");
+    assert.equal(app.calls.prescriptions.some((list) => list.some((rx) => rx.strength === "100 mg")), false);
+  } finally {
+    await app.close();
+  }
+});
+
+test("Add Prescription on another card closes the open editor", async () => {
+  const app = await mountCarePlan({
+    diagnoses: [htn, dm],
+    prescriptions: [losartan],
+  });
+  try {
+    await clickButton(diagnosisCard(app.container, "Hypertension"), "Edit Prescription");
+    await clickButton(diagnosisCard(app.container, "Diabetes"), "Add Prescription");
+    assert.equal(buttonsNamed(app.container, "Save Prescription").length, 1);
+    assert.equal(diagnosisCard(app.container, "Hypertension").querySelector('[name$=".medicineName"]'), null);
+    const medicine = diagnosisCard(app.container, "Diabetes").querySelector('[name$=".medicineName"]');
+    assert.equal(medicine?.value, "");
+    assert.match(diagnosisCard(app.container, "Hypertension").textContent, /Losartan 50 mg/);
+  } finally {
+    await app.close();
+  }
+});
+
+test("Save does not restore a prescription removed on another card", async () => {
+  const app = await mountCarePlan({
+    diagnoses: [htn, dm],
+    prescriptions: [losartan],
+  });
+  try {
+    const hypertension = diagnosisCard(app.container, "Hypertension");
+    await clickButton(hypertension, "Edit Prescription");
+    await setField(hypertension.querySelector('[name$=".strength"]'), "100 mg");
+    await clickButton(diagnosisCard(app.container, "Diabetes"), "Remove Prescription");
+
+    const save = buttonsNamed(app.container, "Save Prescription")[0];
+    if (save) await act(async () => { save.click(); });
+
+    assert.ok(
+      app.calls.prescriptions.every((list) => !list.some((rx) => rx.id === "rx-losartan")),
+      "removed order must not be saved back",
+    );
+    assert.equal(app.calls.prescriptions.at(-1).length, 0);
+    assert.doesNotMatch(app.container.textContent, /Losartan/);
+    assert.equal(buttonsNamed(app.container, "Save Prescription").length, 0);
+  } finally {
+    await app.close();
+  }
+});
+
+test("saving an edit merges the latest list and does not restore a removed order", () => {
+  const edited = { ...losartan, strength: "100 mg" };
+  const merged = commitPrescriptionDraft([losartan, metformin], edited, "edit");
+  assert.equal(merged.cancelled, false);
+  assert.equal(merged.prescriptions.length, 2);
+  assert.equal(merged.prescriptions[0].id, "rx-losartan");
+  assert.equal(merged.prescriptions[0].strength, "100 mg");
+  assert.equal(merged.prescriptions[1].id, "rx-metformin");
+
+  const removed = commitPrescriptionDraft([metformin], edited, "edit");
+  assert.equal(removed.cancelled, true);
+  assert.deepEqual(removed.prescriptions.map((item) => item.id), ["rx-metformin"]);
+});
+
+test("Add Prescription is disabled at 50 visit prescriptions", async () => {
+  const prescriptions = Array.from({ length: 50 }, (_, index) => ({
+    ...metformin,
+    id: `rx-${index}`,
+    medicineName: `Medicine ${index}`,
+  }));
+  const app = await mountCarePlan({ diagnoses: [htn, dm], prescriptions });
+  try {
+    const add = buttonsNamed(diagnosisCard(app.container, "Hypertension"), "Add Prescription")[0];
+    assert.equal(add.disabled, true);
+    await act(async () => { add.click(); });
+    assert.equal(buttonsNamed(app.container, "Save Prescription").length, 0);
+    assert.equal(app.calls.prescriptions.length, 0);
+  } finally {
+    await app.close();
+  }
+});
```
