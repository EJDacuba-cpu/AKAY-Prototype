# BHC Family Serial Number Backend — Design

Date: 2026-10-16
Status: Conversational design approved by Eric; written specification for review.

## 1. Layunin at confirmed workflow

Gawing tunay na database-backed ang BHC Family Serial Number (FSN) flow sa patient
registration at kaugnay na Families screens. Automatic ang normal na assignment;
may manual override ang staff. Hindi sapat na palitan lang ang generator habang
mock registry pa rin ang pinaglalagyan ng household at patient.

Confirmed kay Eric sa interview:

- May 14 barangay, tig-isang BHC bawat barangay. Admin ang gumagawa ng accounts at
  nag-aassign ng facility. Sariling facility records lang ang sakop ng staff.
- BHC muna. RHU implementation, cross-barangay search, at duplicate-person
  matching ay hiwalay na susunod na scope.
- Default FSN ay may year: `FSN-2026-0001`. Hiwalay ang counter bawat barangay/BHC
  at taon. Hindi nire-renumber ang existing households pag nagbagong taon.
- May manual override pa rin. Automation ang default; hindi kailangang mag-type
  o maghanap ng susunod na number ang staff.
- Unique ang FSN sa loob ng parehong barangay. Puwedeng maulit sa ibang barangay.
- Puwedeng magkahiwalay na households ang nasa parehong address/housing unit.
  Hindi batayan ng automatic grouping ang address o apelyido.
- May FSN text field sa paper form, ayon kay Eric. Hindi ito katibayan ng isang
  mandated paper numbering format; ang agreed generated format ay system decision.

## 2. Verified code at implementation boundary

- `AddPatient.jsx` uses `useMockFamilyRegistry` and `saveMockPatient`; wala itong
  tunay na registration write sa kasalukuyang screen.
- `FamiliesDirectory`, `FamilyDetails`, at `FamilyForm` use the same mock snapshot.
- `mockFamilyRegistry.nextSerialNumber` scans all mock households by year; wala
  itong per-BHC counter o protection sa sabayang saves.
- Backend `PatientRequest` accepts nullable `family_serial_number` text. Walang
  canonical household entity sa inspected flow. Existing household lookups and
  `HouseholdEnvironment` identify members through this serial text.
- Families grants are currently injected from browser storage by
  `mockFamilyAccess`; hindi ito valid authorization para sa real API.
- RHU registration wraps the shared BHC registration component. Role boundaries
  must be explicit para hindi aksidenteng lumipat ang RHU sa BHC implementation.
- Existing user changes in consultation/history modules must be preserved.

Included: BHC registration/create/edit integration needed for persisted household
membership, BHC household search/list/details, basic family creation and editing
(FSN/address/head), and real access checks for these operations.

Deferred: editing the person-to-person relationship graph, Related Families,
cross-facility discovery, RHU persistence conversion, household clinical/environment
ownership redesign, at patient identity deduplication. Existing mock graph writes
must not be offered as successful operations against real BHC household IDs.

## 3. Architecture at alternatives

Chosen: PostgreSQL function for transactional FSN allocation, Laravel service for
authorized household/patient operations, and TanStack Query for facility-scoped
server data. Database constraints enforce identity/uniqueness independently of
frontend validation.

Alternative: Laravel may own counter increments with row locking and the same
constraints. Feasible ito, pero PostgreSQL allocation ang pinili sa approved
design at tugma sa project integration. Browser scanning is unsuitable as the
authoritative allocator because another staff session can save the same number.

| Layer | Responsibility |
| --- | --- |
| PostgreSQL/Supabase | Counter locking, FSN allocation, uniqueness, foreign keys. |
| Laravel | Current authorized BHC, permissions, payload validation, household rules, transaction orchestration, audit and error responses. |
| TanStack Query | Fetch/mutate server data, loading/error states, facility-specific keys, invalidation after successful writes. |
| React/shadcn/Tailwind | Existing form structure, automatic/manual mode, inline field validation, and success notification after server confirmation. |

All application access remains through authenticated Laravel endpoints. Browser
Supabase access is not added. New database objects follow existing restricted
schema permissions and do not introduce public/anonymous table or function grants.

## 4. Data model and identity

`households` stores: permanent ID, owning `barangay_health_center_id`, canonical
`serial_number`, household address, nullable `head_patient_id`, `archived_at`,
timestamps, and a version value for stale-edit detection.

The unique key is `(barangay_health_center_id, serial_number)` after canonical
normalization. Archived households participate in uniqueness. Address has no
unique constraint. An internal household ID never changes when its FSN changes.

`household_fsn_counters` stores `(barangay_health_center_id, year, last_number)`
with a unique BHC/year key. Counters are durable and never recomputed from a
browser list or decreased after household rename/archive.

Patients gain nullable `household_id` and `relationship_to_household_head`.
Database constraints reject a linked patient whose BHC differs from its household
and reject BHC household membership on an RHU-owned patient. Laravel additionally
validates head membership and all submitted patient/household IDs.

Keep `patients.family_serial_number` as a compatibility field for existing
clinical readers. For linked patients it is maintained from the canonical
household inside the same transaction; it cannot independently rename a household.
Member registration responses include household ID, FSN, and relationship even
for registration-only staff, without granting access to medical background.

## 5. FSN lifecycle

### Automatic assignment

1. Creating a new household defaults to automatic mode. The screen shows the
   year-based format and that the final number is assigned on save; opening or
   cancelling a form does not allocate a number.
2. Laravel obtains the BHC from the authorized active working facility. Client
   facility fields and patient address text do not choose the FSN namespace.
3. Laravel derives the numbering year from server time in `Asia/Manila`, passing
   that year to the allocator. No unrelated global timezone change is required.
4. Inside the same transaction as household/patient creation, the PostgreSQL
   allocator locks the BHC/year counter, increments it, and returns the FSN.
5. Sequence digits have a minimum width of four; `10000` remains valid. No truncation
   or wraparound occurs after `9999`.
6. A failed transaction rolls back its household, patient, and counter write.
   A successful save returns the final FSN, which is displayed by the UI.

### Manual override and correction

An explicit manual mode allows staff to enter a value instead of allocating one.
Defaulting to automation must not depend on staff leaving a required text input
blank. Switching back to automatic mode clears the unsaved override.

Proposed validation policy for review: trim outer whitespace, uppercase the
stored value, require 1–100 printable characters, and reject normalized duplicates
within the same BHC. Manual values need not match the generated pattern; an
override remains usable for actual paper-folder correction.

When a manual value matches `FSN-YYYY-NNNN` (four or more sequence digits), lock
that BHC/year counter and advance its high-water mark if necessary. For example,
manually saving `FSN-2026-0050` makes the next automatic 2026 value at least
`FSN-2026-0051`. A nonstandard manual value does not alter numeric counters.
Automatic allocation must also skip existing occupied serials defensively.

Proposed post-save policy for review: authorized family editors can correct a
saved FSN through Edit Family. A correction updates the household and linked
patients' compatibility fields atomically and records actor, household ID, old
FSN, and new FSN in the audit trail. The household ID and member links are retained.
The counter never moves backwards. Correcting a member's registration must not
silently rename the whole household.

## 6. Registration and basic Families behavior

- A new BHC registration must either join a selected household or create one.
  Existing household selection reuses its FSN and address, requires relationship
  to head, and generates no new number.
- New inline household creation uses the registration address once. Preserve the
  current prototype's adult-head validation and explicit head designation; no
  inferred head based on surname or age ordering.
- Add Family uses an explicitly selected existing local patient as head and the
  same creation service/allocator. Existing head-departure review remains required
  when moving a head who leaves other members behind.
- Address/head correction and changing a patient's household use explicit member
  selections. Empty source households are archived. Household updates are guarded
  by a version check; stale submissions return an actionable conflict instead of
  overwriting a newer head/FSN decision.
- BHC Family Details displays actual persisted members and their relationship to
  the head. Deferred graph/related-family actions are not routed into mock writers.
  Direct BHC URLs to deferred actions show an unavailable state with a back link.
- Member creation for this phase uses the real registration flow with an explicit
  household selection. Existing basic head/member rules are preserved; no new
  relationship graph editing is introduced.

## 7. API and authorization contract

Use a BHC-specific `/api/bhc/households` namespace for paginated list/search,
detail, create-from-existing-patient, and update operations. No endpoint accepts
an arbitrary BHC query parameter for widening its results. Detail/mutation queries
scope by the current BHC before returning data.

Registration continues through the patient API, adding a structured household
selection: existing household ID plus relationship, or a new household with
`serial_mode: auto|manual`, optional manual serial, and address. The backend owns
the generated FSN. Patient edit can preserve or explicitly change membership.
Conflicting household ID/serial inputs produce validation errors.

Replace the BHC browser-only Families grants with backend-recognized
`families.view` and `families.manage`; management requires view. Admin saves real
grants through the existing account/assignment permission infrastructure. Existing
browser permissions are not imported as trusted grants, and existing accounts
are not silently given new explicit permissions.

Registration lookup is allowed with `patients.register`, exposing only household
identity/address/member demographics needed by registration. Directory/detail
requires `families.view`; household correction and standalone creation require
`families.manage`. Creating/joining a household as part of authorized patient
registration is validated through that registration transaction. All endpoints
also require an active BHC working assignment. RHU role routes remain separate.

Error behavior: duplicate/manual/relationship errors are HTTP 422 field errors;
stale edits are HTTP 409 with reload guidance; forbidden operations are HTTP 403;
foreign or missing household IDs receive the same not-found response. Frontend
maps errors next to the relevant shadcn input, preserves drafts, and never reports
success before the server transaction commits.

## 8. Existing persisted patients and compatibility

Migration is additive and does not import mock fixtures or automatically rewrite
existing patient FSNs. Existing nonblank BHC FSNs must be included in allocation
collision checks so new households cannot unknowingly reuse them.

Until a legacy group is reconciled, it remains readable through the existing
patient flow. A standalone attempt to create a household using an occupied legacy
FSN returns a clear validation message rather than silently moving patients.
No migration guesses a head, address, membership, or relationship from shared
address/surname. Reconciliation of legacy groups is a separate follow-up; this
phase must report their count in deployment verification and document this limit.

For linked BHC patients, household queries and environment suggestions use
household ID plus BHC scope. Legacy unlinked and deferred RHU paths retain the
existing serial-based behavior with facility scoping. This prevents FSN edits
from breaking linked-member lookups without redesigning clinical history.

## 9. Frontend integration and removal of mocks

Add real household service/query modules. New keys include authenticated user,
active working-facility identity, filters, page, and household/patient ID as
appropriate. Switching facility/account must not reuse the previous BHC's data.
Existing API client authentication/working-facility handling is reused.

Successful registration invalidates the current BHC patient list, household
search/list/detail, and affected patient summaries. FSN correction refreshes all
affected member representations. Failed writes do not publish optimistic success.

Extract reusable pure helpers from mock-named modules where needed. BHC components
must not subscribe to seeded snapshots, write through `saveMockPatient` or
`saveFamily`, or fall back to mock records on network error. Show loading, empty,
retry, and inline validation states with existing shadcn/Tailwind components.

Use role-specific adapters/components so deferred RHU prototype routes do not call
the real BHC API or accept real BHC household IDs. Retain mock files only while
deferred routes still import them. Remove dead BHC mock branches and messages,
not unrelated fixtures or unimplemented feature code across the whole repository.

## 10. Required verification and acceptance

Meaningful backend checks must cover:

- Per-BHC and per-year counters, Manila year boundary, and existing FSN stability.
- Same serial accepted in two BHCs but rejected for two households in one BHC,
  including case/whitespace variants and archived households.
- Manual override high-water mark, nonstandard serials, rollback, and sequence
  growth beyond four digits.
- Actual PostgreSQL simultaneous automatic saves and automatic/manual collision
  handling; SQLite-only tests are insufficient evidence for stored-function locks.
- Existing-household join, duplicate address with separate households, membership
  isolation, unauthorized client BHC/household IDs, and stale-edit handling.
- Atomic FSN correction across linked patients and registration-only response
  privacy, real Families grants, and no trusted browser-storage authorization.
- Legacy-serial collision protection and household-ID clinical lookup compatibility.

Frontend checks cover API payloads, auto/manual mode, error-to-field mapping,
facility-specific cache behavior, and the real registration-to-Families path.
Run relevant existing backend suites, frontend tests/lint/build, and browser review
where available. Report unavailable PostgreSQL/browser verification explicitly.

Acceptance: a BHC staff member creates a household through registration, receives
a persisted FSN, reloads and finds the same household/members in BHC Families,
joins a second patient without allocating another FSN, and can make an authorized
manual correction without losing membership. Another BHC has an independent
counter and cannot access these records. No in-scope BHC screen reads seeded mock
data or claims a mock-only save is persistent.

## 11. Review notes

Sections 5 (normalization and post-save correction), 7 (real permission grants),
and 8 (legacy-data preservation) make necessary implementation policies explicit
for written-spec review. They were not separate confirmed facts about the paper
workflow. Product code has not been changed by this specification.
