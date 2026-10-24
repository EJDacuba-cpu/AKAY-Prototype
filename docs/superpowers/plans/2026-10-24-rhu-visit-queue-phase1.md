# RHU Visit Queue — Phase 1 (Queue Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the persistent RHU visit queue table, model and a backend service that securely checks patients in, finds one visit and lists an RHU's visits.

**Architecture:** One additive migration creates `rhu_visit_queue_entries`. A partial unique index (one active visit per patient per RHU) and a unique idempotency key are the database-level guards. `RhuVisitQueueService` authorizes through the existing `FacilityAccessService`, resolves retries and duplicates before inserting, and re-resolves after a unique-constraint race. No routes, UI, referral changes or BHC changes.

**Tech Stack:** Laravel 13, PHP 8.5, PHPUnit 12, in-memory SQLite for tests (PostgreSQL in production).

**Spec:** `docs/superpowers/specs/2026-10-24-rhu-visit-queue-design.md` — section "Phase 1 — Queue foundation (detailed design)" and decisions D1, D2.

## Global Constraints

- Additive only: create one table; alter no existing table, model or service.
- Never run migrations or tests against Supabase. Tests use `phpunit.xml` (`DB_CONNECTION=sqlite`, `DB_DATABASE=:memory:`). Do not set `AKAY_TEST_PG_URL`.
- No BHC behaviour changes, no routes/controllers, no referral status changes, no UI.
- "Active" means `closed_at IS NULL`. Phase 1 defines only status `waiting`.
- `checked_in_at` is always server time (`now()`); never accept it from input.
- Check-in key: required, trimmed non-empty, at most 100 characters.
- All work runs from `backend/`. Test command: `php artisan test --filter=<Name>`.
- Match surrounding code style (constructor property promotion, `abort_unless` with the `FacilityAccessService` denial message, short docblocks only where a rule is non-obvious).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage only the files the task names.

## Review Focus

1. Blank or whitespace-only key, or a 101-character key → validation error on `check_in_key`, nothing inserted. (Task 2)
2. `referral_id` that does not exist → `ModelNotFoundException` (404), not a 500. (Task 2)
3. BHC-registered patient (no `rural_health_unit_id`) previously referred to this RHU checks in as a walk-in → allowed, because `canAccessPatient` grants access through the referral; patient row unchanged. (Task 2)
4. RHU user whose RHU has `status = inactive` → 403 on check-in, find and list. (Task 2, Task 3)
5. Two visits with the same `checked_in_at` (frozen clock) → listed in `id` order. (Task 3)

---

## File Structure

| File | Responsibility |
|---|---|
| `database/migrations/2026_10_24_000001_create_rhu_visit_queue_entries_table.php` | Table, indexes, source rules (PG `CHECK` / SQLite triggers), RLS |
| `app/Models/RhuVisitQueueEntry.php` | Model, constants, relations, `active()` scope |
| `app/Exceptions/RhuVisitCheckInKeyConflictException.php` | Same key, different payload (409) |
| `app/Exceptions/RhuVisitDuplicateActiveException.php` | Patient already has an active visit at this RHU (409), carries the entry |
| `app/Services/RhuVisitQueueService.php` | `checkIn`, `find`, `list` |
| `tests/Feature/RhuVisitQueueMigrationTest.php` | Schema and constraint tests |
| `tests/Feature/RhuVisitQueueServiceTest.php` | Service behaviour tests |

---

### Task 1: Table and model

**Files:**
- Create: `database/migrations/2026_10_24_000001_create_rhu_visit_queue_entries_table.php`
- Create: `app/Models/RhuVisitQueueEntry.php`
- Test: `tests/Feature/RhuVisitQueueMigrationTest.php`

**Interfaces:**
- Produces: table `rhu_visit_queue_entries` with columns `id, rural_health_unit_id, patient_id, referral_id, source, status, checked_in_at, closed_at, checked_in_by, check_in_key, created_at, updated_at`.
- Produces: `App\Models\RhuVisitQueueEntry` with `SOURCE_REFERRAL = 'referral'`, `SOURCE_WALK_IN = 'walk_in'`, `STATUS_WAITING = 'waiting'`; relations `patient()`, `referral()`, `ruralHealthUnit()`, `checkedInBy()` (`BelongsTo User` via `checked_in_by`); local scope `active()`; casts `checked_in_at`, `closed_at` → `datetime`.
- Produces: index names `rhu_visit_queue_entries_key_unique` (`rural_health_unit_id, check_in_key`), `rhu_visit_queue_entries_active_patient_unique` (partial, `WHERE closed_at IS NULL`), `rhu_visit_queue_entries_listing_idx` (`rural_health_unit_id, closed_at, checked_in_at`).

- [ ] **Step 1: Write the failing migration test**

Test class uses `RefreshDatabase`; helper `fixtures(): array{rhu, otherRhu, patient, referral}` creates two active RHUs, one patient (`rural_health_unit_id` = rhu), one referral to rhu (`tracking_id` `'AKY-TEST-'.uniqid()`, `qr_code_value` from `app(ReferralService::class)->makeLegacyQrPlaceholder()`, a BHC, `reason_for_referral` `'Test'`, `status` `Pending`). Helper `row(array $overrides): array` returns a valid walk-in row (`source` walk_in, `status` waiting, `checked_in_at` now, `check_in_key` `uniqid()`).

Tests (insert with `DB::table('rhu_visit_queue_entries')->insert(...)`):
- `test_table_has_expected_columns` — `Schema::hasColumns` with the 12 columns above.
- `test_second_active_entry_for_same_patient_and_rhu_is_rejected` — second active row, different key → `expectException(UniqueConstraintViolationException::class)`.
- `test_closed_entry_does_not_block_a_new_active_entry` — first row with `closed_at` set, second active row inserts; count is 2.
- `test_same_patient_may_be_active_at_two_rhus` — rows for `rhu` and `otherRhu` both insert.
- `test_check_in_key_is_unique_per_rhu` — same key twice at one RHU → `UniqueConstraintViolationException`; same key at `otherRhu` inserts.
- `test_unknown_source_is_rejected` — `source => 'kiosk'` → `QueryException`.
- `test_referral_source_requires_referral` — `source => 'referral', referral_id => null` → `QueryException`.
- `test_walk_in_may_carry_a_referral_link` — `source => 'walk_in', referral_id => $referral->id` inserts.
- `test_down_removes_only_the_queue_table` — `$migration = require database_path('migrations/2026_10_24_000001_create_rhu_visit_queue_entries_table.php'); $migration->down();` → `assertFalse(Schema::hasTable('rhu_visit_queue_entries'))`, `assertTrue(Schema::hasTable('referrals'))` and `patients`; then `$migration->up()` and `assertTrue(Schema::hasTable(...))`.
- `test_model_active_scope_excludes_closed_entries` — one open, one closed row → `RhuVisitQueueEntry::active()->count() === 1`.

- [ ] **Step 2: Run it to verify it fails**

Run: `php artisan test --filter=RhuVisitQueueMigrationTest`
Expected: FAIL — table `rhu_visit_queue_entries` does not exist.

- [ ] **Step 3: Write the migration**

Columns and foreign keys per the spec table (`rural_health_unit_id`, `patient_id`, `referral_id` → `restrictOnDelete`; `checked_in_by` → `nullOnDelete`; `source` string(20); `status` string(30) default `waiting`; `check_in_key` string(100); `checked_in_at` not null; `closed_at` nullable). Create the key unique and listing index through the Blueprint with the names above; create the partial unique index with `DB::statement('CREATE UNIQUE INDEX rhu_visit_queue_entries_active_patient_unique ON rhu_visit_queue_entries (rural_health_unit_id, patient_id) WHERE closed_at IS NULL')` (works on both drivers).

Source rules, rule text `source IN ('referral', 'walk_in') AND (source = 'walk_in' OR referral_id IS NOT NULL)`:
- pgsql: `ALTER TABLE public.rhu_visit_queue_entries ADD CONSTRAINT rhu_visit_queue_entries_source_check CHECK (...)`, then `ALTER TABLE public.rhu_visit_queue_entries ENABLE ROW LEVEL SECURITY`.
- sqlite: `BEFORE INSERT` and `BEFORE UPDATE` triggers named `rhu_visit_queue_entries_source_{INSERT|UPDATE}` with the same rule on `NEW.` columns, `RAISE(ABORT, 'Invalid visit source')` — follow `exclusiveOwner()` in `2026_10_23_000001_add_rhu_ownership_to_households.php`.

`down()`: drop the SQLite triggers if present, then `Schema::dropIfExists('rhu_visit_queue_entries')`.

- [ ] **Step 4: Write the model** per the Interfaces block. `$fillable` = every column except `id` and timestamps.

- [ ] **Step 5: Run the test to verify it passes**

Run: `php artisan test --filter=RhuVisitQueueMigrationTest`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add database/migrations/2026_10_24_000001_create_rhu_visit_queue_entries_table.php app/Models/RhuVisitQueueEntry.php tests/Feature/RhuVisitQueueMigrationTest.php
git commit -m "feat(rhu-queue): add rhu_visit_queue_entries table and model"
```

---

### Task 2: Check-in

**Files:**
- Create: `app/Exceptions/RhuVisitCheckInKeyConflictException.php`
- Create: `app/Exceptions/RhuVisitDuplicateActiveException.php`
- Create: `app/Services/RhuVisitQueueService.php`
- Test: `tests/Feature/RhuVisitQueueServiceTest.php`

**Interfaces:**
- Consumes: Task 1 model and table; `FacilityAccessService::hasValidFacilityAssignment(User)`, `authorizePatient(User, Patient)`, `authorizeRhuReferralAction(User, Referral)`.
- Produces: `RhuVisitQueueService::__construct(private readonly FacilityAccessService $facilityAccess)`.
- Produces: `public function checkIn(User $user, int $patientId, ?int $referralId, string $checkInKey): array` returning `['entry' => RhuVisitQueueEntry, 'created' => bool]`.
- Produces: `protected function insert(array $attributes): RhuVisitQueueEntry` — the only place that writes; `DB::transaction(fn () => RhuVisitQueueEntry::create($attributes))` so a nested caller (Phase 2, inside `transition()`) gets a savepoint and keeps its own transaction usable after a violation on PostgreSQL.
- Produces: `RhuVisitCheckInKeyConflictException` (`render()` → 409, `code` `VISIT_CHECK_IN_KEY_CONFLICT`).
- Produces: `RhuVisitDuplicateActiveException` with `public readonly RhuVisitQueueEntry $entry` (`render()` → 409, `code` `VISIT_ALREADY_ACTIVE`, `active_visit_id`). Both follow `ReferralWorkflowConflictException`.

- [ ] **Step 1: Write the failing tests**

Class uses `RefreshDatabase`. Helpers: `rhu(string $status = 'active')`, `rhuUser(RuralHealthUnit $rhu)` (role `rhu`, staff_role `nurse`, status active), `bhcUser()`, `adminUser()`, `patient(array $attrs)`, `referral(Patient $p, RuralHealthUnit $rhu, array $attrs = [])` (as in Task 1), `service()` → `app(RhuVisitQueueService::class)`.

Facility isolation:
- `test_bhc_and_admin_users_cannot_check_in` — each → `HttpException` with status 403.
- `test_rhu_user_with_inactive_facility_cannot_check_in` — RHU `status inactive` → 403. *(Review Focus 4)*
- `test_patient_outside_the_rhu_is_denied` — patient owned by another RHU, no referral → 403.
- `test_referral_to_another_rhu_is_denied` — referral's `rural_health_unit_id` is another RHU → 403.

Referred / walk-in identity:
- `test_referred_check_in_records_referral_source_and_patient` — `created` true; entry `source` `referral`, `referral_id`, `patient_id` = referral's patient, `rural_health_unit_id`, `status` `waiting`, `checked_in_by` = user id, `checked_in_at` equals frozen `Carbon::setTestNow` time.
- `test_referral_for_a_different_patient_is_rejected` — `ValidationException` with key `referral_id`; no row.
- `test_walk_in_check_in_has_no_referral` — `source` `walk_in`, `referral_id` null.
- `test_check_in_changes_no_patient_referral_or_record_data` — snapshot `patients` row, `referrals` row (`status`), `health_records` count before; identical after.
- `test_previously_referred_bhc_patient_may_check_in_as_walk_in` — patient with `barangay_health_center_id` set, no `rural_health_unit_id`, one referral to this RHU; walk-in check-in succeeds; `patients.rural_health_unit_id` still null. *(Review Focus 3)*
- `test_inactive_patient_cannot_check_in` — patient `status inactive` → `ValidationException` key `patient_id`.
- `test_unknown_referral_is_not_found` — `referralId` 999999 → `ModelNotFoundException`. *(Review Focus 2)*

Key validation:
- `test_blank_or_overlong_key_is_rejected` — keys `''`, `'   '`, `str_repeat('k', 101)` → `ValidationException` key `check_in_key`; table empty. *(Review Focus 1)*

Idempotent retries:
- `test_retry_with_same_key_and_payload_returns_existing_entry` — second call `created` false, same `id`, table count 1.
- `test_same_key_with_different_payload_conflicts` — same key, different patient → `RhuVisitCheckInKeyConflictException`; count 1.

Duplicate prevention:
- `test_active_patient_with_new_key_is_a_duplicate` — second key → `RhuVisitDuplicateActiveException` whose `entry->id` is the first entry; count 1.
- `test_race_loser_resolves_to_the_winning_entry` — anonymous subclass `new class(app(FacilityAccessService::class)) extends RhuVisitQueueService` overriding `insert()` to first `DB::table('rhu_visit_queue_entries')->insert(...)` a competing active row for the same patient (different key), then `return parent::insert($attributes);`. Call → `RhuVisitDuplicateActiveException` carrying the competing row; count 1.
- `test_race_on_same_key_resolves_to_idempotent_replay` — override inserts a competing row with the **same** key and payload → returns `created` false with the competing row's id.

Repeat visits:
- `test_new_visit_allowed_after_previous_one_is_closed_same_day` — check in, set `closed_at = now()` on it directly, check in again with a new key the same frozen day → `created` true; two rows for the patient.

- [ ] **Step 2: Run them to verify they fail**

Run: `php artisan test --filter=RhuVisitQueueServiceTest`
Expected: FAIL — class `App\Services\RhuVisitQueueService` not found.

- [ ] **Step 3: Write both exceptions** per the Interfaces block.

- [ ] **Step 4: Implement `checkIn()` and `insert()`**

Order: authorize user (`abort_unless($user->isRhu() && hasValidFacilityAssignment($user), 403, 'This resource is outside your assigned facility.')`) → trim and validate key → `Patient::findOrFail` → `authorizePatient` → reject inactive → if referral: `Referral::findOrFail`, `authorizeRhuReferralAction`, patient match → `resolveExisting()` → `insert()` → on `Illuminate\Database\UniqueConstraintViolationException` call `resolveExisting()` again and rethrow the original if it finds nothing.

`private function resolveExisting(int $rhuId, string $key, int $patientId, ?int $referralId, string $source): ?array` returns `['entry' => $e, 'created' => false]` for an exact key replay, throws the key-conflict exception when the key matches with different `patient_id`/`referral_id`/`source`, throws the duplicate exception when an `active()` entry exists for the RHU + patient, else `null`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `php artisan test --filter=RhuVisitQueueServiceTest`
Expected: PASS (18 tests).

- [ ] **Step 6: Commit**

```bash
git add app/Exceptions/RhuVisitCheckInKeyConflictException.php app/Exceptions/RhuVisitDuplicateActiveException.php app/Services/RhuVisitQueueService.php tests/Feature/RhuVisitQueueServiceTest.php
git commit -m "feat(rhu-queue): add idempotent, facility-scoped visit check-in"
```

---

### Task 3: Find and list

**Files:**
- Modify: `app/Services/RhuVisitQueueService.php`
- Test: `tests/Feature/RhuVisitQueueServiceTest.php`

**Interfaces:**
- Consumes: Task 2 service and helpers.
- Produces: `public function find(User $user, int $entryId): RhuVisitQueueEntry` — throws `ModelNotFoundException` for another RHU's entry.
- Produces: `public function list(User $user, bool $activeOnly = true): Illuminate\Database\Eloquent\Collection` — this RHU only, `orderBy('checked_in_at')->orderBy('id')`, `with('patient')`.
- Both use the same authorization line as `checkIn()`; extract it to `private function authorizeRhuUser(User $user): int` returning the RHU id, and use it in `checkIn()` too.

- [ ] **Step 1: Write the failing tests**

- `test_find_returns_own_rhu_entry` — same id, `patient` loadable.
- `test_find_hides_other_rhu_entry` — entry of another RHU → `ModelNotFoundException`.
- `test_find_and_list_deny_bhc_admin_and_inactive_facility` — each of the three users → 403 for `find` and `list`. *(Review Focus 4)*
- `test_list_returns_only_own_active_entries_oldest_first` — entries at 8:00, 9:00 (own RHU) and 8:30 (other RHU) plus one closed own entry → ids `[08:00, 09:00]`; `relationLoaded('patient')` true.
- `test_list_with_active_only_false_includes_closed_entries` — the closed own entry is included; the other RHU's is not.
- `test_list_breaks_checked_in_at_ties_by_id` — two own entries with identical frozen `checked_in_at` → ascending `id`. *(Review Focus 5)*
- `test_repeat_visits_both_listed_when_including_closed` — closed first visit and active second visit for one patient, same day → `list($user, false)` has both, `list($user)` has only the active one.

- [ ] **Step 2: Run to verify they fail**

Run: `php artisan test --filter=RhuVisitQueueServiceTest`
Expected: FAIL — method `find` / `list` does not exist (Task 2 tests still pass).

- [ ] **Step 3: Implement `find()`, `list()` and `authorizeRhuUser()`** per the Interfaces block.

- [ ] **Step 4: Run to verify they pass**

Run: `php artisan test --filter=RhuVisitQueue`
Expected: PASS (both test classes, 35 tests).

- [ ] **Step 5: Commit**

```bash
git add app/Services/RhuVisitQueueService.php tests/Feature/RhuVisitQueueServiceTest.php
git commit -m "feat(rhu-queue): add RHU-scoped visit find and list"
```

---

### Task 4: Full-suite verification and report

**Files:** none changed (unless a regression must be fixed; then fix, re-run, and commit that fix on its own).

- [ ] **Step 1: Run the whole backend suite**

Run: `php artisan test`
Expected: all tests pass except tests already skipped (PostgreSQL opt-in tests such as `HouseholdFsnPostgresConcurrencyTest` report "skipped"). Record the totals.

- [ ] **Step 2: Confirm nothing outside scope changed**

Run: `git diff --stat <commit before Task 1>..HEAD`
Expected: only the seven files in "File Structure".

- [ ] **Step 3: Report** — files added, migration impact (one new table, nothing altered, RLS on PostgreSQL, not run against Supabase), tests executed with totals, and the unverified item: true concurrent PostgreSQL writers (spec O4). Stop. Do not start Phase 2.
