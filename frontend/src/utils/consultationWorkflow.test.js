import { test } from "node:test";
import assert from "node:assert/strict";

import { BHC_GENERAL_V2, isBhcGeneralV2, visitAssessmentDisplay } from "./consultationWorkflow.js";

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
