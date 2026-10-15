import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAllergies,
  formatAlcohol,
  formatCycle,
  formatDiet,
  formatEducation,
  formatEnvironment,
  formatFamilyHistory,
  formatHospitalizations,
  formatPatientReported,
  formatPregnancies,
  formatSexual,
  formatSmoking,
  formatSymptoms,
} from "./backgroundFormat.js";

const EVERY_FORMATTER = {
  formatAllergies,
  formatHospitalizations,
  formatFamilyHistory,
  formatEducation,
  formatSmoking,
  formatAlcohol,
  formatDiet,
  formatSexual,
  formatEnvironment,
  formatCycle,
  formatSymptoms,
  formatPregnancies,
  formatPatientReported,
};

test("every formatter returns empty text for null, undefined, legacy strings and empty objects", () => {
  for (const [name, format] of Object.entries(EVERY_FORMATTER)) {
    assert.equal(format(null), "", `${name}(null)`);
    assert.equal(format(undefined), "", `${name}(undefined)`);
    assert.equal(format("Penicillin"), "", `${name}(legacy string)`);
    assert.equal(format(""), "", `${name}(empty string)`);
    assert.equal(format({}), "", `${name}({})`);
    assert.equal(format([]), "", `${name}([])`);
    assert.equal(format(42), "", `${name}(number)`);
  }
});

test("formatAllergies", () => {
  assert.equal(formatAllergies({ noneKnown: true, items: [] }), "No known allergies");
  assert.equal(
    formatAllergies({ items: [{ allergen: "Penicillin", reaction: "Rash" }] }),
    "Penicillin (Rash)",
  );
  assert.equal(
    formatAllergies({
      items: [{ allergen: "Penicillin" }, { allergen: "Shrimp", reaction: "Hives" }],
    }),
    "Penicillin, Shrimp (Hives)",
  );
  assert.equal(formatAllergies({ noneKnown: false, items: [] }), "");
});

test("formatHospitalizations", () => {
  assert.equal(formatHospitalizations({ none: true, items: [] }), "None");
  assert.equal(
    formatHospitalizations({
      items: [
        { type: "Hospitalization", year: 2018, reason: "Dengue", place: "District Hospital" },
        { type: "Surgery", year: 2020, reason: "Appendectomy" },
        { type: "Surgery" },
      ],
    }),
    "Hospitalization 2018: Dengue, District Hospital; Surgery 2020: Appendectomy; Surgery",
  );
});

test("formatFamilyHistory", () => {
  assert.equal(formatFamilyHistory({ noneKnown: true, items: [] }), "None known");
  assert.equal(
    formatFamilyHistory({
      items: [
        { condition: "Hypertension", kind: "Chronic", relation: "Mother" },
        { condition: "Asthma", relation: "Sibling" },
        { condition: "Diabetes" },
        { relation: "Father" },
      ],
    }),
    "Hypertension (Chronic, Mother); Asthma (Sibling); Diabetes",
  );
});

test("formatEducation", () => {
  assert.equal(formatEducation({ level: "College", completed: "Graduate" }), "College (Graduate)");
  assert.equal(formatEducation({ level: "High School", completed: "Level" }), "High School (Level)");
  assert.equal(formatEducation({ level: "None" }), "None");
  assert.equal(formatEducation({ completed: "Graduate" }), "");
});

test("formatSmoking", () => {
  assert.equal(formatSmoking({ status: "never" }), "Never smoked");
  assert.ok(formatSmoking({ status: "current", sticksPerDay: 5, years: 8 }).includes("5 sticks/day"));
  assert.equal(
    formatSmoking({ status: "current", sticksPerDay: 5, years: 8 }),
    "Current smoker · 5 sticks/day · 8 yrs",
  );
  assert.equal(
    formatSmoking({ status: "current", sticksPerDay: 5, years: 8 }, 2),
    "Current smoker · 5 sticks/day · 8 yrs · 2 pack-yrs",
  );
  assert.equal(
    formatSmoking({ status: "former", sticksPerDay: 10, years: 4, quitYear: 2019 }, 2),
    "Former smoker · 10 sticks/day · 4 yrs · quit 2019 · 2 pack-yrs",
  );
  assert.equal(formatSmoking({ status: "current" }, null), "Current smoker");
  assert.equal(formatSmoking({ status: "never" }, 3), "Never smoked");
  assert.equal(formatSmoking({ sticksPerDay: 5 }), "");
  assert.equal(
    formatSmoking({ status: "current", years: 1 }, 0),
    "Current smoker · 1 yr · 0 pack-yrs",
  );
});

test("formatAlcohol", () => {
  assert.equal(formatAlcohol({ status: "never" }), "Does not drink");
  assert.equal(formatAlcohol({ status: "former" }), "Former drinker");
  assert.equal(formatAlcohol({ status: "current", frequency: "weekly" }), "Current drinker · weekly");
  assert.equal(formatAlcohol({ status: "current" }), "Current drinker");
  assert.equal(formatAlcohol({ frequency: "daily" }), "");
});

test("formatDiet treats a missing flag as false", () => {
  assert.equal(
    formatDiet({ highSalt: true, lowFruitVeg: true }),
    "High salt, low fruit and vegetables",
  );
  assert.equal(
    formatDiet({
      highSalt: true,
      fatty: true,
      sweetDrinks: true,
      lowFruitVeg: true,
      notes: "Eats late",
    }),
    "High salt, fatty foods, sweet drinks, low fruit and vegetables · Eats late",
  );
  assert.equal(formatDiet({ notes: "Mostly fish" }), "Mostly fish");
  assert.equal(formatDiet({ highSalt: false }), "");
});

test("formatSexual", () => {
  assert.equal(formatSexual({ active: "yes" }), "Sexually active");
  assert.equal(
    formatSexual({ active: "no", notes: "Not currently" }),
    "Not sexually active · Not currently",
  );
  assert.equal(formatSexual({ active: "declined" }), "Declined to answer");
  assert.equal(formatSexual({ notes: "x" }), "x");
});

test("formatEnvironment", () => {
  assert.equal(
    formatEnvironment({
      waterSource: "Level II",
      toilet: "Pit latrine",
      exposures: ["secondhandSmoke", "biomassCooking"],
      notes: "Near highway",
    }),
    "Water: Level II · Toilet: Pit latrine · Secondhand smoke, Biomass cooking · Near highway",
  );
  assert.equal(
    formatEnvironment({ exposures: ["industrialPollution", "bogus"] }),
    "Industrial pollution",
  );
  assert.equal(formatEnvironment({ waterSource: "Level I" }), "Water: Level I");
});

test("formatCycle", () => {
  assert.equal(
    formatCycle({
      menarcheAge: 12,
      menstrualStatus: "menstruating",
      intervalDays: 28,
      durationDays: 5,
      amount: "moderate",
      regularity: "regular",
    }),
    "Menarche at 12 · Menstruating · every 28 days · lasts 5 days · moderate flow · regular",
  );
  assert.equal(formatCycle({ menstrualStatus: "menopause", menopauseAge: 51 }), "Menopause at 51");
  assert.equal(formatCycle({ menstrualStatus: "menopause" }), "Menopause");
  assert.equal(formatCycle({ intervalDays: 1, durationDays: 1 }), "every 1 day · lasts 1 day");
  assert.equal(formatCycle({ symptoms: ["headache"] }), "");
});

test("formatSymptoms", () => {
  assert.equal(
    formatSymptoms({ symptoms: ["dysmenorrhea", "moodChanges"], symptomNotes: "Worse on day 1" }),
    "Dysmenorrhea, Mood changes · Worse on day 1",
  );
  assert.equal(formatSymptoms({ symptomNotes: "Cramps" }), "Cramps");
  assert.equal(formatSymptoms({ symptoms: ["unknown"] }), "");
});

test("formatPregnancies", () => {
  const list = [
    { year: 2019, outcome: "liveBirth", delivery: "normal" },
    { year: 2021, outcome: "miscarriage" },
  ];
  assert.equal(formatPregnancies(list), "G2 P1: 2019 live birth (normal), 2021 miscarriage");
  assert.ok(formatPregnancies(list).startsWith("G2 P1"));
  assert.equal(
    formatPregnancies([
      { year: 2015, outcome: "liveBirth", delivery: "cesarean", place: "Provincial Hospital" },
      { outcome: "stillbirth", delivery: "notApplicable" },
      { year: 2022 },
    ]),
    "G3 P2: 2015 live birth (cesarean, Provincial Hospital), stillbirth, 2022 outcome not recorded",
  );
});

test("formatPatientReported", () => {
  assert.equal(
    formatPatientReported([
      {
        name: "Hypertension",
        yearDiagnosed: 2020,
        diagnosedWhere: "Private clinic",
        note: "On meds",
      },
      { name: "Asthma" },
      { yearDiagnosed: 2001 },
    ]),
    "Hypertension (2020, Private clinic) - On meds; Asthma",
  );
});
