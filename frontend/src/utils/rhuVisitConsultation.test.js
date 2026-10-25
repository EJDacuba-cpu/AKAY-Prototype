import test from "node:test";
import assert from "node:assert/strict";

import { reviewReferralSlipPath, rhuConsultationPath, rhuPatientReferralsPath } from "./rhuVisitRoutes.js";

test("queue and profile open the same RHU ITR route", () => {
  assert.equal(
    rhuConsultationPath(12, 9),
    "/rhu/health-records/add?visitId=12&patientId=9&mode=continue",
  );
});

test("reviewing a referral opens the dedicated BHC slip for that visit's referral", () => {
  assert.equal(reviewReferralSlipPath(9, 5), "/rhu/patients/9/referrals/5");
  assert.equal(rhuPatientReferralsPath(9), "/rhu/patients/9?tab=referrals");
});
