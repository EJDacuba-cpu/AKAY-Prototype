import test from "node:test";
import assert from "node:assert/strict";
import { calculateBmi } from "./bmi.js";
import {
  BP_PAIR_MESSAGE,
  BP_RANGE_MESSAGE,
  EMPTY_VITALS_REMINDER,
  HEIGHT_MESSAGE,
  PULSE_MESSAGE,
  SPO2_MESSAGE,
  TEMP_MESSAGE,
  WEIGHT_MESSAGE,
  areVitalSignsBlank,
  mergeVitalFieldErrors,
  vitalSignsErrors,
} from "./vitalSigns.js";

const blank = {
  systolicBp: "",
  diastolicBp: "",
  pulse: "",
  spo2: "",
  temp: "",
  weight: "",
  height: "",
  fbs: "",
};

test("blank optional vitals are valid", () => {
  assert.deepEqual(vitalSignsErrors(), {});
  assert.deepEqual(vitalSignsErrors(blank), {});
  assert.deepEqual(vitalSignsErrors({ ...blank, pulse: "  ", temp: null, fbs: undefined }), {});
  assert.equal(areVitalSignsBlank(), true);
  assert.equal(areVitalSignsBlank(blank), true);
  assert.equal(areVitalSignsBlank({ ...blank, pulse: "72" }), false);
  assert.match(EMPTY_VITALS_REMINDER, /No vital signs were recorded/);
});

test("unusual-but-plausible values pass encoding ceilings", () => {
  assert.deepEqual(
    vitalSignsErrors({
      systolicBp: "60",
      diastolicBp: "30",
      pulse: "220",
      spo2: "0",
      temp: "42",
      weight: "0.5",
      height: "40",
      fbs: "1000",
    }),
    {},
  );
  assert.deepEqual(
    vitalSignsErrors({
      pulse: "0",
      spo2: "100",
      temp: "10",
      weight: "500",
      height: "250",
      fbs: "0",
    }),
    {},
  );
});

test("encoding errors reject impossible typed values", () => {
  assert.deepEqual(vitalSignsErrors({ temp: "123" }), { temp: TEMP_MESSAGE });
  assert.deepEqual(vitalSignsErrors({ temp: "-1" }), { temp: TEMP_MESSAGE });
  assert.deepEqual(vitalSignsErrors({ pulse: "3123" }), { pulse: PULSE_MESSAGE });
  assert.deepEqual(vitalSignsErrors({ spo2: "101" }), { spo2: SPO2_MESSAGE });
  assert.deepEqual(vitalSignsErrors({ weight: "0" }), { weight: WEIGHT_MESSAGE });
  assert.deepEqual(vitalSignsErrors({ weight: "501" }), { weight: WEIGHT_MESSAGE });
  assert.deepEqual(vitalSignsErrors({ height: "0" }), { height: HEIGHT_MESSAGE });
  assert.deepEqual(vitalSignsErrors({ height: "251" }), { height: HEIGHT_MESSAGE });
  assert.deepEqual(vitalSignsErrors({ systolicBp: "301", diastolicBp: "80" }), {
    systolicBp: BP_RANGE_MESSAGE,
  });
});

test("an incomplete blood-pressure pair is rejected", () => {
  assert.deepEqual(vitalSignsErrors({ systolicBp: "120" }), {
    bloodPressure: BP_PAIR_MESSAGE,
  });
  assert.deepEqual(vitalSignsErrors({ diastolicBp: "80" }), {
    bloodPressure: BP_PAIR_MESSAGE,
  });
  assert.deepEqual(vitalSignsErrors({ systolicBp: "120", diastolicBp: "80" }), {});
});

test("BMI is derived from this visit's height and weight only", () => {
  assert.equal(calculateBmi(70, 170).toFixed(1), "24.2");
  assert.equal(calculateBmi("", 170), null);
  assert.equal(calculateBmi(70, ""), null);
  assert.equal(calculateBmi("abc", 170), null);
});

test("blur reveals a field error and a change to valid clears it", () => {
  const shown = mergeVitalFieldErrors({}, vitalSignsErrors({ pulse: "3123" }), "pulse", {
    reveal: true,
  });
  assert.deepEqual(shown, { pulse: PULSE_MESSAGE });
  const hidden = mergeVitalFieldErrors({}, vitalSignsErrors({ pulse: "3123" }), "pulse", {
    reveal: false,
  });
  assert.deepEqual(hidden, {});
  const cleared = mergeVitalFieldErrors(shown, vitalSignsErrors({ pulse: "88" }), "pulse");
  assert.deepEqual(cleared, {});
});
