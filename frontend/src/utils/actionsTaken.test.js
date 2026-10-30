import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIONS_TAKEN_REQUIRED,
  actionsTakenErrors,
  hasDocumentedText,
  restoreActionsTakenText,
} from "./actionsTaken.js";

test("whitespace-only text is not documented", () => {
  assert.equal(hasDocumentedText(""), false);
  assert.equal(hasDocumentedText("   "), false);
  assert.equal(hasDocumentedText("\n\t"), false);
  assert.equal(hasDocumentedText("Wound care applied"), true);
  assert.equal(hasDocumentedText("Counseling provided"), true);
});

test("initial visit requires documented actions", () => {
  assert.deepEqual(actionsTakenErrors({ treatmentNotes: "" }), {
    actionsTaken: ACTIONS_TAKEN_REQUIRED,
  });
  assert.deepEqual(actionsTakenErrors({ treatmentNotes: "   " }), {
    actionsTaken: ACTIONS_TAKEN_REQUIRED,
  });
  assert.deepEqual(
    actionsTakenErrors({ treatmentNotes: "Wound care and counseling" }),
    {},
  );
});

test("follow-up visit uses the same actions-taken rule", () => {
  assert.deepEqual(
    actionsTakenErrors({ treatmentNotes: "", visitType: "follow_up_visit" }),
    { actionsTaken: ACTIONS_TAKEN_REQUIRED },
  );
  assert.deepEqual(
    actionsTakenErrors({
      treatmentNotes: "Reassessed wound; dressing changed",
      visitType: "follow_up_visit",
    }),
    {},
  );
});

test("medicines and structured services do not skip actions taken", () => {
  assert.deepEqual(
    actionsTakenErrors({
      treatmentNotes: "",
      dispensedMedicines: [{ medicineId: 12, quantity: 1 }],
    }),
    { actionsTaken: ACTIONS_TAKEN_REQUIRED },
  );
  assert.deepEqual(
    actionsTakenErrors({
      treatmentNotes: "",
      selectedPrograms: ["Maternal"],
    }),
    { actionsTaken: ACTIONS_TAKEN_REQUIRED },
  );
  assert.deepEqual(
    actionsTakenErrors({
      treatmentNotes: "Paracetamol given",
      dispensedMedicines: [{ medicine_id: 12, quantity: 1 }],
      selectedPrograms: ["EPI"],
    }),
    {},
  );
});

test("a no-intervention selection does not replace actions taken", () => {
  assert.deepEqual(
    actionsTakenErrors({
      treatmentNotes: "",
      noInterventionPerformed: true,
      noInterventionReason: "Patient declined treatment",
    }),
    { actionsTaken: ACTIONS_TAKEN_REQUIRED },
  );
});

test("resuming an older no-intervention draft keeps the reason as the note", () => {
  assert.equal(
    restoreActionsTakenText({
      treatmentNotes: "",
      noInterventionPerformed: true,
      noInterventionReason: "Patient declined treatment",
    }),
    "Patient declined treatment",
  );
  assert.equal(
    restoreActionsTakenText({
      treatmentNotes: "Wound care applied",
      noInterventionPerformed: true,
      noInterventionReason: "Patient declined treatment",
    }),
    "Wound care applied",
  );
  assert.equal(restoreActionsTakenText({ treatmentNotes: "" }), "");
});
