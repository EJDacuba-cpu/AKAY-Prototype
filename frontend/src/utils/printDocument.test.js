import assert from "node:assert/strict";
import test from "node:test";
import { checkPrintSource, waitForPrintAssets } from "./printDocument.js";

test("print preparation refuses disconnected, empty, pending, or failed source data", () => {
  const source = { isConnected: true, textContent: "Selected health record", dataset: {} };
  assert.doesNotThrow(() => checkPrintSource(source));
  assert.throws(() => checkPrintSource(null), /unavailable/);
  assert.throws(() => checkPrintSource({ ...source, isConnected: false }), /unavailable/);
  assert.throws(() => checkPrintSource({ ...source, textContent: "  " }), /unavailable/);
  assert.throws(() => checkPrintSource({ ...source, dataset: { printState: "loading" } }), /still loading/);
  assert.throws(() => checkPrintSource({ ...source, dataset: { printState: "error" } }), /could not be loaded/);
});

test("print assets wait for image decoding and font readiness", async () => {
  let imageDecoded = false;
  let fontsLoaded = false;
  const doc = {
    body: { offsetHeight: 100 },
    images: [{ complete: true, naturalWidth: 156, decode: async () => { imageDecoded = true; } }],
    fonts: Object.assign([], { ready: Promise.resolve().then(() => { fontsLoaded = true; }) }),
  };
  await waitForPrintAssets(doc);
  assert.equal(imageDecoded, true);
  assert.equal(fontsLoaded, true);
  assert.equal(doc.images[0].loading, "eager");
});

test("print preparation fails on a missing image or failed font instead of printing incomplete output", async () => {
  const doc = { body: { offsetHeight: 100 }, images: [{ complete: true, naturalWidth: 0 }] };
  await assert.rejects(waitForPrintAssets(doc), /image could not be loaded/);
  await assert.rejects(waitForPrintAssets({ ...doc, images: [], fonts: Object.assign([{ status: "error" }], { ready: Promise.resolve() }) }), /font could not be loaded/);
});
