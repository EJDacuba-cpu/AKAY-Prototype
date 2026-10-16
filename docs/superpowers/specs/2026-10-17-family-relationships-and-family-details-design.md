# Family Relationships, Family Details Redesign, and Patient Editing Workflow

Date: 2026-10-17
Branch: `itr-patient-history`
Status: draft for review (not committed)

## 1. Goal

Give the BHC Family Tree real, persisted relationship data instead of a
frontend-only picture. Then redesign Family Details around it, route Edit
Patient into the existing Patient Details inline editor, and show dates of
birth as `April 13, 2005`.

The approved low-fidelity sketch gives the page structure: back arrow and
household title at the top left; **Edit** and **Register Member** at the top
right; a tabs bar with **Family Tree** and **List**; a tree of rectangular cards
joined by lines with a `Spouse` label; and wide horizontal rows in the list tab.

## 2. Decisions already made

| # | Decision |
|---|---|
| D1 | Add one additive table, `patient_relationships`, for `spouse` and `sibling` only. |
| D2 | Parent-child stays on `patients.mother_patient_id` / `father_patient_id`. It is never copied into the new table. |
| D3 | `relationship_to_household_head` stays a display label. It never creates a graph line. |
| D4 | Only explicitly confirmed, persisted rows (and existing mother/father links) draw lines. |
| D5 | No parallel mock relationship store. The BHC page reads the Laravel backend only. |
| D6 | Registration creates the patient, attaches the household, and records a confirmed link in **one transaction**. |
| D7 | Stored links survive a household move. The tree shows only links whose two people are both in the household on screen. |

## 3. Current persistence (verified in the local code)

- `households` holds FSN, address JSON, `head_patient_id`, `version`.
- `patients.household_id` plus `patients.relationship_to_household_head` (free text, max 100) record membership.
- `patients.mother_patient_id` and `father_patient_id` are the only person-to-person links. `PatientController::authorizeParentLinks` checks the parent's sex, facility, and self-link.
- `spouse_name` is text only. There is no sibling data.
- `Households::attach` runs inside the controller's DB transaction with the facility lock, FSN handling, head replacement and audit logging. It is reused as is.
- Active database: Supabase-hosted Postgres (pooler, port 6543), migrations ran through batch 29. PHPUnit uses in-memory SQLite.
- The household member response does not include `mother_patient_id` / `father_patient_id` yet.

## 4. Data model

`patient_relationships`

| column | notes |
|---|---|
| `id` | |
| `barangay_health_center_id` | FK, restrict on delete |
| `patient_id`, `relative_id` | FKs to `patients`, restrict on delete. Composite FK with the BHC id, as `households` does, so a link cannot cross facilities. |
| `type` | `spouse` or `sibling` (check constraint) |
| `created_by` | user id |
| timestamps | |

- Pairs are canonical: `patient_id < relative_id` (check constraint). `unique(patient_id, relative_id)` allows one relationship per pair and prevents duplicates and reversed copies.
- No `household_id` column. Household scope is derived from the two patients' `household_id`, so there is no stale copy to maintain (D7).
- Postgres gets row level security and the same guards as `households`. SQLite gets equivalent triggers, as the households migration does.
- `down()` drops only this table. There is no backfill and nothing existing is altered.

Parent-child edges are read straight from `mother_patient_id` / `father_patient_id`. Two children who share an explicit parent are drawn as siblings under that parent without storing anything.

## 5. Relationship labels (display only)

The dropdown stops offering combined labels. Each option describes the patient's
relationship **to the household head**.

| Option | Graph type it may confirm |
|---|---|
| Husband, Wife | `spouse` |
| Partner | none (display only; never classified as a spouse. A future partner type would need its own clearly defined relationship type.) |
| Brother, Sister | `sibling` |
| Father, Mother | none (no line) |
| Son, Daughter | none (no line) |
| Grandfather, Grandmother, Grandson, Granddaughter | none |
| Father-in-law, Mother-in-law, Son-in-law, Daughter-in-law | none |
| Uncle, Aunt, Nephew, Niece, Cousin | none |
| Other relative, Non-relative | none |
| Household head | assigned to the head only |

- Options derive from the previous list: Spouse/Partner, Son/Daughter, Parent, Sibling, Grandchild, Grandparent, Son/Daughter-in-law, Parent-in-law, Niece/Nephew, Aunt/Uncle, Cousin, Other relative, Non-relative.
- Labels never infer a type from patient sex. The staff member picks the specific label.
- **Legacy labels** (`Son / Daughter`, `Spouse / Partner` and the other combined ones) stay readable everywhere. They are never rewritten or backfilled. In an editor they appear as a disabled "Saved: Son / Daughter (choose a specific relationship)" entry. An unchanged saved label is accepted when the record is saved again. A changed label must be one of the new options.
- The backend validates labels against the new list plus a legacy allowance (the stored value is accepted only if unchanged). Today only the frontend list enforces this.

**Unsupported for graph lines (reported, not faked):** father, mother, son, daughter,
grandparents, grandchildren, in-laws, uncles, aunts, nieces, nephews, cousins,
other and non-relatives. Son/daughter and father/mother lines come only from the
existing mother/father links on the child's own record. Choosing "Father" for a
new member does **not** edit the head's `father_patient_id` (that would modify an
existing patient and is not allowed from registration).

## 6. Backend rules and API

**Registration payload.** `household` may carry
`relationship_link: { type: "spouse" | "sibling" }`, meaning "record this patient
as spouse/sibling of the target household's head". The backend accepts it only
when:

1. the label is compatible (Husband/Wife with `spouse`, Brother/Sister with `sibling`);
2. the household is an existing one in the user's BHC and the head exists;
3. the patient is not the head, and head and patient are not the same person;
4. no stored link, mother/father link, or ancestor/descendant chain already connects the pair;
5. the user has `patients.register` and facility access to the patient being saved.

The row is created inside `DB::transaction` in `PatientController::store` / `update`,
right after `Households::attach`. Any failure rolls back the patient, the
membership, and the link. The audit log records `relationship_created`.

**Authorization (requirement 9).** A registration link can only connect the
patient being saved to the head of the household they are joining. It writes a
link row and does not modify any other patient. Anything else uses `families.manage`.

**Standalone endpoints** (for the connections editor and for older records):

- `POST /bhc/households/{id}/relationships` with `{ patient_id, relative_id, type }`
- `DELETE /bhc/households/{id}/relationships/{relationshipId}`

Both need `families.manage`, check the facility, require both people to be current
members of that household, run the same validation, bump the household `version`
(409 on a stale version), and write audit entries.

**Validation (requirement 6).** Reject self links, duplicates and reversed
duplicates, a different facility, inactive or missing patients, a pair already
linked as parent and child (either direction), spouse and sibling on the same
pair, and a spouse or sibling who is an ancestor or descendant of the other
(bounded walk over `mother_patient_id` / `father_patient_id`). Saving a
mother/father link is also rejected when a stored spouse/sibling row already
connects that pair, so the two sources cannot contradict each other.

**Reads.** `Households::response` adds, per household:
`members[].mother_patient_id`, `members[].father_patient_id`, and
`relationships: [{ id, patient_id, relative_id, type }]`, limited to rows whose
two people are both current members. `PatientIdentity::HOUSEHOLD_FIELDS` gains the
two parent ids. Viewing requires `families.view`, as the household show endpoint does.

## 7. Edit Patient workflow

- BHC Patient Details: the pencil in Patient Information always uses the existing inline editor. The redirect at `PatientDetails.jsx:565` is removed.
- BHC Family Details: the member action "Edit patient" links to Patient Details (`/bhc/patients/:id`, Patient Information tab), not to `/edit`.
- Household-owned fields (FSN, address, relationship to head) are read-only in the inline form and are left out of the update payload. Backend: for a household member, an address that differs from the household's is rejected (422, "Use Edit Family"), matching the existing FSN guard.
- The `/bhc/patients/:id/edit` route and the Add Patient form are **unchanged** and are no longer linked from any Edit Patient action. A clearly labelled **Change Household** action in the household row of Patient Information opens a panel inside Patient Details. It is shown only to users with `patients.register`, reuses the existing household-change components (`FamilyRegistryField`, the connection review, FSN search, head replacement) and the existing `PATCH /patients/{id}` household command, and sends **only** the household command. It never reopens the general Add Patient form and never sends demographics.
- Existing behavior is kept: Save Changes and Cancel, validation, saving lock, success/error feedback, `patients.register` gating.
- RHU Patient Details has no editing and no Edit Patient entry point today. No RHU behavior is added; this is reported, not invented.

## 8. Family Details UI (BHC, live data)

- Header: back to Families, household title, FSN, head, address, member count; `Edit Family` and `Register Member` at the upper right (both exist today and are reused).
- Tabs (`role="tablist"`): **Family Tree** and **List**. Selected tab changes the panel without leaving the page.
- **Family Tree:** cards laid out by generation. Lines come only from parent links (mother/father), stored spouse rows (a `Spouse` label between the two cards), and sibling rows or shared parents. A member with no explicit link is a neutral card with no line. Cards show name, relationship-to-head label, and date of birth; a click opens Patient Details.
- Canvas: drag to pan the whole canvas, zoom in, zoom out, and Reset / Fit. Cards are not individually draggable. The existing pure `layoutFamilyTree` is reused; the SVG canvas is built in React with pointer events and no new dependency.
- **List:** compact horizontal rows. Head first, then members ordered by age then name. Columns: name, relationship to head, date of birth (age), View Details.
- Related Families is not part of the BHC page (it is deferred in the FSN backend spec).
- The shared presentational pieces take plain `{ members, edges }` so they are not tied to any store.

## 9. Date of birth

Reuse `formatLongDate` / `formatDate` in `utils/formatters.js` (local-calendar parse
of `YYYY-MM-DD`, so no day shift; fallback for missing or invalid values). Apply it to
Patient Details, Family Details, the tree cards and the list. ISO values stay
unchanged in forms and in API payloads.

## 10. Testing and verification

Backend (PHPUnit, SQLite in memory), written **before** any tree UI work:
migration up/down; row created with its patient and attach in one transaction;
rollback when any step fails (no partial patient, membership, or link); label/type
compatibility; duplicate, reversed, self, cross-facility, inactive, parent-conflict
and ancestor-conflict rejections; permission matrix (`patients.register` versus
`families.manage`); no change to unrelated patients; link survives a household
move and is absent from the other household's response; legacy labels still read
and save; FSN, facility and audit behavior unchanged.

Frontend (`node --test`): label list and legacy handling, edge building from
backend data, layout, date formatting, Edit Patient routing. Then `vite build` and a
browser check of the real flow: register with a Wife/Husband/Brother/Sister
confirmation, refresh, and see the persisted line.

Before the migration is applied to the local Postgres, run `migrate:status` and
`migrate --pretend`, and confirm the table is additive. Never reset, truncate or
rewrite patient rows. Nothing is reported as verified unless it was actually run.

## 11. Checkpoints (each is reviewed before the next starts)

**Checkpoint 1 - backend.** Inspect the active DB connection, run `migrate:status`
and `migrate --pretend`, report any unexpected schema change, then: migration,
model and Laravel relationships, label list with legacy allowance, validation
(including parent-link edits after spouse/sibling rows exist), permissions, audit,
API (registration link, standalone add/correct/remove, household response), and
PHPUnit tests.

**Checkpoint 2 - registration and Family Details.** Registration relationship
confirmation, the minimal connections editor, the live Family Tree and List with
pan/zoom, and frontend tests.

**Checkpoint 3 - Patient Details and polish.** Inline Edit Patient routing, the
household-field guard, the Change Household action, date formatting, and the final
regression run (backend tests, frontend tests, `vite build`, browser check).

No commit or push happens at any checkpoint without explicit approval.

## 12. Resolved decisions

1. **Partner** is display-only. Only Husband and Wife may confirm the `spouse` type.
2. **Connections editor** is included in Family Details for authorized staff: add, correct and remove explicit spouse and sibling links, with validation, a confirmation step, audit entries, and the existing permission model (`families.manage`). It never infers or backfills links. "Correct" means changing a pair's type between spouse and sibling, which is validated like a new link.
3. **RHU Family Details** (mock prototype) stays unchanged. RHU live relationship support is a separate unfinished task and is not claimed as done.
4. **Change Household** is a clearly identified, `patients.register`-gated action that reuses the existing household-change flow. Regular Edit Patient actions never open Add Patient.
5. Work stays on `itr-patient-history`. Existing uncommitted changes are preserved.
