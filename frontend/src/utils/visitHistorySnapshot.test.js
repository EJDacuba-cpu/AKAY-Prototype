import assert from "node:assert/strict";
import test from "node:test";

import { visitHistoryChangeRows, visitHistorySectionKeys, visitHistorySnapshot } from "./visitHistorySnapshot.js";

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

test("change rows are Previous → New and omit BHC education fields", () => {
  const rows = visitHistoryChangeRows({
    section: "social",
    before: { personalSocial: { smoking: { status: "never" }, education: { level: "High School" } } },
    after: { personalSocial: { smoking: { status: "former", quitYear: 2024 }, education: { level: "College" } } },
  });
  assert.deepEqual(rows.map((row) => row.key), ["smoking"]);
  assert.match(rows[0].before, /Never/);
  assert.match(rows[0].after, /Former/);
});
