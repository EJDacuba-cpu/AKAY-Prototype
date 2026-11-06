# RHU Walk-in pending referral awareness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When Walk-in Check-in selects a patient with a Pending referral to this RHU, show a Pending BHC Referral notice and route staff to Incoming Referrals instead of creating a walk-in visit.

**Architecture:** Add a facility-scoped pending-referral lookup on the RHU visit/intake surface (identity summary only). Walk-in Check-in Details consumes it when a patient is selected; Confirm Check-in is replaced by View Incoming Referral when `count > 0`.

**Tech Stack:** Laravel / PHPUnit; React; existing `ReferralArrivalSummary`, `FacilityAccessService`, `WalkInCheckInPanel`.

**Spec:** `docs/superpowers/specs/2026-11-05-rhu-walk-in-pending-referral-awareness-design.md`

## Global Constraints

- Do not change referral status from Walk-in Check-in; do not create a second queue; do not alter QR/manual receive.
- Pending only blocks walk-in confirm; Received/Completed patients remain walk-in eligible when no active visit.
- Multiple Pending: return full list + count; never silently pick one.
- Payload: intake identity only (tracking_id, status, sending_bhc, referred_at, referral_id) — no clinical fields.
- Permission: `patients.register` OR `rhu.intake` OR `rhu.manage`.
- Preserve two-panel layout and existing check-in/search/recent behavior.

---

## File Structure

| File | Role |
|------|------|
| `backend/app/Services/RhuVisitQueueService.php` | `pendingReferralsForCheckIn(User, int patientId): array` |
| `backend/app/Http/Controllers/Api/RhuVisitController.php` | `pendingReferrals` action |
| `backend/routes/api.php` | `GET /rhu-visits/patients/{patient}/pending-referrals` |
| `backend/app/Http/Middleware/EnforceActionPermissions.php` | duty for the new path |
| `backend/tests/Feature/RhuWalkInPendingReferralLookupTest.php` | Task 1 tests |
| `frontend/src/services/rhuVisitService.js` | `listPendingReferralsForCheckIn(patientId)` |
| `frontend/src/components/features/rhu-queue/WalkInCheckInPanel.jsx` | notice + CTA |
| Optional util + test | pure helpers for CTA/path if extracted |

---

### Task 1: Backend pending-referral lookup

**Files:** Modify service, controller, routes, middleware; Create `RhuWalkInPendingReferralLookupTest.php`

**Interfaces:**
- Produces: `RhuVisitQueueService::pendingReferralsForCheckIn(User $user, int $patientId): array{count:int, referrals:list<array>}` where each referral is slim: `referral_id`, `tracking_id`, `status`, `sending_bhc`, `referred_at` (from `ReferralArrivalSummary::for` keys).
- Produces: `GET /api/rhu-visits/patients/{patient}/pending-referrals` → `{ data: { count, referrals } }`.
- Duty: path ends with `/pending-referrals` → allow if user has `patients.register` OR `rhu.intake` OR `rhu.manage` (implement as early middleware branch returning null when any of those present, else `'patients.register'`).
- Patient must pass walk-in eligibility (`scopeRhuWalkInPatients` / authorize); else 403/404 consistent with other RHU visit patient lookups.
- Filter: `rural_health_unit_id` = user's RHU, `patient_id` = patient, `status` = `Referral::STATUS_PENDING`. Order oldest first (`orderBy('id')` or referral datetime).

- [ ] **Step 1: Failing tests** in `RhuWalkInPendingReferralLookupTest.php`:
  - `test_returns_pending_referrals_for_walk_in_eligible_patient` — one Pending → count 1; includes tracking_id, sending_bhc; no medical fields.
  - `test_received_referral_does_not_appear` — Received only → count 0.
  - `test_multiple_pending_are_all_returned_oldest_first` — two Pending → count 2; both tracking ids; order preserved.
  - `test_other_rhu_pending_is_hidden` — Pending for another RHU → count 0 for this nurse.
  - `test_active_visit_lookup_still_independent` — (optional assert endpoint does not invent visits).
  - `test_without_register_intake_or_manage_is_forbidden` — clinical.history only → 403.
  - `test_register_only_may_read` — permissions `['patients.register']` → 200.
  - `test_inaccessible_patient_is_forbidden` — other facility patient → 403.

- [ ] **Step 2:** `php artisan test --filter=RhuWalkInPendingReferralLookupTest` — Expected: FAIL (404).

- [ ] **Step 3: Implement** service method + controller + route (before `{visit}` routes) + middleware. Reuse `authorizeRhuUser` / facility patient access patterns from `searchPatients` / `checkIn`. Map rows through `ReferralArrivalSummary::for` then pick only the slim keys (or return summary and document UI uses subset).

- [ ] **Step 4:** Run filter — Expected: PASS. Also `php artisan test --filter=RhuWalkIn` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(rhu-intake): lookup pending referrals for walk-in check-in`

---

### Task 2: Walk-in Check-in Details UI

**Files:** Modify `rhuVisitService.js`, `WalkInCheckInPanel.jsx`; optional small util/test.

**Interfaces:**
- Consumes: `listPendingReferralsForCheckIn(patientId)` → `{ count, referrals }`.
- When selected patient changes (including URL `patient_id`), fetch pending referrals; clear on reset.
- Priority in Details: success → loading → error → **active visit Already Checked In** → **pending referral notice** → normal confirm.
- Notice copy: title **Pending BHC Referral**; body mentions referring BHC and that arrival must be verified via Incoming Referrals.
- Single referral: primary control **View Incoming Referral** → `Link` to `/rhu/referrals/${encodeURIComponent(tracking_id)}`.
- Multiple: list each tracking ID + BHC with individual links; primary may say **View Incoming Referrals** linking to `/rhu/incoming-referrals` OR show only per-row links (prefer per-row links so `intake_staff` without `rhu.manage` can still open detail pages).
- Confirm Check-in hidden/disabled when `count > 0`.
- Preserve status dots for ready / already-in-queue; pending may use info/amber dot + “Pending BHC Referral”.

- [ ] **Step 1:** Add service method; wire fetch in panel when `selected?.id` set.
- [ ] **Step 2:** Implement notice + CTA; keep fixed-height panel / bottom action area.
- [ ] **Step 3:** `cd frontend && npm run test:walk-in` — Expected: PASS (add a tiny util test if you extract `walkInReferralCta(pending)`).
- [ ] **Step 4: Commit** `feat(rhu-intake): guide walk-in desk to pending referrals`

---

### Task 3: Spec docs + verification

**Files:** Spec already written; commit if not yet tracked. Grep that Walk-in never PATCHes referral status.

- [ ] **Step 1:** Confirm no status mutation from panel; run backend + frontend focused suites.
- [ ] **Step 2: Commit** docs if needed: `docs(rhu-intake): pending referral awareness for walk-in check-in`

---

## Self-review

| Spec item | Task |
|-----------|------|
| Detect Pending for current RHU | 1 |
| Notice + View Incoming Referral | 2 |
| Already Checked In precedence | 2 |
| Multiple Pending no silent pick | 1+2 |
| Received still walk-in eligible | 1 test |
| Cross-facility hidden | 1 test |
| No status change / no new queue | Global + 3 |
