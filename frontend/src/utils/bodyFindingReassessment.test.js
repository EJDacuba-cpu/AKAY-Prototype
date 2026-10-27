import test from "node:test";
import assert from "node:assert/strict";
import { summarizeBodyFindings, setFindingReassessment } from "./bodyFindingsSummary.js";
import { normalizeRecordedBodyFindings } from "./bodyFindings.js";

const original = (id, entries = [{ region: "chest", finding: "Tenderness" }]) => ({
  id, dateRecorded: "2026-10-01", bodyFindings: entries,
});
const review = (id, sourceRecordId, status, extra = {}) => ({
  id, dateRecorded: "2026-09-01", bodyFindings: [],
  bodyFindingReassessments: [{ sourceRecordId, sourceFindingIndex: 0, status, ...extra }],
});
const ongoing = (records) => summarizeBodyFindings(records, "ongoing").findings;

test("legacy findings survive empty later visits, default unreviewed, and never merge by text or location", () => {
  const records = [original(1), original(2), original(3, [])];
  const findings = ongoing(records);
  assert.equal(findings.length, 2);
  assert.deepEqual(findings.map((f) => f.status), ["not_yet_reassessed", "not_yet_reassessed"]);
  assert.notEqual(findings[0].id, findings[1].id);
  assert.deepEqual(ongoing(records).map((f) => f.id), findings.map((f) => f.id));
});

test("duplicate IDs in one legacy record remain individually addressable", () => {
  const findings = ongoing([original(1, [
    { id: "same", region: "chest", finding: "Pain" },
    { id: "same", region: "chest", finding: "Pain" },
  ])]);
  assert.equal(new Set(findings.map((f) => f.id)).size, 2);
  assert.deepEqual(findings.map((f) => f.sourceFindingIndex), [0, 1]);
});

test("successful reassessments affect only the referenced identity and retain history", () => {
  const records = [original(1), original(2), review(3, 1, "still_present")];
  assert.equal(ongoing(records).find((f) => f.sourceRecordId === 1).status, "still_present");
  records.push(review(4, 1, "no_longer_present"));
  assert.deepEqual(ongoing(records).map((f) => f.sourceRecordId), [2]);
  assert.equal(summarizeBodyFindings(records, "history").findings.length, 2);
  assert.equal(records[0].bodyFindings[0].finding, "Tenderness");
});

test("commit record identity orders reviews, independent of backdated visit dates or input order", () => {
  const records = [review(4, 1, "still_present"), original(1), review(3, 1, "still_present")];
  const finding = ongoing(records)[0];
  assert.equal(finding.revision, 4);
  assert.deepEqual(finding.reassessments.map((r) => r.recordId), [3, 4]);
});

test("unreassessed visits and unknown events do not reset last documented status", () => {
  const records = [original(1), review(2, 1, "still_present"), original(3, []), review(4, 1, "invalid")];
  assert.equal(ongoing(records)[0].status, "still_present");
  assert.equal(ongoing(records)[0].revision, 2);
});

test("pending choices never mutate the ongoing projection and resetting leaves no event", () => {
  const records = [original(1), review(2, 1, "still_present")];
  const finding = ongoing(records)[0];
  const decisions = setFindingReassessment([], finding, "no_longer_present");
  assert.deepEqual(decisions, [{ sourceRecordId: 1, sourceFindingIndex: 0, expectedRevision: 2, status: "no_longer_present" }]);
  assert.equal(ongoing(records)[0].status, "still_present");
  assert.deepEqual(setFindingReassessment(decisions, finding, "not_yet_reassessed"), []);
});

test("malformed legacy rows retain the original index through record normalization", () => {
  const normalized = normalizeRecordedBodyFindings([null, { region: "chest", finding: "Pain" }], 1);
  assert.equal(ongoing([original(1, normalized)])[0].sourceFindingIndex, 1);
});

test("a raw historical row cannot replace its immutable array identity", () => {
  const normalized = normalizeRecordedBodyFindings([{ region: "chest", finding: "Pain", sourceFindingIndex: 99 }], 1);
  assert.equal(normalized[0].sourceFindingIndex, 0);
});
