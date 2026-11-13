import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createElement, act, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const dom = new Window({ url: "http://localhost/" });
for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Event", "CustomEvent", "Node"]) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? dom : dom[key] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

const cacheDir = mkdtempSync(join(tmpdir(), "akay-rhu-care-plan-"));
const server = await createServer({ cacheDir, configFile: false, plugins: [react()], optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
const { default: CarePlan } = await server.ssrLoadModule("/src/components/features/health-records/wizard/RhuDiagnosisCarePlanSection.jsx");
const { commitPrescriptionDraft } = await server.ssrLoadModule("/src/components/features/health-records/wizard/RhuPrescriptionsSection.jsx");
after(async () => {
  await server.close();
  await dom.happyDOM.close();
  if (!resolve(cacheDir).startsWith(resolve(tmpdir()) + sep)) throw new Error("Unexpected test cache directory");
  rmSync(cacheDir, { recursive: true, force: true });
});

const tb = { id: "tb", name: "TB", nextAction: "none", tbManagement: { diagnosisType: "tb_disease", drugResistance: "drug_susceptible" } };
function render(entry = tb, extra = {}) {
  return renderToStaticMarkup(createElement(CarePlan, { diagnoses: [entry], canConfirmTb: true, ...extra }));
}

test("each diagnosis exposes independent morbidity notifiable and surveillance checkboxes", () => {
  const html = render({ id: "dx1", name: "Dengue", nextAction: "none", reportIn: ["morbidity", "notifiable"] });
  assert.match(html, /Reporting Classification/);
  assert.match(html, /name="diagnoses.dx1.reportIn"/);
  assert.match(html, />Morbidity</);
  assert.match(html, />Notifiable Diseases</);
  assert.match(html, />Community Surveillance</);
});

test("TB assessment remains while Treatment Decision and its disposition fields are removed", () => {
  const html = render();
  assert.match(html, /Physician TB Assessment/);
  assert.match(html, /TB Assessment/);
  assert.match(html, /name="diagnoses.tb.tbManagement.diagnosisType"/);
  assert.match(html, /name="diagnoses.tb.tbManagement.drugResistancePrimary"/);
  assert.doesNotMatch(html, /treatmentDecision|Treatment Decision|Disposition reason|Form 4B is required/);
  assert.doesNotMatch(html, /Register Treatment · Form 4B|Complete Form 4B on Review|Register DS-TB Treatment/);
  assert.match(html, /Existing registered TB treatment cases remain available on the health record when present/);
  assert.match(html, /Actions Taken \/ Treatment/);
  assert.match(html, /name="actionsTaken"/);
  assert.match(html, /Add Prescription/);
  assert.doesNotMatch(html, /name="prescriptionText"/);
  assert.doesNotMatch(html, />Prescription </);
  assert.equal((html.match(/name="diagnoses.tb.nextAction"/g) || []).length, 4);
  for (const label of ["No Further Follow-up Scheduled", "Schedule RHU Follow-up", "Manage to BHC", "Refer to Higher-Level Facility"]) {
    assert.ok(html.includes(label), label);
  }
});

test("DS-TB assessment does not arm consultation Form 4B registration controls", () => {
  const entry = {
    ...tb,
    tbManagement: { diagnosisType: "tb_disease", drugResistance: "drug_susceptible", openTreatmentCard: true },
  };
  const html = render(entry);
  assert.match(html, /Physician TB Assessment/);
  assert.match(html, /TB Case Number/);
  assert.match(html, /name="diagnoses.tb.tbManagement.tbCaseNumber"/);
  assert.doesNotMatch(html, /Register Treatment · Form 4B|Complete Form 4B on Review|Cancel registration|Register DS-TB Treatment|Authorize and register Form 4B/);
  assert.doesNotMatch(html, /data-field="tbCaseRegistration"|Treatment start date|Verified consultation summary|Linked Diagnosis/);
});

test("presumptive and infection assessments hide TB Case Number", () => {
  assert.doesNotMatch(
    render({ ...tb, tbManagement: { diagnosisType: "presumptive_tb" } }),
    /name="diagnoses.tb.tbManagement.tbCaseNumber"/,
  );
  assert.doesNotMatch(
    render({ ...tb, tbManagement: { diagnosisType: "tb_infection" } }),
    /name="diagnoses.tb.tbManagement.tbCaseNumber"/,
  );
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
  assert.match(html, /Record as Under Evaluation/);
  assert.match(html, /does not confirm Active TB Disease/);
  assert.match(html, /Supporting Laboratory Tests/);
  assert.match(html, /Xpert MTB\/RIF/);
  assert.match(html, /Manage to BHC is available only for Active or Controlled/);
  assert.doesNotMatch(html, /name="diagnoses.tb.tbManagement.drugResistancePrimary"/);
  assert.doesNotMatch(html, /I confirm sharing these/);
  const freeText = render(
    { id: "htn", name: "Hypertension", nextAction: "none", supportingLaboratoryTests: [] },
    { laboratoryOptions: [{ reference: "record:3", testName: "Serum Creatinine", resultStatus: "Requested", version: 0 }] },
  );
  assert.match(freeText, /Supporting Laboratory Tests/);
  assert.match(freeText, /Serum Creatinine/);
  assert.match(freeText, /Active Patient Condition/);
});

test("presumptive Manage to BHC draft conflict shows next-action error and keeps the choice", () => {
  const html = render(
    {
      id: "tb",
      name: "Tuberculosis",
      activate: true,
      nextAction: "manage_to_bhc",
      receivingBhcId: "9",
      monitoringRecommendation: "Weekly check",
      tbManagement: { diagnosisType: "presumptive_tb", drugResistance: "" },
    },
    {
      errors: {
        "diagnoses.tb.nextAction":
          "Presumptive TB is Under Evaluation. Manage to BHC is available only for Active or Controlled conditions.",
      },
    },
  );
  assert.match(html, /name="diagnoses.tb.nextAction"[^>]*checked=""[^>]*value="manage_to_bhc"/);
  assert.match(html, /Presumptive TB is Under Evaluation/);
  assert.doesNotMatch(html, /Receiving Barangay Health Center/);
});

test("confirmed TB Disease assessment is locked while susceptibility stays editable", () => {
  const html = render(tb, {
    establishedLock: {
      diagnosisType: "tb_disease",
      drugResistance: "drug_susceptible",
      tbCaseNumber: "TB-100",
    },
  });
  assert.match(html, /TB Disease was confirmed in a previous consultation/);
  assert.match(html, /name="diagnoses.tb.tbManagement.diagnosisType" disabled=""/);
  assert.match(html, /name="diagnoses.tb.tbManagement.drugResistancePrimary" aria-invalid/);
  assert.doesNotMatch(html, /name="diagnoses.tb.tbManagement.drugResistancePrimary" disabled/);
});

test("supporting labs show latest test first and result controls for eligible rows", () => {
  const html = render(tb, {
    canUpdateHistoricalLaboratory: true,
    laboratoryOptions: [
      {
        reference: "record:1",
        testName: "Older smear",
        examinationDate: "2026-09-01",
        resultStatus: "Result Available",
        recordId: 1,
        healthRecordId: 40,
        version: 0,
      },
      {
        reference: "current:abc",
        id: "abc",
        testName: "Newest GeneXpert",
        examinationDate: "2026-11-10",
        resultStatus: "Awaiting Result",
        version: 0,
      },
    ],
    onUpdateCurrentLaboratoryTest() {},
  });
  const newest = html.indexOf("Newest GeneXpert");
  const older = html.indexOf("Older smear");
  assert.ok(newest > -1 && older > -1 && newest < older);
  assert.match(html, /Update Result|View \/ Update Result/);
  assert.match(html, /Linking does not mark a result available/);
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

test("referral visits hide empty Next Action but surface restored walk-in actions", () => {
  const emptyReferral = render(
    { id: "tb", name: "TB", nextAction: "", tbManagement: { diagnosisType: "tb_disease", drugResistance: "drug_susceptible" } },
    { isReferralVisit: true },
  );
  assert.doesNotMatch(emptyReferral, /name="diagnoses.tb.nextAction"/);
  assert.doesNotMatch(emptyReferral, /data-field="diagnoses.tb.nextAction"/);
  const legacy = render(
    {
      id: "tb",
      name: "TB",
      nextAction: "rhu_follow_up",
      tbManagement: { diagnosisType: "tb_disease", drugResistance: "drug_susceptible" },
    },
    {
      isReferralVisit: true,
      errors: { "diagnoses.tb.nextAction": "Referral visits keep follow-up and monitoring on the Return Slip." },
    },
  );
  assert.match(legacy, /name="diagnoses.tb.nextAction"/);
  assert.match(legacy, /Return Slip/);
});

const htn = { id: "htn", name: "Hypertension", nextAction: "none" };
const dm = { id: "dm", name: "Diabetes", nextAction: "none" };
const losartan = {
  id: "rx-losartan",
  diagnosisIds: ["htn", "dm"],
  medicineName: "Losartan",
  strength: "50 mg",
  dose: "1 tablet",
  route: "PO",
  frequency: "Once daily",
  duration: "30 days",
  instructions: "",
  authorizedQuantity: 30,
  authorizedUnit: "tablet",
  source: "itr",
};
const metformin = {
  id: "rx-metformin",
  diagnosisIds: ["dm"],
  medicineName: "Metformin",
  strength: "500 mg",
  dose: "1 tablet",
  route: "PO",
  frequency: "BID",
  duration: "30 days",
  instructions: "",
  authorizedQuantity: null,
  authorizedUnit: "",
  source: "itr",
};

function cardHtml(html, name) {
  const start = html.indexOf(`>${name}<`);
  assert.ok(start >= 0, name);
  const next = html.indexOf('class="rhu-diagnosis-card"', start);
  return html.slice(start, next === -1 ? undefined : next);
}

test("each diagnosis card lists its prescriptions after Supporting Laboratory Tests", () => {
  const html = render(htn, {
    diagnoses: [htn, dm],
    prescriptions: [losartan, metformin],
    errors: { "prescriptions.rx-metformin.medicineName": "Enter the medicine name." },
  });
  for (const name of ["Hypertension", "Diabetes"]) {
    const card = cardHtml(html, name);
    const lab = card.indexOf("Supporting Laboratory Tests");
    const prescriptions = card.indexOf(">Prescriptions<");
    assert.ok(lab >= 0 && prescriptions > lab, `${name} prescriptions follow supporting labs`);
    assert.match(card, /Add Prescription/);
  }
  const hypertension = cardHtml(html, "Hypertension");
  const diabetes = cardHtml(html, "Diabetes");
  assert.match(hypertension, /Losartan 50 mg/);
  assert.doesNotMatch(hypertension, /Metformin/);
  assert.match(diabetes, /Losartan 50 mg/);
  assert.match(diabetes, /Metformin/);
  assert.match(diabetes, /Enter the medicine name/);
  assert.match(html, /Actions Taken \/ Treatment/);
  assert.match(html, /name="actionsTaken"/);
  assert.doesNotMatch(html, /name="prescriptionText"/);
  assert.doesNotMatch(html, />Prescription </);
  assert.doesNotMatch(html, /role="dialog"|type="submit"/);
});

function diagnosisCard(container, name) {
  const card = [...container.querySelectorAll(".rhu-diagnosis-card")].find((node) => node.querySelector("p")?.textContent === name);
  assert.ok(card, name);
  return card;
}

function buttonsNamed(root, text) {
  return [...root.querySelectorAll("button")].filter((node) => node.textContent.trim() === text);
}

async function clickButton(root, text) {
  const button = [...root.querySelectorAll("button")].find((node) => node.textContent.trim() === text);
  assert.ok(button, text);
  await act(async () => { button.click(); });
  return button;
}

async function setField(field, value) {
  await act(async () => {
    const proto = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function mountCarePlan(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const calls = { removed: [], prescriptions: [] };
  function Host() {
    const [prescriptions, setPrescriptions] = useState(props.prescriptions || []);
    const [diagnoses, setDiagnoses] = useState(props.diagnoses);
    return createElement(CarePlan, {
      canConfirmTb: true,
      ...props,
      diagnoses,
      prescriptions,
      onPrescriptionsChange: (next) => {
        calls.prescriptions.push(next);
        setPrescriptions(next);
      },
      onRemoveDiagnosis: (id) => {
        calls.removed.push(id);
        setDiagnoses((current) => current.filter((row) => row.id !== id));
      },
    });
  }
  await act(async () => { root.render(createElement(Host)); });
  return {
    container,
    calls,
    async close() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("Add Prescription saves one visit-level order and keeps field errors beside the form", async () => {
  const app = await mountCarePlan({ diagnoses: [htn, dm], prescriptions: [] });
  try {
    await clickButton(diagnosisCard(app.container, "Hypertension"), "Add Prescription");
    const form = diagnosisCard(app.container, "Hypertension");
    assert.doesNotMatch(form.textContent, /Linked Diagnosis/);
    assert.equal(form.querySelectorAll('input[name$=".diagnosisIds"]').length, 0);
    assert.match(form.textContent, /Medicine Name/);
    assert.match(form.textContent, /Authorized Quantity/);
    await clickButton(form, "Save Prescription");
    assert.match(form.textContent, /Enter the medicine name/);
    assert.equal(app.calls.prescriptions.length, 0);

    await setField(form.querySelector('[name$=".medicineName"]'), "Amlodipine");
    await setField(form.querySelector('[name$=".strength"]'), "5 mg");
    await setField(form.querySelector('[name$=".dose"]'), "1 tablet");
    await setField(form.querySelector('[name$=".route"]'), "PO");
    await setField(form.querySelector('[name$=".frequency"]'), "Once daily");
    await setField(form.querySelector('[name$=".duration"]'), "30 days");
    await setField(form.querySelector('[name$=".instructions"]'), "With breakfast");
    await setField(form.querySelector('[name$=".authorizedQuantity"]'), "14");
    await setField(form.querySelector('[name$=".authorizedUnit"]'), "tablet");
    await clickButton(form, "Save Prescription");

    assert.equal(app.calls.prescriptions.length, 1);
    const [saved] = app.calls.prescriptions[0];
    assert.equal(saved.medicineName, "Amlodipine");
    assert.deepEqual(saved.diagnosisIds, ["htn"]);
    assert.equal(saved.authorizedQuantity, 14);
    assert.equal(saved.authorizedUnit, "tablet");
    assert.equal(saved.source, "itr");
    assert.match(diagnosisCard(app.container, "Hypertension").textContent, /Amlodipine 5 mg/);
    assert.doesNotMatch(diagnosisCard(app.container, "Diabetes").textContent, /Amlodipine 5 mg/);
    assert.doesNotMatch(app.container.textContent, /Enter the medicine name|Linked Diagnosis/);
  } finally {
    await app.close();
  }
});

test("editing and removing a prescription keeps its id until the order is removed", async () => {
  const app = await mountCarePlan({
    diagnoses: [htn],
    prescriptions: [{ ...losartan, diagnosisIds: ["htn"] }],
  });
  try {
    const card = diagnosisCard(app.container, "Hypertension");
    await clickButton(card, "Edit Prescription");
    await setField(card.querySelector('[name$=".strength"]'), "100 mg");
    await clickButton(card, "Save Prescription");
    assert.equal(app.calls.prescriptions.at(-1)[0].id, "rx-losartan");
    assert.equal(app.calls.prescriptions.at(-1)[0].strength, "100 mg");
    assert.match(card.textContent, /Losartan 100 mg/);

    await clickButton(card, "Remove Prescription");
    assert.equal(app.calls.prescriptions.at(-1).length, 0);
    assert.doesNotMatch(card.textContent, /Losartan/);
  } finally {
    await app.close();
  }
});

test("a diagnosis cannot be removed while it is the only link on a prescription", async () => {
  const app = await mountCarePlan({
    diagnoses: [htn],
    prescriptions: [{ ...losartan, diagnosisIds: ["htn"] }],
  });
  try {
    const card = diagnosisCard(app.container, "Hypertension");
    await act(async () => { card.querySelector('[aria-label="Remove Hypertension"]').click(); });
    assert.deepEqual(app.calls.removed, []);
    assert.match(card.textContent, /Remove or relink Losartan before removing this diagnosis/);
    assert.match(card.textContent, /Losartan/);

    await clickButton(card, "Remove Prescription");
    await act(async () => { card.querySelector('[aria-label="Remove Hypertension"]').click(); });
    assert.deepEqual(app.calls.removed, ["htn"]);
  } finally {
    await app.close();
  }
});

test("removing one linked diagnosis keeps the shared prescription on the other diagnosis", async () => {
  const app = await mountCarePlan({
    diagnoses: [htn, dm],
    prescriptions: [losartan],
  });
  try {
    const card = diagnosisCard(app.container, "Hypertension");
    await act(async () => { card.querySelector('[aria-label="Remove Hypertension"]').click(); });
    assert.deepEqual(app.calls.removed, ["htn"]);
    assert.deepEqual(app.calls.prescriptions.at(-1)[0].diagnosisIds, ["dm"]);
    assert.equal(app.calls.prescriptions.at(-1)[0].id, "rx-losartan");
    assert.match(diagnosisCard(app.container, "Diabetes").textContent, /Losartan 50 mg/);
    assert.equal(app.container.querySelector('[aria-label="Remove Hypertension"]'), null);
  } finally {
    await app.close();
  }
});

test("only one prescription editor is open for the visit", async () => {
  const app = await mountCarePlan({
    diagnoses: [htn, dm],
    prescriptions: [losartan],
  });
  try {
    const hypertension = diagnosisCard(app.container, "Hypertension");
    await clickButton(hypertension, "Edit Prescription");
    await setField(hypertension.querySelector('[name$=".strength"]'), "100 mg");
    assert.equal(buttonsNamed(app.container, "Save Prescription").length, 1);

    const diabetes = diagnosisCard(app.container, "Diabetes");
    await clickButton(diabetes, "Edit Prescription");
    assert.equal(buttonsNamed(app.container, "Save Prescription").length, 1);
    assert.equal(diagnosisCard(app.container, "Hypertension").querySelector('[name$=".strength"]'), null);
    const strength = diagnosisCard(app.container, "Diabetes").querySelector('[name$=".strength"]');
    assert.equal(strength?.value, "50 mg");

    await setField(strength, "25 mg");
    await clickButton(diagnosisCard(app.container, "Diabetes"), "Save Prescription");
    const saved = app.calls.prescriptions.at(-1);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].id, "rx-losartan");
    assert.equal(saved[0].strength, "25 mg");
    assert.equal(saved[0].medicineName, "Losartan");
    assert.equal(app.calls.prescriptions.some((list) => list.some((rx) => rx.strength === "100 mg")), false);
  } finally {
    await app.close();
  }
});

test("Add Prescription on another card closes the open editor", async () => {
  const app = await mountCarePlan({
    diagnoses: [htn, dm],
    prescriptions: [losartan],
  });
  try {
    await clickButton(diagnosisCard(app.container, "Hypertension"), "Edit Prescription");
    await clickButton(diagnosisCard(app.container, "Diabetes"), "Add Prescription");
    assert.equal(buttonsNamed(app.container, "Save Prescription").length, 1);
    assert.equal(diagnosisCard(app.container, "Hypertension").querySelector('[name$=".medicineName"]'), null);
    const medicine = diagnosisCard(app.container, "Diabetes").querySelector('[name$=".medicineName"]');
    assert.equal(medicine?.value, "");
    assert.match(diagnosisCard(app.container, "Hypertension").textContent, /Losartan 50 mg/);
  } finally {
    await app.close();
  }
});

test("Save does not restore a prescription removed on another card", async () => {
  const app = await mountCarePlan({
    diagnoses: [htn, dm],
    prescriptions: [losartan],
  });
  try {
    const hypertension = diagnosisCard(app.container, "Hypertension");
    await clickButton(hypertension, "Edit Prescription");
    await setField(hypertension.querySelector('[name$=".strength"]'), "100 mg");
    await clickButton(diagnosisCard(app.container, "Diabetes"), "Remove Prescription");

    const save = buttonsNamed(app.container, "Save Prescription")[0];
    if (save) await act(async () => { save.click(); });

    assert.ok(
      app.calls.prescriptions.every((list) => !list.some((rx) => rx.id === "rx-losartan")),
      "removed order must not be saved back",
    );
    assert.equal(app.calls.prescriptions.at(-1).length, 0);
    assert.doesNotMatch(app.container.textContent, /Losartan/);
    assert.equal(buttonsNamed(app.container, "Save Prescription").length, 0);
  } finally {
    await app.close();
  }
});

test("saving an edit merges the latest list and does not restore a removed order", () => {
  const edited = { ...losartan, strength: "100 mg" };
  const merged = commitPrescriptionDraft([losartan, metformin], edited, "edit");
  assert.equal(merged.cancelled, false);
  assert.equal(merged.prescriptions.length, 2);
  assert.equal(merged.prescriptions[0].id, "rx-losartan");
  assert.equal(merged.prescriptions[0].strength, "100 mg");
  assert.equal(merged.prescriptions[1].id, "rx-metformin");

  const removed = commitPrescriptionDraft([metformin], edited, "edit");
  assert.equal(removed.cancelled, true);
  assert.deepEqual(removed.prescriptions.map((item) => item.id), ["rx-metformin"]);
});

test("Add Prescription is disabled at 50 visit prescriptions", async () => {
  const prescriptions = Array.from({ length: 50 }, (_, index) => ({
    ...metformin,
    id: `rx-${index}`,
    medicineName: `Medicine ${index}`,
  }));
  const app = await mountCarePlan({ diagnoses: [htn, dm], prescriptions });
  try {
    const add = buttonsNamed(diagnosisCard(app.container, "Hypertension"), "Add Prescription")[0];
    assert.equal(add.disabled, true);
    await act(async () => { add.click(); });
    assert.equal(buttonsNamed(app.container, "Save Prescription").length, 0);
    assert.equal(app.calls.prescriptions.length, 0);
  } finally {
    await app.close();
  }
});
