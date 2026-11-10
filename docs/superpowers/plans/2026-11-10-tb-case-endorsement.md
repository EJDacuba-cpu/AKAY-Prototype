# TB case endorsement implementation plan

> Execute inline with superpowers:executing-plans and test-driven-development.

**Goal:** Step 5: the RHU endorses a registered Form 4B to a BHC; the receiving
BHC links/reviews/accepts the same case and reads its clinical card without editing it.
**Spec:** docs/superpowers/specs/2026-11-09-tb-case-workflow-design.md
**Architecture:** Case-specific endorsement history, separate from consultation-based
condition monitoring handoffs. Preserve original case/patient/source identity; a
receiving BHC may link its own patient registration. Share only the registered card
and pinned diagnostic evidence, without widening generic RHU history/laboratory access.
**Stack:** React/JavaScript, Laravel/PHP, PostgreSQL; isolated SQLite tests.

## Scope and contracts
- New `tb_case_endorsements`: case ID, receiving BHC, linked patient, frozen minimal
  patient identity, note, status (linkage_needed/pending_review/accepted/declined/revoked),
  author/reviewer/revoker attribution, timestamps, version, UUID request key/hash.
  Unique active endorsement per case; retain terminal history and restrict deletion.
- Owning RHU physician with conditions.confirm, consultations.finalize and clinical.history
  authorizes/revokes. BHC reviewers need clinical.history + consultations.encode.
  Effective working facility governs all actions; admin keeps clinical read access only.
- Target choices: active owner-RHU catchment BHCs plus the source patient's active home
  BHC. This supports alternate-RHU referral return and walk-ins without arbitrary sharing.
- Same global patient ID at target BHC links automatically; otherwise linkage_needed.
  BHC selects its own active registration and explicitly confirms identity. No automatic
  fuzzy matching, patient creation, or facility ownership change.
- Linked pending_review/accepted endorsements grant target BHC case/PDF reads; only
  accepted + active case will permit DOTS in Step 6. Unlinked/declined/revoked and other
  BHCs get no clinical case access. Recheck active local patient/facility on every read.
- Mutations lock case then endorsement; linkage also locks local patient. Require
  versions, use UUID/hash for create retries, and make identical receiver actions/revoke
  retries harmless. Never change diagnosis, resistance, regimen, outcome or source JSON.
- Reject overlapping active cases for a linked identity; registration must also detect
  an active shared case already linked to that local registration.
- No hospital portal/Form 4C. No daily medication/weight writes in this increment.
- Preserve earlier uncommitted increments; no commits or application DB migration.

## Task 1: Endorsement storage, actions and access
Files: new migration 000004_create_tb_case_endorsements; model TbCaseEndorsement;
service TbCaseEndorsementService; controller TbCaseEndorsementController; tests
TbCaseEndorsementTest. Update TbTreatmentCase, TbCaseAccessService,
TbTreatmentCaseController, TbCaseRegistrationService, routes and permission middleware.

Interfaces:
- GET `/tb-cases/{id}/endorsements`: owner overview, candidates, current/history,
  case_version, can_endorse.
- POST same: case_version, receiving_bhc_id, note; UUID Idempotency-Key.
- GET `/tb-endorsements`: paginated recipient inbox (admin retains read semantics).
- GET `/tb-endorsements/{id}`: scoped minimal detail + action/read capabilities.
- POST `/tb-endorsements/{id}/{link|accept|decline|revoke}`: version, linked_patient_id
  and identity_confirmed for link; confirmed for accept; reason for decline/revoke;
  revoke also requires case_version. Clinical/ownership fields prohibited.
- Existing patient case list maps BHC local patient ID to endorsed source identity.

- [x] Write endpoint regressions and observe missing-route failures.
- [x] Implement schema/model, strict validation, versioned workflow and scoped card/PDF access.
- [x] Verify direct BHC-patient/referral return, alternate RHU return, RHU-only walk-in
  linkage, duplicate identities, UUID/body conflict, stale versions, identical retries,
  revoke/reassign, inactive facilities/patients, grants on wrong roles and clinical tampering.
- [x] Verify migration rollback/reapply, immutable source/card and audit attribution.
  Run all focused TB suites; expected pass.

## Task 2: RHU endorsement and BHC case access UI
Files: new TbCaseEndorsementPanel and SharedTbCaseView; new BhcTbEndorsements page;
new PatientTbCasesPanel; utils/tbEndorsements + tests; extend tbCaseService,
TbCaseRegistrationPanel, BHC PatientsModule/PatientDetails and App routes.
- [x] Write payload/retry/action tests first; then implement helpers and services.
- [x] Add RHU target/instructions/current/history/revoke controls on registered case.
- [x] Add BHC inbox entry from Patients; manual patient search/link, explicit acceptance,
  decline reason, read-only card/PDF; add shared cards to patient Care & Programs.
- [x] Test rendered loading/error/recipient review/read-only states with existing Vite
  SSR test approach. Preserve source-owned fields and avoid daily-consultation actions.
- [x] Run frontend tests, build and changed-file lint; expected pass.

## Task 3: Review and verification
- [x] Fresh read-only review attempted; substantive findings received, final formal
  response interrupted by service usage limit. Important identity fix RED to GREEN.
- [x] Run full backend/frontend suites, production build, PHP syntax/style and diff checks.
  Report baseline failures by name and limitations honestly.

## Review focus
- Revocation, wrong facility or local patient movement must revoke case/PDF access.
- Cross-registration identity links must not allow overlapping active TB episodes.
- Retry/stale requests must not reactivate or overwrite a newer handoff.
- Recipient access must not disclose unrelated source history, labs or other BHC notes.
- Returned referral and RHU-only patient paths must retain original patient/source IDs.

## Execution ledger
- Baseline: Eric-Manually-Fixer, HEAD e866e5d, uncommitted Steps 3/4 retained.
- Pre-flight: use Step 3 shared identity/version and Step 4 registration/PDF. The
  existing generic monitoring handoff remains unchanged, avoiding a first-visit
  requirement for future direct DOTS logging.
- Ruling: physician authorization governs treatment-site endorsement; receiving BHC
  clinical encoders acknowledge it. Cost: RHU nurses may review but cannot issue it.
- Ruling: manual identity confirmation follows existing handoff practice; no fuzzy
  identity guesses. Cost: an RHU-only patient needs a receiving BHC registration/link.
- Ruling: linked pending review grants read access for acceptance; direct DOTS waits
  for accepted status. Cost: BHC acceptance is a separate acknowledgement.
- Task 1: endpoint regressions observed missing routes before implementation. Focused
  TB suite passed 82 tests / 551 assertions before final review; schema rollback,
  immutable snapshots, authorization, stale versions and retries covered.
- Task 2: helper and rendered-component tests observed RED before implementation;
  10 tests passed, including disabled clinical fields, denied cached-card access,
  local identity links and acceptance disabled until the card loads. Scoped ESLint
  passed for 13 frontend files; PHP syntax passed for 27 changed/new files.
- Final review: a fresh read-only reviewer examined access, identity and retry paths.
  Its final response was interrupted by a service usage limit. Its substantive
  finding was independently reproduced for correction; do not treat the review as
  a completed formal sign-off. No second reviewer dispatched.
- Final: Ruling: historical confirmed identity links must guard later episodes in
  both directions, including transitive links, rather than waiting for Step 8.
  Otherwise a later case registered under the BHC ID can overlap one registered
  under the original RHU ID. Retain explicit links after closure/revocation; lock
  related registration rows during registration/linkage. Cost: a mistaken identity
  attestation requires clinical reconciliation before another episode is opened.
- Final fix: the three-registration/two-closed-episode regression first returned
  201 instead of 409, then passed (8 assertions). Identity traversal now follows
  explicit links in both directions and shared registration rows are locked in ID
  order. The preview and registration guard use the same active-episode check.
  No automatic matching or ownership changes were added.
- Final focused backend: 61 shared case/number/access/registration/endorsement
  tests passed, 422 assertions. The complete backend suite is checked separately.
- Final frontend: all 1,889 tests passed, none skipped. Production build passed
  with the existing large-chunk warning. All 13 scoped frontend files pass ESLint;
  targeted PHP Pint passed, syntax checks passed, and git diff --check is clean.
- No application database migration, commit or push performed. New schema is
  exercised only against isolated test databases. Browser interaction and live
  PostgreSQL concurrency remain unverified; no disposable PG URL is configured.
- Final full backend: 1,765 tests, 1,738 passed, 25 skipped, 10,597 assertions.
  The only failures are the same two documented before this increment:
  `DeploymentOperationsReadinessTest::test_valid_production_preflight_passes_without_printing_secrets`
  and `TurnstileLoginTest::test_csp_allows_the_turnstile_widget`.
  All TB tests passed; the backend suite as a whole remains red for those baseline
  failures. No integration/merge/commit is attempted against that baseline.
- Step 5 implementation and verification complete with the limitations above.
  Step 6 is direct dated DOTS/weight monitoring on an accepted active endorsement.
