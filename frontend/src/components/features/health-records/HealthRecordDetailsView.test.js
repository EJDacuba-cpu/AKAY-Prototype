import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const cacheDir = join(tmpdir(), `akay-vite-ssr-record-details-${process.pid}`);
const server = await createServer({
  configFile: false,
  cacheDir,
  plugins: [react()],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(async () => {
  await server.close();
  rmSync(cacheDir, { recursive: true, force: true });
});

const { default: RecordTabs } = await server.ssrLoadModule(
  "/src/components/common/tabs/RecordTabs.jsx",
);
const { FollowUpEpisodeContent } = await server.ssrLoadModule(
  "/src/components/features/health-records/FollowUpEpisodePanel.jsx",
);
const { default: HealthRecordClinicalDetails } = await server.ssrLoadModule(
  "/src/components/features/health-records/HealthRecordClinicalDetails.jsx",
);
const { default: BhcHealthRecordWorkspace } = await server.ssrLoadModule(
  "/src/components/features/health-records/BhcHealthRecordWorkspace.jsx",
);
const {
  default: BhcHealthRecordPrintDocument,
  BHC_HEALTH_RECORD_PRINT_PAGE_STYLES,
} = await server.ssrLoadModule(
  "/src/components/features/health-records/BhcHealthRecordPrintDocument.jsx",
);

const sampleTabs = [
  { id: "clinical", label: "Clinical Details", content: createElement("p", null, "Vital signs 120/80") },
  { id: "treatment", label: "Treatment & Supplies", content: createElement("p", null, "Paracetamol 500mg") },
  { id: "followUp", label: "Follow-ups for This Record", content: createElement("p", null, "Return on Friday") },
];

const episode = {
  originalRecord: { id: 10, visitType: "initial_consultation", diagnosis: "Cough" },
  records: [
    { id: 10, visitType: "initial_consultation", dateRecorded: "2026-10-01", diagnosis: "Cough" },
    { id: 11, visitType: "follow_up_visit", dateRecorded: "2026-10-08", diagnosis: "Improving" },
  ],
  tasks: [
    {
      id: 44,
      healthRecordId: 10,
      dueDate: "2026-10-15",
      dueTime: "09:00",
      state: "pending",
    },
  ],
};

const wrap = (node) => renderToStaticMarkup(createElement(MemoryRouter, null, node));

test("stacked record tabs show every clinical section and hide the tablist", () => {
  const tabbed = wrap(createElement(RecordTabs, { tabs: sampleTabs, defaultTabId: "clinical" }));
  const stacked = wrap(
    createElement(RecordTabs, { tabs: sampleTabs, defaultTabId: "clinical", stacked: true }),
  );

  assert.match(tabbed, /role="tablist"/);
  assert.doesNotMatch(stacked, /role="tablist"/);
  assert.match(stacked, /Clinical Details/);
  assert.match(stacked, /Treatment &amp; Supplies/);
  assert.match(stacked, /Follow-ups for This Record/);
  assert.match(stacked, /Vital signs 120\/80/);
  assert.match(stacked, /Paracetamol 500mg/);
  assert.match(stacked, /Return on Friday/);
});

test("read-only follow-up history keeps visit facts and drops action links", () => {
  const html = wrap(
    createElement(FollowUpEpisodeContent, {
      episode,
      currentRecord: { id: 10 },
      sourceRecordId: 10,
      hideActions: true,
    }),
  );

  assert.match(html, /Visit chain/);
  assert.match(html, /Record #10/);
  assert.match(html, /Record #11/);
  assert.match(html, /Follow-up schedules/);
  assert.match(html, /Next Follow-up Visit/);
  assert.doesNotMatch(html, /View record/);
  assert.doesNotMatch(html, /View Details/);
  assert.doesNotMatch(html, /Record Visit/);
  assert.doesNotMatch(html, /Related consultation records/);
});

test("BHC clinical details stay continuous and keep referral facts without action links", () => {
  const html = wrap(
    createElement(HealthRecordClinicalDetails, {
      record: {
        id: 77,
        patientClassification: "General Consultation",
        chiefComplaint: "Fever for two days",
        history_of_present_illness: "Onset after rainfall",
        physicalExam: "Warm to touch",
        diagnosis: "Acute febrile illness",
        initialActionsTaken: "Gave paracetamol",
        followUpReason: "Recheck temperature",
        needsReferral: true,
        dispensedMedicines: [
          {
            id: 1,
            medicineName: "Paracetamol",
            quantity: 10,
            unit: "tablet",
            remarks: "Every 6 hours",
          },
        ],
      },
      linkedReferral: {
        status: "Pending",
        urgencyLevel: "Routine",
        receivingFacility: "Rural Health Unit Bulakan",
        reasonForReferral: "Needs physician review",
        trackingId: "TRK-77",
      },
    }),
  );

  assert.doesNotMatch(html, /role="tablist"/);
  assert.match(html, /Clinical Details/);
  assert.match(html, /Treatment &amp; Supplies/);
  assert.match(html, /Follow-ups for This Record/);
  assert.match(html, /Referral/);
  assert.match(html, /Fever for two days/);
  assert.match(html, /Paracetamol/);
  assert.match(html, /Needs physician review/);
  assert.match(html, /Rural Health Unit Bulakan/);
  assert.doesNotMatch(html, /View Referral Details/);
  assert.doesNotMatch(html, /Create Referral/);
  assert.doesNotMatch(html, /View Referral/);
});

test("BHC ledger workspace uses section cards, keeps values, and always shows follow-up and referral", () => {
  const html = wrap(
    createElement(BhcHealthRecordWorkspace, {
      record: {
        id: 77,
        patientClassification: "General Consultation",
        chiefComplaint: "Fever for two days",
        history_of_present_illness: "Onset after rainfall",
        physicalExam: "Warm to touch",
        diagnosis: "Acute febrile illness",
        initialActionsTaken: "Gave paracetamol",
        followUpReason: "Recheck temperature",
        needsReferral: true,
        systolicBp: 110,
        diastolicBp: 70,
        temperature: "37.2",
        dispensedMedicines: [
          {
            id: 1,
            medicineName: "Paracetamol",
            quantity: 10,
            unit: "tablet",
            remarks: "Every 6 hours",
          },
        ],
        followUpEpisode: episode,
      },
      linkedReferral: {
        status: "Pending",
        urgencyLevel: "Routine",
        receivingFacility: "Rural Health Unit Bulakan",
        reasonForReferral: "Needs physician review",
        trackingId: "TRK-77",
      },
      title: "General Consultation Record",
      recordId: "77",
      patientName: "Ana Cruz",
      serviceType: "General Consultation",
      displayDate: "October 8, 2026",
      displayTime: "9:00 AM",
      practitioner: "Midwife Santos",
      nextActionLabel: "Referral",
      hasLinkedReferral: true,
      referralStatus: "Pending",
      onBack() {},
      onPrint() {},
    }),
  );

  assert.doesNotMatch(html, /role="tablist"/);
  assert.match(html, /Vital signs/);
  assert.match(html, /Clinical assessment/);
  assert.match(html, /Treatment/);
  assert.match(html, /Dispensed medicines/);
  assert.match(html, /Follow-up &amp; referral information/);
  assert.match(html, /Fever for two days/);
  assert.match(html, /Gave paracetamol/);
  assert.match(html, /Paracetamol/);
  assert.match(html, /Needs physician review/);
  assert.match(html, /Rural Health Unit Bulakan/);
  assert.match(html, /Ana Cruz/);
  assert.match(html, />Back</);
  assert.match(html, />Print</);
  assert.doesNotMatch(html, /View Referral Details/);
  assert.doesNotMatch(html, /Create Referral/);
  assert.doesNotMatch(html, /View record/);
});

const printRecord = {
  id: 77,
  patientClassification: "General Consultation",
  chiefComplaint: "Fever for two days",
  history_of_present_illness: "Onset after rainfall",
  physicalExam: "Warm to touch",
  diagnosis: "Acute febrile illness",
  initialActionsTaken: "Gave paracetamol",
  followUpReason: "Recheck temperature",
  needsReferral: true,
  systolicBp: 110,
  diastolicBp: 70,
  temperature: "37.2",
  dispensedMedicines: [
    {
      id: 1,
      medicineName: "Paracetamol",
      quantity: 10,
      unit: "tablet",
      remarks: "Every 6 hours",
    },
  ],
  followUpEpisode: episode,
};

const printReferral = {
  status: "Pending",
  urgencyLevel: "Routine",
  receivingFacility: "Rural Health Unit Bulakan",
  reasonForReferral: "Needs physician review",
  trackingId: "TRK-77",
};

test("BHC print document uses A4 ledger layout and the same saved record values", () => {
  const html = wrap(
    createElement(BhcHealthRecordPrintDocument, {
      record: printRecord,
      linkedReferral: printReferral,
      title: "General Consultation Record",
      recordId: "77",
      patientName: "Ana Cruz",
      serviceType: "General Consultation",
      displayDate: "October 8, 2026",
      displayTime: "9:00 AM",
      practitioner: "Midwife Santos",
      nextActionLabel: "Referral",
    }),
  );

  assert.match(BHC_HEALTH_RECORD_PRINT_PAGE_STYLES, /size:\s*A4/);
  assert.match(html, /bhc-print-grid-3/);
  assert.match(html, /AKAY/);
  assert.match(html, /Medical EHR and Referral System/);
  assert.match(html, /BHC Health Record/);
  assert.match(html, /Ana Cruz/);
  assert.match(html, /Fever for two days/);
  assert.match(html, /Onset after rainfall/);
  assert.match(html, /Warm to touch/);
  assert.match(html, /Gave paracetamol/);
  assert.match(html, /Paracetamol/);
  assert.match(html, /Needs physician review/);
  assert.match(html, /Rural Health Unit Bulakan/);
  assert.match(html, /Vital signs/);
  assert.match(html, /Clinical assessment/);
  assert.match(html, /Follow-up &amp; referral information/);
  assert.match(html, /Visit chain/);
  assert.match(html, /Record #10/);
  assert.doesNotMatch(html, />Back</);
  assert.doesNotMatch(html, />Print</);
  assert.doesNotMatch(html, /View Referral Details/);
  assert.doesNotMatch(html, /View record/);
  assert.doesNotMatch(html, /Create Referral/);
  assert.equal((html.match(/Vital signs/g) || []).length, 1);
});

test("BHC print document groups program sections and keeps shared treatment once", () => {
  const html = wrap(
    createElement(BhcHealthRecordPrintDocument, {
      record: {
        ...printRecord,
        selectedPrograms: ["EPI", "Maternal"],
        immunizationData: {
          vaccineEntries: [
            {
              vaccineName: "BCG",
              dateGiven: "2026-10-01",
              remarks: "Left arm",
            },
          ],
        },
        maternalData: {
          lmp: "2026-01-15",
          gravida: "2",
          para: "1",
        },
      },
      title: "Health Record",
      recordId: "77",
      patientName: "Ana Cruz",
      serviceType: "General Consultation",
      displayDate: "October 8, 2026",
      displayTime: "9:00 AM",
      practitioner: "Midwife Santos",
      nextActionLabel: "No follow-up",
    }),
  );

  assert.match(html, /Child Health \/ EPI/);
  assert.match(html, /BCG/);
  assert.match(html, /Maternal \/ Prenatal/);
  assert.match(html, /Gravida/);
  assert.equal((html.match(/Dispensed medicines/g) || []).length, 1);
  assert.equal((html.match(/<h2>Treatment<\/h2>/g) || []).length, 1);
});

test("BHC TB print layout keeps recorded TB fields without form controls", () => {
  const html = wrap(
    createElement(BhcHealthRecordPrintDocument, {
      record: {
        id: 88,
        patientClassification: "TB DOTS / TB Monitoring",
        tbData: {
          diagnosis: { tbCaseNumber: "TB-2026-014", attendingPhysician: "Dr. Reyes" },
          doseCalendar: {
            adherencePercent: 92,
            months: [{ label: "Month 1", days: ["ABC", "", "X"] }],
          },
        },
      },
      title: "TB DOTS Record",
      recordId: "88",
      patientName: "Juan Dela Cruz",
      serviceType: "TB DOTS / TB Monitoring",
      displayDate: "October 8, 2026",
      displayTime: "9:00 AM",
      practitioner: "Nurse Cruz",
      nextActionLabel: "Follow-up",
    }),
  );

  assert.match(html, /TB DOTS \/ TB monitoring/);
  assert.match(html, /TB-2026-014/);
  assert.match(html, /Dr\. Reyes/);
  assert.match(html, /Dose calendar/);
  assert.match(html, /D1 ABC/);
  assert.doesNotMatch(html, /Download/);
  assert.doesNotMatch(html, /<input/);
  assert.doesNotMatch(html, /<button/);
});
