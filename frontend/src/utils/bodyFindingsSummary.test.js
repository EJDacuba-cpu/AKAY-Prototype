import test from "node:test";
import assert from "node:assert/strict";
import { getRecordId, summarizeBodyFindings } from "./bodyFindingsSummary.js";

const finding = (region, text, extra = {}) => ({ id: `${region}-${text}`, region, finding: text, ...extra });

const recordA = {
  id: "A",
  dateRecorded: "2026-09-01T09:00:00+08:00",
  bodyFindings: [finding("chest", "Wheeze")],
};
const recordB = {
  id: "B",
  dateRecorded: "2026-09-28T10:00:00+08:00",
  bodyFindings: [
    finding("chest", "Rales"),
    finding("chest", "Tenderness", { location: "Sternum", note: "on palpation" }),
    finding("head", "Headache"),
  ],
};
const recordEmpty = { id: "C", dateRecorded: "2026-09-30T08:00:00+08:00", bodyFindings: [] };
const recordUndated = { id: "U", bodyFindings: [finding("left_leg", "Swelling")] };

test("latest picks newest record even when it has no findings", () => {
  const summary = summarizeBodyFindings([recordA, recordEmpty], "latest");
  assert.equal(summary.mode, "latest");
  assert.equal(summary.findings.length, 0);
  assert.equal(summary.visitDate.toISOString(), new Date("2026-09-30T08:00:00+08:00").toISOString());
  assert.equal(summary.visitCount, 1);
  assert.deepEqual(summary.countByRegion, {});
});

test("latest returns the newest record's findings with counts", () => {
  const summary = summarizeBodyFindings([recordA, recordB], "latest");
  assert.equal(summary.countByRegion.chest, 2);
  assert.equal(summary.countByRegion.head, 1);
  assert.equal(summary.findings.length, 3);
  for (const item of summary.findings) assert.equal(item.recordId, "B");
  const tenderness = summary.findings.find((item) => item.finding === "Tenderness");
  assert.equal(tenderness.location, "Sternum");
  assert.equal(tenderness.note, "on palpation");
  assert.equal(tenderness.regionLabel, "Chest");
});

test("history merges all records newest first", () => {
  const summary = summarizeBodyFindings([recordA, recordB, recordEmpty], "history");
  assert.equal(summary.visitDate, null);
  assert.equal(summary.visitCount, 2);
  assert.equal(summary.findings.length, 4);
  assert.equal(summary.countByRegion.chest, 3);
  const times = summary.findings.map((item) => item.visitDate.getTime());
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
  assert.equal(summary.findings.at(-1).recordId, "A");
});

test("unknown regions and blank findings are dropped", () => {
  const record = {
    id: "X",
    dateRecorded: "2026-09-02T09:00:00+08:00",
    bodyFindings: [{ region: "tail", finding: "x" }, { region: "head", finding: "   " }],
  };
  const summary = summarizeBodyFindings([record], "latest");
  assert.equal(summary.findings.length, 0);
  assert.deepEqual(summary.countByRegion, {});
});

test("undated records are never latest and sort last in history", () => {
  const latest = summarizeBodyFindings([recordUndated, recordA], "latest");
  assert.equal(latest.findings[0].recordId, "A");

  const history = summarizeBodyFindings([recordUndated, recordA], "history");
  assert.equal(history.findings.at(-1).recordId, "U");
  assert.equal(history.findings.at(-1).visitDate, null);
});

test("no records gives an empty latest summary", () => {
  const summary = summarizeBodyFindings([], "latest");
  assert.deepEqual(summary, { mode: "latest", visitDate: null, visitCount: 0, findings: [], countByRegion: {} });
  assert.deepEqual(summarizeBodyFindings(undefined, "history").findings, []);
});

test("getRecordId reads the id aliases records arrive with", () => {
  assert.equal(getRecordId({ id: 7 }), "7");
  assert.equal(getRecordId({ health_record_id: "h1" }), "h1");
  assert.equal(getRecordId({ recordId: "r1" }), "r1");
  assert.equal(getRecordId({}), "");
});
