import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TAB_SENT,
  TAB_WAITING,
  WAITING_EMPTY_DESCRIPTION,
  WAITING_EMPTY_TITLE,
  UNSENT_NOT_APPOINTMENT,
  consultationFinalizeLabel,
  discardReasonError,
  unavailableReferralGuidance,
  waitingHoldCard,
} from "./bhcReferralWorkspace.js";

test("waiting hold cards expose the compact list fields and actions", () => {
  const card = waitingHoldCard({
    id: 44,
    patientName: "Ana Cruz",
    consultationDate: "2026-10-30",
    ruralHealthUnitName: "Central RHU",
    reasonForReferral: "Persistent cough for two weeks",
  });

  assert.equal(card.patientName, "Ana Cruz");
  assert.equal(card.consultationDate, "2026-10-30");
  assert.equal(card.receivingRhu, "Central RHU");
  assert.equal(card.reason, "Persistent cough for two weeks");
  assert.equal(card.status, "Awaiting doctor availability");
  assert.equal(card.detailsPath, "/bhc/referrals/waiting/44");
  assert.equal(card.submitPath, "/bhc/referrals/waiting/44?submit=1");
  assert.equal(card.viewLabel, "View Details");
  assert.equal(card.submitLabel, "Check Availability & Submit");
});

test("tab ids stay as Sent Referrals and Waiting to Submit", () => {
  assert.equal(TAB_SENT, "sent");
  assert.equal(TAB_WAITING, "waiting");
});

test("empty waiting copy is explicit and not decorative", () => {
  assert.match(WAITING_EMPTY_TITLE, /No referrals waiting to submit/i);
  assert.match(WAITING_EMPTY_DESCRIPTION, /Waiting to Submit/i);
  assert.match(UNSENT_NOT_APPOINTMENT, /not an accepted RHU appointment/i);
});

test("finalize label submits when a doctor is available and saves for later when not", () => {
  assert.equal(
    consultationFinalizeLabel({
      canFinalize: true,
      needsReferral: true,
      doctorAvailable: true,
    }),
    "Finalize Consultation & Submit Referral",
  );
  assert.equal(
    consultationFinalizeLabel({
      canFinalize: true,
      needsReferral: true,
      doctorAvailable: false,
    }),
    "Finalize Consultation & Save Referral for Later",
  );
  assert.equal(
    consultationFinalizeLabel({
      canFinalize: true,
      needsReferral: false,
      doctorAvailable: false,
    }),
    "Finalize Consultation",
  );
});

test("Priority unavailable guidance does not present waiting as the default safe option", () => {
  const priority = unavailableReferralGuidance({
    facilityName: "Central RHU",
    isPriority: true,
    alternativeNames: ["East RHU"],
  });
  assert.equal(priority.saveForLaterIsDefault, false);
  assert.match(priority.body, /not the preferred option/i);
  assert.match(priority.body, /not an accepted RHU appointment/i);
  assert.deepEqual(priority.alternatives, ["East RHU"]);

  const routine = unavailableReferralGuidance({
    facilityName: "Central RHU",
    isPriority: false,
  });
  assert.equal(routine.saveForLaterIsDefault, true);
  assert.match(routine.body, /Waiting to Submit/);
});

test("discard requires a brief audited reason", () => {
  assert.match(discardReasonError(""), /reason/i);
  assert.match(discardReasonError("short"), /8 characters/i);
  assert.equal(discardReasonError("Patient asked to wait for next clinic day."), "");
});
