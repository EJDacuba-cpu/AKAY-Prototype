# Outbound DR-TB referral implementation plan

> Execute inline using superpowers:executing-plans and test-driven-development.

**Goal:** Step 7: RHU physician authorizes an outbound PMDT/DR-TB referral after
finalized DR-TB assessment, records its disposition, and prints a frozen slip.
**Spec:** docs/superpowers/specs/2026-11-09-tb-case-workflow-design.md
**Architecture:** Referral and append-only event history belong to the original
patient/RHU/source consultation, independently of DS-TB treatment registration.
Pin patient identity, diagnosis, authority and reviewed labs. UUID/hash retries,
source revisions and locked versions protect issuance and status updates.
**Stack:** Laravel/PHP, React/JavaScript; SQLite API tests and mounted DOM tests.

## Contracts
- New `tb_dr_referrals`: patient, owner RHU, source consultation (composite FK),
  patient/source snapshots, destination_name/address/contact, reason, status,
  version, authorized_by/name/at. New `tb_dr_referral_events`: referral/version
  unique, status, note, event_on, recorder attribution/time, UUID/hash unique.
  Restrict deletion; one noncancelled referral per consultation (partial index).
- Statuses: issued -> sent or cancelled; sent -> attendance_reported or cancelled.
  attendance_reported/cancelled terminal. Cancelled referrals may be replaced from
  the same consultation after a fresh preview. History is retained.
- GET/POST `/health-records/{id}/tb-dr-referral`: owner RHU preview/issue. Preview
  returns current/history, source_revision, eligibility/reason, can_authorize,
  frozen-source preview and Manila today. Issue requires source_revision,
  destination_name/address/contact (last two optional), reason, confirmed, UUID.
- GET `/tb-dr-referrals/{id}`: owner RHU/admin detail, snapshots, events, allowed
  statuses and capabilities. GET `/tb-dr-referrals/{id}/pdf`: same scope.
- POST `/tb-dr-referrals/{id}/status`: version, status, note, event_on (from issue
  date through Manila today), UUID. All values are RHU-recorded reports. No
  external portal acknowledgement, treatment registration or final outcome.
- Writes require current owning RHU physician with conditions.confirm,
  consultations.finalize, referrals.submit and clinical.history. RHU staff/admin
  may read; BHC/other RHU cannot read these outbound documents.
- Eligibility: exactly one recognized structured TB diagnosis, TB Disease + one
  of rr_tb/mdr_tb/clinically_mdr_tb/xdr_tb/other, finalized by an RHU physician.
  Use durable attestation; conservative legacy fallback matches existing Form 4B.
  Active patient required for new issuance. Never infer resistance from lab text.
- Keep existing DS-TB eligibility guard: every DR variant and TB Infection must
  fail Form 4B registration. No automatic closure or alteration of prior DS cases.
- Freeze reviewed labs/addenda; source revision covers clinical data and latest
  referral version. Lock patient -> source -> lab rows for issuance, and source ->
  referral for status. Fresh authorization before retries; retries return current
  state without replaying a terminal event. Clinical and ownership fields prohibited.
- Destination is descriptive text, not a facility account. No messages, hospital
  portals, Form 4C, external-service calls or DR treatment/outcome module.
- Preserve source/legacy JSON and earlier uncommitted increments. No application
  database migration, commit or push.

## Task 1: API and storage
Create migration 000006, TbDrReferral/TbDrReferralEvent models, TbDrReferralService,
controller/requests and TbDrReferralTest. Add routes/permission mapping. Share
physician-finalization provenance check through TbClinicalAuthority (existing DS
registration uses the same check); existing registration behavior stays covered.
- [x] Write endpoint regressions and observe missing-route failures.
- [x] Implement locked source preview/issue, immutable snapshots, scoped reads,
  status transitions, idempotency and attribution.
- [x] Cover DR variants vs DS/Infection/draft/ambiguous/nonphysician sources,
  every role/duty/facility boundary, stale source/lab/status, retries, terminal
  state, cancellation/reissue, DB uniqueness, data preservation and rollback.
  Run `php vendor/bin/phpunit tests/Feature/TbDrReferralTest.php --do-not-cache-result`;
  expected pass. Run existing registration/authority tests after shared check.

## Task 2: Slip and RHU UI
Create tb-dr-referral Blade, TbDrReferralPanel, service/helpers and tests. Mount on
recognized DR-TB source in RHURecordDetails; retain visible Form 4B blocked notice.
- [x] Observe RED for actual PDF snapshot/scope and rendered/mounted panel tests.
- [x] Add explicit physician authorization, destination/reason, reviewed source,
  recorded status/note/date and event history; use server capabilities. Keep drafts
  and submission identity across background checks; hide data after access denial.
- [x] Print patient/source/destination/authorizing physician and RHU-recorded latest
  disposition with cancelled marking. Use snapshots, not mutable source/profile.
- [x] Run frontend suite, build, scoped lint, PHP syntax/Pint and diff checks.

## Task 3: Review and verification
- [x] One fresh read-only review, Important fixes RED to GREEN.
- [x] Full backend/frontend verification; report the two existing baseline failures
  by name. No claim of live PostgreSQL concurrency or visual browser verification.

## Review focus
- Terminal retries cannot resurrect cancelled/attended referrals or hide reissue.
- Changed lab evidence/source assessment must force a fresh review before issue.
- Patient/RHU reassignment must not alter the printed historical author/identity.
- Outbound status must never be described as an external portal acknowledgement.
- Draft/UUID retention and scoped error handling must survive reconnect/access loss.

## Execution ledger
- Baseline: Eric-Manually-Fixer, HEAD e866e5d; earlier approved uncommitted Steps
  3–6 are retained. Continue the current authorized checkout and existing UI style.
- Pre-flight: finalized assessment/authority/lab evidence feeds both DS registration
  and DR referral; the new flow never creates a treatment case or changes snapshots.
- Ruling: physician plus existing referral/finalization/confirmation duties controls
  every outbound update; other RHU clinical readers review only. Cost: physician
  records administrative progress too until staff delegation is explicitly added.
- Ruling: terminal attendance is a reported disposition, not a DR treatment outcome;
  reissue from a cancelled referral needs fresh review. Cost: a new referral after
  reported attendance needs a new consultation rather than rewriting history.
- Ruling: source diagnosis governs Form 4B eligibility. Do not infer global lifetime
  DS exclusion or auto-close an earlier DS case from an outbound referral. Cost:
  later clinical reassessment/DS-case closure remains explicit physician work.
- Task 1 RED: initial test helper collided with PHPUnit's final status() method;
  renamed helper, then all 12 endpoint tests failed on absent routes. The first
  implementation exposed a Carbon-vs-calendar-date comparison and an unrefreshed
  fixture missing database-default columns; normalized the comparison to Y-m-d
  and refreshed the fixture. All 44 referral/registration/authority tests passed.
- Added DB partial-uniqueness/admin/foreign-RHU coverage and populated shared-case
  rollback preservation. Final focused referral suite: 14 tests, 163 assertions.
- Task 2 RED: helper and mounted UI modules absent before implementation, then all
  9 tests passed. Real components, query cache and API services; only HTTP faked.
  Coverage: read-only RHU, uncertain-save reconnect/UUID retention, changed-source
  explicit review + fresh confirmation, status payload/history, denied PDF access.
- Source revision includes the minimal patient identity and latest referral
  version as well as assessment and reviewed lab evidence. Background rechecks
  suspend the form DOM and preserve its state; changed evidence requires explicit
  review before a fresh confirmation, rather than silently rebinding consent.
- Production build and all 6 scoped frontend files pass ESLint; Pint applied.
- Full frontend: all 1,909 tests passed, zero skipped. PHP syntax (11 increment
  files), scoped Pint and git diff --check passed. Build retains the existing
  large-chunk warning. No TypeScript configuration is present.
- No application database migration, commit, push or outbound communication
  performed. Schema tests use isolated SQLite databases. No live PostgreSQL
  concurrency or visual browser verification is claimed; mounted DOM tests run.
- Full backend: 1,794 tests, 1,767 passed, 25 skipped, 10,888 assertions; all TB
  tests passed. The same two documented baseline failures remain:
  `DeploymentOperationsReadinessTest::test_valid_production_preflight_passes_without_printing_secrets`
  and `TurnstileLoginTest::test_csp_allows_the_turnstile_widget`.
- Fresh review found one Important frontend issue: a confirmed PDF/status access
  denial followed by an offline-paused preview recheck left successful cached
  data visible because isFetching is false while paused. No Critical or Minor
  issues found; no concrete backend defect. No second reviewer dispatched.
- Final fix RED to GREEN: the mounted denial/offline regression initially displayed
  private patient/evidence/destination plus a stuck Saving state. Latch confirmed
  denial independently of query status, treat paused checks as unverified, and
  release busy controls without awaiting an offline check. Clear the latch only
  after successful explicit scope revalidation. The test now proves hidden cached
  data and subsequent authorized recovery with the draft preserved. All 10 focused
  frontend tests pass. Only frontend changed after the full backend run.
- Review dispositions: excluded external portals/messages/Form 4C remain excluded;
  DR treatment and automatic closure of prior DS cases remain explicit later
  physician work. Live PG concurrency and visual layout remain unverified, as
  documented. Previous approved increments were reviewed only at shared interfaces;
  their two baseline backend failures remain reported, not concealed or patched.
- Final frontend after review fix: all 1,910 tests passed, zero skipped; production
  build passed (existing large-chunk warning); all 6 scoped files passed ESLint.
  Backend remains unchanged from the full run above. Final diff check passed.
- Step 7 complete. Next: Step 8 RHU follow-up laboratory loop and physician-only
  treatment outcome/closure controls, using the shared case and immutable history.
