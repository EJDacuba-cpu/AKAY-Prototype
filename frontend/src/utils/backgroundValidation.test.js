import assert from "node:assert/strict";
import test from "node:test";

import {
  backgroundUpdateErrors,
  historyFieldError,
} from "./backgroundValidation.js";
import {
  buildBackgroundUpdate,
  normalizeBackground,
  restoreBackgroundUpdate,
  toDraftBackgroundUpdate,
  toRecordBackgroundUpdate,
} from "./backgroundUpdate.js";

const loaded = normalizeBackground({
  personalSocial: { smoking: { status: "never" } },
  revisions: { medical: 0, family: 0, social: 0, obstetric: 0 },
});

function socialUpdate(smoking) {
  const edited = structuredClone(loaded);
  edited.personalSocial = { ...edited.personalSocial, smoking };
  return buildBackgroundUpdate(loaded, edited);
}

test("blank smoking detail stays optional; 0 and 101 fail the sticks-per-day range", () => {
  assert.deepEqual(backgroundUpdateErrors(null), {});
  assert.deepEqual(backgroundUpdateErrors(socialUpdate({ status: "current", sticksPerDay: null, years: null })), {});
  assert.deepEqual(backgroundUpdateErrors(socialUpdate({ status: "former", sticksPerDay: "", years: "" })), {});
  assert.deepEqual(backgroundUpdateErrors(socialUpdate({ status: "never" })), {});
  assert.deepEqual(backgroundUpdateErrors(socialUpdate({ status: "current", sticksPerDay: 10, years: 0 })), {});

  const zero = backgroundUpdateErrors(socialUpdate({ status: "current", sticksPerDay: 0, years: 5 }));
  assert.equal(
    zero["background_update.sections.social.personalSocial.smoking.sticksPerDay"],
    "Sticks per day must be between 1 and 100.",
  );
  const high = backgroundUpdateErrors(socialUpdate({ status: "current", sticksPerDay: 101 }));
  assert.equal(
    high["background_update.sections.social.personalSocial.smoking.sticksPerDay"],
    "Sticks per day must be between 1 and 100.",
  );
});

test("years 0 is valid; years 81 and quit year 1899 are not", () => {
  assert.deepEqual(
    backgroundUpdateErrors(socialUpdate({ status: "former", sticksPerDay: 5, years: 0, quitYear: 2020 })),
    {},
  );
  assert.equal(
    backgroundUpdateErrors(socialUpdate({ status: "former", years: 81 }))[
      "background_update.sections.social.personalSocial.smoking.years"
    ],
    "Years smoked must be between 0 and 80.",
  );
  assert.equal(
    backgroundUpdateErrors(socialUpdate({ status: "former", quitYear: 1899 }))[
      "background_update.sections.social.personalSocial.smoking.quitYear"
    ],
    "Year quit must be between 1900 and 2100.",
  );
});

test("an unedited background and a valid existing smoking value do not error", () => {
  const withSmoking = normalizeBackground({
    personalSocial: { smoking: { status: "current", sticksPerDay: 8, years: 4 } },
    revisions: { social: 2 },
  });
  assert.equal(buildBackgroundUpdate(withSmoking, withSmoking), null);
  assert.deepEqual(backgroundUpdateErrors(null), {});
  const edited = structuredClone(withSmoking);
  edited.personalSocial.alcohol = { status: "never", frequency: "" };
  const update = buildBackgroundUpdate(withSmoking, edited);
  assert.deepEqual(backgroundUpdateErrors(update), {});
});

test("Interview can check social without obstetric, and obstetric stays on its own step", () => {
  const edited = structuredClone(loaded);
  edited.personalSocial.smoking = { status: "current", sticksPerDay: 0 };
  edited.obstetric = { menarcheAge: 40 };
  const update = buildBackgroundUpdate(loaded, edited);
  const interview = backgroundUpdateErrors(update, { sections: ["family", "medical", "social"] });
  assert.equal(
    interview["background_update.sections.social.personalSocial.smoking.sticksPerDay"],
    "Sticks per day must be between 1 and 100.",
  );
  assert.equal(interview["background_update.sections.obstetric.obstetric.menarcheAge"], undefined);
  const obstetric = backgroundUpdateErrors(update, { sections: ["obstetric"] });
  assert.equal(
    obstetric["background_update.sections.obstetric.obstetric.menarcheAge"],
    "Age at first period must be between 6 and 25.",
  );
  assert.equal(obstetric["background_update.sections.social.personalSocial.smoking.sticksPerDay"], undefined);
});

test("half-filled history rows fail; completely blank rows are dropped and stay valid", () => {
  const edited = structuredClone(loaded);
  edited.hospitalizations = { none: false, items: [{ type: "", year: 2019, reason: "", place: "" }] };
  edited.allergies = { noneKnown: false, items: [{ allergen: "", reaction: "Hives" }] };
  const update = buildBackgroundUpdate(loaded, edited);
  const errors = backgroundUpdateErrors(update, { sections: ["medical"] });
  assert.equal(errors["background_update.sections.medical.hospitalizations.items.0.type"], "Enter the type.");
  assert.equal(errors["background_update.sections.medical.allergies.items.0.allergen"], "Enter the allergen.");

  const blank = structuredClone(loaded);
  blank.hospitalizations = { none: false, items: [{ type: "", year: null, reason: "", place: "" }] };
  assert.deepEqual(backgroundUpdateErrors(buildBackgroundUpdate(loaded, blank), { sections: ["medical"] }), {});
});

test("draft and record payloads keep an invalid 0, and a restored draft still fails Next", () => {
  const update = socialUpdate({ status: "current", sticksPerDay: 0, years: 5 });
  assert.equal(toRecordBackgroundUpdate(update).sections.social.personalSocial.smoking.sticksPerDay, 0);
  assert.equal(toDraftBackgroundUpdate(update).sections.social.personalSocial.smoking.sticksPerDay, 0);
  const restored = restoreBackgroundUpdate(toDraftBackgroundUpdate(update));
  assert.equal(restored.sections.social.personalSocial.smoking.sticksPerDay, 0);
  assert.equal(
    backgroundUpdateErrors(restored)["background_update.sections.social.personalSocial.smoking.sticksPerDay"],
    "Sticks per day must be between 1 and 100.",
  );
});

test("historyFieldError reads a string or the first array item", () => {
  assert.equal(historyFieldError(undefined, "x"), "");
  assert.equal(
    historyFieldError(
      { "background_update.sections.social.personalSocial.smoking.sticksPerDay": "Sticks per day must be between 1 and 100." },
      "background_update.sections.social.personalSocial.smoking.sticksPerDay",
    ),
    "Sticks per day must be between 1 and 100.",
  );
  assert.equal(historyFieldError({ a: ["First.", "Second."] }, "a"), "First.");
});
