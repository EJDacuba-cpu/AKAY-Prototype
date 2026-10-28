# BHC Referral Details implementation plan

Spec: the approved single-page layout and saved-referral-only clinical fields in Eric's requests.

Architecture: retain the existing referral query, services, QR component, print document and feedback workflow. Change presentation in `frontend/src/pages/bhc/ReferralDetails.jsx`; pass existing patient-profile navigation state from `PatientDetails.jsx`. No backend changes.

- [x] Add rendered-page regression tests for saved versus live clinical values, missing/legacy data, pending/completed status, missing/present feedback, print document and navigation.
- [x] Replace the tabs with a compact Clinic Ledger workspace using existing shadcn Button and Accordion components. Display Reason for Referral, Chief Complaint, Initial Assessment and Initial Action Taken from referral fields only, plus View Source Health Record.
- [x] Keep assessment text verbatim: the referral stores no independent confirmation status. Never infer confirmation from completion or current patient conditions.
- [x] Keep all persisted RHU feedback readable, including API snake_case fields and legacy camelCase fields. Keep QR regeneration safeguards and the printable slip unchanged.
- [x] Preserve the patient's originating tab with existing navigation metadata. Direct/facility entry returns to Referrals.
- [x] Run focused tests, lint and production build; inspect desktop/mobile and printing where the environment permits. Record any verification limits.

Review focus: live-record contamination; empty saved fields; unclassified legacy assessments; completed referrals without feedback; loss of saved feedback through naming mismatches; returning to the correct patient/tab; QR token and print format preservation.

Verification: 10 rendered-page tests pass (8 failed before implementation); 22 existing referral/navigation tests pass; 30 backend QR/status tests pass with 335 assertions. Focused ESLint and production build pass. Build reports a large bundle warning. Independent read-only review found no important regressions.

Limits: no browser surface is available; desktop/mobile screenshots, interactive QR/accordion checks and native print preview could not run. Print markup, 80mm format and exclusion of clinical details were checked by rendered-page tests; server QR security was tested separately. No live patient data was used. Missing historical fields remain explicitly missing; confirmation metadata cannot be reconstructed from the saved assessment text.
