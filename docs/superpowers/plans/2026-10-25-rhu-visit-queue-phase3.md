# RHU Visit Queue — Phase 3 (Walk-in Check-in) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RHU staff can check an existing patient into the queue as a walk-in, find patients by full name for that purpose, and register a new patient who joins the queue in the same transaction when registration is opened from the check-in flow.

**Architecture:** Extend `RhuVisitQueueService` (check-in guard, patient search, duplicate lookup), add thin controller actions on `RhuVisitController`, and let `PatientController::store` call the service inside its existing transaction when an RHU user sends `check_in`. The frontend gets a pure, unit-tested util plus minimal wiring in the shared registration form.

**Tech Stack:** Laravel 13 / PHP 8.5 / PHPUnit 12 (SQLite in tests); React + Vite, `node --test` for frontend utilities.

**Spec:** `docs/superpowers/specs/2026-10-25-rhu-visit-queue-phase3-walk-in-check-in-design.md` (P3-1..P3-7); parent `docs/superpowers/specs/2026-10-24-rhu-visit-queue-design.md`.

## Global Constraints

- Additive only; no schema change in this phase. Never run migrations or tests against Supabase.
- BHC behaviour and `GET /api/patients` are unchanged; new `PatientRequest` fields are optional and RHU-gated.
- A walk-in visit never carries a `referral_id`; the arrival key prefix is `RhuVisitQueueService::ARRIVAL_KEY_PREFIX` (`referral-`) and is reserved.
- Queue/patient payloads use `PatientIdentity::response($patient, false)`; no tracking or QR values.
- Backend: run from `backend/`, `php artisan test --filter=<Name>`, full suite `php artisan test`. Frontend: run from `frontend/`.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- The frontend JSX wiring is **not** browser-verified in this phase; say so in the report.

## Review Focus

1. Registration with `check_in.key` blank or over 100 characters → 422 on the key, no patient and no visit created. (Task 3)
2. Registration with `check_in` and no birthdate → no duplicate lookup, registers and enqueues. (Task 3)
3. Patient search with empty or whitespace-only `q` → 200 with an empty list, never the whole directory. (Task 2)
4. `%` and `_` in `q` match literally, not as wildcards. (Task 2)
5. Re-submitting the same registration with the same key and `confirm_possible_duplicate` → second attempt answers 409 `VISIT_CHECK_IN_KEY_CONFLICT` and creates no second patient. (Task 3)

---

## File Structure

| File | Change |
|---|---|
| `backend/app/Services/RhuVisitQueueService.php` | reserved-prefix guard, `searchPatients()`, `findPossibleDuplicates()` |
| `backend/app/Http/Controllers/Api/RhuVisitController.php` | `store()`, `patientSearch()` |
| `backend/routes/api.php` | POST `/rhu-visits`, GET `/rhu-visits/patient-search` |
| `backend/app/Http/Middleware/EnforceActionPermissions.php` | duties for the new routes |
| `backend/app/Http/Requests/PatientRequest.php` | optional `check_in`, `confirm_possible_duplicate` |
| `backend/app/Http/Controllers/Api/PatientController.php` | `store()` check-in + duplicate warning |
| `backend/tests/Feature/RhuWalkInCheckInApiTest.php`, `RhuWalkInPatientSearchTest.php`, `RhuWalkInRegistrationTest.php` | Tasks 1–3 |
| `frontend/src/utils/walkInRegistration.js` (+ `.test.js`) | Task 4 util |
| `frontend/src/utils/patientRegistrationPayload.js` (+ test) | pass `check_in`, `confirm_possible_duplicate` through |
| `frontend/src/services/rhuVisitService.js` | `checkInExistingPatient()` |
| `frontend/src/pages/bhc/BhcPatientRegistration.jsx`, `AddPatient.jsx` | minimal wiring |
| `frontend/package.json` | `test:walk-in` script |

---

### Task 1: Walk-in check-in endpoint and reserved key prefix

**Files:** Modify `RhuVisitQueueService.php`, `RhuVisitController.php`, `routes/api.php`, `EnforceActionPermissions.php`; Test `tests/Feature/RhuWalkInCheckInApiTest.php`

**Interfaces:**
- Consumes: Phase 1/2 `checkIn()`, `recordReferralArrival()`, `RhuVisitController::present()`.
- Produces: `POST /api/rhu-visits` `{patient_id:int, check_in_key:string}` → `{data: Visit}`, 201 created / 200 replay. `checkIn()` public signature unchanged but rejects keys starting with `ARRIVAL_KEY_PREFIX` (validation error key `check_in_key`); `recordReferralArrival()` uses a private path that allows it.

- [ ] **Step 1: Failing tests** (RHU nurse with `Sanctum::actingAs($user, ['akay:access'])`, patient owned by the RHU):
  - `test_walk_in_check_in_creates_a_walk_in_visit` — 201; entry `source` walk_in, `referral_id` null, `checked_in_by` = nurse, `status` waiting; `data.id` returned.
  - `test_retry_with_the_same_key_returns_the_visit_with_200` — second call 200, same id, one row.
  - `test_active_patient_with_a_new_key_is_409` — `code` `VISIT_ALREADY_ACTIVE`, `active_visit_id`.
  - `test_same_key_for_another_patient_is_409` — `code` `VISIT_CHECK_IN_KEY_CONFLICT`.
  - `test_reserved_arrival_prefix_is_rejected` — `check_in_key` `referral-5` → 422 on `check_in_key`; zero rows.
  - `test_referral_id_in_the_body_is_ignored` — body with a valid `referral_id` → visit still has null `referral_id`.
  - `test_other_facility_patient_is_forbidden` — 403; BHC and admin users → 403.
  - `test_user_without_patients_register_is_forbidden` — `permissions` `['clinical.history']` → 403.
  - `test_missing_fields_are_validation_errors` — empty body → 422 on `patient_id` and `check_in_key`.
  - `test_referral_arrival_still_enqueues` — Pending referral → Received still creates the visit (regression for the prefix guard).
- [ ] **Step 2:** `php artisan test --filter=RhuWalkInCheckInApiTest` — Expected: FAIL (404 route).
- [ ] **Step 3: Implement.** In the service, move the body of `checkIn()` into `private function performCheckIn(User, int, ?int, string, bool $allowReservedKey): array`; public `checkIn()` calls it with `false` and `recordReferralArrival()` calls it with `true`; the guard (key starts with the prefix and not allowed) throws the same `ValidationException` shape as the key-length error. Controller `store(Request)` validates `patient_id` (`required|integer`) and `check_in_key` (`required|string|max:100`), calls `checkIn($user, $validated['patient_id'], null, $validated['check_in_key'])`, returns `{data: present(entry)}` with 201 when `created` else 200 (`present()` loads `patient` and `referral.barangayHealthCenter` first). Route inside the `role:rhu` group. Middleware: `/rhu-visits` writes require `patients.register`.
- [ ] **Step 4:** `php artisan test --filter="RhuWalkInCheckInApiTest|RhuVisit|RhuReferralArrivalTest"` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rhu-queue): add walk-in check-in endpoint`.

---

### Task 2: Patient search for check-in

**Files:** Modify `RhuVisitQueueService.php`, `RhuVisitController.php`, `routes/api.php`, `EnforceActionPermissions.php`; Test `tests/Feature/RhuWalkInPatientSearchTest.php`

**Interfaces:**
- Produces: `RhuVisitQueueService::searchPatients(User $user, string $query): array` returning a list of `['patient' => Patient, 'active_visit_id' => ?int]` (max 10, `id` ascending); `GET /api/rhu-visits/patient-search?q=` → `{data: [PatientIdentity::response($patient, false) + active_visit_id]}`. Duty `patients.register`; registered before `{visit}`.

- [ ] **Step 1: Failing tests:**
  - `test_full_name_tokens_find_the_patient` — "Jose Ramos" and "ramos jose" both find patient Jose Ramos.
  - `test_matches_philhealth_and_contact_numbers` — one token matching `philhealth_number`, another case `contact_number`.
  - `test_every_token_must_match` — "Jose Santos" does not find Jose Ramos.
  - `test_empty_or_blank_query_returns_an_empty_list` — `q=` and `q=%20%20` → 200, `data` `[]`. *(Review Focus 3)*
  - `test_like_wildcards_match_literally` — patients "Maria" and "Ma_ia"; `q=Ma_ia` finds only the second; `q=%` finds nothing. *(Review Focus 4)*
  - `test_scope_and_status` — excludes inactive patients, other-facility patients, includes a BHC patient referred to this RHU.
  - `test_result_limit_is_ten` — 12 matching patients → 10 results, lowest ids.
  - `test_active_visit_id_is_set_for_queued_patients` — patient with an active visit has the id; others `null`.
  - `test_payload_has_identity_only` — no `medical_background` key; BHC and admin → 403; user without `patients.register` → 403.
- [ ] **Step 2:** `php artisan test --filter=RhuWalkInPatientSearchTest` — Expected: FAIL (404).
- [ ] **Step 3: Implement** `searchPatients`: trim and split `$query` on whitespace; no tokens → `[]`; start from `FacilityAccessService::scopePatients(Patient::query(), $user)` after the same `authorizeRhuUser`; exclude `status = inactive`; for each token add a `where` group that ORs `first_name`, `middle_name`, `last_name`, `philhealth_number`, `contact_number` with `like` and an escaped value (`addcslashes` of `\ % _`) using an explicit `ESCAPE '\'` via `whereRaw`; `orderBy('id')->limit(10)`; one extra query maps patient ids to active visit ids. Controller `patientSearch(Request)` presents the list; middleware: `str_ends_with($path, '/rhu-visits/patient-search') => 'patients.register'` placed before the generic `/rhu-visits` rule.
- [ ] **Step 4:** run the filter — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rhu-queue): add patient search for walk-in check-in`.

---

### Task 3: Registration with check-in and duplicate warning

**Files:** Modify `PatientRequest.php`, `PatientController.php`, `RhuVisitQueueService.php`; Test `tests/Feature/RhuWalkInRegistrationTest.php`

**Interfaces:**
- Consumes: Task 1 `checkIn()`, Task 2 `active_visit_id` mapping.
- Produces: `RhuVisitQueueService::findPossibleDuplicates(User $user, string $firstName, string $lastName, ?string $birthdate): array` (same row shape as `searchPatients`, max 5; `[]` when `$birthdate` is null). `POST /api/patients` accepts `check_in: {key}` and `confirm_possible_duplicate: bool`; response adds top-level `visit: {id, status, checked_in_at}` when checked in; duplicate warning → 409 `{code: 'POSSIBLE_DUPLICATE_PATIENT', message, matches: [identity + active_visit_id]}`.

- [ ] **Step 1: Failing tests** (RHU staff with explicit `permissions` `['patients.register','families.view','families.manage']`; payload = the household-new registration payload used by `RhuHouseholdsTest::register()`):
  - `test_registration_with_check_in_creates_patient_household_and_visit` — 201; `data.rural_health_unit_id` = RHU; one walk-in visit for the new patient with `check_in_key` = sent key; `visit.id` in response.
  - `test_registration_without_check_in_creates_no_visit` — regression.
  - `test_failure_after_the_patient_insert_rolls_everything_back` — bind a `RhuVisitQueueService` subclass whose `insert()` throws a `RuntimeException`; response 500; zero patients, zero households, zero visits.
  - `test_blank_or_overlong_check_in_key_is_422` — `''`, 101 chars → 422 on `check_in.key`; nothing created. *(Review Focus 1)*
  - `test_reserved_prefix_key_is_422_and_creates_no_patient` — key `referral-9`.
  - `test_bhc_user_cannot_send_check_in` — 403 and no patient.
  - `test_same_name_and_birthdate_warns_and_creates_nothing` — existing active RHU patient "Ana Cruz" 1990-01-01 (case/space variants "  ana " "CRUZ"); 409 with one match; patient count unchanged.
  - `test_confirmed_duplicate_registers_and_enqueues` — add `confirm_possible_duplicate: true` → 201 with visit.
  - `test_no_warning_for_a_different_birthdate_or_without_check_in` — different birthdate → 201; same name+birthdate without `check_in` → 201 (regression).
  - `test_missing_birthdate_skips_the_duplicate_lookup` — no `birthdate` (if the form allows it) → 201 with visit. *(Review Focus 2; if birthdate is required by `PatientRequest`, assert the 422 instead and note it in the ledger.)*
  - `test_other_facility_same_name_does_not_warn` — a BHC-owned patient with the same name/birthdate, never referred → 201.
  - `test_resubmitting_with_the_same_key_creates_no_second_patient` — first 201, second identical request with `confirm_possible_duplicate` → 409 `VISIT_CHECK_IN_KEY_CONFLICT`; one patient. *(Review Focus 5)*
  - `test_referral_arrival_and_walk_in_check_in_still_work` — regression for Task 1 behaviour is covered by filters in Step 4.
- [ ] **Step 2:** `php artisan test --filter=RhuWalkInRegistrationTest` — Expected: FAIL.
- [ ] **Step 3: Implement.** `PatientRequest`: `check_in` (`sometimes|array:key`), `check_in.key` (`required_with:check_in|string|max:100`), `confirm_possible_duplicate` (`sometimes|boolean`) — only the POST rules. `PatientController::store`: pull both fields out of `$data` before `Patient::create`; if `check_in` is present, `abort_unless($user->isRhu(), 403, ...)` first; unless confirmed, call `findPossibleDuplicates()` and return the 409 JSON when it finds matches; inside the existing `DB::transaction`, after household attach, call `app(RhuVisitQueueService::class)->checkIn($user, $patient->id, null, $key)` and keep the entry; add `visit` to both existing 201 responses when set. Service `findPossibleDuplicates`: reuse the scope/active/active-visit mapping from `searchPatients`, match `lower(trim(first_name))`, `lower(trim(last_name))` and `birthdate`.
- [ ] **Step 4:** `php artisan test --filter="RhuWalkIn|RhuVisit|RhuReferralArrivalTest|RhuHouseholdsTest|BhcHouseholdsTest|PatientCreationPermissionsTest"` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rhu-queue): enqueue walk-in registrations and warn about possible duplicates`.

---

### Task 4: Frontend util and registration wiring

**Files:** Create `frontend/src/utils/walkInRegistration.js`, `walkInRegistration.test.js`, `frontend/src/services/rhuVisitService.js`; Modify `patientRegistrationPayload.js` (+ its test), `BhcPatientRegistration.jsx`, `AddPatient.jsx`, `package.json`

**Interfaces — `walkInRegistration.js` (pure):**
- `isCheckInFlow(search: string): boolean` — true for `?check_in=1`.
- `newCheckInKey(makeId = () => crypto.randomUUID()): string`.
- `withCheckIn(payload: object, { key: string, confirmDuplicate?: boolean }): object` — adds `check_in: {key}` and, only when true, `confirm_possible_duplicate: true`; returns a new object.
- `duplicatePrompt(error: {status?: number, code?: string, payload?: {matches?: object[]}}): null | { matches: { id: number, fullName: string, birthdate: string|null, activeVisitId: number|null }[] }` — non-null only for status 409 and code `POSSIBLE_DUPLICATE_PATIENT`.
- `postSaveDestination({ checkIn: boolean, patientsPath: string, patientId: string }): string` — `patientsPath` when `checkIn`, else `${patientsPath}/${patientId}`.
- `rhuVisitService.js`: `checkInExistingPatient(patientId: number|string, checkInKey: string): Promise<object>` → `POST /rhu-visits`.

- [ ] **Step 1: Failing tests** with `node --test`: `isCheckInFlow` (`?check_in=1` true, `?check_in=0`, empty, other params false); `newCheckInKey` uses the injected id; `withCheckIn` adds `check_in`, omits `confirm_possible_duplicate` unless true, does not mutate its input; `duplicatePrompt` parses a 409 payload into the view model, returns `null` for other statuses/codes/missing payload; `postSaveDestination` both cases; in `patientRegistrationPayload.test.js`, `toPayload` keeps `check_in` and `confirm_possible_duplicate` when present and omits them otherwise.
- [ ] **Step 2:** `node --test src/utils/walkInRegistration.test.js src/utils/patientRegistrationPayload.test.js` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the util, the `toPayload` pass-through (same pattern as `head_replacement`), the service function, and add `"test:walk-in": "node --test src/utils/walkInRegistration.test.js src/utils/patientRegistrationPayload.test.js"` to `package.json`.
- [ ] **Step 4: Wire the form (minimal).** `BhcPatientRegistration`: when `role === 'rhu'`, no `patientId` and `isCheckInFlow(params)`, create one key per mount (`useRef`), append `withCheckIn(...)` to the payload in `save()` using a new fifth argument `options` (`{confirmDuplicate}`), and pass `walkIn={{ key }}` to `RegistrationForm`. `RegistrationForm` (AddPatient.jsx): accept optional `walkIn`; in `handleSubmit`'s catch, if `duplicatePrompt(error)` is non-null open a confirm modal listing the matches with three actions — "Use this patient" (calls `checkInExistingPatient`, then navigates to `patientsPath`), "Register anyway" (resubmits with `confirmDuplicate: true`), "Cancel"; on success when `walkIn` is set, the success modal's primary button navigates to `postSaveDestination(...)` ("Back to queue") and "Register Another Patient" keeps the `?check_in=1` query. Without `walkIn` nothing changes.
- [ ] **Step 5:** `npm run test:walk-in` — Expected: PASS; `npx eslint` on the changed files and `npm run build` — Expected: no errors.
- [ ] **Step 6: Commit** `feat(rhu-queue): wire walk-in registration into the shared form`.

---

### Task 5: Full verification and report

- [ ] **Step 1:** `php artisan test` — Expected: 0 failures (existing skips only).
- [ ] **Step 2:** `npm run test:walk-in`, `npm run lint` (note any pre-existing lint errors by comparing with the files this phase did not touch), `npm run build`.
- [ ] **Step 3:** `git diff --stat fdef285..HEAD` — only the files in File Structure and this plan.
- [ ] **Step 4:** Final whole-branch review by a fresh reviewer; fix Critical/Important with a failing test first; report (state plainly that the JSX flow was not exercised in a browser) and stop before Phase 4.
