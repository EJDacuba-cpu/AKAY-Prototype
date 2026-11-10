import assert from "node:assert/strict";
import test from "node:test";

import { resolveReportPeriod } from "./bhcReporting.js";
import {
  buildFamilyPlanningTclRows,
  filterFamilyPlanningTclRows,
  formatFpSeStatus,
} from "./familyPlanningTcl.js";

const NOW = new Date("2026-10-15T12:00:00");

function period(preset = "monthly") {
  return resolveReportPeriod({ preset, from: "", to: "", now: NOW });
}

function fpVisit({
  id,
  patientId,
  date,
  clientType,
  methodUsed,
  previousMethod,
  selectedPrograms = ["Family Planning"],
  category,
  dateRegistered,
  patient,
}) {
  return {
    id,
    patientId,
    dateOfVisit: date,
    selectedPrograms,
    category,
    patient,
    familyPlanningData: {
      clientType,
      methodUsed,
      previousMethod,
      dateRegistered,
    },
  };
}

test("TCL keeps one row per patient and uses the latest period visit details", () => {
  const patients = [
    {
      id: "p1",
      firstName: "Ana",
      lastName: "Santos",
      familySerialNumber: "FSN-1",
      birthdate: "1998-05-20",
      nhtsStatus: "NHTS",
    },
  ];
  const records = [
    fpVisit({
      id: "r1",
      patientId: "p1",
      date: "2026-10-04",
      clientType: "NA — New Acceptors",
      methodUsed: "CON — Condom",
      previousMethod: "NONE — None / New Acceptor",
      dateRegistered: "2026-09-01",
      patient: { id: "p1", firstName: "Ana", lastName: "Santos" },
    }),
    fpVisit({
      id: "r2",
      patientId: "p1",
      date: "2026-10-12",
      clientType: "CU — Current Users",
      methodUsed: "Pills-COC — Combined Oral Contraceptives",
      previousMethod: "CON — Condom",
      patient: { id: "p1", firstName: "Ana", lastName: "Santos" },
    }),
    fpVisit({
      id: "r3",
      patientId: "p1",
      date: "2026-09-02",
      clientType: "NA — New Acceptors",
      methodUsed: "CON — Condom",
    }),
  ];

  const rows = buildFamilyPlanningTclRows({
    records,
    patients,
    period: period("monthly"),
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].patientId, "p1");
  assert.equal(rows[0].visitCountInPeriod, 2);
  assert.equal(rows[0].clientTypeCode, "CU");
  assert.equal(rows[0].methodUsed, "Pills-COC — Combined Oral Contraceptives");
  assert.equal(rows[0].previousMethod, "CON — Condom");
  assert.equal(rows[0].dateRegistered, "2026-09-01");
  assert.equal(rows[0].familySerialNumber, "FSN-1");
  assert.equal(rows[0].dateOfBirth, "1998-05-20");
  assert.equal(rows[0].age, "28");
  assert.equal(rows[0].seStatus, "1 — NHTS");
  assert.equal(rows[0].lastVisit, undefined);
  assert.equal(rows[0].nextAppointmentDate, undefined);
  assert.match(rows[0].patientName, /Ana/);
});

test("Date of Registration stays empty when only visit dates exist", () => {
  const records = [
    fpVisit({
      id: "r1",
      patientId: "p9",
      date: "2026-10-03",
      clientType: "CU — Current Users",
      methodUsed: "CON — Condom",
      patient: { id: "p9", firstName: "Dina", lastName: "Reyes" },
    }),
  ];

  const rows = buildFamilyPlanningTclRows({
    records,
    patients: [],
    period: period("monthly"),
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].dateRegistered, "");
});

test("Previous Method never copies current method when undocumented", () => {
  const records = [
    fpVisit({
      id: "r1",
      patientId: "p8",
      date: "2026-10-08",
      clientType: "CU — Current Users",
      methodUsed: "IMP — Single rod sub-dermal Implant",
      previousMethod: "",
      patient: { id: "p8", firstName: "Gina", lastName: "Tan", nhtsStatus: "Non-NHTS" },
    }),
  ];

  const rows = buildFamilyPlanningTclRows({
    records,
    patients: [{ id: "p8", firstName: "Gina", lastName: "Tan", nhtsStatus: "Non-NHTS" }],
    period: period("monthly"),
  });

  assert.equal(rows[0].methodUsed, "IMP — Single rod sub-dermal Implant");
  assert.equal(rows[0].previousMethod, "");
  assert.equal(rows[0].seStatus, "2 — Non-NHTS");
});

test("formatFpSeStatus maps known NHTS values only", () => {
  assert.equal(formatFpSeStatus("NHTS"), "1 — NHTS");
  assert.equal(formatFpSeStatus("Non-NHTS"), "2 — Non-NHTS");
  assert.equal(formatFpSeStatus("maybe"), "");
  assert.equal(formatFpSeStatus(""), "");
});

test("TCL includes mixed-service FP consultations via selectedPrograms", () => {
  const records = [
    fpVisit({
      id: "m1",
      patientId: "p2",
      date: "2026-10-05",
      clientType: "OA — Other Acceptors",
      methodUsed: "IMP — Single rod sub-dermal Implant",
      selectedPrograms: ["Maternal", "Family Planning"],
      category: "General Consultation",
      patient: { id: "p2", firstName: "Bea", lastName: "Cruz" },
    }),
  ];

  const rows = buildFamilyPlanningTclRows({
    records,
    patients: [],
    period: period("monthly"),
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].patientId, "p2");
  assert.equal(rows[0].clientTypeCode, "OA");
});

test("Missing DOB and SE Status stay empty for Not recorded display", () => {
  const records = [
    fpVisit({
      id: "sparse",
      patientId: "p3",
      date: "2026-10-07",
      clientType: "",
      methodUsed: "",
      patient: { id: "p3", firstName: "Cora", lastName: "Lim" },
    }),
  ];

  const rows = buildFamilyPlanningTclRows({
    records,
    patients: [],
    period: period("monthly"),
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].dateOfBirth, "");
  assert.equal(rows[0].age, "");
  assert.equal(rows[0].seStatus, "");
  assert.equal(rows[0].previousMethod, "");
});

test("TCL search and client-type filter still work", () => {
  const rows = [
    {
      patientName: "Ana Santos",
      familySerialNumber: "FSN-1",
      clientTypeCode: "NA",
      methodUsed: "Pills",
      previousMethod: "Condom",
      seStatus: "1 — NHTS",
    },
    {
      patientName: "Bea Cruz",
      familySerialNumber: "FSN-2",
      clientTypeCode: "CU-CM",
      methodUsed: "IUD",
      previousMethod: "",
      seStatus: "2 — Non-NHTS",
    },
  ];

  assert.equal(filterFamilyPlanningTclRows(rows, { clientType: "na" }).length, 1);
  assert.equal(filterFamilyPlanningTclRows(rows, { search: "fsn-2" }).length, 1);
  assert.equal(filterFamilyPlanningTclRows(rows, { search: "iud" }).length, 1);
});
