# RHU Visit Queue — Phase 2: Referral Check-in — Design

Date: 2026-10-25 · Status: awaiting spec review
Parent spec: `docs/superpowers/specs/2026-10-24-rhu-visit-queue-design.md` (decisions D1–D14 apply)
Builds on Phase 1: `rhu_visit_queue_entries`, `RhuVisitQueueService` (commits 7bc20a0..62c529e)

## Goal

When RHU staff confirm a referred patient's arrival (QR, tracking ID or the existing Received
action), the referral becomes `Received` and the visit enters today's queue in the same
transaction (D3), reusing the existing patient identity. Expose a read API for the queue so
Phase 4 can render it.

## Findings that shape this phase

1. **`Received` returns 500 for BHC household members.** `ReferralWorkflowService::
   linkPatientToReceivingRhu()` writes `rural_health_unit_id` onto the BHC-owned patient. Since
   2026-10-23 a household member must have exactly one owning facility
   (`patients_household_facility_exclusive`), so the write fails and the whole transition rolls
   back. Reproduced on SQLite; the PostgreSQL CHECK has the same rule.
2. **O6.** `DELETE /referrals/{id}` hard-deletes, while a visit's `referral_id` is
   `restrictOnDelete`. Once Phase 2 links visits, deleting a received referral would 500.
3. RHU read access to a referred patient already works through the referral
   (`FacilityAccessService::canAccessPatient`), so the queue needs no ownership change to show
   or check in a referred patient.

## Decisions

| # | Decision |
|---|---|
| P2-1 | Arrival hook lives inside `ReferralWorkflowService::transition()`, after the status update and patient link, for every transition **into** `Received` (Pending → Received and the No-Show late arrival). A retry of `Received` already returns early (`status_unchanged`), so it creates nothing. |
| P2-2 | Arrival key is deterministic: `referral-{referral_id}`. One referral arrives once; replays resolve to the same visit. |
| P2-3 | D4: if the patient already has an active visit at this RHU with no referral, that visit gains `referral_id`; source stays `walk_in`. If the active visit already carries a referral, it is left unchanged and `Received` still succeeds. No second entry in either case. |
| P2-4 | Finding 1 fix: `linkPatientToReceivingRhu()` skips the ownership write when the patient is a household member owned by a BHC (the write would break exclusive ownership). Other patients keep today's behaviour, so existing RHU record creation for referred patients does not regress. Visit-based clinical authorization for referred patients is Phase 6's job; whether to stop the ownership write entirely is decided there. |
| P2-5 | O6: keep `restrictOnDelete`. `ReferralController::destroy` answers **409** (`REFERRAL_HAS_VISIT`, "This referral has a recorded RHU visit and cannot be deleted.") when any visit links the referral. Add an index on `rhu_visit_queue_entries.referral_id` (additive migration). |
| P2-6 | Read API, RHU only: `GET /api/rhu-visits` (active visits, oldest first; `?include_closed=1` adds closed ones) and `GET /api/rhu-visits/{id}`. Duty: `clinical.history` (nurses and doctors both read the queue). Response per visit: id, source, status, checked_in_at, closed_at, waiting minutes, referral `{id, sending BHC name}` (no tracking or QR value, D7), and the patient identity fields the directory already exposes. |
| P2-7 | The visit is created by the user who confirmed arrival (`checked_in_by`). Referral status, BHC notification, audit log and cache invalidation stay exactly as today. |

## Out of scope

Walk-in check-in (Phase 3), UI (Phase 4), closing visits and the intake permission split
(Phase 5), any change to QR/tracking lookup endpoints (they stay lookup-only; staff confirm with
the existing Received action).

## Tests (in-memory SQLite)

- Pending → Received creates one waiting visit with `source = referral`, the referral's patient,
  `checked_in_by` = actor; referral status, `referral_updates`, BHC notification unchanged.
- Repeating Received creates nothing; No-Show → Received (with the required note) creates the visit.
- D4: active walk-in visit gains the referral link; no second entry; Received succeeds.
- Active visit already linked to another referral: unchanged; Received succeeds.
- BHC household member: Received succeeds (was 500), patient ownership unchanged, visit created.
- Non-household BHC patient: ownership link behaves as before.
- A failure inside the hook rolls back the Received transition (one test that forces it).
- Destroy: referral with a visit → 409 and still present; without a visit → 204 as before.
- Read API: own RHU only; BHC/admin denied; other RHU's visit 404; active-only default and
  `include_closed`; ordering; no tracking or QR value in the payload; duty `clinical.history` enforced.
- Full backend suite stays green.

## Risks

- The hook runs inside the core referral transaction: any unexpected exception now blocks
  `Received`. Mitigated by the D4/duplicate handling above and by the savepoint in
  `RhuVisitQueueService::insert()`.
- PostgreSQL concurrency remains unverified locally (parent spec O4).
