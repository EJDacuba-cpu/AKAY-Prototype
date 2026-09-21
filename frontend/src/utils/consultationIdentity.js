import { createUuid } from "./idempotency.js";

/**
 * Lifecycle rules for a consultation's stable identity (consultation_uuid).
 *
 * The identity is born once, when setup hands over to Interview, and then
 * follows the SAME consultation through every server draft, encrypted device
 * copy, reconnect, and finally the official health record. It is never
 * re-minted for a consultation that already has one.
 *
 * Not an idempotency key: that names one final-save ATTEMPT and is bound to one
 * payload. They share a UUID generator, not a meaning.
 */

export function normalizeConsultationUuid(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * The identity to use when setup hands over to Interview. Keeps an
 * existing one - Back to Setup and Next again re-enters the SAME consultation
 * - and mints only when there is none yet.
 */
export function ensureConsultationUuid(current, generate = createUuid) {
  return normalizeConsultationUuid(current) || generate();
}

/**
 * The identity to adopt when a draft is reopened - resumed from the server or
 * recovered from this device. Always the draft's own identity, never a new
 * one. Only a legacy draft saved before identities existed has none, so it is
 * given one now; the server adopts it on the next save.
 */
export function adoptConsultationUuid(draft, generate = createUuid) {
  return (
    normalizeConsultationUuid(draft?.consultationUuid) ||
    normalizeConsultationUuid(draft?.payload?.consultationUuid) ||
    generate()
  );
}
