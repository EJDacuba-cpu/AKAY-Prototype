import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyLegacyReportingStatus,
  deriveReportingStatus,
  formatRecordReporting,
  formatReportAs,
  getMorbidityReportingStatus,
  getReportedDiagnoses,
  normalizeReportAs,
  setDiagnosisReportAs,
  usesDiagnosisReporting,
} from "./diagnosisReporting.js";

test("normalizeReportAs accepts only the two report types", () => {
  assert.equal(normalizeReportAs("Morbidity"), "morbidity");
  assert.equal(normalizeReportAs("notifiable"), "notifiable");
  assert.equal(normalizeReportAs("not_included"), null);
  assert.equal(normalizeReportAs(undefined), null);
});

test("deriveReportingStatus: notifiable wins, then morbidity, else not_included", () => {
  assert.equal(deriveReportingStatus([{ reportAs: "morbidity" }, { reportAs: "notifiable" }]), "notifiable");
  assert.equal(deriveReportingStatus([{ reportAs: "morbidity" }, { reportAs: null }]), "morbidity");
  assert.equal(deriveReportingStatus([{ reportAs: null }]), "not_included");
  assert.equal(deriveReportingStatus([]), "not_included");
});

test("usesDiagnosisReporting is keyed on the presence of reportAs, even null", () => {
  assert.equal(usesDiagnosisReporting([{ name: "Asthma", reportAs: null }]), true);
  assert.equal(usesDiagnosisReporting([{ name: "Asthma" }]), false);
  assert.equal(usesDiagnosisReporting(undefined), false);
});

test("setDiagnosisReportAs changes only the chosen diagnosis", () => {
  const list = [{ id: "a", reportAs: null }, { id: "b", reportAs: "morbidity" }];
  assert.deepEqual(setDiagnosisReportAs(list, "a", "notifiable"), [
    { id: "a", reportAs: "notifiable" },
    { id: "b", reportAs: "morbidity" },
  ]);
});

test("applyLegacyReportingStatus spreads an old draft's visit status to its diagnoses", () => {
  assert.deepEqual(applyLegacyReportingStatus([{ id: "a" }, { id: "b" }], "notifiable"), [
    { id: "a", reportAs: "notifiable" },
    { id: "b", reportAs: "notifiable" },
  ]);
  assert.deepEqual(applyLegacyReportingStatus([{ id: "a" }], "not_included"), [{ id: "a", reportAs: null }]);
  const already = [{ id: "a", reportAs: "morbidity" }];
  assert.equal(applyLegacyReportingStatus(already, "notifiable"), already);
});

test("getMorbidityReportingStatus reads the explicit status, then the legacy flags", () => {
  assert.equal(getMorbidityReportingStatus({ monitoring_data: { morbidityReportingStatus: "notifiable" } }), "notifiable");
  assert.equal(getMorbidityReportingStatus({ monitoringData: { includeInMorbidityReport: true } }), "morbidity");
  assert.equal(getMorbidityReportingStatus({ includeInMorbidityReport: "yes", isNotifiableDisease: "yes" }), "notifiable");
  assert.equal(getMorbidityReportingStatus({}), "not_included");
});

test("getReportedDiagnoses: one row per diagnosis marked for that report", () => {
  const record = {
    diagnoses: [
      { name: "Asthma", reportAs: "morbidity" },
      { name: "Dengue fever", reportAs: "notifiable" },
      { name: "Allergic rhinitis", reportAs: null },
    ],
    monitoring_data: { morbidityReportingStatus: "notifiable" },
  };
  assert.deepEqual(getReportedDiagnoses(record, "morbidity"), ["Asthma"]);
  assert.deepEqual(getReportedDiagnoses(record, "notifiable"), ["Dengue fever"]);
});

test("getReportedDiagnoses: an older or follow-up record reports its plain-text diagnosis once", () => {
  const legacy = { diagnosis: "Asthma; Rhinitis", monitoring_data: { morbidityReportingStatus: "morbidity" } };
  assert.deepEqual(getReportedDiagnoses(legacy, "morbidity"), ["Asthma; Rhinitis"]);
  assert.deepEqual(getReportedDiagnoses(legacy, "notifiable"), []);
  // Structured diagnoses saved before this feature (no reportAs) still follow the visit status.
  const preFeature = { diagnosis: "Asthma", diagnoses: [{ name: "Asthma" }], morbidityReportingStatus: "notifiable" };
  assert.deepEqual(getReportedDiagnoses(preFeature, "notifiable"), ["Asthma"]);
});

test("formatRecordReporting summarizes which diagnosis went to which report", () => {
  assert.equal(
    formatRecordReporting({
      diagnoses: [
        { name: "Asthma", reportAs: "morbidity" },
        { name: "Dengue fever", reportAs: "notifiable" },
      ],
    }),
    "Morbidity: Asthma · Notifiable: Dengue fever",
  );
  assert.equal(formatRecordReporting({ diagnosis: "Asthma", morbidityReportingStatus: "morbidity" }), "Morbidity: Asthma");
  assert.equal(formatRecordReporting({ morbidityReportingStatus: "notifiable" }), "Notifiable");
  assert.equal(formatRecordReporting({ diagnoses: [{ name: "Asthma", reportAs: null }] }), "Not reported");
});

test("formatReportAs labels", () => {
  assert.equal(formatReportAs("morbidity"), "Morbidity");
  assert.equal(formatReportAs("notifiable"), "Notifiable");
  assert.equal(formatReportAs(null), "Not reported");
});
