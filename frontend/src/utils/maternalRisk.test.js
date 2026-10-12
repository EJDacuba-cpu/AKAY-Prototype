import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRiskFlags,
  getMaternalRiskFlags,
  pendingRiskAnnouncements,
} from "./maternalRisk.js";

const referenceDate = new Date("2026-10-12");

function flagsForAge(birthdate) {
  return getMaternalRiskFlags({ birthdate, visitHeight: "160", referenceDate });
}

test("age risk boundaries: under 18 and over 35 only", () => {
  const cases = [
    ["2009-01-01", 17, true],
    ["2008-01-01", 18, false],
    ["1991-01-01", 35, false],
    ["1990-01-01", 36, true],
  ];
  for (const [birthdate, age, ageRisk] of cases) {
    const flags = flagsForAge(birthdate);
    assert.equal(flags.age, age, birthdate);
    assert.equal(flags.ageRisk, ageRisk, birthdate);
  }
});

test("age is taken at the visit date, not today", () => {
  const before = getMaternalRiskFlags({ birthdate: "2008-10-13", referenceDate: new Date("2026-10-12") });
  assert.equal(before.age, 17);
  assert.equal(before.ageRisk, true);
  const onBirthday = getMaternalRiskFlags({ birthdate: "2008-10-13", referenceDate: new Date("2026-10-13") });
  assert.equal(onBirthday.age, 18);
  assert.equal(onBirthday.ageRisk, false);
});

test("height risk boundaries: under 145 cm only", () => {
  const risk = (visitHeight) => getMaternalRiskFlags({ visitHeight, referenceDate }).heightRisk;
  assert.equal(risk("144"), true);
  assert.equal(risk("145"), false);
  assert.equal(risk("142.5"), true);
});

test("unusable height is null", () => {
  for (const visitHeight of ["", "0", "abc", undefined]) {
    const flags = getMaternalRiskFlags({ visitHeight, referenceDate });
    assert.equal(flags.heightRisk, null, String(visitHeight));
    assert.equal(flags.heightSource, null, String(visitHeight));
    assert.equal(flags.heightCm, null, String(visitHeight));
  }
});

test("this visit's height wins over the last recorded one", () => {
  const recordedHeight = { value: 140, date: "2026-08-12" };
  const visit = getMaternalRiskFlags({ visitHeight: "150", recordedHeight, referenceDate });
  assert.equal(visit.heightRisk, false);
  assert.equal(visit.heightSource, "visit");
  const recorded = getMaternalRiskFlags({ visitHeight: "", recordedHeight, referenceDate });
  assert.equal(recorded.heightRisk, true);
  assert.equal(recorded.heightSource, "record");
  assert.equal(recorded.heightDate, "2026-08-12");
});

test("a missing or invalid birthdate gives no age flag", () => {
  for (const birthdate of ["", "not-a-date", undefined]) {
    const flags = getMaternalRiskFlags({ birthdate, referenceDate });
    assert.equal(flags.ageRisk, null, String(birthdate));
    assert.equal(flags.age, null, String(birthdate));
  }
});

test("announcements list only true, unacknowledged flags, age first", () => {
  const flags = getMaternalRiskFlags({
    birthdate: "2009-01-01",
    recordedHeight: { value: 142, date: "2026-08-12" },
    referenceDate,
  });
  const all = pendingRiskAnnouncements(flags, []);
  assert.deepEqual(all.map((item) => item.key), ["ageRisk", "heightRisk"]);
  assert.equal(all[0].message, "Age risk — patient is 17 years old.");
  assert.equal(all[1].message, "Height risk — last recorded height is 142 cm (2026-08-12).");

  assert.deepEqual(
    pendingRiskAnnouncements(flags, ["ageRisk"]).map((item) => item.key),
    ["heightRisk"],
  );
  assert.deepEqual(pendingRiskAnnouncements(flags, ["ageRisk", "heightRisk"]), []);

  const clean = getMaternalRiskFlags({ birthdate: "1996-05-05", visitHeight: "160", referenceDate });
  assert.deepEqual(pendingRiskAnnouncements(clean, []), []);
  assert.deepEqual(pendingRiskAnnouncements(getMaternalRiskFlags({ referenceDate }), []), []);
});

test("a height entered this visit is worded as such", () => {
  const flags = getMaternalRiskFlags({ visitHeight: "142", referenceDate });
  const [item] = pendingRiskAnnouncements(flags, []);
  assert.equal(item.message, "Height risk — height entered this visit is 142 cm.");
});

test("announcements state the fact and never advise", () => {
  const flags = getMaternalRiskFlags({
    birthdate: "2009-01-01",
    visitHeight: "142",
    referenceDate,
  });
  for (const { message } of pendingRiskAnnouncements(flags, [])) {
    assert.doesNotMatch(message, /refer|recommend|should|advise/i);
  }
});

test("applyRiskFlags sets both keys, null counts as false, input untouched", () => {
  const before = { previousCs: true, ageRisk: true, heightRisk: true };
  const flags = getMaternalRiskFlags({ birthdate: "1996-05-05", referenceDate });
  const next = applyRiskFlags(before, flags);
  assert.deepEqual(next, { previousCs: true, ageRisk: false, heightRisk: false });
  assert.deepEqual(before, { previousCs: true, ageRisk: true, heightRisk: true });

  const risky = applyRiskFlags({}, getMaternalRiskFlags({ birthdate: "2009-01-01", visitHeight: "140", referenceDate }));
  assert.deepEqual(risky, { ageRisk: true, heightRisk: true });
  assert.doesNotThrow(() => applyRiskFlags(undefined, flags));
});
