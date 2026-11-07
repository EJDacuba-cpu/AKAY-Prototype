import { test } from "node:test";
import assert from "node:assert/strict";
import { registrationTarget, storeRegistrationEntry, readRegistrationEntry, consumeRegistrationEntry, releaseRegistrationEntry } from "./patientRegistrationEntry.js";

const fixture = () => {
  const rows = new Map();
  const client = { setQueryData: (key, value) => rows.set(JSON.stringify(key), value), getQueryData: (key) => rows.get(JSON.stringify(key)), removeQueries: ({ queryKey }) => rows.delete(JSON.stringify(queryKey)) };
  const engine = { identity: { form_type: "patient", mode: "create", context_key: "new" }, options: { owner: "actor" }, closed: false, getSnapshot: () => ({ ready: true }), clearTimers() {}, close() { this.closed = true; } };
  return { client, engine };
};

test("registration entry matches new BHC/RHU registration, preserving household and walk-in queries", () => {
  assert.equal(registrationTarget("/bhc/patients/add?household=12", "bhc"), "/bhc/patients/add?household=12");
  assert.equal(registrationTarget("/rhu/patients/add?check_in=1", "rhu"), "/rhu/patients/add?check_in=1");
  for (const target of ["/bhc/patients/12/edit", "/rhu/patients/add", "https://elsewhere.test/bhc/patients/add"]) assert.equal(registrationTarget(target, "bhc"), null);
});

test("restored registration transfers the same coordinator once without route payloads or another init", () => {
  const { client, engine } = fixture();
  storeRegistrationEntry(client, "actor", "/bhc/patients/add", engine, 100);
  assert.equal(readRegistrationEntry(client, "actor", "/bhc/patients/add", 101), engine);
  assert.equal(consumeRegistrationEntry(client, "actor", "/bhc/patients/add", engine, 101), true);
  assert.equal(readRegistrationEntry(client, "actor", "/bhc/patients/add", 101), null);
  assert.equal(engine.closed, false);
});

test("handoff rejects changed account, destination, expiry, closed or unready engine", () => {
  const { client, engine } = fixture();
  storeRegistrationEntry(client, "actor", "/bhc/patients/add", engine, 100);
  assert.equal(readRegistrationEntry(client, "other", "/bhc/patients/add", 101), null);
  assert.equal(readRegistrationEntry(client, "actor", "/bhc/patients/add?household=2", 101), null);
  assert.equal(readRegistrationEntry(client, "actor", "/bhc/patients/add", 60101), null);
  engine.closed = true;
  assert.equal(readRegistrationEntry(client, "actor", "/bhc/patients/add", 101), null);
  engine.closed = false; engine.getSnapshot = () => ({ ready: false });
  assert.equal(readRegistrationEntry(client, "actor", "/bhc/patients/add", 101), null);
});

test("expired unclaimed handoffs can be cleared without closing a consumed or replacement session", () => {
  const { client, engine } = fixture();
  const path = "/bhc/patients/add";
  storeRegistrationEntry(client, "actor", path, engine, 100);
  assert.equal(readRegistrationEntry(client, "actor", path, 999999), null);
  assert.equal(releaseRegistrationEntry(client, "actor", path, engine), true);
  storeRegistrationEntry(client, "actor", path, engine, 100);
  assert.equal(consumeRegistrationEntry(client, "actor", path, engine, 101), true);
  assert.equal(releaseRegistrationEntry(client, "actor", path, engine), false);
  const replacement = { ...engine };
  storeRegistrationEntry(client, "actor", path, replacement, 100);
  assert.equal(releaseRegistrationEntry(client, "actor", path, engine), false);
  assert.equal(readRegistrationEntry(client, "actor", path, 101), replacement);
});
