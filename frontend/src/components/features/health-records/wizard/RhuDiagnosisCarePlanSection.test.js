import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const cacheDir = mkdtempSync(join(tmpdir(), "akay-rhu-care-plan-"));
const server = await createServer({ cacheDir, configFile: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
const { default: CarePlan } = await server.ssrLoadModule("/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.jsx");
after(async () => {
  await server.close();
  if (!resolve(cacheDir).startsWith(resolve(tmpdir()) + sep)) throw new Error("Unexpected test cache directory");
  rmSync(cacheDir, { recursive: true, force: true });
});

const tb = { id: "tb", name: "TB", nextAction: "none", tbManagement: { diagnosisType: "tb_disease", drugResistance: "drug_susceptible" } };
function render(entry = tb, extra = {}) {
  return renderToStaticMarkup(createElement(CarePlan, { diagnoses: [entry], canConfirmTb: true, ...extra }));
}

test("TB assessment remains while Treatment Decision and its disposition fields are removed", () => {
  const html = render();
  assert.match(html, /Physician TB Assessment/);
  assert.match(html, /TB Assessment/);
  assert.match(html, /name="diagnoses.tb.tbManagement.diagnosisType"/);
  assert.match(html, /name="diagnoses.tb.tbManagement.drugResistancePrimary"/);
  assert.doesNotMatch(html, /treatmentDecision|Treatment Decision|Disposition reason|Form 4B is required/);
  assert.match(html, /Actions Taken \/ Treatment/);
  assert.match(html, /Prescription/);
  assert.equal((html.match(/name="diagnoses.tb.nextAction"/g) || []).length, 4);
  for (const label of ["No Further Follow-up Scheduled", "Schedule RHU Follow-up", "Manage to BHC", "Refer to Higher-Level Facility"]) {
    assert.ok(html.includes(label), label);
  }
});

test("presumptive TB hides drug susceptibility and every diagnosis can link supporting labs", () => {
  const presumptive = {
    id: "tb",
    name: "TB",
    nextAction: "none",
    tbManagement: { diagnosisType: "presumptive_tb", drugResistance: "" },
    supportingLaboratoryTests: [{ reference: "record:9" }],
  };
  const html = render(presumptive, {
    laboratoryOptions: [{
      reference: "record:9",
      testName: "Xpert MTB/RIF",
      resultStatus: "Awaiting Result",
      collectionDate: "2026-11-10",
      version: 0,
    }],
  });
  assert.match(html, /Presumptive TB/);
  assert.match(html, /Supporting Laboratory Tests/);
  assert.match(html, /Xpert MTB\/RIF/);
  assert.doesNotMatch(html, /name="diagnoses.tb.tbManagement.drugResistancePrimary"/);
  assert.doesNotMatch(html, /I confirm sharing these/);
  const freeText = render(
    { id: "htn", name: "Hypertension", nextAction: "none", supportingLaboratoryTests: [] },
    { laboratoryOptions: [{ reference: "record:3", testName: "Serum Creatinine", resultStatus: "Requested", version: 0 }] },
  );
  assert.match(freeText, /Supporting Laboratory Tests/);
  assert.match(freeText, /Serum Creatinine/);
});

test("higher-level plan shows inline errors and saved details only when selected", () => {
  const entry = { ...tb, nextAction: "refer_higher_level", higherLevelReferralPlan: {
    reason: "Specialist assessment", intendedFacility: "Provincial hospital", clinicalPlan: "Review investigations",
  } };
  const html = render(entry, { errors: { "diagnoses.tb.higherLevelReferralPlan.reason": "Enter the referral reason." } });
  assert.match(html, /Higher-Level Referral Plan/);
  assert.match(html, /name="diagnoses.tb.higherLevelReferralPlan.reason"[^>]*aria-invalid="true"/);
  assert.match(html, /Enter the referral reason/);
  for (const value of ["Specialist assessment", "Provincial hospital", "Review investigations"]) assert.ok(html.includes(value));
  assert.doesNotMatch(html, /role="dialog"|type="submit"/);
  for (const nextAction of ["none", "rhu_follow_up", "manage_to_bhc"]) {
    assert.doesNotMatch(render({ ...entry, nextAction }), /name="diagnoses.tb.higherLevelReferralPlan/);
  }
});
