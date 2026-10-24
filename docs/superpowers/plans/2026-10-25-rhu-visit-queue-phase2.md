# RHU Visit Queue — Phase 2 (Referral Check-in) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Confirming a referral as Received enqueues the patient's visit in the same transaction, the Received transition no longer fails for BHC household members, referral delete refuses when a visit links it, and RHU staff can read the queue over HTTP.

**Architecture:** `RhuVisitQueueService::recordReferralArrival()` handles D4 linking and otherwise delegates to `checkIn()` with key `referral-{id}`. `ReferralWorkflowService::transition()` calls it inside its existing transaction. A thin `RhuVisitController` exposes `find`/`list` through a presenter-style private method.

**Tech Stack:** Laravel 13, PHP 8.5, PHPUnit 12, in-memory SQLite.

**Spec:** `docs/superpowers/specs/2026-10-25-rhu-visit-queue-phase2-referral-check-in-design.md` (decisions P2-1..P2-7); parent `docs/superpowers/specs/2026-10-24-rhu-visit-queue-design.md`.

## Global Constraints

- Additive schema only; never run migrations or tests against Supabase (`phpunit.xml` uses `sqlite` `:memory:`).
- Referral status values, `referral_updates`, BHC notifications, audit log and cache invalidation behave exactly as before for every transition.
- The queue payload never contains `tracking_id`, `qr_code_value` or any QR token field (D7).
- No BHC behaviour change except the household-member ownership skip (P2-4).
- Run from `backend/`; test command `php artisan test --filter=<Name>`; full suite `php artisan test`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Referred patient whose record is `inactive` reaches Received → `checkIn()` raises a `patient_id` validation error, so Received is refused with 422 and nothing changes (no silent queue skip). (Task 1)
2. Late arrival No-Show → Received **without** the required note → 422 as today, and no visit is created. (Task 1)
3. `?include_closed=yes` or any truthy string → treated as boolean via `$request->boolean()`; garbage values are false. (Task 3)
4. RHU account without `clinical.history` (explicit `permissions` lacking it) → 403 on both read endpoints. (Task 3)
5. Deleting a referral after its visit was closed → still 409 (any linked visit, open or closed, blocks the delete). (Task 2)

---

## File Structure

| File | Change |
|---|---|
| `app/Services/RhuVisitQueueService.php` | + `recordReferralArrival()` |
| `app/Services/ReferralWorkflowService.php` | call the hook on transitions into Received; household skip in `linkPatientToReceivingRhu()` |
| `app/Http/Controllers/Api/ReferralController.php` | `destroy()` 409 guard |
| `database/migrations/2026_10_25_000002_add_referral_index_to_rhu_visit_queue_entries.php` | index on `referral_id` |
| `app/Http/Controllers/Api/RhuVisitController.php` | new, `index`, `show` |
| `routes/api.php` | two GET routes in the `role:rhu` group |
| `app/Http/Middleware/EnforceActionPermissions.php` | `/rhu-visits` read → `clinical.history` |
| `tests/Feature/RhuReferralArrivalTest.php` | Task 1 |
| `tests/Feature/ReferralVisitDeleteGuardTest.php` | Task 2 |
| `tests/Feature/RhuVisitApiTest.php` | Task 3 |

---

### Task 1: Arrival hook and household fix

**Files:** Modify `app/Services/RhuVisitQueueService.php`, `app/Services/ReferralWorkflowService.php`; Test `tests/Feature/RhuReferralArrivalTest.php`

**Interfaces:**
- Consumes: Phase 1 `RhuVisitQueueService::checkIn(User, int, ?int, string): array{entry, created}`, `RhuVisitQueueEntry::active()`.
- Produces: `public function recordReferralArrival(User $user, Referral $referral): RhuVisitQueueEntry` and `public const ARRIVAL_KEY_PREFIX = 'referral-';`.

- [ ] **Step 1: Write the failing tests** (HTTP through `PATCH /api/referrals/{id}/status`, RHU nurse with `staff_role` nurse, `Sanctum::actingAs($user, ['akay:access'])`, `seedAvailableProvider()` not needed because referrals are created directly with `Referral::create`):
  - `test_received_enqueues_one_waiting_referral_visit` — Pending → Received: 200; one entry with `source` referral, `referral_id`, referral's `patient_id`, `status` waiting, `checked_in_by` nurse id, `check_in_key` `referral-{id}`; `referral_updates` gains exactly one Received row; one `referral_received` notification for the BHC user.
  - `test_repeated_received_creates_no_second_visit` — second PATCH Received → `status_unchanged` true; entry count 1.
  - `test_late_arrival_from_no_show_enqueues_the_visit` — referral `No-Show`, PATCH Received with `remarks` → one visit.
  - `test_late_arrival_without_note_is_refused_and_creates_no_visit` — 422 on `remarks`; zero entries. *(Review Focus 2)*
  - `test_arrival_links_an_active_walk_in_visit` — existing active walk-in entry (no referral) for the patient at this RHU → after Received: still one entry, it now has `referral_id`, `source` still walk_in.
  - `test_arrival_leaves_a_visit_linked_to_another_referral_unchanged` — active entry already carrying referral X; Received on referral Y → 200, one entry, `referral_id` still X.
  - `test_household_member_can_be_received_without_ownership_change` — BHC household member (`household_id` set): Received → 200 (was 500); patient `rural_health_unit_id` still null, `barangay_health_center_id` unchanged; one visit.
  - `test_non_household_patient_keeps_the_receiving_rhu_link` — BHC patient without household: after Received `rural_health_unit_id` = RHU (unchanged behaviour).
  - `test_inactive_patient_arrival_is_refused_and_rolled_back` — patient `status` inactive: 422 with `patient_id` error; referral still Pending; zero entries; zero new `referral_updates`. *(Review Focus 1)*

- [ ] **Step 2: Run** `php artisan test --filter=RhuReferralArrivalTest` — Expected: FAIL (no visit created; household case 500).

- [ ] **Step 3: Implement `recordReferralArrival()`** — inside the caller's transaction: lock (`lockForUpdate`) the active entry for `(referral->rural_health_unit_id, referral->patient_id)`; if it exists and has no `referral_id`, set it and return it; if it exists with a referral, return it unchanged; otherwise return `checkIn($user, $referral->patient_id, $referral->id, self::ARRIVAL_KEY_PREFIX.$referral->id)['entry']`.

- [ ] **Step 4: Wire `transition()`** — inject `RhuVisitQueueService` into `ReferralWorkflowService`'s constructor; in the existing `if ($requested === Referral::STATUS_RECEIVED)` block call `linkPatientToReceivingRhu()` then `recordReferralArrival($request->user(), $referral)`, then the existing notification.

- [ ] **Step 5: Household skip** — in `linkPatientToReceivingRhu()` return early when `$referral->patient->household_id !== null && $referral->patient->barangay_health_center_id !== null`, with a one-line comment naming the exclusive-ownership rule.

- [ ] **Step 6: Run** `php artisan test --filter="RhuReferralArrivalTest|ReferralStatusStateMachineTest|RhuVisitQueue"` — Expected: PASS.

- [ ] **Step 7: Commit** `feat(rhu-queue): enqueue referral arrivals and fix Received for household members`.

---

### Task 2: Referral delete guard and index

**Files:** Create `database/migrations/2026_10_25_000002_add_referral_index_to_rhu_visit_queue_entries.php`; Modify `app/Http/Controllers/Api/ReferralController.php`; Test `tests/Feature/ReferralVisitDeleteGuardTest.php`

**Interfaces:** Produces index `rhu_visit_queue_entries_referral_idx` on `referral_id`; 409 body `{message: 'This referral has a recorded RHU visit and cannot be deleted.', code: 'REFERRAL_HAS_VISIT'}`.

- [ ] **Step 1: Failing tests** (`DELETE /api/referrals/{id}` as the receiving RHU nurse):
  - `test_referral_with_a_visit_cannot_be_deleted` — 409, code `REFERRAL_HAS_VISIT`, referral still exists.
  - `test_referral_with_a_closed_visit_still_cannot_be_deleted` — visit `closed_at` set → 409. *(Review Focus 5)*
  - `test_referral_without_a_visit_deletes_as_before` — 204, row gone.
  - `test_referral_index_exists` — `Schema::getIndexes('rhu_visit_queue_entries')` contains `rhu_visit_queue_entries_referral_idx`.
- [ ] **Step 2: Run** `php artisan test --filter=ReferralVisitDeleteGuardTest` — Expected: FAIL (500 / missing index).
- [ ] **Step 3: Implement** the migration (`up` adds the index, `down` drops it) and, in `destroy()` after `authorizeReferral`, return the 409 JSON when `RhuVisitQueueEntry::where('referral_id', $referral->id)->exists()`.
- [ ] **Step 4: Run** the same filter — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rhu-queue): refuse deleting referrals with a recorded visit`.

---

### Task 3: Queue read API

**Files:** Create `app/Http/Controllers/Api/RhuVisitController.php`; Modify `routes/api.php`, `app/Http/Middleware/EnforceActionPermissions.php`; Test `tests/Feature/RhuVisitApiTest.php`

**Interfaces:**
- Consumes: `RhuVisitQueueService::find(User, int)`, `list(User, bool)`.
- Produces: `GET /api/rhu-visits` → `{data: Visit[]}`; `GET /api/rhu-visits/{id}` → `{data: Visit}`. `Visit` = `{id, source, status, checked_in_at, closed_at, waiting_minutes, referral: {id, sending_bhc} | null, patient: PatientIdentity::response($patient, false)}`; `waiting_minutes` = whole minutes from `checked_in_at` to `closed_at ?? now()`; `sending_bhc` = the referral's BHC name.

- [ ] **Step 1: Failing tests:**
  - `test_rhu_staff_list_own_active_visits_oldest_first` — two own visits + one other-RHU visit + one closed own visit → two ids in `checked_in_at` order.
  - `test_include_closed_adds_closed_visits` — `?include_closed=1` includes the closed one; `?include_closed=nope` does not. *(Review Focus 3)*
  - `test_payload_shape_has_no_tracking_or_qr_values` — referred visit: `data.0.referral.sending_bhc` equals BHC name, `data.0.waiting_minutes` equals 15 with a frozen clock; `assertJsonMissingPath` for `data.0.referral.tracking_id` and `data.0.referral.qr_code_value`; the JSON string contains neither the referral's `tracking_id` nor `qr_code_value`.
  - `test_show_returns_own_visit_and_hides_other_rhu_visit` — own 200; other RHU 404.
  - `test_bhc_and_admin_cannot_read_the_queue` — 403 for both endpoints.
  - `test_doctor_can_read_the_queue` — `staff_role` doctor → 200.
  - `test_rhu_account_without_clinical_history_is_denied` — `permissions` `['patients.register']` → 403. *(Review Focus 4)*
- [ ] **Step 2: Run** `php artisan test --filter=RhuVisitApiTest` — Expected: FAIL (404 route).
- [ ] **Step 3: Implement** the controller (actions call the service; one private `present(RhuVisitQueueEntry): array`, eager-loading `referral.barangayHealthCenter`); add `Route::get('/rhu-visits', ...)` and `Route::get('/rhu-visits/{visit}', ...)->whereNumber('visit')` inside the `role:rhu` group; add `str_contains($path, '/rhu-visits') => $read ? 'clinical.history' : 'rhu.manage',` before the `/referrals` rule.
- [ ] **Step 4: Run** the same filter — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rhu-queue): add RHU visit queue read API`.

---

### Task 4: Full suite and report

- [ ] **Step 1:** `php artisan test` — Expected: 0 failures (skips are the existing opt-in tests).
- [ ] **Step 2:** `git diff --stat c3ac137..HEAD` — only the files in File Structure plus this plan.
- [ ] **Step 3:** Final whole-branch review by a fresh reviewer; fix Critical/Important with a failing test first; report and stop before Phase 3.
