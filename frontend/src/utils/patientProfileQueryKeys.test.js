import test from "node:test";
import assert from "node:assert/strict";

import { queryKeys } from "./queryKeys.js";

test("RHU profile cache keys stay on the rhu namespace and do not share BHC follow-ups", () => {
  assert.deepEqual(queryKeys.patientDetails("rhu", "9"), ["patient-details", "rhu", "9"]);
  assert.deepEqual(
    [...queryKeys.healthRecords("rhu"), "patient", "9"],
    ["health-records", "rhu", "patient", "9"],
  );
  assert.deepEqual(
    [...queryKeys.referrals("rhu"), "patient", "9"],
    ["referrals", "rhu", "patient", "9"],
  );
  assert.notDeepEqual(queryKeys.followUpTasks("rhu"), queryKeys.followUpTasks("bhc"));
});
