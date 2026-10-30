import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  reviewReferralSlipPath,
  rhuConsultationPath,
  rhuPatientReferralsPath,
  selectedRhuFollowUpIds,
  visitContinuedFollowUpIds,
} from "./rhuVisitRoutes.js";

test("start and resume go through the existing visit APIs without minting a second identity", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, "rhuVisitConsultation.js"), "utf8");
  const service = readFileSync(join(here, "../services/rhuVisitService.js"), "utf8");
  assert.match(source, /mode === "resume"/);
  assert.match(source, /resumeRhuVisit\(visitId\)/);
  assert.match(source, /startRhuVisit\(visitId/);
  assert.match(service, /export async function getRhuVisit/);
});

test("start and resume reuse the same visit consultation path", () => {
  assert.equal(
    rhuConsultationPath(12, 9),
    "/rhu/health-records/add?visitId=12&patientId=9&mode=continue",
  );
  assert.equal(
    rhuConsultationPath(12, 9, visitContinuedFollowUpIds({ continued_follow_up_task_ids: [] })),
    "/rhu/health-records/add?visitId=12&patientId=9&mode=continue",
  );
});

test("queue and profile open the same RHU ITR route", () => {
  assert.equal(
    rhuConsultationPath(12, 9),
    "/rhu/health-records/add?visitId=12&patientId=9&mode=continue",
  );
});

test("selected follow-up ids are appended without creating a second visit identity", () => {
  assert.equal(
    rhuConsultationPath(12, 9, [31, 32]),
    "/rhu/health-records/add?visitId=12&patientId=9&mode=continue&followUpIds=31,32",
  );
  assert.equal(rhuConsultationPath(12, 9, []), "/rhu/health-records/add?visitId=12&patientId=9&mode=continue");
});

test("reviewing a referral opens the dedicated BHC slip for that visit's referral", () => {
  assert.equal(reviewReferralSlipPath(9, 5), "/rhu/patients/9/referrals/5");
  assert.equal(rhuPatientReferralsPath(9), "/rhu/patients/9?tab=referrals");
});

test("a started visit keeps only the follow-up ids stored on that visit", () => {
  assert.deepEqual(visitContinuedFollowUpIds({ continued_follow_up_task_ids: ["31", 32, 31] }), [31, 32]);
  assert.deepEqual(visitContinuedFollowUpIds({ continuedFollowUpTaskIds: [8] }), [8]);
  assert.deepEqual(visitContinuedFollowUpIds({}), []);
});

test("new consultation does not inherit pending follow-ups, and resume prefers the stored visit ids", () => {
  assert.deepEqual(selectedRhuFollowUpIds({ queryIds: [9], visit: { continued_follow_up_task_ids: [] } }), []);
  assert.deepEqual(selectedRhuFollowUpIds({ queryIds: [9], visit: { continued_follow_up_task_ids: [4, 5] } }), [4, 5]);
  assert.deepEqual(selectedRhuFollowUpIds({ queryIds: [9], visit: {} }), [9]);
  assert.deepEqual(selectedRhuFollowUpIds({ queryIds: [9], visit: null }), [9]);
  assert.deepEqual(selectedRhuFollowUpIds({ queryIds: [], singularId: 7, visit: null }), [7]);
});
