import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";

import {
  createVaultKey,
  decryptRecord,
  deriveTag,
  encryptRecord,
  isCryptoAvailable,
} from "./localDraftCrypto.js";

test("Web Crypto is available to the draft vault in this runtime", () => {
  assert.equal(isCryptoAvailable(), true);
});

test("the vault key is non-extractable, so raw key bytes cannot be read back", async () => {
  const key = await createVaultKey();
  assert.equal(key.extractable, false);
  assert.equal(key.algorithm.name, "AES-GCM");
  await assert.rejects(() => globalThis.crypto.subtle.exportKey("raw", key));
});

test("a draft round-trips through encrypt/decrypt unchanged", async () => {
  const key = await createVaultKey();
  const recordKey = await deriveTag("akay-local-draft", "user-7", "draft-abc");
  const draft = {
    chiefComplaint: "Fever and cough",
    vitals: { systolicBp: "120", diastolicBp: "80" },
    dispensedMedicines: [{ medicineId: 4, quantity: 2 }],
  };

  const envelope = await encryptRecord(key, recordKey, draft);
  assert.equal(envelope.iv.length, 12);
  assert.deepEqual(await decryptRecord(key, recordKey, envelope), draft);
});

test("ciphertext never contains the plaintext clinical values", async () => {
  const key = await createVaultKey();
  const recordKey = await deriveTag("akay-local-draft", "user-7", "draft-abc");
  const envelope = await encryptRecord(key, recordKey, {
    chiefComplaint: "Fever and cough",
  });

  const bytes = Buffer.from(envelope.ciphertext);
  assert.equal(bytes.includes(Buffer.from("Fever and cough")), false);
  assert.equal(bytes.includes(Buffer.from("chiefComplaint")), false);
});

test("each write uses a fresh IV, so identical drafts differ on disk", async () => {
  const key = await createVaultKey();
  const recordKey = await deriveTag("akay-local-draft", "user-7", "draft-abc");
  const draft = { chiefComplaint: "Fever" };

  const first = await encryptRecord(key, recordKey, draft);
  const second = await encryptRecord(key, recordKey, draft);

  assert.notDeepEqual(Buffer.from(first.iv), Buffer.from(second.iv));
  assert.notDeepEqual(
    Buffer.from(first.ciphertext),
    Buffer.from(second.ciphertext),
  );
});

test("a record cannot be decrypted under another record key (AAD binding)", async () => {
  const key = await createVaultKey();
  const ownRecordKey = await deriveTag("akay-local-draft", "user-7", "draft-a");
  const otherRecordKey = await deriveTag("akay-local-draft", "user-7", "draft-b");

  const envelope = await encryptRecord(key, ownRecordKey, { note: "private" });
  await assert.rejects(() => decryptRecord(key, otherRecordKey, envelope));
});

test("another user's key cannot open a draft", async () => {
  const ownerKey = await createVaultKey();
  const strangerKey = await createVaultKey();
  const recordKey = await deriveTag("akay-local-draft", "user-7", "draft-abc");

  const envelope = await encryptRecord(ownerKey, recordKey, { note: "private" });
  await assert.rejects(() => decryptRecord(strangerKey, recordKey, envelope));
});

test("tampered ciphertext is rejected rather than partially decrypted", async () => {
  const key = await createVaultKey();
  const recordKey = await deriveTag("akay-local-draft", "user-7", "draft-abc");
  const envelope = await encryptRecord(key, recordKey, { note: "private" });

  const tampered = new Uint8Array(envelope.ciphertext);
  tampered[0] ^= 0xff;
  await assert.rejects(() =>
    decryptRecord(key, recordKey, { iv: envelope.iv, ciphertext: tampered.buffer }),
  );
});

test("index tags are stable, opaque, and reveal no identifier", async () => {
  const tag = await deriveTag("akay-local-draft-owner", "user-7");
  assert.match(tag, /^[0-9a-f]{64}$/);
  assert.equal(tag, await deriveTag("akay-local-draft-owner", "user-7"));
  assert.notEqual(tag, await deriveTag("akay-local-draft-owner", "user-8"));
  assert.equal(tag.includes("user-7"), false);
});

test("tag parts cannot be shifted across the separator", async () => {
  assert.notEqual(
    await deriveTag("akay", "ab", "c"),
    await deriveTag("akay", "a", "bc"),
  );
});
