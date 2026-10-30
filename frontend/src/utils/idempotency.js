/**
 * An RFC 4122 v4 UUID. `crypto.randomUUID()` where available, otherwise the
 * same format from `crypto.getRandomValues()`.
 *
 * Shared by two identities that must never be confused:
 *  - createIdempotencyKey(): one FINAL-SAVE attempt, bound to one payload.
 *  - a consultation_uuid: one CONSULTATION, stable across every draft and the
 *    record it becomes.
 * They share a generator, not a meaning.
 */
export function createUuid() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));

  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10).join(""),
  ].join("-");
}

export function createIdempotencyKey() {
  return createUuid();
}

export function createClientSubmissionId() {
  return `client-${createIdempotencyKey()}`;
}
