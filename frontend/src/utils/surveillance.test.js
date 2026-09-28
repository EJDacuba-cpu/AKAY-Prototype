import test from "node:test";
import assert from "node:assert/strict";
import { getSurveillanceTags, hasSurveillanceTag, matchSurveillanceDisease } from "./surveillance.js";

const registry = {
  hfmd: { name: "Hand, Foot and Mouth Disease", aliases: ["HFMD"] },
};

test("surveillanceTags is used directly when present", () => {
  assert.deepEqual(getSurveillanceTags({ monitoring_data: { surveillanceTags: ["hfmd"] } }), ["hfmd"]);
  assert.deepEqual(getSurveillanceTags({}, { surveillanceTags: [] }), []);
});

test("a legacy hfmdSurveillance-only record reads as [hfmd]", () => {
  assert.deepEqual(getSurveillanceTags({ monitoring_data: { hfmdSurveillance: true } }), ["hfmd"]);
  assert.deepEqual(getSurveillanceTags({ hfmdSurveillance: true }), ["hfmd"]);
});

test("a legacy surveillanceCategory-only record reads as [hfmd]", () => {
  assert.deepEqual(getSurveillanceTags({ monitoring_data: { surveillanceCategory: "hfmd" } }), ["hfmd"]);
});

test("no legacy signal and no tags reads as an empty list", () => {
  assert.deepEqual(getSurveillanceTags({}), []);
  assert.deepEqual(getSurveillanceTags({ monitoring_data: { hfmdSurveillance: false } }), []);
});

test("hasSurveillanceTag checks membership safely", () => {
  assert.equal(hasSurveillanceTag(["hfmd"], "hfmd"), true);
  assert.equal(hasSurveillanceTag(["hfmd"], "dengue"), false);
  assert.equal(hasSurveillanceTag(undefined, "hfmd"), false);
  assert.equal(hasSurveillanceTag(null, "hfmd"), false);
});

test("matchSurveillanceDisease matches by official name or alias", () => {
  assert.deepEqual(matchSurveillanceDisease("Hand, Foot and Mouth Disease", registry), { key: "hfmd", name: "Hand, Foot and Mouth Disease" });
  assert.deepEqual(matchSurveillanceDisease("HFMD", registry), { key: "hfmd", name: "Hand, Foot and Mouth Disease" });
  assert.deepEqual(matchSurveillanceDisease("  hfmd  ", registry), { key: "hfmd", name: "Hand, Foot and Mouth Disease" });
});

test("matchSurveillanceDisease never fuzzy-matches", () => {
  assert.equal(matchSurveillanceDisease("HFM", registry), null);
  assert.equal(matchSurveillanceDisease("Dengue", registry), null);
  assert.equal(matchSurveillanceDisease("", registry), null);
});
