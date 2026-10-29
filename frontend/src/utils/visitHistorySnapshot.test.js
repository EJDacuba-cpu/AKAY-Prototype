import assert from "node:assert/strict";
import test from "node:test";

import {
  visitHistoryInformantLine,
  visitHistorySectionKeys,
  visitHistorySimilarIllnessLine,
  visitHistorySnapshot,
} from "./visitHistorySnapshot.js";

test("a missing snapshot is null so Details can show unavailable instead of live background", () => {
  assert.equal(visitHistorySnapshot(null), null);
  assert.equal(visitHistorySnapshot({}), null);
  assert.equal(visitHistorySnapshot({ historySnapshot: { changes: [] } }), null);
});

test("section order is Family, Past Medical, Social, then obstetric when present", () => {
  const snapshot = visitHistorySnapshot({
    history_snapshot: {
      sections: {
        obstetric: { obstetric: { menarcheAge: 13 } },
        social: { personalSocial: { smoking: { status: "never" } } },
        medical: { allergies: { noneKnown: true } },
        family: { familyHistory: { noneKnown: true } },
      },
      changes: [],
    },
  });
  assert.deepEqual(visitHistorySectionKeys(snapshot), ["family", "medical", "social", "obstetric"]);
});

test("visit answers come from the record, never from live background", () => {
  assert.equal(visitHistoryInformantLine({ informant: { relation: "Mother", name: " Ana " } }), "Mother · Ana");
  assert.equal(
    visitHistorySimilarIllnessLine({ similar_illness: { answer: "Yes", who: "Brother", note: "Cough" } }),
    "Yes · Brother · Cough",
  );
  assert.equal(visitHistoryInformantLine({ medicalBackground: { informant: { relation: "Father" } } }), "");
});
