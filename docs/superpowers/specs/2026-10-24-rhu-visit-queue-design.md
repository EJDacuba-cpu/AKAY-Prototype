# RHU Visit Queue, Intake and Consultation Workflow — Design

Date: 2026-10-24 · Status: approved in brainstorming, awaiting spec review
Branch: `itr-patient-history`
UI reference (mockup, not production code): https://claude.ai/artifact/Sif1CnXPvzZJAQJAnW2huB

## Goal

Give the RHU one facility-scoped patient care process. BHC-referred and walk-in patients
check in, wait in one daily queue, are seen in a manually started consultation, and leave
the queue when the record is finalized or the visit is closed. Referral state, queue state
and consultation state stay independent.

This spec fixes the end-to-end architecture and the approved decisions, and gives the full
design of **Phase 1 (queue foundation)**. Phases 2–8 each get a short spec of their own,
written against this one, before they are implemented.

## Principles

1. **A queue entry is a visit.** It is not a patient registration and not a clinical record.
2. **Identity is never duplicated.** Returning patients reuse their profile. Facility
   ownership, household/FSN links, referral history and finalized records are preserved.
3. **Three independent states.** Referral (`Pending/Received/No-Show/Completed`), visit
   (active/closed), consultation (draft/finalized). One may trigger another only through an
   explicit, named step in this spec.
4. **Staff decide.** Consultation starts manually. No doctor is auto-assigned. Nothing closes
   a visit automatically except finalizing its record.
5. **Server-side enforcement.** Sidebar visibility is never the control.
6. **Additive schema.** No destructive migrations. Nothing runs against live Supabase.
7. **No invented clinical policy.** Open policy questions are listed, not decided here.

## Current repository facts this design depends on

- Check-in today is two calls: `POST /referrals/qr/resolve` or `/referrals/tracking/resolve`
  (lookup only), then `PATCH /referrals/{id}/status` → `Received` through
  `ReferralWorkflowService::transition()`, which links the patient to the receiving RHU,
  writes `referral_updates`, audits and notifies the BHC.
- The draft/consultation architecture (`HealthRecordDraftService`, `consultation_events`,
  editor lock, `version`, review state, `health_record_corrections`) is BHC-only
  (`ensureBhc`, `isBhc()` checks, keyed by `barangay_health_center_id`).
- RHU consultation UI is the legacy `frontend/src/pages/rhu/RHUAddHealthRecords.jsx`.
- `StaffRoles::AVAILABLE[rhu]` excludes `consultations.encode`, `consultations.finalize`,
  `records.correct` and `items.dispense`. Nurse and doctor share `RHU_DEFAULTS`.
- `rhu.manage` gates incoming referrals, referral status changes and feedback together.
- Feedback requires a `referral_id`, so a walk-in can never produce BHC feedback.
- Tests run on in-memory SQLite (`phpunit.xml`). PostgreSQL tests are opt-in through
  `AKAY_TEST_PG_URL`; none is configured on the development machine.

## Approved decisions

| # | Decision |
|---|---|
| D1 | One active queue entry per patient per RHU. "Active" means `closed_at IS NULL`. A new visit is allowed once the previous one is closed, including on the same date. |
| D2 | Every check-in carries an idempotency key. Same key + same payload returns the existing entry. Same key + different payload is a conflict. Different key while the patient is active is a "duplicate active visit" error that carries the existing entry. |
| D3 | Referral arrival is enqueued inside the same transaction as the `Received` transition, so QR, tracking ID and manual paths all behave the same. |
| D4 | Referral arrives while the patient already has an active walk-in entry: `Received` still succeeds; the existing entry gains the `referral_id` link; no second entry is created. |
| D5 | Walk-in check-in searches existing patients first. Registration started from walk-in check-in enqueues the new patient in the same transaction. Registration from All Patients never enqueues. |
| D6 | RHU Patients has two views: **Today's Queue** and **All Patients**. Queue layout is the **table** (mockup Option A). BHC Patients is unchanged. |
| D7 | Queue rows show patient, source (Referred with the sending BHC name, or Walk-in), arrival time, waiting time and visit progress. The referral tracking/QR ID is **not shown** in the row; search still accepts it. |
| D8 | Start consultation, Resume consultation, Open patient record, Close visit, and Discard and close visit live in the row's **⋯ action menu**, not as visible row buttons. Start opens the consultation directly, with no modal. |
| D9 | No automatic closing. A visit still open from an earlier day stays in Today's Queue with a "From yesterday · still open" marker until staff act. |
| D10 | **Close visit** is available only while the visit is Waiting. It opens a modal with three reasons: *Left before consultation*, *Checked in by mistake*, *Other* (note required for Other). The visit stays in patient history. |
| D11 | Finalizing the visit's record closes the visit as *Completed* in the same transaction. No modal. |
| D12 | Patient leaves mid-consultation: **Discard and close visit** (In consultation only) discards the unfinalized consultation and closes the visit, with the same three reasons, audit-logged. Finalized records are never touched. |
| D13 | Closing or discarding never changes referral status. A referred patient stays `Received` until RHU feedback completes the referral through the existing workflow. |
| D14 | Intake navigation (Incoming Referrals, QR Scanner) for staff without the intake duty is shown **Locked** (muted, lock icon, "No access"), per DESIGN.md. Intake is a separate server-side permission. |

## Architecture

```
Referral (BHC→RHU) ─ Received ─┐                                   ┌─ referral stays Received
                               ▼                                   │  until RHU feedback
Walk-in (existing / new) ──► rhu_visit_queue_entries ── Start ──► consultation ── finalize ──► health record
                              (one visit; closed_at)      (one per visit)                (closes visit: Completed)
                                    │
                                    └── Close visit / Discard and close (reason) ──► closed
```

- **Visit** — `rhu_visit_queue_entries` (Phase 1). Owns check-in, active/closed, close reason.
- **Consultation** — the existing draft/consultation architecture extended to RHU (Phase 6),
  linked to exactly one visit by a unique column. Not a parallel system.
- **Referral** — unchanged state machine. The visit links to it; it never drives it, except
  D3 (arrival enqueues) which runs inside the existing transition.

## Phase roadmap

| Phase | Scope | Depends on | Acceptance | Key risks |
|---|---|---|---|---|
| **1. Queue foundation** | Table, model, `RhuVisitQueueService` (check-in, find, list), RLS, tests. No routes, no UI. | — | SQLite tests pass for isolation, identity, idempotency, duplicates, repeat visits, migration up/down. | Real PostgreSQL concurrency unverified locally. |
| **2. Referral check-in** | Enqueue inside `transition()` → `Received` (D3, D4); idempotent retry; queue read API. | 1 | Received referral has exactly one active visit; patient ownership unchanged; No-Show late-arrival note still required; existing referral tests green. | Changes the core referral transaction. |
| **3. Walk-in check-in** | Check-in endpoint for existing patients; `check_in` option on RHU registration (D5). | 1 | Returning patient gets a new visit and no new profile; admin registration creates no visit; no referral is created. | Registration and household/FSN rules. |
| **4. RHU Patients UI** | Today's Queue table + All Patients tab, check-in modal, arrival confirm, ⋯ menu (D6–D9). | 1, 2, 3 | BHC Patients unchanged (regression test); queue matches mockup decisions. | Shared components with uncommitted edits; use RHU wrappers instead of changing shared ones. |
| **5. Start/resume, close, permissions** | Start/Resume (one consultation per visit), Close visit with reasons (D10), intake permission split and Locked nav (D14). | 1, open item O1 | Two concurrent Starts produce one consultation; no doctor auto-assigned; closed visit can be re-checked-in. | Permission model change plus grant migration for existing staff. |
| **6. Shared encounter + handoff** | Interview → Vital Signs → Consultation → Medicines for referred and walk-in; editor handoff on the same consultation with `consultation_events`; Discard and close (D12). | 5, O1, O2, O3 | Authorship and version history kept; handoff creates no new consultation. | Largest phase: two 4,000–5,700-line monoliths; own spec required. |
| **7. Finalization + feedback** | Finalize closes the visit (D11); feedback stays the existing referral action (D13); no feedback for walk-ins. | 6 | Referral stays Received until feedback; no visit can stay trapped active. | Ordering of finalize and close in one transaction. |
| **8. End-to-end + cleanup** | E2E tests, PostgreSQL concurrency run, removal of dead RHU code, docs. | all | Report separates SQLite-verified from PostgreSQL-verified behaviour. | Needs a disposable PostgreSQL (O4). |

## Open items (not decided here)

| # | Item | Blocks |
|---|---|---|
| O1 | Which RHU roles may encode, finalize and correct consultations. Use per-user grants; do not hard-code nurse vs doctor defaults until the RHU/MHO confirms. | 5, 6 |
| O2 | RHU medicine dispensing and inventory deduction. No RHU rule exists in code. | 6 (Medicines step) |
| O3 | Locking submitted intake and audited corrections at RHU. Provisional; needs its own design review. May reuse `health_record_corrections`. | 6 |
| O4 | A disposable PostgreSQL for concurrency verification. Without it, PostgreSQL-specific behaviour is reported as unverified. | 8 |
| O5 | Name of the intake permission key (proposed `rhu.intake`) and which existing routes move from `rhu.manage` to it. | 5 |
| O6 | `DELETE /referrals/{id}` hard-deletes, but `rhu_visit_queue_entries.referral_id` is `restrictOnDelete`: once a visit links a referral, that delete fails with an uncaught foreign-key error (500). Phase 1 review recommends keeping restrict and making `ReferralController::destroy` refuse with 409 when a visit links the referral (`nullOnDelete` would break the source rule for `referral` rows). Must be resolved in the Phase 2 spec. Phase 2 should also add an index on `referral_id`. | 2 |

---

## Phase 1 — Queue foundation (detailed design)

### Scope

In: one additive migration, `RhuVisitQueueEntry` model, `RhuVisitQueueService`, two domain
exceptions, isolated tests.
Out: routes and controllers, referral integration, walk-in registration, UI, closing or
transitioning visits, consultation links, any BHC change.

### Data: `rhu_visit_queue_entries`

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `rural_health_unit_id` | FK `rural_health_units`, required, `restrictOnDelete` | Owning RHU. |
| `patient_id` | FK `patients`, required, `restrictOnDelete` | |
| `referral_id` | FK `referrals`, nullable, `restrictOnDelete` | Link only; the referral is never modified. |
| `source` | string(20), required | `referral` or `walk_in`. Where the visit started; never rewritten. |
| `status` | string(30), required, default `waiting` | Visit progress. Free string so later phases add values without a migration. |
| `checked_in_at` | timestamp, required | Set by the server (`now()`), never by the client. |
| `closed_at` | timestamp, nullable | `NULL` = active (D1). |
| `checked_in_by` | FK `users`, nullable, `nullOnDelete` | |
| `check_in_key` | string(100), required | Client idempotency key. |
| `created_at`, `updated_at` | timestamps | |

Constraints and indexes:

- `UNIQUE (rural_health_unit_id, check_in_key)`.
- Partial unique `(rural_health_unit_id, patient_id) WHERE closed_at IS NULL` — the duplicate
  guard and the race guard (D1). Because a referral has one patient, this also limits a
  referral to one active visit per RHU.
- Source consistency: `source = 'walk_in' OR referral_id IS NOT NULL`. A referral-sourced
  visit must carry its referral; a walk-in visit may gain a `referral_id` later (D4).
  PostgreSQL `CHECK`; SQLite `BEFORE INSERT/UPDATE` triggers, following
  `2026_10_23_000001_add_rhu_ownership_to_households.php`. `source` limited to the two values
  the same way.
- Index `(rural_health_unit_id, closed_at, checked_in_at)` for listing.
- PostgreSQL: `ALTER TABLE public.rhu_visit_queue_entries ENABLE ROW LEVEL SECURITY`, as every
  table created after the containment migration does.
- `down()` drops the table (and SQLite triggers). No other table is altered.

### Model: `App\Models\RhuVisitQueueEntry`

Constants `SOURCE_REFERRAL`, `SOURCE_WALK_IN`, `STATUS_WAITING`. Fillable columns above,
datetime casts, `patient()`, `referral()`, `ruralHealthUnit()`, `checkedInBy()` relations, and
an `active()` local scope (`whereNull('closed_at')`). Phase 1 defines only the `waiting`
status; later phases add their own constants.

### Service: `App\Services\RhuVisitQueueService`

**`checkIn(User $user, int $patientId, ?int $referralId, string $checkInKey): array{entry: RhuVisitQueueEntry, created: bool}`**

1. Authorize: `$user->isRhu()` and `FacilityAccessService::hasValidFacilityAssignment()`;
   otherwise 403. Admin and BHC users are denied. Permission keys are bound by the
   controllers of later phases, not here.
2. Validate key: non-empty, at most 100 characters.
3. Load the patient; `FacilityAccessService::authorizePatient()` (owned by this RHU or
   referred to it). A patient with `status = inactive` (deactivated through
   `PatientController::destroy`) cannot be checked in: validation error.
4. With a referral: load it; `authorizeRhuReferralAction()`; its `patient_id` must equal
   `$patientId`, else a validation error. Source is `referral`. Without one, source is
   `walk_in`. Referral status is not checked or changed in Phase 1.
5. Resolve in this order, then insert inside a transaction:
   - an entry with this RHU + key exists: same patient, referral and source → return it with
     `created = false`; otherwise throw `RhuVisitCheckInKeyConflictException`;
   - an active entry for this RHU + patient exists → throw
     `RhuVisitDuplicateActiveException` carrying that entry;
   - insert with `status = waiting`, `checked_in_at = now()`, `checked_in_by = $user->id`.
6. On a unique-constraint violation (a concurrent writer won), the transaction has rolled
   back; re-run the step 5 resolution **outside** it (required on PostgreSQL, where the
   violation aborts the transaction) and return or throw accordingly.
7. No writes to patients, referrals, health records or households.

**`find(User $user, int $entryId): RhuVisitQueueEntry`** — same authorization as step 1;
query scoped to the user's RHU; another RHU's entry is "not found".

**`list(User $user, bool $activeOnly = true): Collection`** — same authorization; the
user's RHU only; ordered by `checked_in_at`, then `id`; patient eager-loaded.

### Exceptions

`App\Exceptions\RhuVisitCheckInKeyConflictException` and
`App\Exceptions\RhuVisitDuplicateActiveException` (exposes the existing entry), following the
shape of `ReferralWorkflowConflictException`. HTTP mapping is Phase 2/3 controller work.

### Tests (in-memory SQLite)

`tests/Feature/RhuVisitQueueServiceTest.php`:

- **Facility isolation** — other RHU cannot find or list; BHC and admin denied; patient not
  accessible to this RHU denied; referral of another RHU denied.
- **Identity** — referred entry takes the referral's patient; mismatched patient rejected;
  walk-in has no referral; patient ownership, referral status and health records unchanged
  after check-in.
- **Idempotent retries** — same key + payload returns the same entry, one row; same key +
  different payload throws the key conflict.
- **Duplicate prevention** — different key while active throws the duplicate error with the
  existing entry; a raw insert that violates the partial index fails at the database; the
  same patient may be active at two different RHUs.
- **Repeat visits** — after the first entry is closed (set directly; closing is Phase 5), a
  new check-in the same day succeeds; both rows remain; default list shows only active.
- **Race recovery** — a competing row inserted between resolution and insert is resolved to
  the correct result (simulated on SQLite).

`tests/Feature/RhuVisitQueueMigrationTest.php` — table, indexes and constraints exist (source
values, source consistency, partial unique index); `down()` removes them; no other table changes.

### Verification and limits

Runs on the suite's isolated in-memory SQLite only. True concurrent PostgreSQL writers are
**not** verified in Phase 1 (O4); the report will say so. No migration is run against
Supabase.
