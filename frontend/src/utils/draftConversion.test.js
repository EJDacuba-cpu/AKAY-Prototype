import { test } from "node:test";
import assert from "node:assert/strict";

import { convertLegacyDraft, isLegacyDraftPayload } from "./draftConversion.js";
import { restoreNextActions } from "./nextActions.js";

const referralForm = { priority: "Urgent", reasonForReferral: "Persistent cough", receivingRhuId: "4" };

function legacyDraft(overrides = {}) {
  return {
    diagnoses: [
      { id: "a", name: "Cough", carePlan: "refer", reportAs: null },
      { id: "b", name: "Dengue", carePlan: "none", reportAs: "notifiable", includeInSurveillance: true },
    ],
    diagnosis: "Cough; Dengue",
    assessmentNotes: "Looks pale",
    monitoringNotes: "",
    referralForm,
    followUpDate: "",
    followUpTime: "",
    followUpReason: "",
    chiefComplaint: "Cough for a week",
    carePlan: { continuedFollowUpTaskIds: [], continuedMonitoringIds: [], startConditionIds: [] },
    ...overrides,
  };
}

test("isLegacyDraftPayload is true unless the draft is stamped bhc_general_v2", () => {
  assert.equal(isLegacyDraftPayload(legacyDraft()), true);
  assert.equal(isLegacyDraftPayload({}), true);
  assert.equal(isLegacyDraftPayload({ consultationWorkflow: "bhc_general_v2" }), false);
  assert.equal(isLegacyDraftPayload({ consultationWorkflow: "something_else" }), true);
});

test("convertLegacyDraft: concerns with a destination become entries, the rest go to the notes", () => {
  const converted = convertLegacyDraft(legacyDraft());
  assert.equal(converted.consultationWorkflow, "bhc_general_v2");
  assert.deepEqual(converted.diagnoses, [{ id: "b", name: "Dengue", reportIn: ["notifiable", "surveillance"] }]);
  assert.equal(converted.assessmentNotes, "Earlier draft — Health concerns: Cough\nLooks pale");
  assert.equal(converted.carePlan.referToRhu, true);
  assert.equal(converted.carePlan.bhcFollowUp, false);
  assert.equal(converted.carePlan.referralMultipleIssues, false);
  assert.deepEqual(converted.referralForm, referralForm);
  assert.equal(converted.diagnosis, "");
  assert.equal(converted.chiefComplaint, "Cough for a week");
  for (const entry of converted.diagnoses) {
    assert.ok(!("carePlan" in entry));
    assert.ok(!("bhcFollowUp" in entry));
    assert.ok(!("conditionKey" in entry));
    assert.ok(Array.isArray(entry.reportIn));
  }
});

test("convertLegacyDraft: does not mutate the legacy payload", () => {
  const draft = legacyDraft();
  const snapshot = JSON.parse(JSON.stringify(draft));
  convertLegacyDraft(draft);
  assert.deepEqual(draft, snapshot);
});

test("convertLegacyDraft: a recheck concern ticks the BHC follow-up", () => {
  const converted = convertLegacyDraft(
    legacyDraft({ diagnoses: [{ id: "a", name: "Fever", carePlan: "recheck", reportAs: null }] }),
  );
  assert.equal(converted.carePlan.bhcFollowUp, true);
  assert.equal(converted.carePlan.referToRhu, false);
  assert.deepEqual(converted.diagnoses, []);
  assert.equal(converted.assessmentNotes, "Earlier draft — Health concerns: Fever\nLooks pale");
});

test("convertLegacyDraft: follow_up, a referral with bhcFollowUp, or a follow-up date tick the BHC follow-up", () => {
  const followUp = convertLegacyDraft(legacyDraft({ diagnoses: [{ id: "a", name: "Fever", carePlan: "follow_up" }] }));
  assert.equal(followUp.carePlan.bhcFollowUp, true);

  const referral = convertLegacyDraft(
    legacyDraft({ diagnoses: [{ id: "a", name: "Fever", carePlan: "refer", bhcFollowUp: true }] }),
  );
  assert.equal(referral.carePlan.bhcFollowUp, true);
  assert.equal(referral.carePlan.referToRhu, true);

  const plainRefer = convertLegacyDraft(legacyDraft());
  assert.equal(plainRefer.carePlan.bhcFollowUp, false);

  const dated = convertLegacyDraft(legacyDraft({ followUpDate: "2026-11-02", followUpTime: "09:00", followUpReason: "Recheck" }));
  assert.equal(dated.carePlan.bhcFollowUp, true);
  assert.equal(dated.followUpDate, "2026-11-02");
  assert.equal(dated.followUpTime, "09:00");
  assert.equal(dated.followUpReason, "Recheck");
});

test("convertLegacyDraft: monitor_refer and needsReferral tick Refer to RHU", () => {
  const monitorRefer = convertLegacyDraft(
    legacyDraft({ diagnoses: [{ id: "a", name: "Asthma", carePlan: "monitor_refer" }] }),
  );
  assert.equal(monitorRefer.carePlan.referToRhu, true);

  const needs = convertLegacyDraft(
    legacyDraft({ diagnoses: [{ id: "a", name: "Asthma", carePlan: "none" }], needsReferral: true }),
  );
  assert.equal(needs.carePlan.referToRhu, true);

  const none = convertLegacyDraft(legacyDraft({ diagnoses: [{ id: "a", name: "Asthma", carePlan: "none" }] }));
  assert.equal(none.carePlan.referToRhu, false);
});

test("convertLegacyDraft: a monitoring-only referral does not tick Refer to RHU", () => {
  const monitoringOnly = convertLegacyDraft(
    legacyDraft({
      diagnoses: [{ id: "a", name: "Asthma", carePlan: "none" }],
      needsReferral: true,
      carePlan: { continuedMonitoringIds: [7], monitoringReferrals: [7] },
    }),
  );
  assert.equal(monitoringOnly.carePlan.referToRhu, false);
  assert.deepEqual(monitoringOnly.carePlan.monitoringReferrals, [7]);

  const withReferConcern = convertLegacyDraft(
    legacyDraft({
      diagnoses: [{ id: "a", name: "Cough", carePlan: "refer" }],
      needsReferral: true,
      carePlan: { continuedMonitoringIds: [7], monitoringReferrals: [7] },
    }),
  );
  assert.equal(withReferConcern.carePlan.referToRhu, true);

  const emptyList = convertLegacyDraft(
    legacyDraft({ diagnoses: [{ id: "a", name: "Asthma", carePlan: "none" }], needsReferral: true, carePlan: { monitoringReferrals: [] } }),
  );
  assert.equal(emptyList.carePlan.referToRhu, true);
});

test("convertLegacyDraft: the converted care plan restores as the same checkbox state", () => {
  const converted = convertLegacyDraft(legacyDraft({ followUpDate: "2026-11-02" }));
  assert.deepEqual(restoreNextActions(converted.carePlan), {
    bhcFollowUp: true,
    referToRhu: true,
    referralMultipleIssues: false,
  });
});

test("convertLegacyDraft: monitoringNotes without monitoring move into the assessment notes", () => {
  const converted = convertLegacyDraft(legacyDraft({ monitoringNotes: "Mother says fever at night" }));
  assert.equal(
    converted.assessmentNotes,
    "Earlier draft — Health concerns: Cough\nLooks pale\nEarlier draft — Additional clinical notes: Mother says fever at night",
  );
  assert.equal(converted.monitoringNotes, "");
});

test("convertLegacyDraft: monitoringNotes with continued or starting monitoring are kept", () => {
  for (const carePlan of [{ continuedMonitoringIds: [7] }, { startConditionIds: [3] }]) {
    const converted = convertLegacyDraft(legacyDraft({ monitoringNotes: "BP stable", carePlan }));
    assert.equal(converted.monitoringNotes, "BP stable");
    assert.ok(!converted.assessmentNotes.includes("Additional clinical notes"));
    assert.deepEqual(converted.carePlan.continuedMonitoringIds, carePlan.continuedMonitoringIds);
    assert.deepEqual(converted.carePlan.startConditionIds, carePlan.startConditionIds);
  }
});

test("convertLegacyDraft: assessmentNotes is empty when there is nothing to keep", () => {
  const converted = convertLegacyDraft(
    legacyDraft({
      diagnoses: [{ id: "b", name: "Dengue", reportAs: "notifiable" }],
      diagnosis: "Dengue",
      assessmentNotes: "",
    }),
  );
  assert.equal(converted.assessmentNotes, "");
});

test("convertLegacyDraft: unnamed concerns are not emitted and not listed", () => {
  const converted = convertLegacyDraft(
    legacyDraft({
      diagnoses: [
        { id: "a", name: "  ", reportAs: "morbidity" },
        { id: "b", reportAs: "notifiable" },
        { id: "c", name: "Cough", carePlan: "none", reportAs: null },
      ],
    }),
  );
  assert.deepEqual(converted.diagnoses, []);
  assert.equal(converted.assessmentNotes, "Earlier draft — Health concerns: Cough\nLooks pale");
});

test("convertLegacyDraft: an entry without an id gets one", () => {
  const converted = convertLegacyDraft(legacyDraft({ diagnoses: [{ name: "Dengue", reportAs: "morbidity" }] }));
  assert.equal(converted.diagnoses.length, 1);
  assert.equal(typeof converted.diagnoses[0].id, "string");
  assert.ok(converted.diagnoses[0].id.length > 0);
});

test("convertLegacyDraft: a v2 payload is returned unchanged (same reference)", () => {
  const payload = { consultationWorkflow: "bhc_general_v2", diagnoses: [{ id: "x", name: "A", reportIn: [] }] };
  assert.equal(convertLegacyDraft(payload), payload);
});

test("convertLegacyDraft: a pre-per-diagnosis draft takes the visit-level status for each named entry", () => {
  const converted = convertLegacyDraft({
    morbidityReportingStatus: "morbidity",
    diagnoses: [
      { id: "a", name: "Asthma" },
      { id: "b", name: "Flu" },
      { id: "c", name: "" },
    ],
    diagnosis: "Asthma; Flu",
  });
  assert.deepEqual(converted.diagnoses, [
    { id: "a", name: "Asthma", reportIn: ["morbidity"] },
    { id: "b", name: "Flu", reportIn: ["morbidity"] },
  ]);
  assert.equal(converted.assessmentNotes, "");
});

test("convertLegacyDraft: a pre-per-diagnosis draft with no reporting status keeps the names in the notes", () => {
  const converted = convertLegacyDraft({
    morbidityReportingStatus: "not_included",
    diagnoses: [{ id: "a", name: "Asthma" }],
  });
  assert.deepEqual(converted.diagnoses, []);
  assert.equal(converted.assessmentNotes, "Earlier draft — Health concerns: Asthma");
});

test("convertLegacyDraft: a visit-level diagnosis with no concern list is not lost", () => {
  const converted = convertLegacyDraft({ diagnosis: "Acute bronchitis", morbidityReportingStatus: "not_included" });
  assert.equal(converted.diagnosis, "");
  assert.equal(converted.assessmentNotes, "Earlier draft — Health concerns: Acute bronchitis");

  const reported = convertLegacyDraft({ diagnosis: "Acute bronchitis", morbidityReportingStatus: "morbidity" });
  assert.equal(reported.diagnoses.length, 1);
  assert.equal(reported.diagnoses[0].name, "Acute bronchitis");
  assert.deepEqual(reported.diagnoses[0].reportIn, ["morbidity"]);
  assert.equal(reported.assessmentNotes, "");

  const long = convertLegacyDraft({ diagnosis: "x".repeat(200), morbidityReportingStatus: "morbidity" });
  assert.deepEqual(long.diagnoses, []);
  assert.equal(long.assessmentNotes, `Earlier draft — Health concerns: ${"x".repeat(200)}`);
});

const LABELS = /Earlier draft — (Health concerns|Additional clinical notes|continued): /g;

/** The worker's characters in the converted notes: labels and the joining newlines removed. */
function keptCharacters(converted) {
  return [converted.assessmentNotes, converted.monitoringNotes].join("\n").replace(LABELS, "").replace(/\n/g, "");
}

test("convertLegacyDraft: notes that fit 5000 characters are kept whole in the assessment notes", () => {
  const exact = convertLegacyDraft(legacyDraft({ diagnoses: [], diagnosis: "", assessmentNotes: "n".repeat(5000) }));
  assert.equal(exact.assessmentNotes, "n".repeat(5000));
  assert.equal(exact.monitoringNotes, "");
});

test("convertLegacyDraft: 4000 + 3000 characters lose nothing; the monitoring notes stay in monitoringNotes", () => {
  const assessment = "a".repeat(4000);
  const monitoring = "m".repeat(3000);
  const converted = convertLegacyDraft(legacyDraft({ assessmentNotes: assessment, monitoringNotes: monitoring }));

  assert.equal(converted.assessmentNotes, `Earlier draft — Health concerns: Cough\n${assessment}`);
  assert.equal(converted.monitoringNotes, `Earlier draft — Additional clinical notes: ${monitoring}`);
  assert.ok(!converted.assessmentNotes.includes("…"));
  // Every input character is kept: only labels were added.
  assert.equal(keptCharacters(converted), `Cough${assessment}${monitoring}`);
  assert.equal(keptCharacters(converted).length, "Cough".length + 4000 + 3000);
});

test("convertLegacyDraft: concerns and assessment notes over 5000 characters continue in monitoringNotes", () => {
  const assessment = "a".repeat(5000);
  const monitoring = "m".repeat(9000);
  const converted = convertLegacyDraft(legacyDraft({ assessmentNotes: assessment, monitoringNotes: monitoring }));

  assert.equal(converted.assessmentNotes.length, 5000);
  assert.ok(converted.assessmentNotes.startsWith("Earlier draft — Health concerns: Cough\naaa"));
  assert.ok(converted.monitoringNotes.startsWith("Earlier draft — continued: aaa"));
  assert.ok(converted.monitoringNotes.endsWith(`\nEarlier draft — Additional clinical notes: ${monitoring}`));
  assert.equal(keptCharacters(converted), `Cough${assessment}${monitoring}`);
});

test("convertLegacyDraft: with monitoring, the rest continues ahead of the worker's own monitoring notes", () => {
  const converted = convertLegacyDraft(
    legacyDraft({ assessmentNotes: "a".repeat(5000), monitoringNotes: "BP stable", carePlan: { continuedMonitoringIds: [7] } }),
  );
  assert.equal(converted.assessmentNotes.length, 5000);
  assert.ok(converted.monitoringNotes.startsWith("Earlier draft — continued: "));
  assert.ok(converted.monitoringNotes.endsWith("\nBP stable"));
  assert.equal(keptCharacters(converted), `Cough${"a".repeat(5000)}BP stable`);
});

test("convertLegacyDraft: never slices text away and never adds an ellipsis", () => {
  const cases = [
    [0, 0], [10, 10], [4000, 900], [4000, 3000], [4900, 200], [4999, 1], [5000, 0], [5000, 10000], [10, 10000],
  ];
  for (const [assessmentLength, monitoringLength] of cases) {
    for (const carePlan of [{}, { startConditionIds: [3] }]) {
      const assessment = "a".repeat(assessmentLength);
      const monitoring = "m".repeat(monitoringLength);
      const converted = convertLegacyDraft(legacyDraft({ assessmentNotes: assessment, monitoringNotes: monitoring, carePlan }));
      const label = `${assessmentLength} + ${monitoringLength} ${JSON.stringify(carePlan)}`;
      assert.ok(converted.assessmentNotes.length <= 5000, label);
      assert.ok(!`${converted.assessmentNotes}${converted.monitoringNotes}`.includes("…"), label);
      assert.equal(keptCharacters(converted), `Cough${assessment}${monitoring}`, label);
    }
  }
});

test("convertLegacyDraft: a split never breaks a surrogate pair", () => {
  // The concerns line and its newline take 39 units, so a high surrogate sits at index 4999.
  const assessment = "\u{1F600}".repeat(3000);
  const converted = convertLegacyDraft(legacyDraft({ assessmentNotes: assessment }));
  assert.equal(converted.assessmentNotes.length, 4999);
  assert.ok(!/[\uD800-\uDBFF]$/.test(converted.assessmentNotes));
  assert.ok(converted.monitoringNotes.startsWith("Earlier draft — continued: \u{1F600}"));
  assert.equal(keptCharacters(converted), `Cough${assessment}`);
});

test("convertLegacyDraft: is idempotent on its own output", () => {
  const once = convertLegacyDraft(legacyDraft());
  assert.equal(convertLegacyDraft(once), once);
});
