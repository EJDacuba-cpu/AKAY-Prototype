import assert from "node:assert/strict";
import test from "node:test";

import { buildDispensedMedicineRows, buildMaternalTracking } from "./patientTrackingView.js";

test("maternal tracking keeps the latest recorded lab result and both TT/Td histories", () => {
  const records = [
    {
      id: 1,
      dateRecorded: "2026-09-01",
      maternalData: {
        lmp: "2026-07-01",
        expectedDeliveryDate: "2027-04-07",
        gravida: 1,
        para: 0,
        tpal: "0-0-0-0",
        laboratoryResults: { hemoglobin: "10.2 g/dL", cbc: "Normal" },
        laboratoryResultDates: { hemoglobin: "2026-08-30" },
        tetanusToxoidStatus: { tt1: "2026-08-01" },
      },
    },
    {
      id: 2,
      dateRecorded: "2026-10-01",
      maternalData: {
        laboratoryResults: { hemoglobin: "10.8 g/dL" },
        laboratoryResultDates: { hemoglobin: "2026-09-29" },
        tetanusDiphtheriaStatus: { td1: "2026-09-30" },
      },
    },
  ];

  const result = buildMaternalTracking(records, new Date(2026, 9, 14));
  assert.equal(result.gp, "G1 P0");
  assert.equal(result.tpal, "0-0-0-0");
  assert.equal(result.labs.find((lab) => lab.label === "Hemoglobin").value, "10.8 g/dL");
  assert.equal(result.labs.find((lab) => lab.label === "CBC").value, "Normal");
  assert.deepEqual(result.doses[0], { dose: 1, tt: "2026-08-01", td: "2026-09-30" });
  assert.equal(result.doses[1].td, "");
  assert.ok(result.progress > 0);
});

test("medicine history only includes dispensed items and keeps visit service labels", () => {
  const rows = buildDispensedMedicineRows([
    {
      id: 8,
      dateRecorded: "2026-10-01",
      category: "Maternal",
      monitoringData: { selectedPrograms: ["Maternal", "Family Planning"] },
      items_planned: [{ medicine_name_snapshot: "Not given" }],
      dispensedMedicines: [{ id: 3, medicineName: "Iron + Folic Acid", quantity: 30, unit: "tablets", dispensedByName: "Nurse A" }],
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Iron + Folic Acid");
  assert.equal(rows[0].quantity, "30 tablets");
  assert.deepEqual(rows[0].programs, ["Maternal Care", "Family Planning"]);
  assert.equal(rows[0].dispensedBy, "Nurse A");
});
