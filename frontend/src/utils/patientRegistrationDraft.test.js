import assert from "node:assert/strict";
import test from "node:test";
import { assertFormDraftPayload } from "./formDraftRegistry.js";
import * as registration from "./patientRegistrationPayload.js";

test("new registration recovery is enabled for BHC/RHU and excluded for edits or saved patients", () => {
  for (const role of ["bhc", "rhu"]) {
    assert.equal(registration.registrationRecoveryEnabled({ role, live: true }), true);
    assert.equal(registration.registrationRecoveryEnabled({ role, live: true, patientId: "7" }), false);
    assert.equal(registration.registrationRecoveryEnabled({ role, live: true, createdPatientId: "7" }), false);
  }
  assert.equal(registration.registrationRecoveryEnabled({ role: "admin", live: true }), false);
  assert.equal(registration.registrationRecoveryEnabled({ role: "bhc", live: false }), false);
});

test("registration checkpoints preserve partial raw and hidden fields plus household intent", () => {
  const snapshot = registration.registrationDraftSnapshot({
    form: { firstName: "Partial", birthDate: "2026-", occupation: "Hidden retained input", contactNumber: "09" },
    connection: { kind: "new", headPatientId: "self", household: { serialMode: "manual", serialNumber: "Partial-", address: { barangay: "Bagumbayan", streetAddress: "" } } },
    walkIn: { key: "check-in-key" },
  });
  const restored = registration.restoreRegistrationDraft(snapshot, { municipality: "Bulakan" });
  assert.equal(restored.form.birthDate, "2026-");
  assert.equal(restored.form.occupation, "Hidden retained input");
  assert.equal(restored.connection.household.serialNumber, "Partial-");
  assert.equal(restored.walkIn.key, "check-in-key");
});

test("checkpoint excludes fetched patient records, secrets and duplicate confirmations", () => {
  const payload = registration.registrationDraftSnapshot({
    form: { firstName: "Draft", password: "secret", medicalBackground: { history: "must not copy" }, confirmDuplicate: true },
    connection: { kind: "existing", householdId: "3", relationship: "Daughter", members: [{ name: "Fetched family" }] },
    householdVersion: 4,
  });
  assert.doesNotMatch(JSON.stringify(payload), /secret|medicalBackground|Fetched family|confirmDuplicate/);
  const restored = registration.restoreRegistrationDraft(payload, {});
  assert.equal(restored.connection.householdId, "3");
  assert.equal(restored.householdVersion, 4);
});

test("legacy registration drafts restore known input without treating malformed snapshots as empty forms", () => {
  const restored = registration.restoreRegistrationDraft({ first_name: "Old input", birthdate: "2020-", household: { kind: "existing", household_id: "3", relationship: "Son", version: 2 } }, {});
  assert.equal(restored.form.firstName, "Old input");
  assert.equal(restored.form.birthDate, "2020-");
  assert.equal(restored.connection.householdId, "3");
  assert.equal(restored.householdVersion, 2);
  assert.throws(() => registration.restoreRegistrationDraft({ token: "invalid" }, {}), /snapshot|registration/i);
});

test("RHU registration snapshots for auto FSN, existing household and walk-in stay within the draft schema", () => {
  const autoFsn = registration.registrationDraftSnapshot({
    form: { firstName: "Ana", lastName: "Cruz", birthDate: "1990-01-01", sex: "Female", barangay: "Bagumbayan", municipality: "Bulakan" },
    connection: {
      kind: "new",
      headPatientId: "self",
      household: { serialMode: "auto", serialNumber: "", address: { streetAddress: "1 Main", purokArea: "Zone 1", barangay: "Bagumbayan", municipality: "Bulakan" } },
    },
    walkIn: { key: "walk-in-key" },
  });
  const existing = registration.registrationDraftSnapshot({
    form: { firstName: "Ana", lastName: "Cruz", birthDate: "1990-01-01", sex: "Female", barangay: "Bagumbayan", municipality: "Bulakan" },
    connection: { kind: "existing", householdId: "4", relationship: "Spouse" },
    householdVersion: 2,
  });
  assert.deepEqual(assertFormDraftPayload("patient", autoFsn), autoFsn);
  assert.deepEqual(assertFormDraftPayload("patient", existing), existing);
});
