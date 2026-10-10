import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BHC_GENERAL_V2,
  continuedDraftNotes,
  earlierDraftContinuedNotes,
  earlierDraftNotes,
  isBhcGeneralV2,
  showsDiagnosisRow,
  visitAssessmentDisplay,
} from "./consultationWorkflow.js";
import { convertLegacyDraft } from "./draftConversion.js";

test("BHC_GENERAL_V2 marker", () => {
  assert.equal(BHC_GENERAL_V2, "bhc_general_v2");
});

test("isBhcGeneralV2 reads monitoring_data or monitoringData", () => {
  assert.equal(isBhcGeneralV2({ monitoring_data: { consultationWorkflow: "bhc_general_v2" } }), true);
  assert.equal(isBhcGeneralV2({ monitoringData: { consultationWorkflow: "bhc_general_v2" } }), true);
  assert.equal(isBhcGeneralV2({ monitoring_data: {} }), false);
  assert.equal(isBhcGeneralV2({}), false);
  assert.equal(isBhcGeneralV2(null), false);
});

test("visitAssessmentDisplay: a v2 record with no diagnosis shows the Chief Complaint", () => {
  const record = { diagnosis: "", chief_complaint: "Cough", monitoring_data: { consultationWorkflow: "bhc_general_v2" } };
  assert.deepEqual(visitAssessmentDisplay(record), { label: "Chief Complaint", value: "Cough" });
  assert.deepEqual(
    visitAssessmentDisplay({ chiefComplaint: "Fever", monitoringData: { consultationWorkflow: "bhc_general_v2" } }),
    { label: "Chief Complaint", value: "Fever" },
  );
});

test("visitAssessmentDisplay: a legacy record with no diagnosis shows nothing", () => {
  assert.equal(visitAssessmentDisplay({ diagnosis: "", chief_complaint: "Cough" }), null);
  assert.equal(visitAssessmentDisplay({ diagnosis: "  ", chief_complaint: "Cough", monitoring_data: {} }), null);
});

test("visitAssessmentDisplay: a stored diagnosis is never replaced", () => {
  assert.deepEqual(visitAssessmentDisplay({ diagnosis: "Asthma", chief_complaint: "Cough" }), {
    label: "Diagnosis",
    value: "Asthma",
  });
  assert.deepEqual(
    visitAssessmentDisplay({
      diagnosis: " Asthma ",
      chief_complaint: "Cough",
      monitoring_data: { consultationWorkflow: "bhc_general_v2" },
    }),
    { label: "Diagnosis", value: "Asthma" },
  );
});

test("visitAssessmentDisplay: a v2 record with neither returns null", () => {
  assert.equal(visitAssessmentDisplay({ monitoring_data: { consultationWorkflow: "bhc_general_v2" } }), null);
  assert.equal(visitAssessmentDisplay(undefined), null);
});

test("isBhcGeneralV2: an empty monitoring_data does not hide the marker in monitoringData", () => {
  assert.equal(
    isBhcGeneralV2({ monitoring_data: {}, monitoringData: { consultationWorkflow: "bhc_general_v2" } }),
    true,
  );
});

test("visitAssessmentDisplay: a blank chief_complaint does not hide a filled chiefComplaint", () => {
  assert.deepEqual(
    visitAssessmentDisplay({
      diagnosis: "",
      chief_complaint: "",
      chiefComplaint: "Headache",
      monitoring_data: { consultationWorkflow: "bhc_general_v2" },
    }),
    { label: "Chief Complaint", value: "Headache" },
  );
});

test("visitAssessmentDisplay: an RHU diagnosis on a v2 record is shown as stored under Diagnosis", () => {
  assert.deepEqual(
    visitAssessmentDisplay({
      diagnosis: "Acute bronchitis",
      chief_complaint: "Cough",
      monitoring_data: { consultationWorkflow: "bhc_general_v2" },
    }),
    { label: "Diagnosis", value: "Acute bronchitis" },
  );
});

test("showsDiagnosisRow: hidden only for a v2 record with no stored diagnosis", () => {
  const v2 = { monitoring_data: { consultationWorkflow: "bhc_general_v2" } };
  assert.equal(showsDiagnosisRow({ ...v2, diagnosis: "" }), false);
  assert.equal(showsDiagnosisRow({ ...v2, diagnosis: null }), false);
  assert.equal(showsDiagnosisRow({ ...v2, diagnosis: "Asthma" }), true);
  assert.equal(showsDiagnosisRow(v2, "From initial diagnosis"), true);
  assert.equal(showsDiagnosisRow({ diagnosis: "" }), true);
  assert.equal(showsDiagnosisRow({}), true);
});

test("earlierDraftNotes: a v2 record returns its trimmed assessment notes, either spelling", () => {
  const marker = { monitoring_data: { consultationWorkflow: "bhc_general_v2" } };
  assert.equal(earlierDraftNotes({ ...marker, assessment_notes: "  Asthma\nNotes  " }), "Asthma\nNotes");
  assert.equal(earlierDraftNotes({ ...marker, assessment_notes: "", assessmentNotes: "From camel" }), "From camel");
});

test("earlierDraftNotes: blank or missing notes on a v2 record give an empty string", () => {
  const marker = { monitoring_data: { consultationWorkflow: "bhc_general_v2" } };
  assert.equal(earlierDraftNotes({ ...marker, assessment_notes: "   " }), "");
  assert.equal(earlierDraftNotes({ ...marker, assessment_notes: null }), "");
  assert.equal(earlierDraftNotes(marker), "");
  assert.equal(earlierDraftNotes(null), "");
});

test("earlierDraftNotes: a legacy record always gives an empty string", () => {
  assert.equal(earlierDraftNotes({ assessment_notes: "Legacy notes" }), "");
  assert.equal(earlierDraftNotes({ assessmentNotes: "Legacy notes", monitoring_data: {} }), "");
});

test("continuedDraftNotes: only notes that start with the Earlier draft label", () => {
  assert.equal(continuedDraftNotes("  Earlier draft — continued: rest  "), "Earlier draft — continued: rest");
  assert.equal(continuedDraftNotes("Earlier draft — Additional clinical notes: fever"), "Earlier draft — Additional clinical notes: fever");
  assert.equal(continuedDraftNotes("BP stable"), "");
  assert.equal(continuedDraftNotes(""), "");
  assert.equal(continuedDraftNotes(null), "");
});

test("earlierDraftContinuedNotes: a v2 record shows monitoring notes a converted draft kept, either spelling", () => {
  const notes = "Earlier draft — Additional clinical notes: Mother says fever at night";
  const v2 = { consultationWorkflow: "bhc_general_v2" };
  assert.equal(earlierDraftContinuedNotes({ monitoring_data: { ...v2, monitoringNotes: notes } }), notes);
  assert.equal(earlierDraftContinuedNotes({ monitoringData: { ...v2 }, monitoringNotes: notes }), notes);
  assert.equal(earlierDraftContinuedNotes({ monitoring_data: { ...v2 }, monitoring_notes: `  ${notes}  ` }), notes);
  // Notes the worker typed for a monitored condition are not earlier draft text.
  assert.equal(earlierDraftContinuedNotes({ monitoring_data: { ...v2, monitoringNotes: "BP stable" } }), "");
  assert.equal(earlierDraftContinuedNotes({ monitoring_data: { ...v2 } }), "");
});

test("earlierDraftContinuedNotes: a legacy record always gives an empty string", () => {
  const notes = "Earlier draft — continued: rest";
  assert.equal(earlierDraftContinuedNotes({ monitoring_data: { monitoringNotes: notes } }), "");
  assert.equal(earlierDraftContinuedNotes({ monitoringNotes: notes }), "");
  assert.equal(earlierDraftContinuedNotes(null), "");
});

test("earlierDraftContinuedNotes: a long converted draft reads back whole across both fields", () => {
  const converted = convertLegacyDraft({
    diagnoses: [],
    assessmentNotes: "a".repeat(4000),
    monitoringNotes: "m".repeat(3000),
  });
  const record = {
    assessment_notes: converted.assessmentNotes,
    monitoring_data: { consultationWorkflow: "bhc_general_v2", monitoringNotes: converted.monitoringNotes },
  };
  assert.equal(earlierDraftNotes(record), "a".repeat(4000));
  assert.equal(earlierDraftContinuedNotes(record), `Earlier draft — Additional clinical notes: ${"m".repeat(3000)}`);
});
