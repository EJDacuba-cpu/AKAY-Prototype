# RHU Visit Queue — Phase 3: Walk-in Check-in — Design

Date: 2026-10-25 · Status: awaiting spec review
Parent spec: `docs/superpowers/specs/2026-10-24-rhu-visit-queue-design.md` (D1–D14 apply, especially D5, D6, D7)
Builds on: Phase 1 `RhuVisitQueueService`, Phase 2 read API (`/api/rhu-visits`)

## Goal

RHU staff can check a walk-in patient into today's queue in two ways, both without any BHC
referral: an **existing** patient (search, then Check in) or a **new** patient (the existing
registration form, which enqueues the patient in the same transaction when it was opened from
the check-in flow). Registration opened from All Patients never enqueues.

## Findings that shape this phase

1. **One shared registration form.** `/rhu/patients/add` is the household-first `RegistrationForm`
   with `role="rhu"` (`RHUAddPatient` → `PatientRegistrationPage` → `BhcPatientRegistration`).
   Walk-in registration reuses it; no new form.
2. **Data stays facility-separate.** An RHU registration creates an RHU-owned patient and RHU-owned
   household (`PatientController::store`). Nothing about BHC data changes.
3. **No cross-facility identity matching exists** (decision A, approved): a person registered at a
   BHC who was never referred will not be found by the RHU, and registers again as a separate RHU
   record. Phase 3 only prevents duplicates *inside the RHU's own visible patients*.
4. **The existing directory search matches single fields only** (`first_name LIKE`, `last_name
   LIKE` …), so "Jose Ramos" finds nothing. Check-in needs name-token search. It is added as a new
   endpoint instead of changing `GET /patients`, which BHC also uses.
5. The registration frontend is 1,283 lines shared with BHC, and the frontend only unit-tests pure
   `.js` utilities (`node --test`). Logic goes in a pure util; JSX changes stay minimal.

## Decisions

| # | Decision |
|---|---|
| P3-1 | `POST /api/rhu-visits` `{patient_id, check_in_key}` checks in an **existing** patient as a walk-in (`referral_id` is never accepted here). 201 when created, 200 when an idempotent replay, 409 `VISIT_ALREADY_ACTIVE` (with `active_visit_id`) or `VISIT_CHECK_IN_KEY_CONFLICT` from Phase 1. Duty: `patients.register` (D8 intake; the `/rhu-visits` write rule changes from `rhu.manage` to `patients.register`). |
| P3-2 | `GET /api/rhu-visits/patient-search?q=` (RHU only, duty `patients.register`): patients the user may access (`scopePatients`), active only, split `q` on whitespace and require every token to match first, middle, last name, PhilHealth number or contact number; max 10 results, oldest id first. Each result: `PatientIdentity::response($patient, false)` plus `active_visit_id` (nullable) so the UI can say "Already in today's queue". |
| P3-3 | Client check-in keys may not start with `referral-` (Phase 2 review): `checkIn()` rejects them with a `check_in_key` validation error. `recordReferralArrival()` bypasses this by using an internal path (an `allowReservedPrefix` argument on a private method), not by a public flag. |
| P3-4 | Registration with check-in: `POST /api/patients` accepts an optional `check_in: {key}` (RHU users only; a BHC user sending it gets 403). The patient, household attach, audit entry **and** the visit are created in the one existing transaction. The response keeps `data` unchanged and adds top-level `visit: {id, status, checked_in_at}`. Without `check_in`, behaviour is byte-for-byte what it is today. |
| P3-5 | Duplicate warning (decision A): only when `check_in` is present, if the RHU already sees an active patient with the same first name, last name (case-insensitive, trimmed) and birthdate, the request answers **409 `POSSIBLE_DUPLICATE_PATIENT`** with up to 5 matches (identity fields + `active_visit_id`) and creates nothing. Sending `confirm_possible_duplicate: true` proceeds. This also catches a double-submitted registration whose first response was lost. Normal registration from All Patients is unchanged. |
| P3-6 | Registration page: `?check_in=1` marks the check-in flow. The frontend generates one `check_in_key` per page load (UUID), sends `check_in` on create, handles the 409 duplicate response with a confirm dialog listing the matches (each with "Use this patient" → check in via P3-1, or "Register anyway"), and on success shows "Back to queue" / "Register another" instead of opening the profile. |
| P3-7 | The check-in modal itself (search box, results, Check in button, "Register new patient" link to `/rhu/patients/add?check_in=1`) and the Today's Queue table are **Phase 4**. Phase 3 delivers the endpoints and the registration-flow behaviour, testable by URL. |

## Out of scope

Referral arrival (done), the queue table/menu/modal UI (Phase 4), closing/cancelling visits and the
intake permission split (Phase 5), cross-facility matching (rejected for now), changing BHC
registration or `GET /patients`.

## Tests

Backend (SQLite):
- `POST /rhu-visits`: creates a walk-in visit (source `walk_in`, no referral, `checked_in_by`); replay → 200 same visit; active patient → 409 with `active_visit_id`; same key different patient → 409 conflict; key starting `referral-` → 422; patient of another facility → 403; BHC/admin → 403; `referral_id` in the body is ignored/rejected; user without `patients.register` → 403.
- `patient-search`: full-name tokens find "Jose Ramos"; token order irrelevant; matches PhilHealth/contact; excludes inactive and other-facility patients; includes a BHC patient referred to this RHU; max 10; `active_visit_id` set for patients in the queue; BHC/admin 403.
- Registration with `check_in`: patient + household + visit created together; visit source walk_in; `visit` in the response; rollback test (forced failure after the patient insert leaves no patient and no visit); registration without `check_in` creates no visit (regression); BHC user with `check_in` → 403; RHU household ownership unchanged.
- Duplicate warning: same name+birthdate → 409 with matches and nothing created; with `confirm_possible_duplicate` → created and enqueued; different birthdate → no warning; warning only with `check_in`; other facility's same-name patient does not trigger it.
- Referral arrival still works with its `referral-` key (regression).
- Full backend suite stays green.

Frontend (`node --test`, pure util `src/utils/walkInRegistration.js`): builds the create payload with/without check-in, keeps `check_in` out of BHC payloads, parses the duplicate 409 into a view model, picks the post-save destination. `npm run lint` and `npm run build` pass; the JSX wiring is checked in the browser during Phase 4/8 (declared, not claimed here).

## Risks

- `PatientRequest` is shared with BHC; only optional, RHU-gated fields are added.
- Name+birthdate matching can warn on twins/namesakes; the confirm step exists for that. Missing birthdates are not matched.
- Registration is not itself idempotent (existing behaviour); the duplicate warning is the retry safety net.
- PostgreSQL concurrency stays unverified locally (parent O4).
