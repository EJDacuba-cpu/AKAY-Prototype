import test from "node:test";
import assert from "node:assert/strict";

import { prefetchPatientProfile } from "./prefetchPatientProfile.js";

function fakeClient(handlers) {
  const calls = [];
  return {
    calls,
    async fetchQuery(options) {
      calls.push(options);
      return handlers[options.queryKey[0]](options);
    },
  };
}

const queries = {
  patient: { queryKey: ["patient"], queryFn: () => {} },
  secondary: [
    { queryKey: ["records"], queryFn: () => {} },
    { queryKey: ["referrals"], queryFn: () => {}, enabled: false },
  ],
};

test("resolves with the patient only after every enabled query has loaded", async () => {
  let recordsDone = false;
  const client = fakeClient({
    patient: async () => ({ id: 7 }),
    records: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      recordsDone = true;
    },
  });

  const patient = await prefetchPatientProfile(client, queries);

  assert.deepEqual(patient, { id: 7 });
  assert.equal(recordsDone, true);
});

test("skips disabled queries and never passes `enabled` to fetchQuery", async () => {
  const client = fakeClient({ patient: async () => ({}), records: async () => [] });

  await prefetchPatientProfile(client, queries);

  assert.deepEqual(client.calls.map((c) => c.queryKey[0]).sort(), ["patient", "records"]);
  assert.ok(client.calls.every((c) => !("enabled" in c)));
});

test("a failing secondary query does not block opening", async () => {
  const client = fakeClient({
    patient: async () => ({ id: 1 }),
    records: async () => {
      throw new Error("records down");
    },
  });

  assert.deepEqual(await prefetchPatientProfile(client, queries), { id: 1 });
});

test("a failing patient query rejects so the caller can stay on the directory", async () => {
  const client = fakeClient({
    patient: async () => {
      throw new Error("patient down");
    },
    records: async () => [],
  });

  await assert.rejects(prefetchPatientProfile(client, queries), /patient down/);
});
