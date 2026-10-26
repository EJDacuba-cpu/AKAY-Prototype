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
const { recordDetailsPresentation, recordedVitalItems } = await server.ssrLoadModule(
  "/src/components/features/health-records/recordDetailsPresentation.js",
);
const { getRecordPractitioner } = await server.ssrLoadModule(
  "/src/components/features/health-records/recordDetailsHelpers.js",
);

test("details reader uses scoped task states and explicit related IDs without mutating records", () => {
  const record = {
    id: 11, parent_health_record_id: 10,
    followUpDate: "2020-01-01", followUpStatus: "Follow-up Required",
    followUpEpisode: { records: [...episode.records].reverse(), tasks: [
      { id: 1, healthRecordId: 10, dueDate: "2027-01-01", state: "pending" },
      { id: 2, healthRecordId: 11, dueDate: "2026-10-10", state: "fulfilled", fulfilledByHealthRecordId: 12 },
      { id: 3, healthRecordId: 11, dueDate: "2026-10-11", state: "cancelled" },
    ] },
  };
  const before = JSON.stringify(record);
  const details = recordDetailsPresentation(record);
  assert.equal(details.nextAction, "No active follow-up task");
  assert.deepEqual(details.related.map((row) => row.id), [10, 11]);
  assert.equal(details.schedules.length, 2);
  assert.equal(details.schedules[0].completedRecordId, 12);
  assert.deepEqual(details.legacy, []);
  assert.equal(JSON.stringify(record), before);
});

test("explicit empty reporting destinations suppress legacy mirrors and fabricated legacy defaults", () => {
  const details = recordDetailsPresentation({
    id: 1, recordedLegacyStatus: "", status: "Routine Monitoring", followUpStatus: "Routine Monitoring",
    diagnoses: [{ name: "Recorded only", reportIn: [] }],
    morbidityReportingStatus: "notifiable", hfmdSurveillance: true,
  });
  assert.deepEqual(details.legacy, []);
  assert.ok(details.reporting.every((group) => group.names.length === 0));
  assert.equal(details.nextAction, "Not recorded");
});

test("recorded vitals keep units and attribution never invents credentials", () => {
  const items = recordedVitalItems({ temperature: "36.7 C", weight: "62 kg", pulse: "80", spo2: "98", height: "0", fbs: 0 });
  assert.deepEqual(items, [
    { label: "Temperature", value: "36.7 C" }, { label: "Weight", value: "62 kg" },
    { label: "Pulse", value: "80 bpm" }, { label: "SpO₂", value: "98 %" },
  ]);
  assert.equal(getRecordPractitioner({ creator: { name: "Ana Cruz", role: "doctor" }, attendingStaff: "Other staff" }), "Ana Cruz");
  assert.equal(getRecordPractitioner({ recordedBy: "Saved Encoder", attendingStaff: "Old Practitioner" }), "Saved Encoder");
  assert.equal(getRecordPractitioner({ practitioner: { name: "Other Practitioner" }, recordedBy: "Saved Encoder" }), "Saved Encoder");
});

test("older care plans retain historical fields without becoming current clinical outcomes", () => {
  const details = recordDetailsPresentation({
    id: 8, patientCondition: "Historical condition", followUpStatus: "Follow-up Required",
    followUpDate: "2020-01-01", diagnoses: [{ id: "old", name: "Old concern", carePlan: "monitor" }],
  });
  assert.ok(details.legacy.some((item) => item.value === "Historical condition"));
  assert.ok(details.legacy.some((item) => item.value === "2020-01-01"));
  assert.equal(details.nextAction, "Not recorded");
});

for (const View of [BhcHealthRecordWorkspace, BhcHealthRecordPrintDocument]) {
  test(`${View.name}: separates historical fields from authoritative schedules`, () => {
    const record = {
      id: 10, patientCondition: "Improving historically", followUpStatus: "Follow-up Required",
      followUpDate: "2020-01-01", followUpReason: "Old return reason",
      monitoringData: { consultationWorkflow: "bhc_general_v2", followUpSchedules: [] },
      diagnoses: [{ id: "a", name: "Recorded concern", reportIn: ["morbidity", "surveillance"], clinicalOutcome: "managed_at_bhc" }],
      followUpEpisode: { ...episode, tasks: [{ id: 44, healthRecordId: 10, dueDate: "2026-11-15", state: "rescheduled", purpose: "Updated return reason" }] },
    };
    const html = wrap(createElement(View, { record, serviceType: "General Consultation", practitioner: "Ana Santos" }));
    assert.match(html, /Recorded By/);
    assert.doesNotMatch(html, /Record status|Current condition|Visit chain|Morbidity \/ notifiable reports/);
    assert.match(html, /November 15, 2026/);
    assert.match(html, /Rescheduled/);
    assert.match(html, /Updated return reason/);
    assert.doesNotMatch(html, /January 1, 2020|Old return reason|Improving historically|Legacy Recorded Information/);
    assert.match(html, /Notifiable Diseases/);
    assert.match(html, /No entries recorded/);
    assert.match(html, /Clinical outcomes/);
    assert.match(html, /Managed at BHC/);
    assert.match(html, /Related Visits/);
  });

  test(`${View.name}: legacy values are historical only and empty vitals are omitted`, () => {
    const html = wrap(createElement(View, {
      record: { id: 3, patientCondition: "Historical stable", followUpStatus: "Follow-up Required", temperature: "0", weight: "0", followUpDate: "2020-01-01" },
      serviceType: "General Consultation",
    }));
    assert.match(html, /Legacy Recorded Information/);
    assert.match(html, /Historical stable/);
    assert.match(html, /Follow-up Required/);
    assert.doesNotMatch(html, /Record status|Current condition|Related Visits/);
    assert.doesNotMatch(html, />0(?:\s|<)/);
    assert.match(html, /Current next action/);
    assert.match(html, /Not recorded/);
    assert.match(html, /No vital measurements recorded/);
  });

  test(`${View.name}: retains saved referral facts when a linked referral is unavailable`, () => {
    const html = wrap(createElement(View, {
      record: { id: 4, referral_status: "Pending", referral_reason: "Saved referral reason", needs_referral: true },
      serviceType: "General Consultation",
    }));
    assert.match(html, /Saved referral reason/);
    assert.match(html, /Pending/);
    const partial = wrap(createElement(View, {
      record: { id: 4, referral_reason: "Saved fallback reason", linkedTrackingId: "TRACK-SAVED" },
      linkedReferral: { status: "Pending" }, serviceType: "General Consultation",
    }));
    assert.match(partial, /Saved fallback reason/);
    assert.match(partial, /TRACK-SAVED/);
  });

  test(`${View.name}: keeps distinct condition referral facts outside reporting`, () => {
    const html = wrap(createElement(View, {
      record: { id: 5, diagnoses: [
        { id: "a", name: "First saved concern", reportIn: ["morbidity"], clinicalOutcome: "refer_to_rhu", referral: { urgencyLevel: "Urgent", reasonForReferral: "First condition reason" } },
        { id: "b", name: "Second saved concern", reportIn: ["notifiable"], clinicalOutcome: "refer_to_rhu", referral: { urgencyLevel: "Routine", reasonForReferral: "Second condition reason" } },
      ] },
      serviceType: "General Consultation",
    }));
    assert.match(html, /First condition reason/);
    assert.match(html, /Second condition reason/);
    assert.equal((html.match(/First condition reason/g) || []).length, 1);
  });

  test(`${View.name}: postpartum vitals appear once in Vital signs`, () => {
    const html = wrap(createElement(View, {
      record: { id: 6, pulse: "80", spo2: "98", monitoringData: { visitPurpose: { services: ["Postpartum"] } } },
      serviceType: "General Consultation",
    }));
    assert.equal((html.match(/Pulse/g) || []).length, 1);
    assert.equal((html.match(/SpO₂/g) || []).length, 1);
  });
}

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

test("follow-up schedules keep visit actions and no longer open Follow-up Details", () => {
  const html = wrap(
    createElement(FollowUpEpisodeContent, {
      episode,
      currentRecord: { id: 10 },
    }),
  );

  assert.match(html, /Record Visit/);
  assert.match(html, /Reschedule/);
  assert.match(html, /Cancel/);
  assert.doesNotMatch(html, /View Details/);
  assert.doesNotMatch(html, /\/bhc\/follow-ups\/44(?!\?)/);
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
  assert.match(html, /Related Visits/);
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
