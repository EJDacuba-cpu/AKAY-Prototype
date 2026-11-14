import assert from "node:assert/strict";
import test from "node:test";

import { resolveReportPeriod } from "./bhcReporting.js";
import {
  assessChildCpab,
  buildChildCareTclRows,
  countCpabProtectedChildren,
  filterChildCareTclRows,
  formatNewbornVaccineTiming,
} from "./childCareTcl.js";

const NOW = new Date("2026-10-15T12:00:00");

function period() {
  return resolveReportPeriod({ preset: "monthly", from: "", to: "", now: NOW });
}

test("Child Care TCL includes infants without doses and keeps one row per child", () => {
  const patients = [
    {
      id: "c1",
      firstName: "Baby",
      lastName: "One",
      birthdate: "2026-09-01",
      sex: "Female",
      familySerialNumber: "FSN-9",
      motherName: "Ana One",
      created_at: "2026-09-02",
    },
    {
      id: "adult",
      firstName: "Adult",
      lastName: "Person",
      birthdate: "1990-01-01",
      sex: "Female",
    },
  ];
  const records = [
    {
      id: "e1",
      patientId: "c1",
      selectedPrograms: ["EPI", "Maternal"],
      dateOfVisit: "2026-10-05",
      immunization_data: {
        vaccineEntries: [{ vaccineName: "BCG", dateGiven: "2026-09-01" }],
      },
    },
  ];

  const rows = buildChildCareTclRows({ patients, records, period: period() });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].patientId, "c1");
  assert.equal(rows[0].familySerialNumber, "FSN-9");
  assert.equal(rows[0].motherName, "Ana One");
  assert.match(rows[0].bcgDisplay, /2026-09-01/);
  assert.equal(rows[0].hepaBDisplay, "");
});

test("CPAB stays Not assessed without verified maternal TT2+/Td2+ evidence", () => {
  const child = { id: "c2", birthdate: "2026-08-01", motherPatientId: "m1" };
  const mother = { id: "m1", firstName: "Mother", lastName: "Link" };
  const assessed = assessChildCpab({
    child,
    mother,
    motherRecords: [
      {
        selectedPrograms: ["Maternal"],
        maternalData: { tetanusToxoidStatus: { tt1: "2026-07-01" } },
      },
    ],
    childEpiHistory: new Map([["CPAB", { dateGiven: "2026-08-01" }]]),
  });
  assert.equal(assessed.status, "not_assessed");
  assert.equal(assessed.label, "Not assessed");
  assert.match(assessed.evidenceLabel, /without verified maternal doses/i);
});

test("CPAB Protected can come from child EPI manual evidence without a mother link", () => {
  const assessed = assessChildCpab({
    child: { id: "c-manual", birthdate: "2026-08-01", motherName: "Ana Only" },
    mother: null,
    motherRecords: [],
    childEpiHistory: new Map(),
    childEpiRecords: [
      {
        selectedPrograms: ["EPI"],
        dateOfVisit: "2026-09-01",
        immunization_data: {
          cpabAssessment: { status: "protected", notes: "Card reviewed" },
          maternalTtTdEvidence: [
            {
              vaccineType: "TT",
              dose: "2",
              dateAdministered: "2026-06-01",
              evidenceSource: "maternal_card",
            },
          ],
        },
      },
    ],
  });
  assert.equal(assessed.status, "protected");
  assert.equal(assessed.label, "Protected");
  assert.match(assessed.evidenceLabel, /TT2/);
});

test("CPAB stays Not assessed when only mother-reported evidence supports Protected", () => {
  const assessed = assessChildCpab({
    child: { id: "c-reported", birthdate: "2026-08-01" },
    childEpiRecords: [
      {
        selectedPrograms: ["EPI"],
        immunization_data: {
          cpabAssessment: { status: "protected" },
          maternalTtTdEvidence: [
            {
              vaccineType: "Td",
              dose: "2",
              dateAdministered: "2026-05-01",
              evidenceSource: "mother_reported",
            },
          ],
        },
      },
    ],
  });
  assert.equal(assessed.status, "not_assessed");
  assert.match(assessed.evidenceLabel, /reported/i);
});

test("CPAB Protected requires linked mother and dated TT2+ on or before DOB", () => {
  const patients = [
    {
      id: "c3",
      firstName: "Child",
      lastName: "Three",
      birthdate: "2026-08-10",
      sex: "Male",
      motherPatientId: "m2",
      created_at: "2026-08-11",
    },
    {
      id: "m2",
      firstName: "Maria",
      lastName: "Reyes",
      birthdate: "1995-01-01",
      sex: "Female",
    },
  ];
  const records = [
    {
      id: "mat1",
      patientId: "m2",
      selectedPrograms: ["Maternal"],
      dateOfVisit: "2026-07-01",
      maternalData: {
        tetanusToxoidStatus: { tt1: "2026-05-01", tt2: "2026-06-01" },
      },
    },
  ];

  const rows = buildChildCareTclRows({ patients, records, period: period() });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cpabStatus, "protected");
  assert.equal(rows[0].motherName, "Maria Reyes");
  assert.equal(countCpabProtectedChildren(rows), 1);
});

test("vaccine timing never marks same-day date-only records as within 24 hours", () => {
  const unverified = formatNewbornVaccineTiming({
    birthDate: "2026-08-01",
    birthTime: "",
    dateGiven: "2026-08-01",
    timeGiven: "",
  });
  assert.equal(unverified.timingVerified, false);
  assert.match(unverified.display, /timing unverified/);

  const within = formatNewbornVaccineTiming({
    birthDate: "2026-08-01",
    birthTime: "08:00",
    dateGiven: "2026-08-01",
    timeGiven: "18:00",
  });
  assert.equal(within.timingVerified, true);
  assert.equal(within.group, "within_24h");

  const beyond = formatNewbornVaccineTiming({
    birthDate: "2026-08-01",
    birthTime: "08:00",
    dateGiven: "2026-08-02",
    timeGiven: "10:00",
  });
  assert.equal(beyond.group, "beyond_24h");
});

test("search and CPAB filter work on Child Care TCL rows", () => {
  const rows = [
    {
      patientName: "Baby One",
      familySerialNumber: "FSN-1",
      motherName: "Ana",
      cpabStatus: "protected",
      cpabLabel: "Protected",
      bcgDisplay: "2026-09-01",
      hepaBDisplay: "",
    },
    {
      patientName: "Baby Two",
      familySerialNumber: "FSN-2",
      motherName: "Bea",
      cpabStatus: "not_assessed",
      cpabLabel: "Not assessed",
      bcgDisplay: "",
      hepaBDisplay: "2026-09-02 · timing unverified",
    },
  ];
  assert.equal(filterChildCareTclRows(rows, { search: "bea" }).length, 1);
  assert.equal(filterChildCareTclRows(rows, { cpabFilter: "protected" }).length, 1);
  assert.equal(filterChildCareTclRows(rows, { cpabFilter: "not_assessed" }).length, 1);
});
