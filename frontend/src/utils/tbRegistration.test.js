import assert from "node:assert/strict";
import test from "node:test";
import {
  tbRegistrationPayload,
  tbRegistrationErrors,
  tbRegistrationAttempt,
  withTbRegimenRows,
  registerOrRecoverTbCase,
  screeningPrefillFromVisit,
  emptyTbCaseRegistration,
  normalizeTbCaseRegistration,
} from "./tbRegistration.js";

const card = () => ({
  caseFinding: { diagnosingFacility: "Forged", ntpFacilityCode: "RHU-1" },
  diagnosis: { diagnosisType: "tb_infection", tbCaseNumber: "Forged", dateOfNotification: "2026-11-10" },
  classification: { drugResistance: "rr_tb", bacteriologicalStatus: "clinically_diagnosed", anatomicalSite: "pulmonary", registrationGroup: "new" },
  regimen: { description: "Physician-entered regimen", weightKg: "55", rows: [{ dateStart: "2026-11-10", drug4fdc: "4", strength: "Specified", unit: "tablets/day" }] },
  doseCalendar: { adherencePercent: 100 }, outcome: { status: "cured" }, laboratory: { xpert: { result: "Invented" } },
});
const payload = data => tbRegistrationPayload({
  reportingYear: 2026,
  caseNumber: "",
  sourceRevision: "a".repeat(64),
  confirmed: true,
  treatmentStartDate: "2026-11-10",
  cardData: data ?? card(),
});

test("registration payload omits diagnostic ownership, outcome and monitoring fields", () => {
  const result = payload();
  assert.equal(result.case_number, null);
  assert.deepEqual(result.card_data.caseFinding, { ntpFacilityCode: "RHU-1" });
  assert.deepEqual(result.card_data.diagnosis, { dateOfNotification: "2026-11-10" });
  assert.equal(result.card_data.classification.drugResistance, undefined);
  assert.equal(result.card_data.laboratory, undefined);
  assert.equal(result.card_data.outcome, undefined);
  assert.equal(result.card_data.doseCalendar, undefined);
  assert.equal(result.card_data.regimen.rows[0].drug4fdc, "4");
});

test("editing regimen rows retains the manual regimen and baseline weight through submission", () => {
  const data = card();
  data.regimen = withTbRegimenRows(data.regimen, [{ ...data.regimen.rows[0], drug4fdc: "3" }]);
  assert.equal(payload(data).card_data.regimen.weightKg, "55");
  assert.equal(payload(data).card_data.regimen.description, "Physician-entered regimen");
  assert.equal(payload(data).card_data.regimen.rows[0].drug4fdc, "3");
});

test("registration requires explicit prescription, positive weight and a positive dose in every row", () => {
  assert.deepEqual(tbRegistrationErrors(payload()), {});
  const data = payload();
  data.confirmed = false;
  data.card_data.regimen.description = "";
  data.card_data.regimen.weightKg = "0";
  data.card_data.regimen.rows[0].drug4fdc = "0";
  const errors = tbRegistrationErrors(data);
  assert.ok(errors.confirmed);
  assert.ok(errors["card_data.regimen.description"]);
  assert.ok(errors["card_data.regimen.weightKg"]);
  assert.ok(errors["card_data.regimen.rows.0"]);
});

test("classification and dosage validation handles missing, negative and nonnumeric values", () => {
  const data = payload();
  data.card_data.classification.anatomicalSite = "extrapulmonary";
  data.card_data.regimen.rows[0].drug4fdc = "many";
  assert.ok(tbRegistrationErrors(data)["card_data.classification.extrapulmonarySite"]);
  assert.ok(tbRegistrationErrors(data)["card_data.regimen.rows.0.drug4fdc"]);
  data.card_data.regimen.rows[0].drug4fdc = "-1";
  assert.ok(tbRegistrationErrors(data)["card_data.regimen.rows.0.drug4fdc"]);
});

test("lost-response retries retain their key and frozen payload while edits start another attempt", () => {
  const data = payload();
  const first = tbRegistrationAttempt(null, 12, data, () => "first-key");
  assert.equal(tbRegistrationAttempt(first, 12, payload(), () => "unused"), first);
  data.card_data.regimen.description = "Changed";
  assert.equal(first.payload.card_data.regimen.description, "Physician-entered regimen");
  const next = tbRegistrationAttempt(first, 12, data, () => "next-key");
  assert.equal(next.key, "next-key");
  assert.equal(next.payload.card_data.regimen.description, "Changed");
  assert.equal(tbRegistrationAttempt(first, 13, payload(), () => "other-source").key, "other-source");
});

test("a committed registration recovered after a network failure returns the saved case", async () => {
  const attempt = tbRegistrationAttempt(null, 12, payload(), () => "lost-response");
  const failure = Object.assign(new Error("Connection lost"), { isNetworkError: true });
  const result = await registerOrRecoverTbCase(attempt, async () => { throw failure; }, async () => ({ case: { id: 42, source_health_record_id: 12 } }));
  assert.deepEqual(result, { id: 42, source_health_record_id: 12 });
});

test("recovery preserves clinical conflicts and cannot resolve a different source", async () => {
  const attempt = tbRegistrationAttempt(null, 12, payload(), () => "conflict");
  const conflict = Object.assign(new Error("Changed prescription"), { status: 409 });
  await assert.rejects(registerOrRecoverTbCase(attempt, async () => { throw conflict; }, async () => ({ case: { id: 42, source_health_record_id: 12 } })), error => error === conflict);
  const failure = Object.assign(new Error("Connection lost"), { isNetworkError: true });
  await assert.rejects(registerOrRecoverTbCase(attempt, async () => { throw failure; }, async () => ({ case: { id: 43, source_health_record_id: 13 } })), error => error === failure);
});

test("screening prefill labels referral fallback versus walk-in visit date", () => {
  const referral = screeningPrefillFromVisit({
    referral_id: 9,
    referral: { referral_datetime: "2026-03-15T08:00:00+08:00", sending_bhc: { name: "Sample BHC" } },
  });
  assert.equal(referral.dateOfScreening, "2026-03-15");
  assert.equal(referral.screeningDateSource, "referral_fallback");
  assert.equal(referral.referralSourceLabel, "Sample BHC");
  const walkIn = screeningPrefillFromVisit({ source: "walk_in", consultationDate: "2026-04-01" });
  assert.equal(walkIn.dateOfScreening, "2026-04-01");
  assert.equal(walkIn.screeningDateSource, "rhu_visit");
  assert.equal(walkIn.referralSourceLabel, "RHU walk-in");
});

test("consultation Form 4B draft keeps a stable registration key across normalize", () => {
  const first = emptyTbCaseRegistration({ visit: { consultationDate: "2026-05-01" }, createKey: () => "stable-key" });
  const restored = normalizeTbCaseRegistration({
    ...first,
    confirmed: true,
    treatment_start_date: "2026-05-02",
    card_data: { ...first.card_data, classification: { ...first.card_data.classification, bacteriologicalStatus: "clinically_diagnosed" } },
  }, { createKey: () => "other-key" });
  assert.equal(restored.registration_key, "stable-key");
  assert.equal(restored.confirmed, true);
  assert.equal(restored.treatment_start_date, "2026-05-02");
  assert.equal(restored.card_data.classification.bacteriologicalStatus, "clinically_diagnosed");
  assert.equal(restored.card_data.caseFinding.dateOfScreening, "2026-05-01");
});

test("registration payload and errors require treatment start date", () => {
  const draft = emptyTbCaseRegistration({ visit: { consultationDate: "2026-05-01" }, createKey: () => "key" });
  const incomplete = tbRegistrationPayload({
    reportingYear: draft.reporting_year,
    caseNumber: "",
    sourceRevision: "a".repeat(64),
    confirmed: true,
    cardData: {
      ...draft.card_data,
      classification: { bacteriologicalStatus: "clinically_diagnosed", anatomicalSite: "pulmonary", registrationGroup: "new" },
      regimen: { description: "2HRZE/4HR", weightKg: 55, rows: [{ dateStart: "2026-05-01", drug4fdc: 3, strength: "150/75/400/275", unit: "tabs" }] },
    },
  });
  assert.equal(tbRegistrationErrors(incomplete).treatment_start_date, "Enter the actual treatment start date.");
  const complete = tbRegistrationPayload({
    reportingYear: draft.reporting_year,
    caseNumber: "",
    sourceRevision: "a".repeat(64),
    confirmed: true,
    treatmentStartDate: "2026-05-03",
    cardData: incomplete.card_data,
  });
  assert.equal(complete.treatment_start_date, "2026-05-03");
  assert.equal(complete.card_data.phases.intensiveStart, "2026-05-03");
  assert.equal(tbRegistrationErrors(complete).treatment_start_date, undefined);
});
