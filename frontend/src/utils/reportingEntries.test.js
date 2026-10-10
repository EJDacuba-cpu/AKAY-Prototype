import { test } from "node:test";
import assert from "node:assert/strict";

import {
  REPORT_DESTINATIONS,
  entryDestinations,
  formatEntryDestinations,
  newReportingEntry,
  reportingEntryErrors,
  reportingEntryDraft,
  reportingEntryPayload,
  restoreReportingEntries,
  toggleDestination,
} from "./reportingEntries.js";

test("REPORT_DESTINATIONS is the canonical order", () => {
  assert.deepEqual(REPORT_DESTINATIONS, ["morbidity", "notifiable", "surveillance"]);
});

test("entryDestinations: a v2 entry reads reportIn in canonical order", () => {
  assert.deepEqual(entryDestinations({ reportIn: ["surveillance", "morbidity"] }), ["morbidity", "surveillance"]);
  assert.deepEqual(entryDestinations({ reportIn: ["morbidity", "notifiable", "surveillance"] }), [
    "morbidity",
    "notifiable",
    "surveillance",
  ]);
  assert.deepEqual(entryDestinations({ reportIn: [] }), []);
});

test("entryDestinations: reportIn wins over the compatibility mirrors", () => {
  assert.deepEqual(entryDestinations({ reportIn: [], reportAs: "morbidity", includeInSurveillance: true }), []);
  assert.deepEqual(entryDestinations({ reportIn: ["notifiable"], reportAs: "morbidity" }), ["notifiable"]);
});

test("entryDestinations: legacy entries read reportAs and includeInSurveillance", () => {
  assert.deepEqual(entryDestinations({ reportAs: "morbidity" }), ["morbidity"]);
  assert.deepEqual(entryDestinations({ reportAs: "notifiable", includeInSurveillance: true }), [
    "notifiable",
    "surveillance",
  ]);
  assert.deepEqual(entryDestinations({ reportAs: null }), []);
  assert.deepEqual(entryDestinations({ reportAs: null, includeInSurveillance: true }), ["surveillance"]);
  assert.deepEqual(entryDestinations({ includeInSurveillance: "true" }), []);
});

test("entryDestinations: unknown values and non-objects are dropped", () => {
  assert.deepEqual(entryDestinations({ reportIn: ["bogus", "morbidity", "morbidity", 3, null] }), ["morbidity"]);
  assert.deepEqual(entryDestinations({ reportAs: "bogus" }), []);
  assert.deepEqual(entryDestinations(null), []);
  assert.deepEqual(entryDestinations("morbidity"), []);
  assert.deepEqual(entryDestinations({ reportIn: "morbidity" }), []);
});

test("newReportingEntry has an id, a blank name and no destination", () => {
  const entry = newReportingEntry();
  assert.equal(typeof entry.id, "string");
  assert.ok(entry.id.length > 0);
  assert.equal(entry.name, "");
  assert.deepEqual(entry.reportIn, []);
  assert.notEqual(newReportingEntry().id, entry.id);
});

test("toggleDestination adds in canonical order, removes, and never mutates", () => {
  const entry = { id: "a", name: "Dengue", reportIn: ["surveillance"] };
  const added = toggleDestination(entry, "morbidity", true);
  assert.deepEqual(added.reportIn, ["morbidity", "surveillance"]);
  assert.deepEqual(entry.reportIn, ["surveillance"]);
  assert.deepEqual(toggleDestination(added, "surveillance", false).reportIn, ["morbidity"]);
  assert.deepEqual(toggleDestination(added, "morbidity", true).reportIn, ["morbidity", "surveillance"]);
  assert.deepEqual(toggleDestination(entry, "bogus", true).reportIn, ["surveillance"]);
  assert.equal(toggleDestination(entry, "notifiable", true).name, "Dengue");
});

test("reportingEntryPayload trims names, always emits reportIn, and drops blank entries", () => {
  assert.deepEqual(
    reportingEntryPayload([
      { id: "a", name: "  Dengue ", reportIn: ["notifiable", "morbidity"], extra: 1 },
      { id: "b", name: "   ", reportIn: [] },
      { id: "c", name: "", reportIn: ["morbidity"] },
      { id: "d", name: "Cough", reportIn: [] },
      { id: "e", name: "Legacy", reportAs: "morbidity" },
    ]),
    [
      { id: "a", name: "Dengue", reportIn: ["morbidity", "notifiable"] },
      { id: "c", name: "", reportIn: ["morbidity"] },
      { id: "d", name: "Cough", reportIn: [] },
      { id: "e", name: "Legacy", reportIn: ["morbidity"] },
    ],
  );
  assert.deepEqual(reportingEntryPayload(null), []);
  assert.ok(Array.isArray(reportingEntryPayload([{ id: "x", name: "A" }])[0].reportIn));
});

test("reportingEntryErrors: name, destination and duplicate messages", () => {
  assert.deepEqual(reportingEntryErrors([{ id: "a", name: "Dengue", reportIn: ["morbidity"] }]), {});
  assert.deepEqual(reportingEntryErrors([{ id: "a", name: "  ", reportIn: ["morbidity"] }]), {
    "reportingEntry.a.name": "Enter the reported health problem.",
  });
  assert.deepEqual(reportingEntryErrors([{ id: "a", name: "Dengue", reportIn: [] }]), {
    "reportingEntry.a.reportIn": "Choose at least one report.",
  });
  assert.deepEqual(
    reportingEntryErrors([
      { id: "a", name: "Dengue", reportIn: ["morbidity"] },
      { id: "b", name: " dengue ", reportIn: ["notifiable"] },
    ]),
    { "reportingEntry.b.duplicate": "This health problem is already listed." },
  );
  assert.deepEqual(reportingEntryErrors(null), {});
});

test("formatEntryDestinations joins labels in canonical order", () => {
  assert.equal(
    formatEntryDestinations({ reportIn: ["surveillance", "notifiable", "morbidity"] }),
    "Morbidity · Notifiable · Surveillance",
  );
  assert.equal(formatEntryDestinations({ reportAs: "notifiable" }), "Notifiable");
  assert.equal(formatEntryDestinations({ reportIn: [] }), "");
});

test("restoreReportingEntries keeps only v2 entries (those carrying reportIn)", () => {
  const restored = restoreReportingEntries([
    { id: "a", name: "Dengue", reportIn: ["surveillance", "notifiable"] },
    { id: "b", name: "Cough", carePlan: "refer", reportAs: "morbidity" },
    { id: "c", name: "Flu", reportIn: [] },
    null,
  ]);
  assert.deepEqual(restored, [
    { id: "a", name: "Dengue", reportIn: ["notifiable", "surveillance"] },
    { id: "c", name: "Flu", reportIn: [] },
  ]);
});

test("restoreReportingEntries gives a legacy or missing list no entries, and an id to an entry without one", () => {
  assert.deepEqual(restoreReportingEntries([{ name: "Cough", reportAs: "morbidity" }]), []);
  assert.deepEqual(restoreReportingEntries(undefined), []);
  assert.deepEqual(restoreReportingEntries("x"), []);
  const [entry] = restoreReportingEntries([{ name: "Dengue", reportIn: ["morbidity"] }]);
  assert.equal(typeof entry.id, "string");
  assert.ok(entry.id.length > 0);
});

test("reportingEntryDraft keeps named entries with reportIn always an array, and drops nameless ones", () => {
  assert.deepEqual(
    reportingEntryDraft([
      { id: "a", name: " Dengue ", reportIn: [] },
      { id: "b", name: "", reportIn: ["morbidity"] },
      { id: "c", name: "Flu", reportIn: ["morbidity"] },
    ]),
    [
      { id: "a", name: "Dengue", reportIn: [] },
      { id: "c", name: "Flu", reportIn: ["morbidity"] },
    ],
  );
});
