import test from "node:test";
import assert from "node:assert/strict";
import {
  arrivalIdentity,
  arrivalReferralMeta,
  canReceiveReferral,
  isReferralAlreadyReceived,
  missingIdentityLabel,
  receiveConfirmCopy,
  RECEIVED_QUEUE_MESSAGE,
} from "./referralArrivalWorkspace.js";

test("Pending and No-Show can be received; Received and Completed cannot", () => {
  assert.equal(canReceiveReferral("Pending"), true);
  assert.equal(canReceiveReferral("No-Show"), true);
  assert.equal(canReceiveReferral("Received"), false);
  assert.equal(canReceiveReferral("Completed"), false);
  assert.equal(isReferralAlreadyReceived("Received"), true);
  assert.equal(isReferralAlreadyReceived("Completed"), true);
  assert.equal(isReferralAlreadyReceived("Pending"), false);
});

test("identity prefers BHC registration fields and leaves blanks as not recorded", () => {
  const identity = arrivalIdentity({
    patientName: "Rosa Intake",
    birthDate: "1990-05-01",
    age: 36,
    sex: "Female",
    address: "12 Rizal St, Pitpitan, Bulakan",
    contactNumber: "09171234567",
  });

  assert.equal(identity.fullName, "Rosa Intake");
  assert.equal(identity.birthDateLabel, "May 1, 1990");
  assert.equal(identity.age, "36");
  assert.equal(identity.sex, "Female");
  assert.equal(identity.address, "12 Rizal St, Pitpitan, Bulakan");
  assert.equal(identity.contact, "09171234567");
  assert.equal(missingIdentityLabel(""), "Not recorded");
});

test("missing demographics stay empty so the page can show Not recorded", () => {
  const identity = arrivalIdentity({ trackingId: "AKY-X" });
  assert.equal(identity.fullName, "Unknown Patient");
  assert.equal(identity.birthDateLabel, "");
  assert.equal(identity.age, "");
  assert.equal(identity.sex, "");
  assert.equal(identity.address, "");
  assert.equal(identity.contact, "");
});

test("referral meta is tracking, facilities, time and status only", () => {
  const meta = arrivalReferralMeta({
    trackingId: "AKY-20261025-ABC123",
    referringHci: "Pitpitan Health Center",
    destinationFacility: "Rural Health Unit Bulakan",
    referralDateTime: "2026-10-25T01:00:00.000Z",
    status: "Pending",
    chiefComplaint: "must not be copied",
  });

  assert.equal(meta.trackingId, "AKY-20261025-ABC123");
  assert.equal(meta.referringBhc, "Pitpitan Health Center");
  assert.equal(meta.receivingRhu, "Rural Health Unit Bulakan");
  assert.equal(meta.status, "Pending");
  assert.equal("chiefComplaint" in meta, false);
});

test("receive copy names the patient and the queue outcome", () => {
  const copy = receiveConfirmCopy({ fullName: "Rosa Intake" });
  assert.match(copy.description, /Rosa Intake/);
  assert.match(copy.description, /today's queue/);
  assert.equal(copy.confirmText, "Receive Patient");
  assert.match(RECEIVED_QUEUE_MESSAGE, /today's RHU queue/);

  const late = receiveConfirmCopy({ fullName: "Rosa Intake" }, true);
  assert.match(late.description, /late-arrival note/);
});
