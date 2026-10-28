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

test("details reader uses stored follow-up dates and explicit related IDs without mutating records", () => {
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
  assert.equal(details.schedules.length, 1);
  assert.equal(details.schedules[0].date, "2020-01-01");
  assert.equal(details.schedules[0].sourceEntryId, null);
  assert.equal(details.visitFollowUps.length, 1);
  assert.ok(details.legacy.some((item) => item.value === "Follow-up Required"));
  assert.ok(!details.legacy.some((item) => item.value === "2020-01-01"));
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
  assert.equal(details.schedules[0].date, "2020-01-01");
  assert.ok(!details.legacy.some((item) => item.value === "2020-01-01"));
  assert.equal(details.nextAction, "Follow-up recorded · task status unavailable");
  assert.equal(details.concerns[0].name, "Old concern");
  assert.equal(details.concerns[0].reporting, "");
  assert.equal(details.mapsReportingToConcerns, false);
});

test("mixed concerns keep per-entry reporting and outcomes without inferring follow-up", () => {
  const details = recordDetailsPresentation({
    id: 10,
    diagnoses: [
      { id: "a", name: "Cough", reportIn: ["morbidity"], clinicalOutcome: "managed_at_bhc" },
      { id: "b", name: "Fever", reportIn: ["notifiable", "surveillance"], clinicalOutcome: "refer_to_rhu", referral: { urgencyLevel: "Urgent", reasonForReferral: "High fever" } },
    ],
    followUpEpisode: { tasks: [{ id: 44, healthRecordId: 10, dueDate: "2026-11-01", state: "pending" }] },
  });
  assert.equal(details.mapsReportingToConcerns, true);
  assert.deepEqual(details.unmappedReporting, []);
  assert.equal(details.concerns[0].outcome, "Managed at BHC");
  assert.equal(details.concerns[0].reporting, "Morbidity");
  assert.equal(details.concerns[1].outcome, "Refer to RHU");
  assert.equal(details.concerns[1].reporting, "Notifiable · Surveillance");
  assert.equal(details.concerns[1].referralDetails, "Urgent · High fever");
  assert.equal(details.concerns[1].referral.urgency, "Urgent");
  assert.equal(details.concerns[0].followUps.length, 0);
  assert.equal(details.schedules.length, 0);
  assert.ok(!details.concerns.some((item) => String(item.outcome + item.reporting).includes("2026-11-01")));
});

test("legacy visit-level reporting stays unmapped when concerns have no reportIn", () => {
  const details = recordDetailsPresentation({
    id: 9,
    diagnosis: "Asthma",
    morbidityReportingStatus: "morbidity",
    hfmdSurveillance: true,
    diagnoses: [{ id: "c", name: "Cough", clinicalOutcome: "managed_at_bhc" }],
  });
  assert.equal(details.mapsReportingToConcerns, false);
  assert.equal(details.concerns[0].name, "Cough");
  assert.equal(details.concerns[0].reporting, "");
  assert.ok(details.unmappedReporting.some((group) => group.label === "Morbidity" && group.names.includes("Asthma")));
  assert.ok(details.unmappedReporting.some((group) => group.label === "Surveillance" && group.names.includes("Hand, Foot and Mouth Disease")));
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
    assert.doesNotMatch(html, /November 15, 2026|Rescheduled|Updated return reason/);
    assert.doesNotMatch(html, /January 1, 2020|Old return reason|Improving historically|Legacy Recorded Information/);
    assert.doesNotMatch(html, /Visit type|Current next action/);
    assert.doesNotMatch(html, /No entries recorded/);
    assert.match(html, /Health concerns/);
    assert.match(html, /Managed at BHC/);
    assert.match(html, /Morbidity/);
    assert.match(html, /Surveillance/);
    assert.match(html, /Related consultation history/);
    assert.doesNotMatch(html, /Follow-up &amp; referral/);
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
    assert.doesNotMatch(html, /Visit type|Current next action/);
    assert.match(html, /No vital measurements recorded/);
  });

  test(`${View.name}: retains saved referral facts when a linked referral is unavailable`, () => {
    const html = wrap(createElement(View, {
      record: { id: 4, referral_status: "Pending", referral_reason: "Saved referral reason", needs_referral: true },
      serviceType: "General Consultation",
    }));
    assert.match(html, /Saved referral reason/);
    assert.doesNotMatch(html, /Pending|Received|Completed/);
    const partial = wrap(createElement(View, {
      record: { id: 4, referral_reason: "Saved fallback reason", linkedTrackingId: "TRACK-SAVED" },
      linkedReferral: { status: "Pending" }, serviceType: "General Consultation",
    }));
    assert.match(partial, /Saved fallback reason/);
    assert.match(partial, /TRACK-SAVED/);
    assert.doesNotMatch(partial, /Pending|Received|Completed/);
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
  assert.match(html, /Treatment &amp; dispensed medicines/);
  assert.match(html, /Health concerns/);
  assert.doesNotMatch(html, /Follow-up &amp; referral/);
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
  assert.match(html, /Health concerns/);
  assert.doesNotMatch(html, /Follow-up &amp; referral/);
  assert.match(html, /Related consultation history/);
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
  assert.equal((html.match(/Treatment &amp; dispensed medicines/g) || []).length, 1);
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

for (const View of [BhcHealthRecordWorkspace, BhcHealthRecordPrintDocument]) {
  test(`${View.name}: mixed concerns show outcome and reporting together without a separate reporting block`, () => {
    const html = wrap(createElement(View, {
      record: {
        id: 21,
        diagnoses: [
          { id: "a", name: "Cough", reportIn: ["morbidity"], clinicalOutcome: "managed_at_bhc" },
          { id: "b", name: "Fever", reportIn: ["notifiable", "surveillance"], clinicalOutcome: "refer_to_rhu", referral: { urgencyLevel: "Urgent", reasonForReferral: "High fever" } },
        ],
        followUpEpisode: { tasks: [{ id: 9, healthRecordId: 21, dueDate: "2026-11-01", state: "pending", purpose: "Wound check" }] },
      },
      serviceType: "General Consultation",
      practitioner: "Ana Santos",
    }));
    assert.match(html, /Health concerns/);
    assert.match(html, /Cough/);
    assert.match(html, /Managed at BHC/);
    assert.match(html, /Fever/);
    assert.match(html, /Refer to RHU/);
    assert.match(html, /High fever/);
    assert.match(html, /Morbidity/);
    assert.match(html, /Notifiable/);
    assert.match(html, /Surveillance/);
    assert.doesNotMatch(html, /Recorded reporting/);
    assert.doesNotMatch(html, /Wound check/);
    assert.doesNotMatch(html, /Pending|Received|Completed/);
  });

  test(`${View.name}: unmapped legacy reporting stays at record level`, () => {
    const html = wrap(createElement(View, {
      record: {
        id: 22,
        diagnosis: "Asthma",
        morbidityReportingStatus: "morbidity",
        diagnoses: [{ id: "c", name: "Cough", clinicalOutcome: "managed_at_bhc" }],
      },
      serviceType: "General Consultation",
    }));
    assert.match(html, /Cough/);
    assert.match(html, /Managed at BHC/);
    assert.match(html, /Recorded reporting/);
    assert.match(html, /Asthma/);
    assert.doesNotMatch(html, /Cough[^<]*Morbidity|Cough[^<]*Asthma/);
  });

  test(`${View.name}: body findings stay in clinical assessment and print`, () => {
    const html = wrap(createElement(View, {
      record: {
        id: 23,
        chiefComplaint: "Chest pain",
        bodyFindings: [{ region: "chest", finding: "Tenderness", location: "Upper chest" }],
      },
      serviceType: "General Consultation",
    }));
    assert.match(html, /Clinical assessment/);
    assert.match(html, /Body findings and reassessment history/);
    assert.match(html, /Tenderness/);
    assert.match(html, /Chest/);
  });
}

test("BHC workspace omits live referral statuses from the historical record", () => {
  const pending = wrap(createElement(BhcHealthRecordWorkspace, {
    record: { id: 24, referral_reason: "Needs review" },
    linkedReferral: { status: "Pending", reasonForReferral: "Needs review" },
    hasLinkedReferral: true,
    referralStatus: "Pending",
    serviceType: "General Consultation",
    title: "General Consultation Record",
    recordId: "24",
    patientName: "Ana Cruz",
    onBack() {},
    onPrint() {},
  }));
  assert.doesNotMatch(pending, /border-amber-200 bg-amber-50/);
  assert.doesNotMatch(pending, /Referral status/);
  assert.match(pending, /Needs review/);
  assert.doesNotMatch(pending, /Pending|Received|Completed|Accepted|Done/);

  const accepted = wrap(createElement(BhcHealthRecordWorkspace, {
    record: { id: 25, referral_reason: "Physician review" },
    linkedReferral: { status: "Accepted", reasonForReferral: "Physician review" },
    hasLinkedReferral: true,
    referralStatus: "Accepted",
    serviceType: "General Consultation",
    title: "General Consultation Record",
    recordId: "25",
    patientName: "Ana Cruz",
    onBack() {},
    onPrint() {},
  }));
  assert.match(accepted, /Physician review/);
  assert.doesNotMatch(accepted, /Accepted|Pending|Received|Completed/);
});

test("stored assessment text is not repeated when it already names a health concern", () => {
  const html = wrap(createElement(BhcHealthRecordWorkspace, {
    record: {
      id: 26,
      diagnosis: "Cough",
      diagnoses: [{ id: "a", name: "Cough", reportIn: ["morbidity"], clinicalOutcome: "managed_at_bhc" }],
    },
    serviceType: "General Consultation",
  }));
  assert.equal((html.match(/Cough/g) || []).length, 1);
  assert.doesNotMatch(html, /Diagnosis \/ assessment/);
  assert.match(html, /not RHU-confirmed diagnoses/);
});

test("verified follow-up and referral stay with their concerns and keep the original schedule date", () => {
  const details = recordDetailsPresentation({
    id: 31,
    diagnoses: [
      { id: "a", name: "Cough", reportIn: ["morbidity"], clinicalOutcome: "managed_at_bhc" },
      { id: "b", name: "Fever", reportIn: ["notifiable"], clinicalOutcome: "refer_to_rhu", referral: { urgencyLevel: "Urgent", reasonForReferral: "High fever", receivingRhuId: "9" } },
    ],
    monitoringData: {
      consultationWorkflow: "bhc_general_v2",
      followUpSchedules: [
        { purposeKey: "entry:a", sourceEntryId: "a", purpose: "Cough review", date: "2026-10-22", time: "08:00" },
        { purposeKey: "visit", purpose: "Return for labs", date: "2026-10-28" },
      ],
    },
    followUpEpisode: { tasks: [{ id: 44, healthRecordId: 31, dueDate: "2026-11-15", state: "rescheduled", purpose: "Updated return reason" }] },
  }, {
    status: "Pending",
    trackingId: "TRK-MIX",
    urgencyLevel: "Urgent",
    receivingFacility: "RHU Bulakan",
    ruralHealthUnitId: "9",
    reasonForReferral: "High fever",
  });
  assert.equal(details.concerns[0].followUps[0].date, "2026-10-22");
  assert.equal(details.concerns[0].followUps[0].reason, "Cough review");
  assert.equal(details.concerns[0].referral, null);
  assert.equal(details.concerns[1].referral.facility, "RHU Bulakan");
  assert.equal(details.concerns[1].referral.reason, "High fever");
  assert.equal(details.concerns[1].followUps.length, 0);
  assert.equal(details.visitFollowUps[0].date, "2026-10-28");
  assert.equal(details.visitReferral.trackingId, "TRK-MIX");
  assert.equal(details.visitReferral.reason, "");
  assert.ok(!details.schedules.some((row) => row.date === "2026-11-15"));
});

test("does not attach a visit schedule to a concern by purpose name", () => {
  const details = recordDetailsPresentation({
    id: 40,
    diagnoses: [{ id: "a", name: "Cough review", reportIn: ["morbidity"], clinicalOutcome: "managed_at_bhc" }],
    monitoringData: { followUpSchedules: [{ purposeKey: "visit", purpose: "Cough review", date: "2026-10-22" }] },
  });
  assert.equal(details.concerns[0].followUps.length, 0);
  assert.equal(details.visitFollowUps[0].date, "2026-10-22");
});

for (const View of [BhcHealthRecordWorkspace, BhcHealthRecordPrintDocument]) {
  test(`${View.name}: mixed referral and follow-up stay under related concerns`, () => {
    const html = wrap(createElement(View, {
      record: {
        id: 31,
        diagnoses: [
          { id: "a", name: "Cough", reportIn: ["morbidity"], clinicalOutcome: "managed_at_bhc" },
          { id: "b", name: "Fever", reportIn: ["notifiable"], clinicalOutcome: "refer_to_rhu", referral: { urgencyLevel: "Urgent", reasonForReferral: "High fever", receivingRhuId: "9" } },
        ],
        monitoringData: {
          consultationWorkflow: "bhc_general_v2",
          followUpSchedules: [
            { purposeKey: "entry:a", sourceEntryId: "a", purpose: "Cough review", date: "2026-10-22", time: "08:00" },
          ],
        },
      },
      linkedReferral: {
        status: "Pending",
        trackingId: "TRK-MIX",
        urgencyLevel: "Urgent",
        receivingFacility: "RHU Bulakan",
        ruralHealthUnitId: "9",
        reasonForReferral: "High fever",
      },
      serviceType: "General Consultation",
      practitioner: "Ana Santos",
      title: "General Consultation Record",
      recordId: "31",
      patientName: "Ana Cruz",
      onBack() {},
      onPrint() {},
    }));
    assert.match(html, /Cough review/);
    assert.match(html, /October 22, 2026/);
    assert.match(html, /High fever/);
    assert.match(html, /RHU Bulakan/);
    assert.match(html, /TRK-MIX/);
    assert.doesNotMatch(html, /Visit-level follow-up/);
    assert.doesNotMatch(html, /Pending|Received|Completed/);
    assert.doesNotMatch(html, /Follow-up &amp; referral/);
  });

  test(`${View.name}: keeps the original consultation date after a follow-up is rescheduled`, () => {
    const html = wrap(createElement(View, {
      record: {
        id: 32,
        diagnoses: [{ id: "a", name: "Wound", reportIn: ["morbidity"], clinicalOutcome: "managed_at_bhc" }],
        monitoringData: {
          consultationWorkflow: "bhc_general_v2",
          followUpSchedules: [
            { purposeKey: "entry:a", sourceEntryId: "a", purpose: "Wound reassessment", date: "2026-10-20", time: "08:00" },
          ],
        },
        followUpEpisode: { tasks: [{ id: 44, healthRecordId: 32, dueDate: "2026-11-15", state: "rescheduled", purpose: "Updated return reason" }] },
      },
      serviceType: "General Consultation",
      practitioner: "Ana Santos",
      title: "General Consultation Record",
      recordId: "32",
      patientName: "Ana Cruz",
      onBack() {},
      onPrint() {},
    }));
    assert.match(html, /October 20, 2026/);
    assert.match(html, /Wound reassessment/);
    assert.doesNotMatch(html, /November 15, 2026/);
    assert.doesNotMatch(html, /Rescheduled|Updated return reason/);
  });

  test(`${View.name}: labels unassociated follow-up as visit-level`, () => {
    const html = wrap(createElement(View, {
      record: {
        id: 33,
        diagnoses: [{ id: "a", name: "Cough", reportIn: ["morbidity"], clinicalOutcome: "managed_at_bhc" }],
        monitoringData: {
          consultationWorkflow: "bhc_general_v2",
          followUpSchedules: [
            { purposeKey: "visit", purpose: "Return for review", date: "2026-10-25", time: "09:00" },
          ],
        },
      },
      serviceType: "General Consultation",
      practitioner: "Ana Santos",
      title: "General Consultation Record",
      recordId: "33",
      patientName: "Ana Cruz",
      onBack() {},
      onPrint() {},
    }));
    assert.match(html, /Visit-level follow-up/);
    assert.match(html, /October 25, 2026/);
    assert.match(html, /Return for review/);
  });

  test(`${View.name}: shared referral stays visit-level when concerns have no referral object`, () => {
    const html = wrap(createElement(View, {
      record: {
        id: 34,
        diagnoses: [
          { id: "a", name: "Cough", reportIn: ["morbidity"], clinicalOutcome: "refer_to_rhu" },
          { id: "b", name: "Fever", reportIn: ["notifiable"], clinicalOutcome: "refer_to_rhu" },
        ],
      },
      linkedReferral: {
        status: "Received",
        trackingId: "TRK-SHARE",
        urgencyLevel: "Routine",
        receivingFacility: "RHU Bulakan",
        reasonForReferral: "Shared referral reason",
      },
      serviceType: "General Consultation",
      practitioner: "Ana Santos",
      title: "General Consultation Record",
      recordId: "34",
      patientName: "Ana Cruz",
      onBack() {},
      onPrint() {},
    }));
    assert.match(html, /Visit-level referral/);
    assert.match(html, /Shared referral reason/);
    assert.match(html, /TRK-SHARE/);
    assert.equal((html.match(/Shared referral reason/g) || []).length, 1);
    assert.doesNotMatch(html, /Received|Pending|Completed/);
  });
}

test("BHC workspace links to referral and follow-up modules without live status", () => {
  const html = wrap(createElement(BhcHealthRecordWorkspace, {
    record: {
      id: 35,
      monitoringData: {
        followUpSchedules: [{ purposeKey: "visit", purpose: "Return", date: "2026-10-26" }],
      },
    },
    linkedReferral: { trackingId: "TRK-35", reasonForReferral: "Needs review" },
    serviceType: "General Consultation",
    title: "General Consultation Record",
    recordId: "35",
    patientName: "Ana Cruz",
    onBack() {},
    onPrint() {},
  }));
  assert.match(html, /View in Referrals/);
  assert.match(html, /\/bhc\/referrals\/TRK-35/);
  assert.match(html, /View in Follow-ups/);
  assert.match(html, /\/bhc\/follow-ups/);
  const printed = wrap(createElement(BhcHealthRecordPrintDocument, {
    record: {
      id: 35,
      monitoringData: {
        followUpSchedules: [{ purposeKey: "visit", purpose: "Return", date: "2026-10-26" }],
      },
    },
    linkedReferral: { trackingId: "TRK-35", reasonForReferral: "Needs review" },
    serviceType: "General Consultation",
    title: "General Consultation Record",
    recordId: "35",
    patientName: "Ana Cruz",
  }));
  assert.doesNotMatch(printed, /View in Referrals|View in Follow-ups/);
  assert.match(printed, /TRK-35/);
  assert.match(printed, /Needs review/);
});
