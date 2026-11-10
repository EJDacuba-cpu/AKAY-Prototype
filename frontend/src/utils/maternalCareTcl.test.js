import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMaternalCareTclRows,
  countMaternalEpisodeStartsInPeriod,
  countPrenatalConsultationsInPeriod,
  filterMaternalCareTclRows,
  formatGravidaPara,
  formatMaternalTtTdDisplay,
  isPostpartumMaternalVisit,
  isPrenatalMaternalVisit,
  splitMaternalEpisodes,
  tclDisplayValue,
} from "./maternalCareTcl.js";

const period = { start: "2026-10-01", end: "2026-10-31", label: "October 2026" };

function maternal(patientId, date, data = {}, services = []) {
  return {
    id: `${patientId}-${date}`,
    patientId,
    dateOfVisit: date,
    selectedPrograms: ["Maternal"],
    maternalData: data,
    monitoringData: services.length ? { visitPurpose: { services } } : {},
    patient: {
      id: patientId,
      first_name: "Ana",
      last_name: "Cruz",
      birthdate: "1995-05-10",
      family_serial_number: "FSN-2026-0001",
    },
  };
}

test("TCL builds one row per patient with maternal visit in period", () => {
  const rows = buildMaternalCareTclRows({
    period,
    patients: [{ id: "p1", firstName: "Ana", lastName: "Cruz", birthDate: "1995-05-10", familySerialNumber: "FSN-1" }],
    records: [
      maternal("p1", "2026-10-05", { gravida: "2", para: "1", lmp: "2026-02-01", expectedDeliveryDate: "2026-11-08" }),
      maternal("p1", "2026-10-20", { gravida: "2", para: "1", lmp: "2026-02-01", expectedDeliveryDate: "2026-11-08", tetanusToxoidStatus: { tt1: "2026-03-01", tt2: "2026-04-01" } }),
      maternal("p2", "2026-09-15", { gravida: "1", para: "0" }),
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].patientId, "p1");
  assert.equal(rows[0].dateRegistered, "2026-10-05");
  assert.equal(rows[0].gravidaPara, "G2P1");
  assert.equal(rows[0].lmp, "2026-02-01");
  assert.equal(rows[0].edc, "2026-11-08");
  assert.equal(rows[0].ttTd, "TT2");
  assert.equal(rows[0].visitCountInPeriod, 2);
  assert.ok(rows[0].canViewPatient);
});

test("Date of Registration uses earliest maternal visit of the episode, not patient registration", () => {
  const rows = buildMaternalCareTclRows({
    period,
    patients: [{ id: "p1", firstName: "Ana", lastName: "Cruz", birthDate: "1990-01-01", createdAt: "2020-01-01" }],
    records: [
      maternal("p1", "2026-10-12", { lmp: "2026-03-01" }),
      maternal("p1", "2026-10-03", { lmp: "2026-03-01" }),
    ],
  });
  assert.equal(rows[0].dateRegistered, "2026-10-03");
});

test("missing LMP EDC G/P TT/Td and DOB show empty for Not recorded display", () => {
  const rows = buildMaternalCareTclRows({
    period,
    patients: [{ id: "p1", firstName: "Ana", lastName: "Cruz" }],
    records: [{
      id: "p1-bare",
      patientId: "p1",
      dateOfVisit: "2026-10-08",
      selectedPrograms: ["Maternal"],
      maternalData: {},
      patient: { id: "p1", first_name: "Ana", last_name: "Cruz" },
    }],
  });
  assert.equal(rows[0].lmp, "");
  assert.equal(rows[0].edc, "");
  assert.equal(rows[0].gravidaPara, "");
  assert.equal(rows[0].ttTd, "");
  assert.equal(rows[0].age, "");
  assert.equal(tclDisplayValue(rows[0].lmp), "Not recorded");
});

test("TT and Td histories stay separate in the display", () => {
  assert.equal(
    formatMaternalTtTdDisplay([
      maternal("p1", "2026-10-01", {
        tetanusToxoidStatus: { tt1: "2026-01-01", tt2: "2026-02-01" },
        tetanusDiphtheriaStatus: { td1: "2026-03-01", td2: "2026-04-01" },
      }),
    ]),
    "TT2 · Td2",
  );
  assert.equal(formatGravidaPara({ gravida: "3", para: "2" }), "G3P2");
});

test("second pregnancy after completed postpartum window creates a separate TCL row", () => {
  const rows = buildMaternalCareTclRows({
    period: { start: "2026-01-01", end: "2026-12-31", label: "2026" },
    patients: [{ id: "p1", firstName: "Ana", lastName: "Cruz", birthDate: "1992-01-01" }],
    records: [
      maternal("p1", "2026-01-10", { gravida: "1", para: "0", lmp: "2025-08-01" }, ["Prenatal"]),
      maternal("p1", "2026-03-01", { deliveryDate: "2026-03-01" }, ["Postpartum"]),
      // Beyond 42-day window → new episode
      maternal("p1", "2026-05-01", { gravida: "2", para: "1", lmp: "2026-04-01", expectedDeliveryDate: "2027-01-06" }, ["Prenatal"]),
      maternal("p1", "2026-06-01", { gravida: "2", para: "1", lmp: "2026-04-01" }, ["Prenatal"]),
    ],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].dateRegistered, "2026-01-10");
  assert.equal(rows[0].gravidaPara, "G1P0");
  assert.equal(rows[1].dateRegistered, "2026-05-01");
  assert.equal(rows[1].gravidaPara, "G2P1");
});

test("mixed-service maternal consultation still appears when Maternal is selected", () => {
  const rows = buildMaternalCareTclRows({
    period,
    records: [{
      id: "mix-1",
      patientId: "p1",
      dateOfVisit: "2026-10-09",
      selectedPrograms: ["Maternal", "Family Planning"],
      maternalData: { gravida: "1", para: "0", lmp: "2026-02-15" },
      patient: { id: "p1", first_name: "Bea", last_name: "Santos", birthdate: "1998-02-02" },
    }],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].patientName, "Bea Santos");
});

test("search and TT/Td filter work", () => {
  const rows = buildMaternalCareTclRows({
    period,
    records: [
      maternal("p1", "2026-10-05", { tetanusToxoidStatus: { tt2: "2026-04-01" } }),
      {
        ...maternal("p2", "2026-10-06", { tetanusDiphtheriaStatus: { td1: "2026-05-01" } }),
        patient: { id: "p2", first_name: "Bea", last_name: "Reyes", family_serial_number: "FSN-9" },
      },
    ],
  });
  assert.equal(filterMaternalCareTclRows(rows, { search: "fsn-9" }).length, 1);
  assert.equal(filterMaternalCareTclRows(rows, { ttTdFilter: "tt" }).length, 1);
  assert.equal(filterMaternalCareTclRows(rows, { ttTdFilter: "td" }).length, 1);
  assert.equal(filterMaternalCareTclRows(rows, { ttTdFilter: "none" }).length, 0);
});

test("prenatal consultation count excludes postpartum-only visits", () => {
  const records = [
    maternal("p1", "2026-10-05", {}, ["Prenatal"]),
    maternal("p1", "2026-10-12", { deliveryDate: "2026-10-10" }, ["Postpartum"]),
    maternal("p1", "2026-10-20", {}, []), // legacy unlabeled → prenatal-ish
  ];
  assert.equal(isPostpartumMaternalVisit(records[1]), true);
  assert.equal(isPrenatalMaternalVisit(records[1]), false);
  assert.equal(isPrenatalMaternalVisit(records[0]), true);
  assert.equal(countPrenatalConsultationsInPeriod(records, period), 2);
});

test("new enrollment count can include a second pregnancy episode start", () => {
  const records = [
    maternal("p1", "2026-01-10", {}, ["Prenatal"]),
    maternal("p1", "2026-02-01", { deliveryDate: "2026-02-01" }, ["Postpartum"]),
    maternal("p1", "2026-10-05", {}, ["Prenatal"]),
  ];
  assert.equal(countMaternalEpisodeStartsInPeriod(records, period), 1);
  assert.equal(splitMaternalEpisodes(records).length, 2);
});
