# Family Relationships, Family Details, and Patient Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist explicit spouse/sibling relationships in the Laravel backend, show them (with mother/father links) in a redesigned BHC Family Details page, and route Edit Patient through Patient Details inline editing.

**Architecture:** One additive table (`patient_relationships`) holds `spouse`/`sibling` pairs; parent-child stays on `patients.mother_patient_id`/`father_patient_id`. A backend service validates and audits every link and is called inside the existing registration transaction and from standalone endpoints. The frontend turns the household response into `{members, edges}` and feeds a pan/zoom tree canvas and a list. Relationship-to-head labels remain display text.

**Tech Stack:** Laravel (PHPUnit, SQLite in memory; Supabase Postgres for real use), React 19 + react-router + TanStack Query, `node --test`, Vite.

**Spec:** `docs/superpowers/specs/2026-10-17-family-relationships-and-family-details-design.md`

## Global Constraints

- Work on branch `itr-patient-history`. **Do not commit or push.** Every "checkpoint report" step replaces a commit; preserve all uncommitted changes.
- No destructive migration, no reset/truncate, no backfill or inference of relationships. `down()` drops only `patient_relationships`.
- Before applying any migration to the real DB: print the active connection, run `php artisan migrate:status` and `php artisan migrate --pretend`, and report. Apply only if the output is solely the creation of `patient_relationships` and its indexes/constraints; otherwise stop and report.
- Relationship types are exactly `spouse` and `sibling`. Pairs are canonical (`patient_id < relative_id`).
- Husband and Wife may confirm `spouse`; Brother and Sister may confirm `sibling`; **Partner is display-only**. Every other label never creates a record.
- Labels (new list, exact strings): `Husband`, `Wife`, `Partner`, `Brother`, `Sister`, `Father`, `Mother`, `Son`, `Daughter`, `Grandfather`, `Grandmother`, `Grandson`, `Granddaughter`, `Father-in-law`, `Mother-in-law`, `Son-in-law`, `Daughter-in-law`, `Uncle`, `Aunt`, `Nephew`, `Niece`, `Cousin`, `Other relative`, `Non-relative`; `Household head` is assigned to the head only.
- Legacy combined labels stay readable and are never rewritten: `Spouse / Partner`, `Son / Daughter`, `Parent`, `Sibling`, `Grandchild`, `Grandparent`, `Son / Daughter-in-law`, `Parent-in-law`, `Niece / Nephew`, `Aunt / Uncle`.
- The RHU mock prototype (`mockFamilyRegistry*`, `FamilyDetails.jsx`, `FamilyTree.jsx`, `RelatedFamilyForm.jsx`, `FamilyMemberForm.jsx`) and `layoutFamilyTree`'s output stay unchanged. No new mock relationship store.
- Registration permission (`patients.register`) may only link the patient being saved to the head of the household they join. Standalone link changes need `families.manage`. All facility-scoped. All audited via `AuditLogger::log($request, $action, 'households', $description)`.
- Dates: ISO `YYYY-MM-DD` stays in forms/API; only display uses `formatLongDate` (`frontend/src/utils/formatters.js`).
- Add Patient form and its flow (FSN search, household selection, connection confirmation, address auto-fill, Save Patient) keep working.
- Backend tests: `cd backend && php artisan test --filter=<Name>`. Frontend tests: `cd frontend && node --test <file>`.
- UI copy and code are in English.

## Review Focus

- Saving a patient whose relationship link is invalid (self, duplicate, wrong label) must leave no patient, membership, or link behind.
- A patient moved to another household keeps the stored link, but the old and new household responses show it only when both people are members.
- Changing `mother_patient_id`/`father_patient_id` to someone already stored as that patient's spouse/sibling is rejected.
- A legacy label such as `Son / Daughter` on an existing member still renders and re-saves unchanged; a new label is required only if the user changes it.
- A household with only a head, or members with no explicit links, renders the tree with neutral cards and no lines or errors.
- A 40-member household stays usable: no overlapping cards, tree reachable by pan and Fit.

---

## Checkpoint 1: Backend

### Task 1: `patient_relationships` migration and models

**Files:**
- Create: `backend/database/migrations/2026_10_17_000001_create_patient_relationships_table.php`
- Create: `backend/app/Models/PatientRelationship.php`
- Modify: `backend/app/Models/Patient.php` (add relations)
- Test: `backend/tests/Feature/PatientRelationshipSchemaTest.php`

**Interfaces:**
- Produces: `App\Models\PatientRelationship` with `$fillable = ['barangay_health_center_id','patient_id','relative_id','type','created_by']`, relations `patient(): BelongsTo`, `relative(): BelongsTo`; constants `TYPE_SPOUSE = 'spouse'`, `TYPE_SIBLING = 'sibling'`, `TYPES`. `Patient::relationshipLinks(): Builder` returning rows where the patient is either side.

- [ ] **Step 1: Write failing tests** in `PatientRelationshipSchemaTest` (use `RefreshDatabase`, create two patients in one `BarangayHealthCenter`): `test_pair_is_unique_and_canonical` (inserting `(2,1)` fails, inserting `(1,2)` twice fails), `test_self_pair_is_rejected`, `test_type_must_be_spouse_or_sibling`, `test_cross_facility_pair_is_rejected`, `test_patient_delete_is_restricted`.
- [ ] **Step 2: Run** `php artisan test --filter=PatientRelationshipSchemaTest`. Expected: FAIL (table missing).
- [ ] **Step 3: Write the migration** following `2026_10_16_090000_create_bhc_households.php`: columns per spec section 4, `foreignId(...)->constrained()->restrictOnDelete()`, `unique(['patient_id','relative_id'])`, index on `relative_id`, composite FKs `(patient_id, barangay_health_center_id)` and `(relative_id, barangay_health_center_id)` to `patients` (add `unique(['id','barangay_health_center_id'])` on `patients` only if absent; check first and report). Check constraints for `patient_id < relative_id` and `type in ('spouse','sibling')`: pgsql via `DB::statement('ALTER TABLE ... ADD CONSTRAINT ...')`, enable RLS like `households`; sqlite via `BEFORE INSERT/UPDATE` triggers with `RAISE(ABORT, ...)`. `down()` drops triggers/constraints and the table only.
- [ ] **Step 4: Implement** the model and `Patient::relationshipLinks()`.
- [ ] **Step 5: Run** the schema tests. Expected: PASS.
- [ ] **Step 6: Pre-apply inspection (no apply yet).** Run `php artisan tinker --execute="echo config('database.default');"`, `php artisan migrate:status`, `php artisan migrate --pretend`. Report to the user: connection, pending list, and the SQL. Expected pending: only this migration; expected SQL: create table + indexes/constraints, nothing touching `patients` rows.
- [ ] **Step 7: Apply to the Supabase Postgres only after the user explicitly confirms the target and dry-run output**, with `php artisan migrate` only if Step 6 matches expectations; re-run `migrate:status` and report.

### Task 2: Relationship label rules

**Files:**
- Create: `backend/app/Services/RelationshipLabels.php`
- Modify: `backend/app/Services/Households.php` (validate label in `attach` and `head`)
- Modify: `backend/app/Http/Requests/PatientRequest.php`, `backend/app/Http/Controllers/Api/HouseholdController.php` (label validation on `relationships.*`)
- Test: `backend/tests/Feature/RelationshipLabelsTest.php`

**Interfaces:**
- Produces: `RelationshipLabels::LABELS` (the new list from Global Constraints), `::LEGACY`, `::linkTypeFor(string $label): ?string` (`Husband`/`Wife` → `spouse`, `Brother`/`Sister` → `sibling`, else `null`), `::validate(string $label, ?string $current = null, string $field = 'relationship'): void` (throws `ValidationException` unless the label is in `LABELS`, or is a legacy label equal to `$current`).

- [ ] **Step 1: Write failing tests**: `test_new_labels_are_accepted_on_registration`, `test_combined_label_rejected_for_a_new_member`, `test_legacy_label_accepted_only_when_unchanged_on_resave` (existing member stored as `Son / Daughter` re-saved with the same value → 200; changed to `Parent` → 422), `test_head_replacement_relationships_use_new_labels`, `test_link_type_mapping_table` (Husband/Wife → spouse, Brother/Sister → sibling, Partner/Father/Son/Grandmother → null).
- [ ] **Step 2: Run** `--filter=RelationshipLabelsTest`. Expected: FAIL.
- [ ] **Step 3: Implement** `RelationshipLabels` and call `validate` from `Households::attach` (passing the patient's stored `relationship_to_household_head` as `$current` when the household is unchanged) and `Households::head` for every submitted relationship.
- [ ] **Step 4: Run** the new tests plus `--filter=BhcHouseholdsTest`. Existing tests that submit `Son / Daughter` for new members must be updated to a specific label (note each change in the checkpoint report). Expected: PASS.

### Task 3: `PatientRelationships` service (rules, create, change, remove)

**Files:**
- Create: `backend/app/Services/PatientRelationships.php`
- Test: `backend/tests/Feature/PatientRelationshipsServiceTest.php`

**Interfaces:**
- Consumes: `PatientRelationship`, `Patient`, `Household`, `AuditLogger`, `FacilityAccessService`.
- Produces (all throw `ValidationException` keyed `relationship`, or abort 403/404):
  - `create(Request $request, Household $household, Patient $patient, Patient $relative, string $type): PatientRelationship`
  - `change(Request $request, Household $household, PatientRelationship $link, string $type): PatientRelationship`
  - `remove(Request $request, Household $household, PatientRelationship $link): void`
  - `assertPairFree(Patient $a, Patient $b, ?int $ignoreId = null): void` (used by Task 5)
  - `forHousehold(Household $household): Collection` (rows whose two people are both current members)

- [ ] **Step 1: Write failing tests**, each asserting no row is created on failure: `test_creates_canonical_pair_regardless_of_argument_order`; `test_rejects_self_link`; `test_rejects_duplicate_and_reversed_duplicate`; `test_rejects_pair_already_parent_and_child` (via `mother_patient_id` and via `father_patient_id`, both directions); `test_rejects_spouse_when_one_is_ancestor_of_the_other` (grandparent chain via parent links); `test_rejects_spouse_and_sibling_on_the_same_pair`; `test_rejects_cross_facility_and_inactive_patients`; `test_requires_both_people_in_the_household`; `test_change_type_revalidates`; `test_remove_deletes_only_that_row`; `test_each_mutation_writes_an_audit_log_entry` (actions `relationship_created`, `relationship_updated`, `relationship_removed`; description names both patient ids and the type).
- [ ] **Step 2: Run** `--filter=PatientRelationshipsServiceTest`. Expected: FAIL.
- [ ] **Step 3: Implement** the service. Ancestor check: bounded walk (max 20 generations, visited set) over `mother_patient_id`/`father_patient_id`. Canonical order via `min/max` of ids. Facility check via `FacilityAccessService::authorizePatientModification` for the patient being linked and BHC id equality for the relative.
- [ ] **Step 4: Run** the service tests. Expected: PASS.

### Task 4: Atomic link at registration

**Files:**
- Modify: `backend/app/Http/Requests/PatientRequest.php` (`household` array keys + `household.relationship_link`, `household.relationship_link.type` in `spouse,sibling`)
- Modify: `backend/app/Services/Households.php` (`attach` accepts `relationship_link`)
- Test: `backend/tests/Feature/RegistrationRelationshipLinkTest.php`

**Interfaces:**
- Consumes: `PatientRelationships::create`, `RelationshipLabels::linkTypeFor`.
- Produces: request shape `household: { kind: 'existing', household_id, relationship, version, relationship_link?: { type: 'spouse'|'sibling' } }`.

- [ ] **Step 1: Write failing tests** (reuse the `staff()` / `register()` helpers pattern from `BhcHouseholdsTest`): `test_wife_with_confirmed_spouse_link_persists_patient_membership_and_link`; `test_brother_with_confirmed_sibling_link_persists`; `test_no_link_is_created_without_the_confirmed_flag` (label `Wife`, no `relationship_link` → zero rows); `test_link_type_must_match_label` (`Wife` + `sibling` → 422); `test_partner_label_cannot_carry_a_link`; `test_link_for_a_new_household_is_rejected` (patient is the head); `test_invalid_link_rolls_back_patient_and_membership` (assert `Patient::count()` and the household `version` unchanged after a 422); `test_late_failure_rolls_back_everything` (make `AuditLogger` throw after the link as `test_late_audit_failure_rolls_back_patient_household_and_counter` does); `test_registration_permission_cannot_link_two_existing_unrelated_patients` (payload cannot name any patient except the saved one and the head); `test_update_move_household_with_link_confirms_against_the_new_head`.
- [ ] **Step 2: Run** `--filter=RegistrationRelationshipLinkTest`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `Households::attach`, after the patient update and before the version bump/audit, when `relationship_link` is present: require `$target->head_patient_id !== $patient->id`, require `linkTypeFor($relationship) === link type`, then call `PatientRelationships::create($request, $target, $patient, $headPatient, $type)`. Everything stays inside the controller's existing `DB::transaction`.
- [ ] **Step 4: Run** the new tests and `--filter=BhcHouseholdsTest`. Expected: PASS.

### Task 5: Parent-link edits stay consistent with stored links

**Files:**
- Modify: `backend/app/Http/Controllers/Api/PatientController.php` (`authorizeParentLinks`)
- Test: `backend/tests/Feature/ParentLinkRelationshipConsistencyTest.php`

**Interfaces:**
- Consumes: `PatientRelationships::assertPairFree`.

- [ ] **Step 1: Write failing tests**: `test_cannot_set_mother_to_a_stored_spouse_or_sibling` (PATCH → 422 with a clear message, `mother_patient_id` unchanged); `test_cannot_set_father_to_a_stored_sibling`; `test_unrelated_parent_link_still_saves`; `test_clearing_a_parent_link_is_allowed`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the check in `authorizeParentLinks` for the current patient (route model) when `mother_patient_id`/`father_patient_id` is being set. Registration of a brand-new patient has no stored links, so only updates are affected.
- [ ] **Step 4: Run** the new tests plus `--filter=Patient` suites that cover parent links. Expected: PASS.

### Task 6: Standalone endpoints and household response

**Files:**
- Modify: `backend/routes/api.php` (inside the `facility.assigned`, `actions.allowed` group)
- Modify: `backend/app/Http/Controllers/Api/HouseholdController.php` (`storeRelationship`, `updateRelationship`, `destroyRelationship`)
- Modify: `backend/app/Services/Households.php` (`response` adds `relationships`)
- Modify: `backend/app/Services/PatientIdentity.php` (`HOUSEHOLD_FIELDS` gains `mother_patient_id`, `father_patient_id`)
- Test: `backend/tests/Feature/HouseholdRelationshipsApiTest.php`

**Interfaces:**
- Produces:
  - `POST bhc/households/{id}/relationships` body `{version, patient_id, relative_id, type}` → 201 `{data: household response}`
  - `PATCH bhc/households/{id}/relationships/{relationshipId}` body `{version, type}` → 200 household response
  - `DELETE bhc/households/{id}/relationships/{relationshipId}` body `{version}` → 200 household response
  - household response gains `relationships: [{id, patient_id, relative_id, type}]` and each member gains `mother_patient_id`, `father_patient_id`.
  - All three mutations: `families.manage`, stale `version` → 409, bump `households.version`.

- [ ] **Step 1: Write failing tests**: `test_create_change_and_remove_round_trip_and_bump_version`; `test_stale_version_returns_409`; `test_requires_families_manage` (a user with only `patients.register` and `families.view` gets 403 on all three); `test_other_facility_household_is_404`; `test_rhu_user_is_forbidden`; `test_response_lists_only_links_between_current_members`; `test_member_response_includes_parent_ids`; `test_link_survives_household_move_and_disappears_from_both_responses_until_reunited` (move via `PATCH /api/patients/{id}` with a `household` command, assert the stored row still exists and neither household response lists it); `test_removed_member_leaves_other_links_intact`; `test_audit_entries_for_each_mutation`; `test_response_is_unchanged_for_households_without_links` (`relationships` is `[]`).
- [ ] **Step 2: Run** `--filter=HouseholdRelationshipsApiTest`. Expected: FAIL.
- [ ] **Step 3: Implement** the routes (`whereNumber` on both ids), controller methods (call `$this->households->bhc`, `ActionPermissions::ensure(..., 'families.manage')`, `checkVersion`, then the service, in `DB::transaction` under `Households::lock`), and the response/field changes.
- [ ] **Step 4: Run** the new tests, then the whole backend suite `php artisan test`. Expected: PASS (record any pre-existing failures separately; do not fix unrelated ones).

### Checkpoint 1 report

- [ ] **Step 1:** Report to the user: migration inspection output and whether it was applied, the list of tests added with results, existing tests modified (Task 2), and the full-suite result. **Stop and wait for review.** No commit.

---

## Checkpoint 2: Registration, Family Details, Tree

### Task 7: Frontend labels, payload, and graph builder

**Files:**
- Create: `frontend/src/utils/relationshipLabels.js`
- Create: `frontend/src/utils/familyGraph.js`
- Modify: `frontend/src/services/familyRegistry.js` (`validateConnection` gets a trailing `labels = RELATIONSHIPS` parameter; `RELATIONSHIPS` itself unchanged)
- Modify: `frontend/src/utils/householdData.js` (`normalizeHousehold` adds `relationships` and member parent ids already exist; `householdPayload` adds `relationship_link`)
- Modify: `frontend/src/services/householdService.js` (add the three relationship calls)
- Test: `frontend/src/utils/relationshipLabels.test.js`, `frontend/src/utils/familyGraph.test.js`, extend `frontend/src/utils/householdData.test.js`
- Modify: `frontend/package.json` (script `test:family-relationships`)

**Interfaces:**
- Produces:
  - `relationshipLabels.js`: `RELATIONSHIP_LABELS: string[]` (new list), `LEGACY_LABELS: string[]`, `linkTypeForLabel(label: string): 'spouse' | 'sibling' | null`, `labelOptions(current: string): {value: string, label: string, legacy: boolean}[]` (appends the saved legacy label as a disabled option "Saved: <label> (choose a specific relationship)"), `isAcceptedLabel(label: string, current: string): boolean`.
  - `familyGraph.js`: `buildFamilyGraph(household): { members: Member[], edges: Edge[] }` where `Edge = { from: string, to: string, type: 'parent' | 'spouse' | 'sibling', id?: string }`. Parent edges come only from members' `motherPatientId`/`fatherPatientId` that point at another member; `spouse`/`sibling` edges only from `household.relationships` whose two people are both members. `sortMembers(members, headId): Member[]` (head first, then by birth date ascending with missing last, then name).
  - `householdService.js`: `addRelationship(householdId, {version, patientId, relativeId, type})`, `changeRelationship(householdId, relationshipId, {version, type})`, `removeRelationship(householdId, relationshipId, {version})`, each returning a normalized household.
  - `householdPayload(connection, registry)` includes `relationship_link: {type}` when `connection.relationshipLink?.type` is set.

- [ ] **Step 1: Write failing tests**: `linkTypeForLabel` table (Husband/Wife → spouse, Brother/Sister → sibling, `Partner`, `Son`, `Spouse / Partner`, `''` → null); `labelOptions('Son / Daughter')` ends with the disabled legacy option and `labelOptions('Son')` has none; `isAcceptedLabel('Son / Daughter','Son / Daughter')` true, `isAcceptedLabel('Parent','Son / Daughter')` false; `buildFamilyGraph` — a Wife label alone creates **no** edge, a `relationships` row creates one `spouse` edge, a row referencing a non-member is dropped, `motherPatientId` pointing to a member creates a `parent` edge, one pointing outside the household does not; `sortMembers` order; `householdPayload` carries `relationship_link`; `normalizeHousehold` maps `relationships`.
- [ ] **Step 2: Run** `node --test src/utils/relationshipLabels.test.js src/utils/familyGraph.test.js src/utils/householdData.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add `"test:family-relationships": "node --test src/utils/relationshipLabels.test.js src/utils/familyGraph.test.js src/utils/householdData.test.js src/utils/householdTreeLayout.test.js src/utils/canvasViewport.test.js"` to `package.json` (later test files are added in Tasks 9-10).
- [ ] **Step 4: Run** the three test files. Expected: PASS.

### Task 8: Registration relationship confirmation (live BHC)

**Files:**
- Modify: `frontend/src/components/features/patients/HouseholdConnectionReview.jsx` (`RelationshipField` takes `labels`; review offers the confirmation)
- Modify: `frontend/src/components/features/patients/FamilyRegistryField.jsx` (pass `live` and `labels` through)
- Modify: `frontend/src/pages/bhc/AddPatient.jsx` (validate with the live label list when `live`; keep `connection.relationshipLink` through `stageConnection` and save)
- Create: `frontend/src/utils/relationshipLink.js`
- Test: `frontend/src/utils/relationshipLink.test.js`

**Interfaces:**
- Produces: `relationshipLinkOffer(label: string, headName: string): { type: 'spouse'|'sibling', text: string } | null` where `text` is e.g. `Record as spouse of Ana Cruz` / `Record as sibling of Ana Cruz`; `null` for any label without a link type. The review shows an unchecked checkbox with that text; ticking sets `connection.relationshipLink = { type }`, unticking or changing the label clears it. Mock/RHU paths (`live` false) keep the legacy list and show no offer.

- [ ] **Step 1: Write failing tests** for `relationshipLinkOffer`: Wife/Husband → spouse text, Brother/Sister → sibling text, Partner/Son/Father/`Spouse / Partner`/`''` → `null`, head name interpolated.
- [ ] **Step 2: Run** `node --test src/utils/relationshipLink.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the helper and the UI wiring. The existing confirm button, FSN search, address auto-fill, and Save Patient flow must behave as before when no link is ticked. `RelationshipField` renders `labelOptions(value)` for live registrations.
- [ ] **Step 4: Run** the helper test and `node --test src/utils/householdData.test.js src/services/mockFamilyRegistry.test.js src/services/mockFamilyWorkflows.test.js` (the mock tests must pass unchanged). Expected: PASS.
- [ ] **Step 5: Browser check** (dev server + real backend): register a member as Wife with the box ticked, then `GET /api/bhc/households/{id}` shows one `spouse` row; refresh and confirm it persists. Register one without ticking; confirm no row. Report results.

### Task 9: Tree layout and canvas viewport

**Files:**
- Modify: `frontend/src/utils/familyTree.js` (extract the shared grouping into `layoutGroups(members, edges, headId, groupTypes)`; `layoutFamilyTree` calls it with `['spouse']`; export `layoutHouseholdTree` using `['spouse','sibling']`)
- Create: `frontend/src/utils/householdTreeLayout.test.js`
- Create: `frontend/src/utils/canvasViewport.js`, `frontend/src/utils/canvasViewport.test.js`
- Create: `frontend/src/components/features/families/FamilyTreeCanvas.jsx`

**Interfaces:**
- Produces:
  - `layoutHouseholdTree(members, edges, headId): { nodes: Node[], width: number, height: number }` with `Node = Member & {x, y, width, height}`; existing `layoutFamilyTree` output is byte-for-byte unchanged for the existing mock inputs.
  - `canvasViewport.js`: `fitToView(content: {width, height}, viewport: {width, height}, padding = 24): {scale, x, y}` (never above `1`, centered), `zoomAt(view, factor, point): view` clamped to `[0.25, 2]`, `panBy(view, dx, dy): view`, constants `MIN_SCALE = 0.25`, `MAX_SCALE = 2`.
  - `<FamilyTreeCanvas members edges headId onOpenMember(memberId) />`: renders SVG lines plus absolutely positioned cards (name, relationship-to-head label, `formatLongDate(birthDate)`), `Spouse` / `Sibling` labels on those links, a `Parent` line bus for parent edges; toolbar buttons `Zoom in`, `Zoom out`, `Reset view` (fit) with `aria-label`s; pointer-drag pans the whole canvas only; wheel zoom is optional; cards are buttons that call `onOpenMember`; keyboard arrows pan the focused canvas region.

- [ ] **Step 1: Write failing tests**: `householdTreeLayout.test.js` — sibling-only pair sits adjacent in the same row; a 40-member household has no two nodes with overlapping rectangles; members with no edges all appear exactly once; invalid cyclic parent edges do not hang (bounded). `canvasViewport.test.js` — `fitToView` never scales above 1 and centers; `zoomAt` clamps and keeps the pointer's world point fixed; `panBy` adds offsets. Also assert `layoutFamilyTree` is unchanged by running `node --test src/services/mockFamilyWorkflows.test.js`.
- [ ] **Step 2: Run** the two new test files. Expected: FAIL.
- [ ] **Step 3: Implement** the layout refactor and `canvasViewport.js`, then the canvas component using them. Use Pointer Events with `setPointerCapture`; no new dependency.
- [ ] **Step 4: Run** `npm run test:family-relationships` and `node --test src/services/mockFamilyWorkflows.test.js`. Expected: PASS.

### Task 10: BHC Family Details page and connections editor

**Files:**
- Modify: `frontend/src/pages/bhc/BhcFamilies.jsx` (`BhcFamilyDetails`; replace `BhcDeferredFamilyAction` use for member-edit only)
- Create: `frontend/src/components/features/families/FamilyMembersList.jsx`
- Create: `frontend/src/components/features/families/FamilyConnectionsEditor.jsx`
- Modify: `frontend/src/App.jsx` (route `/bhc/families/:householdId/members/:memberId/edit` renders `FamilyConnectionsEditor` for `bhc`; the `related/new` route stays deferred; RHU routes untouched)
- Test: `frontend/src/utils/familyConnections.test.js` (pure helper)
- Create: `frontend/src/utils/familyConnections.js`

**Interfaces:**
- Produces:
  - Page structure per the sketch: back link, title, FSN, head, address, member count; `Edit Family` and `Register Member` (existing links and permission checks) at the upper right; `role="tablist"` with `Family Tree` and `List`; the panel switches without navigation; arrow/Home/End keyboard handling as in `FamilyDetails.jsx`.
  - `FamilyMembersList`: compact rows (head first via `sortMembers`): name, relationship-to-head label (legacy labels shown as saved), `formatLongDate(birthDate)` plus age, `View Details` linking to `/bhc/patients/{id}?tab=patient-info`.
  - `familyConnections.js`: `connectionRowsFor(household, memberId): {id, relativeId, type}[]` (explicit spouse/sibling rows only); `candidateRelatives(household, memberId): Member[]` (members not already linked to the member, excluding self); `describeConnection(type, relativeName): string`.
  - `FamilyConnectionsEditor` (requires `families.manage` through the existing `familiesManage` route guard): lists the member's explicit spouse/sibling links; add (choose member + type), correct (switch type), remove; every change goes through a confirmation modal naming both people; send the household `version`; show server errors (422 `relationship`, 409 reload prompt) without losing the draft; invalidate the household query keys on success; no inference or bulk "fill from labels" action.

- [ ] **Step 1: Write failing tests** for `connectionRowsFor`, `candidateRelatives`, `describeConnection` (including: parent links are not listed as editable rows, a member already linked is excluded from candidates, a household of one has no candidates).
- [ ] **Step 2: Run** `node --test src/utils/familyConnections.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** helper, components, route, and page. Date display uses `formatLongDate` everywhere in these components. Neutral members (no edges) render as cards without lines; show a short note when a household has members but no explicit connections.
- [ ] **Step 4: Run** `npm run test:family-relationships` and `node --test src/utils/familyAccess.test.js`. Expected: PASS.
- [ ] **Step 5: Browser check** with the real backend (use the `run` skill): open a household, switch tabs, pan/zoom/reset, confirm cards do not move individually, add a spouse link in the editor, refresh, confirm the `Spouse` line persists, change it to sibling, remove it, confirm a stale-version conflict message by editing the same household in a second tab. Report results.

### Checkpoint 2 report

- [ ] **Step 1:** Run `cd frontend && npm run test:family-relationships && npm run test:families && npm run build`. Report test/build results, browser-check findings, and any failure. **Stop and wait for review.** No commit.

---

## Checkpoint 3: Patient Details, Change Household, Dates, Regression

### Task 11: Edit Patient uses inline Patient Information

**Files:**
- Modify: `frontend/src/pages/bhc/PatientDetails.jsx` (remove the `navigate(.../edit)` redirect at the pencil handler; always `handleEditSection`; strip household-owned fields from the update payload for household members)
- Modify: `frontend/src/components/features/patients/profile/RegistrationSections.jsx` (new prop `householdLocked`: FSN, street/purok/barangay/municipality, and relationship-to-head are read-only with the text "Managed by the household. Use Edit Family or Change Household.")
- Modify: `frontend/src/pages/bhc/BhcFamilies.jsx` (the former "Edit patient" row action is now `View Details`, already added in Task 10, so only verify no link to `/edit` remains)
- Modify: `backend/app/Http/Controllers/Api/PatientController.php` (`update`: for a patient with a `household_id`, reject a changed `street_address`/`purok_area`/`barangay`/`municipality` with 422 "Use Edit Family to change the household address.", mirroring the FSN guard)
- Create: `frontend/src/utils/patientInlineEdit.js`
- Test: `frontend/src/utils/patientInlineEdit.test.js`, `backend/tests/Feature/HouseholdMemberAddressGuardTest.php`

**Interfaces:**
- Produces: `inlineUpdatePayload(form: object, patient: object): object` (returns `form` minus `familySerialNumber`, `streetAddress`, `purokArea`, `barangay`, `municipality`, `relationshipToHouseholdHead` when `patient.householdId` is set, otherwise returns `form` unchanged); `isHouseholdLocked(patient): boolean`.

- [ ] **Step 1: Write failing tests**: frontend — `inlineUpdatePayload` strips the six keys for a household member and keeps every other key, leaves a non-member's form untouched, never mutates its input; backend — member address change → 422 and unchanged row, same address resent → 200, FSN guard still 422, non-member address edits still 200, a user without `patients.register` still 403, an RHU user cannot edit a BHC patient.
- [ ] **Step 2: Run** both. Expected: FAIL.
- [ ] **Step 3: Implement** as listed. Keep `canRegister` gating, the existing Save Changes confirm modal, Cancel behavior, `saving` lock, and `registrationErrors` mapping so entered values survive a validation failure.
- [ ] **Step 4: Run** `node --test src/utils/patientInlineEdit.test.js src/utils/patientProfile.test.js` and `php artisan test --filter=HouseholdMemberAddressGuardTest`. Expected: PASS.
- [ ] **Step 5: Browser check:** pencil on a household member opens inline editing (no navigation), Save persists after refresh, Cancel restores values, household fields read-only, a read-only user sees no pencil.

### Task 12: Change Household action

**Files:**
- Create: `frontend/src/components/features/patients/profile/ChangeHouseholdPanel.jsx`
- Create: `frontend/src/hooks/useHouseholdSearch.js`
- Modify: `frontend/src/pages/bhc/PatientDetails.jsx` (a clearly labelled **Change Household** button in the Patient Information household row, shown only when `canRegister`)
- Test: `frontend/src/utils/changeHousehold.test.js`
- Create: `frontend/src/utils/changeHousehold.js`

**Interfaces:**
- Produces: `changeHouseholdPayload(connection, registry, replacement): { household: object, head_replacement?: object }` (built with `householdPayload`; contains **no** other patient field); `useHouseholdSearch(scope): { results, loading, error, search(query) }` (same lookup call `BhcPatientRegistration` uses; `BhcPatientRegistration` itself is not modified); the panel reuses `FamilyRegistryField` with `live`, shows the existing review (FSN search, selection, confirmation, head replacement, relationship dropdown with the new labels, and the Task 8 link confirmation), and on confirm calls `updatePatient(patientId, changeHouseholdPayload(...))`, then invalidates `queryKeys.patientDetails("bhc", patientId)`, `queryKeys.patients("bhc")` and the household keys.

- [ ] **Step 1: Write failing tests**: `changeHouseholdPayload` contains only `household` (and `head_replacement` when given), carries `relationship_link` when set, omits demographics.
- [ ] **Step 2: Run** `node --test src/utils/changeHousehold.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** helper, hook, panel, and button. The patient's identity fields are never sent. Backend behavior is already covered by the existing update path (`Households::attach` with `head_replacement`); add one backend test in `RegistrationRelationshipLinkTest` `test_household_only_patch_does_not_change_demographics` if not already covered by Task 4.
- [ ] **Step 4: Run** the frontend test and `php artisan test --filter=RegistrationRelationshipLinkTest`. Expected: PASS.
- [ ] **Step 5: Browser check:** move a non-head member to another household and confirm: the patient keeps name/DOB/etc., both household pages update, an old spouse link disappears from the old tree but stays stored (verify via API), and a head with remaining members is blocked until a replacement is chosen.

### Task 13: Consistent Date of Birth display

**Files:**
- Modify: `frontend/src/pages/bhc/BhcFamilies.jsx`, family components from Task 10, and any Patient Details/Family view that still prints a raw ISO birth date (search `birthDate`, `birthdate`, `Date of birth` under `frontend/src/pages` and `frontend/src/components/features/families|patients/profile`; change display only)
- Test: `frontend/src/utils/formatters.test.js` (create if absent)

- [ ] **Step 1: Write failing tests** for `formatLongDate`: `'2005-04-13'` → `April 13, 2005`; `'2024-01-01'` and `'2024-12-31'` do not shift a day; `null`, `''`, `'not-a-date'` return the fallback (`'—'` default, custom when passed); a `Date` input works.
- [ ] **Step 2: Run** `node --test src/utils/formatters.test.js`. Expected: PASS for existing behavior (these pin it); add any failing case discovered and fix `formatLongDate` minimally.
- [ ] **Step 3: Replace** raw ISO displays in the files found. Do not touch form values, payloads, calculations, or other date fields.
- [ ] **Step 4: Grep check:** `Grep` the family/profile components for `birthDate}`/`birthdate}` rendered directly; expected none.

### Task 14: Regression, documentation, and final report

**Files:**
- Modify: `docs/superpowers/specs/2026-10-17-family-relationships-and-family-details-design.md` (add section 13 "Unfinished: RHU live relationship support" stating RHU Family Details is still the mock prototype and has no live relationship support)
- Modify: `frontend/package.json` (add `utils/patientInlineEdit.test.js`, `changeHousehold.test.js`, `relationshipLink.test.js`, `familyConnections.test.js`, `formatters.test.js` to `test:family-relationships`)

- [ ] **Step 1: Run backend:** `cd backend && php artisan test`. Record totals and every failure; classify each failure as pre-existing or new by reading whether the failing test touches any file changed by this plan. Do not stash, reset, or discard working-tree changes to compare.
- [ ] **Step 2: Run frontend:** `cd frontend && npm run test:family-relationships && npm run test:families && npm run test:household-workflow && npm run test:patient-profile && npm run test:access && npm run test:breadcrumbs && npm run lint && npm run build`. Record results.
- [ ] **Step 3: Browser regression** with the real backend: registration (new household, existing household, address auto-fill, FSN search), Family Details tabs/tree/list/connections editor, Edit Patient inline, Change Household, a user lacking `families.manage` (no editor, API 403), a user lacking `patients.register` (no pencil, no Change Household). Report each as performed or not performed.
- [ ] **Step 4: Write the final report** with the six sections the user requested (implementation summary per checkpoint, files modified with reasons, existing functionality reused, verification results including failures, regression check, remaining issues including RHU live relationships, Partner type, unsupported labels that never draw lines, and legacy labels left as saved). **Stop and wait for the user's review before any commit.**
