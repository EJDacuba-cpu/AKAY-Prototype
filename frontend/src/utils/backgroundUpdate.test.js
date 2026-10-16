import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKGROUND_SECTION_FIELDS,
  BACKGROUND_SECTION_KEYS,
  BACKGROUND_SECTION_LABELS,
  allConflictsResolved,
  backgroundChangeRows,
  buildBackgroundUpdate,
  editedSectionKeys,
  markReviewed,
  newPatientReportedCondition,
  normalizeBackground,
  normalizeHouseholdEnvironment,
  overlayBackgroundUpdate,
  readBackgroundConflicts,
  restoreBackgroundUpdate,
  resolveBackgroundConflicts,
  reviewedSectionKeys,
  sliceBackground,
  toDraftBackgroundUpdate,
  toRecordBackgroundUpdate,
  unmarkReviewed,
} from "./backgroundUpdate.js";

const loaded = normalizeBackground({
  currentDiseases: [
    { name: "Migraine", yearDiagnosed: "2020", diagnosedWhere: "RHU", note: "", source: "Patient-reported", firstRecorded: "2026-01-02" },
  ],
  allergies: { noneKnown: false, items: [{ allergen: "Dust", reaction: "Sneezing" }] },
  hospitalizations: { none: true },
  familyHistory: { items: [{ condition: "Asthma", kind: "Chronic", relation: "Mother" }] },
  personalSocial: { smoking: { status: "never" }, alcohol: { status: "current", frequency: "weekly" } },
  obstetric: { menarcheAge: 12, pregnancies: [{ year: 2019, outcome: "liveBirth", delivery: "normal" }] },
  revisions: { medical: 3, family: 1, social: 0, obstetric: 2 },
});

function edit(change) {
  const edited = structuredClone(loaded);
  change(edited);
  return edited;
}

test("the four sections and their labels", () => {
  assert.deepEqual(BACKGROUND_SECTION_KEYS, ["medical", "family", "social", "obstetric"]);
  assert.equal(BACKGROUND_SECTION_LABELS.obstetric, "Obstetric & Menstrual History");
  BACKGROUND_SECTION_KEYS.forEach((section) => {
    assert.ok(BACKGROUND_SECTION_FIELDS[section].length > 0);
    BACKGROUND_SECTION_FIELDS[section].forEach((field) => {
      assert.equal(typeof field.read, "function");
      assert.equal(field.read(null), "");
    });
  });
});

test("each section slices to the API shape", () => {
  assert.deepEqual(Object.keys(sliceBackground(loaded, "medical")), ["currentDiseases", "allergies", "hospitalizations"]);
  assert.deepEqual(Object.keys(sliceBackground(loaded, "family")), ["familyHistory"]);
  assert.deepEqual(Object.keys(sliceBackground(loaded, "social")), ["personalSocial"]);
  assert.deepEqual(Object.keys(sliceBackground(loaded, "obstetric")), ["obstetric"]);

  const medical = sliceBackground(loaded, "medical");
  assert.deepEqual(medical.currentDiseases[0], {
    name: "Migraine",
    yearDiagnosed: 2020,
    diagnosedWhere: "RHU",
    note: "",
    source: "Patient-reported",
    firstRecorded: "2026-01-02",
  });
  assert.deepEqual(medical.hospitalizations, { none: true, items: [] });
  assert.deepEqual(sliceBackground(loaded, "social").personalSocial.smoking, {
    status: "never",
    sticksPerDay: null,
    years: null,
    quitYear: null,
  });
  assert.equal(sliceBackground(loaded, "obstetric").obstetric.pregnancies[0].year, 2019);
});

test("a staged condition never carries status, conditionKey or lastConfirmed", () => {
  const edited = edit((bg) => {
    bg.currentDiseases[0] = { ...bg.currentDiseases[0], status: "Active", conditionKey: "migraine", lastConfirmed: "2026-02-02" };
  });
  const [entry] = sliceBackground(edited, "medical").currentDiseases;
  assert.equal("status" in entry, false);
  assert.equal("conditionKey" in entry, false);
  assert.equal("lastConfirmed" in entry, false);
  assert.equal(buildBackgroundUpdate(loaded, edited), null);
});

test("nothing edited stages nothing", () => {
  assert.equal(buildBackgroundUpdate(loaded, structuredClone(loaded)), null);
});

test("whitespace, blank rows and server-owned fields are not edits", () => {
  const edited = edit((bg) => {
    bg.allergies.items[0].allergen = "  Dust ";
    bg.allergies.items.push({ allergen: "", reaction: "" });
    bg.currentDiseases[0].firstRecorded = "";
    bg.personalSocial.smoking.years = "";
  });
  assert.equal(buildBackgroundUpdate(loaded, edited), null);
});

test("only the edited section is staged, at the revision it was loaded at", () => {
  const edited = edit((bg) => {
    bg.personalSocial.smoking = { status: "former", sticksPerDay: "10", years: "5", quitYear: "2020" };
  });
  const update = buildBackgroundUpdate(loaded, edited);

  assert.deepEqual(editedSectionKeys(update), ["social"]);
  assert.deepEqual(update.baseRevisions, { social: 0 });
  assert.deepEqual(update.reviewed, []);
  assert.deepEqual(update.sections.social.personalSocial.smoking, {
    status: "former",
    sticksPerDay: 10,
    years: 5,
    quitYear: 2020,
  });
});

test("the obstetric section stages at its own revision", () => {
  const edited = edit((bg) => {
    bg.obstetric.menarcheAge = 13;
  });
  const update = buildBackgroundUpdate(loaded, edited);
  assert.deepEqual(editedSectionKeys(update), ["obstetric"]);
  assert.deepEqual(update.baseRevisions, { obstetric: 2 });
});

test("a section keeps its first base revision when the background is refetched", () => {
  const edited = edit((bg) => {
    bg.allergies.items[0].allergen = "Penicillin";
  });
  const first = buildBackgroundUpdate(loaded, edited);
  const refetched = { ...loaded, revisions: { ...loaded.revisions, medical: 4 } };

  assert.equal(buildBackgroundUpdate(refetched, edited, first).baseRevisions.medical, 3);
});

test("reverting a section un-stages it", () => {
  const edited = edit((bg) => {
    bg.allergies.items[0].allergen = "Penicillin";
  });
  const staged = buildBackgroundUpdate(loaded, edited);
  edited.allergies.items[0].allergen = "Dust";
  assert.equal(buildBackgroundUpdate(loaded, edited, staged), null);
});

test("previous reviewed sections are kept, and keep the update alive on their own", () => {
  const previous = markReviewed(null, ["family"]);
  const update = buildBackgroundUpdate(loaded, structuredClone(loaded), previous);
  assert.deepEqual(update, { sections: {}, baseRevisions: {}, reviewed: ["family"] });

  const edited = edit((bg) => {
    bg.allergies.noneKnown = true;
    bg.allergies.items = [];
  });
  assert.deepEqual(buildBackgroundUpdate(loaded, edited, previous).reviewed, ["family"]);
});

test("mark and unmark reviewed", () => {
  const marked = markReviewed(markReviewed(null, ["social", "medical"]), ["medical", "obstetric", "bogus"]);
  assert.deepEqual(reviewedSectionKeys(marked), ["medical", "social", "obstetric"]);

  const still = unmarkReviewed(marked, "social");
  assert.deepEqual(reviewedSectionKeys(still), ["medical", "obstetric"]);
  assert.equal(unmarkReviewed(markReviewed(null, ["family"]), "family"), null);

  const edited = buildBackgroundUpdate(
    loaded,
    edit((bg) => {
      bg.obstetric.menarcheAge = 14;
    }),
    markReviewed(null, ["family"]),
  );
  const cleared = unmarkReviewed(edited, "family");
  assert.deepEqual(editedSectionKeys(cleared), ["obstetric"]);
  assert.deepEqual(cleared.reviewed, []);
});

test("overlay shows staged sections over the loaded background", () => {
  const edited = edit((bg) => {
    bg.familyHistory.items.push({ condition: "Diabetes", kind: "Hereditary", relation: "Father", relativePatientId: null });
  });
  const overlaid = overlayBackgroundUpdate(loaded, buildBackgroundUpdate(loaded, edited));

  assert.equal(overlaid.familyHistory.items.length, 2);
  assert.equal(overlaid.allergies.items[0].allergen, "Dust");
});

test("change rows list only the fields that differ, as text", () => {
  const edited = edit((bg) => {
    bg.allergies.items[0].allergen = "Penicillin";
    bg.currentDiseases.push({ name: "Gout", yearDiagnosed: null, diagnosedWhere: "", note: "", source: "Patient-reported" });
  });

  assert.deepEqual(backgroundChangeRows(loaded, edited, "medical"), [
    {
      key: "currentDiseases",
      label: "Patient-reported Conditions",
      before: "Migraine (2020, RHU)",
      after: "Migraine (2020, RHU); Gout",
    },
    { key: "allergies", label: "Allergies", before: "Dust (Sneezing)", after: "Penicillin (Sneezing)" },
  ]);
  assert.deepEqual(backgroundChangeRows(loaded, edited, "family"), []);
});

test("change rows read a slice as well as a whole background, and read smoking with pack-years", () => {
  const rows = backgroundChangeRows(
    sliceBackground(loaded, "social"),
    { personalSocial: { smoking: { status: "current", sticksPerDay: 20, years: 10 }, alcohol: { status: "current", frequency: "weekly" } } },
    "social",
  );
  assert.deepEqual(rows.map((row) => [row.label, row.before, row.after]), [
    ["Smoking", "Never smoked", "Current smoker · 20 sticks/day · 10 yrs · 10 pack-yrs"],
  ]);
});

test("the record payload uses the API spelling, and nothing when empty", () => {
  const edited = edit((bg) => {
    bg.allergies.items[0].allergen = "Penicillin";
    bg.allergies.items.push({ allergen: "", reaction: "" });
  });
  const payload = toRecordBackgroundUpdate(buildBackgroundUpdate(loaded, edited));

  assert.deepEqual(payload.base_revisions, { medical: 3 });
  assert.deepEqual(payload.reviewed, []);
  assert.equal(payload.sections.medical.allergies.items.length, 1);
  assert.equal(payload.sections.medical.allergies.items[0].allergen, "Penicillin");
  assert.equal(toRecordBackgroundUpdate(null), undefined);
  assert.equal(toRecordBackgroundUpdate({ sections: {}, baseRevisions: {}, reviewed: [] }), undefined);
});

test("the draft payload drops completely blank rows but keeps half-filled ones", () => {
  const edited = edit((bg) => {
    bg.allergies.items.push({ allergen: "", reaction: "" });
    bg.allergies.items.push({ allergen: "", reaction: "Hives" });
  });
  const update = buildBackgroundUpdate(loaded, edited, markReviewed(null, ["family"]));
  const draft = toDraftBackgroundUpdate(update);

  assert.deepEqual(
    draft.sections.medical.allergies.items.map((item) => item.reaction),
    ["Sneezing", "Hives"],
  );
  assert.deepEqual(draft.baseRevisions, { medical: 3 });
  assert.deepEqual(draft.reviewed, ["family"]);
  assert.equal(update.sections.medical.allergies.items.length, 3, "the staged update itself is untouched");
  assert.deepEqual(restoreBackgroundUpdate(JSON.parse(JSON.stringify(draft))).sections.medical.allergies.items.length, 2);
  assert.equal(toDraftBackgroundUpdate(null), null);
  assert.equal(toDraftBackgroundUpdate({ sections: {}, baseRevisions: {}, reviewed: [] }), null);
});

test("a reviewed-only update sends reviewed and no sections or base revisions", () => {
  const payload = toRecordBackgroundUpdate(markReviewed(null, ["family", "social"]));
  assert.deepEqual(payload, { reviewed: ["family", "social"] });
  assert.equal("sections" in payload, false);
  assert.equal("base_revisions" in payload, false);
});

test("an edited and reviewed update sends both", () => {
  const edited = edit((bg) => {
    bg.obstetric.menarcheAge = 14;
  });
  const payload = toRecordBackgroundUpdate(buildBackgroundUpdate(loaded, edited, markReviewed(null, ["family"])));
  assert.deepEqual(payload.reviewed, ["family"]);
  assert.deepEqual(Object.keys(payload.sections), ["obstetric"]);
  assert.deepEqual(payload.base_revisions, { obstetric: 2 });
});

test("only a background conflict 409 is read as one", () => {
  const conflicts = [{ section: "medical", revision: 4, current: {} }];
  assert.deepEqual(readBackgroundConflicts({ status: 409, payload: { code: "PATIENT_BACKGROUND_CONFLICT", conflicts } }), conflicts);
  assert.equal(readBackgroundConflicts({ status: 409, payload: { code: "CONDITION_MONITORING_CONFLICT" } }), null);
  assert.equal(readBackgroundConflicts({ status: 500 }), null);
});

test("conflict choices rebase kept sections and drop the others", () => {
  const update = {
    sections: { medical: sliceBackground(loaded, "medical"), social: sliceBackground(loaded, "social") },
    baseRevisions: { medical: 3, social: 0 },
    reviewed: [],
  };
  const conflicts = [{ section: "medical", revision: 5 }, { section: "social", revision: 1 }];

  assert.equal(allConflictsResolved(conflicts, { medical: "mine" }), false);
  assert.equal(allConflictsResolved(conflicts, { medical: "mine", social: "latest" }), true);

  const resolved = resolveBackgroundConflicts(update, conflicts, { medical: "mine", social: "latest" });
  assert.deepEqual(resolved.baseRevisions, { medical: 5 });
  assert.deepEqual(editedSectionKeys(resolved), ["medical"]);
  assert.equal(resolveBackgroundConflicts(update, conflicts, { medical: "latest", social: "latest" }), null);
});

test("dropping every edit keeps what was only reviewed", () => {
  const update = { ...markReviewed(null, ["family"]), sections: { medical: sliceBackground(loaded, "medical") }, baseRevisions: { medical: 3 } };
  const resolved = resolveBackgroundConflicts(update, [{ section: "medical", revision: 4 }], { medical: "latest" });
  assert.deepEqual(resolved, { sections: {}, baseRevisions: {}, reviewed: ["family"] });
});

test("a new condition is patient-reported: name and detail, no status", () => {
  assert.deepEqual(newPatientReportedCondition("  Migraine ", " since 2020 "), {
    name: "Migraine",
    yearDiagnosed: null,
    diagnosedWhere: "",
    note: "since 2020",
    source: "Patient-reported",
  });
  assert.equal(newPatientReportedCondition("Gout", "", { yearDiagnosed: "2018", diagnosedWhere: " RHU " }).yearDiagnosed, 2018);
  assert.equal(newPatientReportedCondition("   "), null);
});

test("adding a patient-reported condition stages the medical section", () => {
  const edited = edit((bg) => {
    bg.currentDiseases.push(newPatientReportedCondition("Gout", "since 2018"));
  });
  const update = buildBackgroundUpdate(loaded, edited);
  const [kept, added] = update.sections.medical.currentDiseases;

  assert.deepEqual(editedSectionKeys(update), ["medical"]);
  assert.deepEqual(kept, sliceBackground(loaded, "medical").currentDiseases[0]);
  assert.equal(added.name, "Gout");
  assert.equal("status" in added, false);
});

test("restore drops old-shape updates", () => {
  assert.equal(restoreBackgroundUpdate({ sections: { medical: { allergies: "Dust" } }, baseRevisions: { medical: 1 } }), null);
  assert.equal(restoreBackgroundUpdate({ sections: { medical: { hospitalizations: "" } }, baseRevisions: {} }), null);
  assert.equal(restoreBackgroundUpdate({ sections: { medical: { surgeries: "x" } }, baseRevisions: {} }), null);
  assert.equal(
    restoreBackgroundUpdate({ sections: { family: { familyHistory: { similarIllness: "x" } } }, baseRevisions: { family: 1 } }),
    null,
  );
  assert.equal(
    restoreBackgroundUpdate({ sections: { social: { personalSocial: { smoking: "Never" } } }, baseRevisions: { social: 1 } }),
    null,
  );
});

test("restore drops on-device drafts whose conditions still carry status, conditionKey or lastConfirmed", () => {
  for (const extra of [{ status: "" }, { conditionKey: null }, { lastConfirmed: "" }]) {
    const raw = {
      sections: { medical: { currentDiseases: [{ name: "Asthma", note: "", ...extra }] } },
      baseRevisions: { medical: 1 },
    };
    assert.equal(restoreBackgroundUpdate(raw), null);
  }
});

test("restore drops updates with any key outside the new shape (null-valued old fields, old notes)", () => {
  const shapes = [
    {
      medical: {
        currentDiseases: [{ name: "Asthma", status: "Confirmed", conditionKey: "asthma" }],
        allergies: null,
        hospitalizations: null,
        surgeries: null,
      },
    },
    { medical: { allergies: null, surgeries: null } },
    { social: { personalSocial: { notes: "x" } } },
    { social: { personalSocial: { diet: { highSalt: true, salt: "low" } } } },
    { family: { familyHistory: { chronicIllness: null } } },
    { medical: { hospitalizations: { items: "Appendectomy" } } },
  ];
  for (const sections of shapes) {
    assert.equal(restoreBackgroundUpdate({ sections, baseRevisions: {} }), null, JSON.stringify(sections));
  }
});

test("a full pre-ITR update is dropped", () => {
  const raw = {
    sections: {
      medical: {
        currentDiseases: [
          {
            name: "Hypertension",
            note: "",
            status: "Confirmed",
            firstRecorded: "2026-05-01",
            lastConfirmed: "2026-06-01",
            source: "Consultation",
            conditionKey: "hypertension",
          },
        ],
        allergies: "",
        hospitalizations: "",
        surgeries: "",
      },
      family: { familyHistory: { similarIllness: "", chronicIllness: "Diabetes", hereditaryIllness: "" } },
      social: { personalSocial: { diet: "", smoking: "Never", alcohol: "", notes: "x" } },
    },
    baseRevisions: { medical: 1, family: 0, social: 0 },
  };
  assert.equal(restoreBackgroundUpdate(raw), null);
});

test("restore keeps a new-shape update and fills what the server dropped", () => {
  const raw = {
    sections: {
      social: { personalSocial: { diet: { highSalt: true }, smoking: { status: "current", sticksPerDay: 10 } } },
      medical: { allergies: { items: [{ allergen: "Dust" }] } },
    },
    baseRevisions: { social: 1, medical: "2" },
    reviewed: ["family", "nonsense"],
  };
  const restored = restoreBackgroundUpdate(raw);

  assert.deepEqual(editedSectionKeys(restored), ["medical", "social"]);
  assert.deepEqual(restored.baseRevisions, { medical: 2, social: 1 });
  assert.deepEqual(restored.reviewed, ["family"]);
  assert.equal(restored.sections.social.personalSocial.diet.fatty, false);
  assert.equal(restored.sections.social.personalSocial.smoking.years, null);
  assert.deepEqual(restored.sections.medical.allergies, { noneKnown: false, items: [{ allergen: "Dust", reaction: "" }] });
  assert.deepEqual(restored.sections.medical.hospitalizations, { none: false, items: [] });
});

test("restore of nothing useful is null", () => {
  for (const raw of [null, undefined, "text", [], {}, { sections: {}, baseRevisions: {}, reviewed: [] }]) {
    assert.equal(restoreBackgroundUpdate(raw), null);
  }
  assert.deepEqual(restoreBackgroundUpdate({ reviewed: ["social"] }), { sections: {}, baseRevisions: {}, reviewed: ["social"] });
});

test("a built update survives a restore unchanged", () => {
  const edited = edit((bg) => {
    bg.personalSocial.diet.highSalt = true;
    bg.obstetric.regularity = "regular";
  });
  const update = buildBackgroundUpdate(loaded, edited, markReviewed(null, ["family"]));
  assert.deepEqual(restoreBackgroundUpdate(JSON.parse(JSON.stringify(update))), update);
});

test("the normalizer gives the full shape for null, empty and old string-shaped input", () => {
  for (const source of [null, undefined, {}, "text", { allergies: "Dust" }, { familyHistory: { similarIllness: "x" } }, { personalSocial: { smoking: "Never" } }]) {
    const background = normalizeBackground(source);
    assert.deepEqual(background.currentDiseases, []);
    assert.deepEqual(background.allergies, { noneKnown: false, items: [] });
    assert.deepEqual(background.hospitalizations, { none: false, items: [] });
    assert.deepEqual(background.familyHistory, { noneKnown: false, items: [] });
    assert.equal(background.personalSocial.smoking.status, "");
    assert.deepEqual(background.personalSocial.environment.exposures, []);
    assert.deepEqual(background.obstetric.pregnancies, []);
    assert.deepEqual(background.obstetric.symptoms, []);
    assert.deepEqual(background.revisions, { medical: 0, family: 0, social: 0, obstetric: 0 });
    assert.deepEqual(background.updatedAt, { medical: "", family: "", social: "", obstetric: "" });
    assert.deepEqual(background.reviewedAt, { medical: null, family: null, social: null, obstetric: null });
  }
});

test("the normalizer reads a missing flag as false and coerces numeric strings", () => {
  const background = normalizeBackground({
    personalSocial: { diet: { notes: "Rice" }, smoking: { status: "former", sticksPerDay: "10", years: "", quitYear: "2020" } },
    hospitalizations: { items: [{ type: "Surgery", year: "2018", reason: "Appendectomy" }] },
    obstetric: {
      menarcheAge: "12",
      menopauseAge: "50",
      intervalDays: "28",
      durationDays: "5",
      pregnancies: [{ year: "2019", outcome: "liveBirth" }],
    },
    currentDiseases: [{ name: "Gout", yearDiagnosed: "2015" }],
    revisions: { medical: "2", obstetric: 1 },
    updatedAt: { social: "2026-03-04" },
    reviewedAt: { family: { date: "2026-03-05", facility: "RHU Bulakan", by: 7 }, social: {} },
  });

  assert.equal(background.personalSocial.diet.highSalt, false);
  assert.deepEqual(background.personalSocial.smoking, { status: "former", sticksPerDay: 10, years: null, quitYear: 2020 });
  assert.equal(background.hospitalizations.items[0].year, 2018);
  assert.equal(background.hospitalizations.none, false);
  assert.equal(background.obstetric.menarcheAge, 12);
  assert.equal(background.obstetric.menopauseAge, 50);
  assert.equal(background.obstetric.intervalDays, 28);
  assert.equal(background.obstetric.durationDays, 5);
  assert.equal(background.obstetric.pregnancies[0].year, 2019);
  assert.equal(background.currentDiseases[0].yearDiagnosed, 2015);
  assert.equal(background.revisions.medical, 2);
  assert.equal(background.updatedAt.social, "2026-03-04");
  assert.deepEqual(background.reviewedAt.family, { date: "2026-03-05", facility: "RHU Bulakan", by: 7 });
  assert.equal(background.reviewedAt.social, null);
});

test("normalizing is idempotent", () => {
  assert.deepEqual(normalizeBackground(loaded), loaded);
});

test("the household environment is optional and its date may be null", () => {
  assert.equal(normalizeHouseholdEnvironment(undefined), null);
  assert.equal(normalizeHouseholdEnvironment(null), null);
  assert.equal(normalizeHouseholdEnvironment({ patientId: 3 }), null);

  const found = normalizeHouseholdEnvironment({
    environment: { waterSource: "Level II", exposures: ["secondhandSmoke"] },
    patientId: 9,
    patientName: "Ana Cruz",
    date: null,
  });
  assert.equal(found.date, null);
  assert.equal(found.patientName, "Ana Cruz");
  assert.equal(found.environment.waterSource, "Level II");
  assert.equal(found.environment.toilet, "");
});
