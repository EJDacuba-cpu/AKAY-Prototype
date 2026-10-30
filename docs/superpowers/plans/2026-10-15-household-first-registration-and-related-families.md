# Household-First Registration and Related Families Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every patient belongs to exactly one household, created inline in registration with the address typed once. Staff can link relatives who live in other households from Family Details.

**Architecture:** All rules live in the pure mock-registry services:
- `mockFamilyRegistry.js` holds patient and household commits.
- `mockFamilyWorkflows.js` holds family and related-link commits.

Each service function validates before mutation and is unit-tested with `node --test`. The React pages only stage drafts and call these functions. Related families are not a new entity: they are `registry.connections` edges whose two endpoints are in different households.

**Tech Stack:**
- React 19 + react-router, Vite, Tailwind v4
- `node:test` with `node:assert/strict`
- lucide-react icons, react-hot-toast

**Spec:** `docs/superpowers/specs/2026-10-15-household-first-registration-and-related-families-design.md`

## Global Constraints

- Frontend prototype only. No API, Laravel, or database changes. All data stays in the mock registry snapshot.
- All UI copy is English. Use the spec's strings verbatim where it gives them.
- FSN format is `FSN-<4-digit year>-<4-digit sequence>`, for example `FSN-2026-0001`. It is always editable.
- FSN uniqueness is trimmed and case-insensitive, and **includes archived households**.
- A household head must be 18 or older and must have a recorded date of birth.
- Never infer a household or a link from surname or address. Every link is explicit.
- Service imports between files use explicit `.js` extensions, because `node --test` runs them directly.
- Run commands from `frontend/`. The test command for the touched services is `npm run test:families`.
- Keep the registration page's medical-ehr-minimalism styling:
  - flat, `rounded-none`, `border-gray-200`/`300`, no shadows
  - `red-600` primary buttons
  - field labels `text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]`

## Review Focus

1. **Date of birth changed after creating a household.** A patient creates a new household, then edits the DOB to under 18. Save must be rejected with the minor message. Task 1 covers this with `validateConnection` called with the patient.
2. **Address edited after "+ Create New Household".** The saved household must use the address in the form at save time, not the address when the button was pressed. Task 1 `withFormAddress` test, and Task 5 browser check.
3. **A moved child's registration parent link.** When the child changes household, the `motherPatientId` edge must survive as an explicit connection and must not be duplicated if the edge already exists. Task 2.
4. **Editing member connections in Family Details.** Saving must not delete links to other households. Task 3 `commitFamilyMember` test.
5. **Stale selection.** A household archived, or a patient moved, between opening a form and saving. The save must fail cleanly with no partial write. Task 3 and Task 4 tests use a registry mutated after draft creation.

## Before Task 1

The working tree already contains a lot of uncommitted work, including the whole Families module and the registration layout rework that this plan builds on. **Ask the user whether to commit that existing work as a baseline commit first.** Do not start Task 1 until they answer. If they decline, each task still commits only its own listed files.

---

### Task 1: Registry rules for household-first registration

**Files:**
- Modify: `frontend/src/services/mockFamilyRegistry.js`
- Test: `frontend/src/services/mockFamilyRegistry.test.js`

**Interfaces:**
- Produces:
  - `NO_HOUSEHOLD_MESSAGE = "Search for a household or create a new one."`
  - `MINOR_HEAD_MESSAGE = "A patient under 18 can't be a household head. Register the parent or guardian first, then add this child to their household."`
  - `MISSING_BIRTH_DATE_MESSAGE = "Enter the date of birth first."`
  - `nextSerialNumber(registry, date = new Date()) -> string`
  - `canHeadHousehold(patient, today = new Date()) -> { ok: true } | { ok: false, code: "missing-birth-date" | "minor", reason: string }`
  - `validateConnection(registry, connection, patientId, patient?) -> errors`. New optional 4th argument: the form-like patient with `birthDate`.
  - `withFormAddress(connection, form) -> connection`. For `kind: "new"` with `headPatientId: "self"`, it returns a copy whose `household.address = addressValues(form)`. Otherwise it returns `connection` unchanged.
  - `stageConnection`: for `kind: "new"` with `headPatientId: "self"` it no longer overwrites the form's address fields. It still sets `familySerialNumber`.

- [ ] **Step 1: Write failing tests**

```js
test("nextSerialNumber counts same-year FSN-YYYY-NNNN serials only, archived included", () => {
  const registry = createMockRegistry();
  assert.equal(nextSerialNumber(registry, new Date(2026, 9, 15)), "FSN-2026-0001");
  registry.households.push({ id: "h-a", serialNumber: "FSN-2026-0007", archivedAt: "2026-10-01T00:00:00.000Z", headPatientId: null, address: {} });
  registry.households.push({ id: "h-b", serialNumber: "fsn-2025-0099", headPatientId: null, address: {} });
  assert.equal(nextSerialNumber(registry, new Date(2026, 9, 15)), "FSN-2026-0008");
  assert.equal(nextSerialNumber(registry, new Date(2025, 2, 1)), "FSN-2025-0100");
});

test("canHeadHousehold requires a birth date and age 18+", () => {
  const today = new Date(2026, 9, 15);
  assert.deepEqual(canHeadHousehold({ birthDate: "" }, today), { ok: false, code: "missing-birth-date", reason: MISSING_BIRTH_DATE_MESSAGE });
  assert.deepEqual(canHeadHousehold({ birthDate: "2008-10-16" }, today), { ok: false, code: "minor", reason: MINOR_HEAD_MESSAGE });
  assert.deepEqual(canHeadHousehold({ birthDate: "2008-10-15" }, today), { ok: true });
});

test("saving without a household is rejected and leaves the registry untouched", () => {
  const registry = createMockRegistry();
  assert.deepEqual(validateConnection(registry, null, undefined, patient), { household: NO_HOUSEHOLD_MESSAGE });
  assert.throws(() => commitMockPatient(registry, patient, null, undefined, id), (error) => error.errors.household === NO_HOUSEHOLD_MESSAGE);
});

test("a minor cannot head a new self household, including after a later DOB change", () => {
  const registry = createMockRegistry();
  const minor = { ...patient, birthDate: "2015-01-01" };
  assert.equal(validateConnection(registry, newHousehold(), undefined, minor).headPatientId, MINOR_HEAD_MESSAGE);
  assert.throws(() => commitMockPatient(registry, minor, newHousehold(), undefined, id));
});

test("withFormAddress copies the form address into a new self household only", () => {
  const form = { ...patient, streetAddress: "1 Late Edit Street" };
  assert.equal(withFormAddress(newHousehold(), form).household.address.streetAddress, "1 Late Edit Street");
  const joined = existing();
  assert.equal(withFormAddress(joined, form), joined);
});

test("staging a new self household keeps the typed address", () => {
  const registry = createMockRegistry();
  const staged = stageConnection(patient, registry, { ...newHousehold(), household: { serialNumber: "FSN-2026-0001", address: {} } });
  assert.equal(staged.streetAddress, patient.streetAddress);
  assert.equal(staged.familySerialNumber, "FSN-2026-0001");
});
```

Update existing tests that commit with a `null` connection, which is now invalid:
- **"unlinked save creates neither a household…":** delete it. The new rejection test replaces it.
- **"later Edit Patient links the same saved unlinked patient…":** start from the seeded legacy unlinked patient `mock-patient-7` instead of committing with `null`.
- **"Remove Connection retains address…":** delete it.
- **"a departing head must explicitly choose…":** move the head with `existing("mock-household-2", "Sibling")` instead of `null`, and assert `result.patient.householdId === "mock-household-2"`.
- **"removing a sole head preserves the saved household…":** delete it. Task 2 adds the archive test.
- **"confirming a connection stages address…":** if it saves with `null`, use the seeded unlinked `mock-patient-7` as the saved-unlinked patient instead.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm run test:families`
Expected: FAIL. `nextSerialNumber`, `canHeadHousehold`, `withFormAddress` and the message constants are not exported, and the null-connection rejection fails.

- [ ] **Step 3: Implement in `mockFamilyRegistry.js`**

- `canHeadHousehold` computes whole years from `birthDate` against `today` with its own date math (year difference, minus one if the birthday hasn't occurred yet). Don't import `calculateAge`, because it has no injectable "today".
- `nextSerialNumber`: the regex is `^FSN-(\d{4})-(\d{4})$`, case-insensitive, applied to the trimmed serial. Use `max + 1`, padded to 4.
- `validateConnection`:
  - `!connection` returns `{ household: NO_HOUSEHOLD_MESSAGE }`.
  - For `kind: "new"` with `headPatientId: "self"` and a `patient` argument, add `errors.headPatientId = canHeadHousehold(patient).reason` when not ok.
- `commitMockPatient` passes `form` as the 4th argument to `validateConnection`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test:families`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/mockFamilyRegistry.js frontend/src/services/mockFamilyRegistry.test.js
git commit -m "feat(families): household-first registry rules and FSN suggestion"
```

---

### Task 2: Keep connections on move, convert parent IDs, archive empty households

**Files:**
- Modify: `frontend/src/services/mockFamilyRegistry.js` (`commitMockPatient`, `searchHouseholds`)
- Test: `frontend/src/services/mockFamilyRegistry.test.js`, `frontend/src/services/mockFamilyWorkflows.test.js`

**Interfaces:**
- Consumes: Task 1 exports.
- Produces:
  - `archiveEmptyHouseholds(households, patients, now = new Date()) -> households`. Any non-archived household with zero members gets `archivedAt: now.toISOString()` and `headPatientId: null`.
  - `commitMockPatient` keeps every edge whose two endpoints still exist.
  - `searchHouseholds` skips households with `archivedAt`.

- [ ] **Step 1: Write failing tests**

In `mockFamilyRegistry.test.js`:

```js
test("moving the last member out archives the old household; search hides it; its FSN stays taken", () => {
  const registry = createMockRegistry();
  const carmen = registry.patients.find((item) => item.id === "mock-patient-6");
  const result = commitMockPatient(registry, carmen, existing("mock-household-1", "Other relative"), carmen.id, id);
  const old = result.registry.households.find((item) => item.id === "mock-household-3");
  assert.ok(old.archivedAt);
  assert.equal(old.headPatientId, null);
  assert.ok(!searchHouseholds(result.registry, "FSN-003").length);
  const reuse = { ...newHousehold(), household: { serialNumber: "fsn-003 ", address: addressValues(patient) } };
  assert.equal(validateConnection(result.registry, reuse, undefined, patient).serialNumber, "This Family Serial Number already exists.");
});

test("a moved child's registration parent ID becomes one explicit parent edge", () => {
  const registry = createMockRegistry();
  const lucas = { ...registry.patients.find((item) => item.id === "mock-patient-lucas"), motherPatientId: "mock-patient-ana" };
  registry.connections = registry.connections.filter((edge) => !(edge.from === "mock-patient-ana" && edge.to === lucas.id));
  const moved = commitMockPatient(registry, lucas, existing("mock-household-2", "Grandchild"), lucas.id, id).registry;
  assert.equal(moved.patients.find((item) => item.id === lucas.id).motherPatientId, "");
  assert.equal(moved.connections.filter((edge) => edge.type === "parent" && edge.from === "mock-patient-ana" && edge.to === lucas.id).length, 1);
});
```

In `mockFamilyWorkflows.test.js`, replace the assertion in **"registration saves preserve other family graphs and moving clears only departed links"**:
- Rename it to **"moving a member keeps their connections as cross-household links"**.
- Assert that `moved.connections` still contains every edge touching `mock-patient-miguel` from `registry.connections`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm run test:families`
Expected: FAIL. There's no `archivedAt`, the edges are dropped, and the parent edge is missing.

- [ ] **Step 3: Implement**

In `commitMockPatient`:
1. Before clearing a `motherPatientId` or `fatherPatientId` whose parent is no longer in the same household, push `{ from: parentId, to: childId, type: "parent" }` into the connections. Skip it if an edge with the same `parent:from:to` key already exists. The key format matches `connectionKey` in workflows. Inline the same key string here, because the registry must not import workflows (that would create a cycle).
2. Replace the same-household edge filter with "both endpoints exist in `patients`".
3. Run `archiveEmptyHouseholds` on the households last.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test:families`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/mockFamilyRegistry.js frontend/src/services/mockFamilyRegistry.test.js frontend/src/services/mockFamilyWorkflows.test.js
git commit -m "feat(families): keep links on move and archive empty households"
```

---

### Task 3: Add Family commit, member-connection fix, no member removal

**Files:**
- Modify: `frontend/src/services/mockFamilyWorkflows.js`
- Modify: `frontend/src/pages/shared/FamilyMemberForm.jsx` (remove the removal flow)
- Test: `frontend/src/services/mockFamilyWorkflows.test.js`

**Interfaces:**
- Consumes:
  - `canHeadHousehold`, `nextSerialNumber` and `commitMockPatient` from Task 1 and Task 2.
  - `HEAD_RELATIONSHIP`, `ADDRESS_FIELDS`, `MockRegistryError`.
- Produces:
  - `newFamilyHeadStatus(registry, patient) -> { ok: boolean, reason?: string, notice?: string }`:

    | Case | Result |
    |---|---|
    | `canHeadHousehold` fails | `ok: false`, reason `"Date of birth not recorded"` or `"Under 18"` (by `code`) |
    | Heads a household that still has other members | `ok: false`, reason `` `Assign a new head for ${serial} first.` `` |
    | In another household | `ok: true`, notice `` `Currently in ${serial} (${relationship}). They will move to this new household.` `` |
    | No household | `ok: true` |

  - `commitNewFamily(registry, draft, makeId?) -> { registry, householdId }`
    - `draft = { serialNumber, address, headPatientId }`.
    - It validates the draft:
      - FSN: blank → `"Enter a Family Serial Number."`; duplicate → `"This Family Serial Number already exists."`
      - address fields, using the same messages as `commitFamily`
      - head existence: missing → `"This patient or household is no longer available. Search again."`
      - `newFamilyHeadStatus`
    - It then calls `commitMockPatient(registry, head, { kind: "new", headPatientId: "self", relationship: HEAD_RELATIONSHIP, household: { serialNumber, address } }, head.id, makeId)`.
    - `householdId` is the new household's id.
  - `saveNewFamily(draft) -> householdId`, which publishes through `publishMockRegistry`.
  - `commitFamilyMember` now replaces only edges with **both** endpoints in the household.
  - Removed: `commitRemoveMember`, `removeFamilyMember`.

- [ ] **Step 1: Write failing tests**

```js
test("Add Family moves an adult member out as head and keeps their links", () => {
  const registry = createMockRegistry();
  const draft = { serialNumber: "FSN-2026-0001", address: { streetAddress: "3 New St", purokArea: "Purok 9", barangay: "Perez", municipality: "Bulakan" }, headPatientId: "mock-patient-miguel" };
  const { registry: next, householdId } = commitNewFamily(registry, draft, () => "x");
  const miguel = next.patients.find(p => p.id === "mock-patient-miguel");
  assert.equal(miguel.householdId, householdId);
  assert.equal(miguel.relationshipToHouseholdHead, HEAD_RELATIONSHIP);
  assert.equal(miguel.streetAddress, "3 New St");
  assert.ok(next.connections.some(edge => edge.from === "mock-patient-roberto" && edge.to === "mock-patient-miguel"));
});

test("Add Family blocks a head of a multi-member household and a minor", () => {
  const registry = createMockRegistry();
  const base = { serialNumber: "FSN-2026-0001", address: { ...registry.households[0].address } };
  assert.throws(() => commitNewFamily(registry, { ...base, headPatientId: "mock-patient-roberto" }), e => e.errors.headPatientId === "Assign a new head for FSN-00208 first.");
  assert.throws(() => commitNewFamily(registry, { ...base, headPatientId: "mock-patient-lucas" }), e => e.errors.headPatientId === "Under 18");
});

test("Add Family from a single-person household archives the old one", () => {
  const registry = createMockRegistry();
  const { registry: next } = commitNewFamily(registry, { serialNumber: "FSN-2026-0001", address: { ...registry.households[0].address }, headPatientId: "mock-patient-6" }, () => "y");
  assert.ok(next.households.find(h => h.id === "mock-household-3").archivedAt);
});

test("Add Family rejects a head who disappeared after the draft was made", () => {
  const registry = createMockRegistry();
  registry.patients = registry.patients.filter(p => p.id !== "mock-patient-7");
  assert.throws(() => commitNewFamily(registry, { serialNumber: "FSN-2026-0001", address: { ...registry.households[0].address }, headPatientId: "mock-patient-7" }), e => e.errors.headPatientId === "This patient or household is no longer available. Search again.");
});

test("saving member connections keeps links to other households", () => {
  const registry = createMockRegistry();
  registry.connections.push({ from: "mock-patient-roberto", to: "mock-patient-4", type: "sibling" });
  const sofia = registry.patients.find(p => p.id === "mock-patient-sofia");
  const next = commitFamilyMember(registry, "mock-household-cruz", { patientId: sofia.id, relationship: sofia.relationshipToHouseholdHead, connections: connectionRows(registry, "mock-household-cruz", sofia.id) });
  assert.ok(next.connections.some(edge => edge.from === "mock-patient-roberto" && edge.to === "mock-patient-4"));
});
```

Delete the test **"remove preserves patient and address, clears FSN and all old family edges"**, and drop `commitRemoveMember` from the test file's import.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm run test:families`
Expected: FAIL. `commitNewFamily` isn't exported, and the cross-household edge is dropped.

- [ ] **Step 3: Implement the service changes**

In `mockFamilyWorkflows.js`, the change to `commitFamilyMember` is a one-line filter change:

```js
// before: !memberIds.has(edge.from) && !memberIds.has(edge.to)
!(memberIds.has(edge.from) && memberIds.has(edge.to))
```

- [ ] **Step 4: Update `FamilyMemberForm.jsx`**

- Remove the `removing` state, the confirm modal, the "Remove Connection" button and the `removeFamilyMember` import.
- For an existing non-head member, show this text instead:
  `<p className="text-xs text-neutral-500">To move this member, use Change Household in Edit Patient or Add Family.</p>`
- Keep the existing head text.

- [ ] **Step 5: Verify**

Run: `npm run test:families && npx eslint src/pages/shared/FamilyMemberForm.jsx src/services/mockFamilyWorkflows.js`
Expected: tests PASS, and no lint output.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/services/mockFamilyWorkflows.js frontend/src/services/mockFamilyWorkflows.test.js frontend/src/pages/shared/FamilyMemberForm.jsx
git commit -m "feat(families): add-family commit, keep cross-household links, drop member removal"
```

---

### Task 4: Related-family link services

**Files:**
- Modify: `frontend/src/services/mockFamilyWorkflows.js`
- Test: `frontend/src/services/mockFamilyWorkflows.test.js`

**Interfaces:**
- Consumes: `familyConnections`, `graphErrors`, `connectionKey`, `familyMembers`, `publishMockRegistry`.
- Produces:
  - `RELATED_TYPES = [["parent-of", "Parent of"], ["child-of", "Child of"], ["spouse", "Spouse / Partner"], ["sibling", "Sibling"], ["relative", "Other relative"]]`
  - `relatedConnections(registry, householdId) -> Array<{ key, memberId, relativeId, relativeHouseholdId, label }>`
    - These are edges from `registry.connections` with exactly one endpoint in `householdId`. Rows where either endpoint is missing, or the other household is archived, are skipped.
    - `label` is read from the member's side: `"parent of"`, `"child of"`, `"spouse / partner of"`, `"sibling of"` or `"relative of"`.
  - `commitRelatedLink(registry, householdId, { memberId, relativeId, type }) -> registry`
    - Errors are keyed `memberId`, `relativeId` and `type`:
      - `memberId`: `"Choose a member of this household."`
      - `relativeId`: `"Choose a patient from another household."` (same household, unlinked, archived, or missing)
      - `type`: `"Select a relationship."`
    - Then it runs `graphErrors` over both households' members, with the edges `familyConnections(h1) ∪ familyConnections(h2) ∪` existing edges between them `∪` the new edge. A graph error goes to `errors.form`.
    - `child-of` is stored as `{ from: relativeId, to: memberId, type: "parent" }`. `parent-of` is stored as `{ from: memberId, to: relativeId, type: "parent" }`. The other types are stored as `{ from: memberId, to: relativeId, type }`.
  - `commitRemoveRelatedLink(registry, key) -> registry`. If the key is missing: `errors.form = "This link no longer exists."`
  - `saveRelatedLink(householdId, draft)` and `removeRelatedLink(key)`, which publish.

- [ ] **Step 1: Write failing tests**

```js
test("child-of creates a reversed parent edge visible from both families", () => {
  const registry = createMockRegistry();
  const next = commitRelatedLink(registry, "mock-household-2", { memberId: "mock-patient-4", relativeId: "mock-patient-6", type: "child-of" });
  assert.ok(next.connections.some(e => e.from === "mock-patient-6" && e.to === "mock-patient-4" && e.type === "parent"));
  assert.equal(relatedConnections(next, "mock-household-2")[0].label, "child of");
  assert.equal(relatedConnections(next, "mock-household-3")[0].label, "parent of");
});

test("related link rejects same-household, archived, duplicate and cyclic targets", () => {
  const registry = createMockRegistry();
  assert.throws(() => commitRelatedLink(registry, "mock-household-cruz", { memberId: "mock-patient-miguel", relativeId: "mock-patient-sofia", type: "sibling" }), e => e.errors.relativeId);
  const linked = commitRelatedLink(registry, "mock-household-2", { memberId: "mock-patient-4", relativeId: "mock-patient-6", type: "child-of" });
  assert.throws(() => commitRelatedLink(linked, "mock-household-2", { memberId: "mock-patient-4", relativeId: "mock-patient-6", type: "sibling" }), e => e.errors.form);
  assert.throws(() => commitRelatedLink(linked, "mock-household-2", { memberId: "mock-patient-4", relativeId: "mock-patient-6", type: "parent-of" }), e => e.errors.form);
  linked.households = linked.households.map(h => h.id === "mock-household-3" ? { ...h, archivedAt: "2026-10-15T00:00:00.000Z" } : h);
  assert.throws(() => commitRelatedLink(linked, "mock-household-2", { memberId: "mock-patient-5", relativeId: "mock-patient-6", type: "relative" }), e => e.errors.relativeId);
});

test("removing a related link deletes only that edge; stale keys fail cleanly", () => {
  const registry = createMockRegistry();
  const linked = commitRelatedLink(registry, "mock-household-2", { memberId: "mock-patient-4", relativeId: "mock-patient-6", type: "relative" });
  const [row] = relatedConnections(linked, "mock-household-2");
  const removed = commitRemoveRelatedLink(linked, row.key);
  assert.equal(removed.connections.length, registry.connections.length);
  assert.throws(() => commitRemoveRelatedLink(removed, row.key), e => e.errors.form === "This link no longer exists.");
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm run test:families`
Expected: FAIL, the functions are not exported.

- [ ] **Step 3: Implement the functions listed in Interfaces in `mockFamilyWorkflows.js`**

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test:families`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/mockFamilyWorkflows.js frontend/src/services/mockFamilyWorkflows.test.js
git commit -m "feat(families): related-family link services"
```

---

### Task 5: Registration UI — inline Create New Household; remove the Create Household page

**Files:**
- Modify: `frontend/src/components/features/patients/FamilyRegistryField.jsx`
- Modify: `frontend/src/pages/bhc/AddPatient.jsx`
- Modify: `frontend/src/App.jsx`
  - Remove the `CreateHouseholdPage` import.
  - Remove the four `/(bhc|rhu)/patients/(add|:patientId)/household/new` routes.
  - Remove the `registrationDrafts` import and the `registrationDrafts.clear()` call.
- Modify: `frontend/package.json`. Drop `src/services/patientRegistrationDrafts.test.js` from `test:household-workflow` and `test:families`.
- Delete:
  - `frontend/src/pages/shared/CreateHouseholdPage.jsx`
  - `frontend/src/services/patientRegistrationDrafts.js`
  - `frontend/src/services/patientRegistrationDrafts.test.js`

**Interfaces:**
- Consumes: `nextSerialNumber`, `canHeadHousehold`, `withFormAddress`, `MINOR_HEAD_MESSAGE`, `MISSING_BIRTH_DATE_MESSAGE`, `HEAD_RELATIONSHIP`, and the 4-arg `validateConnection` from Task 1.
- `FamilyRegistryField` props after this task: `registry, patient, connection, savedConnection, headReplacement, onChange, onPendingChange, error, relationshipError`. `onCreateHousehold` is removed.

- [ ] **Step 1: `FamilyRegistryField.jsx`**

**No-match box**
- Replace `emptyActions` with the following.
- If `canHeadHousehold(patient)` is ok:
  - red `<Button size="sm"><Plus size={14} />Create New Household</Button>`
  - above it, the helper text *"This patient will be the household head. The address on this form will be used."*
  - On click: `onChange({ kind: "new", headPatientId: "self", relationship: HEAD_RELATIONSHIP, household: { serialNumber: nextSerialNumber(registry), address: {} } }, null)`, then reset search and `setSearching(false)`.
- If the reason code is `minor`: show `MINOR_HEAD_MESSAGE` as text (`text-xs text-gray-700`) with no button.
- If the code is `missing-birth-date`: show the button disabled, with `MISSING_BIRTH_DATE_MESSAGE` below it.

**New-household branch** (`connection?.kind === "new"`), rendered instead of the read-only serial row:
- an editable `Input` labelled "Family Serial Number" bound to `connection.household.serialNumber`, with `onChange` calling `onChange({ ...connection, household: { ...connection.household, serialNumber: value } }, null)`
- the line *"New household · This patient is the household head."*
- a ghost **Cancel** button that calls `onChange(null, null)` and `setSearching(true)`

**Removals**
- Delete `continueUnlinked` and the "Remove Connection" button.
- Keep "Change Household" for `kind: "existing"`.

- [ ] **Step 2: `AddPatient.jsx`**

**Address panel**
- Address inputs use `readOnly={householdConnection?.kind === "existing"}`.
- In `handleChange`, the early return for address fields applies only when `kind === "existing"`.

**Validation and save**
- Compute `const connectionToSave = withFormAddress(householdConnection, form);`.
- Use it in `validateForm`, calling `validateConnection(registry, connectionToSave, editingPatientId, form)` and `validateHeadReplacement`.
- Pass it to `saveMockPatient`.
- In `validateForm`, ignore `ADDRESS_FIELDS` keys from `householdErrors`, since the address panel validates them itself. Map `headPatientId` and `serialNumber` errors to `fieldErrors.familySerialNumber`.

**Removed code**
- `handleCreateHousehold` and the `onCreateHousehold` prop.
- Every `registrationDrafts` and `registrationPath` use, plus the `restoredDraft` state initialisers. Initial state now comes straight from `savedPatient`.
- Keep `createdPatientId` as plain `useState("")`.

- [ ] **Step 3: Remove the page, routes, drafts module and script entries listed under Files**

- [ ] **Step 4: Verify**

Run: `npx eslint src/App.jsx src/pages/bhc/AddPatient.jsx src/components/features/patients/FamilyRegistryField.jsx && npm run test:families && npm run test:household-workflow && npm run build`
Expected: no lint output, tests PASS, `✓ built`.

Then check in the browser at `http://localhost:5173/bhc/patients/add` (and `/rhu/patients/add`):
- **Adult with no match:** **Create New Household** shows `FSN-2026-0001`. Edit the street address afterwards, then save. The saved household's address in Families must be the edited one.
- **DOB of 2015:** the minor message appears and there's no button.
- **No DOB:** the button is disabled and shows "Enter the date of birth first."
- **Existing FSN:** search `FSN-001` and join it. The address becomes read-only.
- **Save with no household:** the FSN error reads "Search for a household or create a new one."

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src/components/features/patients/FamilyRegistryField.jsx frontend/src/pages/bhc/AddPatient.jsx frontend/src/App.jsx frontend/package.json frontend/src/pages/shared/CreateHouseholdPage.jsx frontend/src/services/patientRegistrationDrafts.js frontend/src/services/patientRegistrationDrafts.test.js
git commit -m "feat(registration): inline household creation, household required"
```

---

### Task 6: Add Family page (new mode)

**Files:**
- Modify: `frontend/src/pages/shared/FamilyForm.jsx` (new mode only; edit mode unchanged)
- Modify: `frontend/src/components/features/families/FamilyFields.jsx` (`PatientPicker`)

**Interfaces:**
- Consumes: `newFamilyHeadStatus` and `saveNewFamily` from Task 3, and `nextSerialNumber` from Task 1.
- `PatientPicker` gets optional props:
  - `describe(patient) -> { disabled?: boolean, note?: string }`. A disabled option renders `disabled` with `note` under the name in `text-xs text-neutral-500`.
  - `emptyText` (default `"No matching unlinked patients."`).

- [ ] **Step 1: New mode of `FamilyForm.jsx`**

**Initial draft:** `{ serialNumber: nextSerialNumber(registry), address: addressValues(), headPatientId: "" }`.

**Head section first.** Use `PatientPicker` with:
- `patients = registry.patients`
- `label = "Choose household head"`
- `emptyText = "No matching patients."`
- `describe = p => { const s = newFamilyHeadStatus(registry, p); return { disabled: !s.ok, note: s.reason || s.notice }; }`

**On select:** set `headPatientId` and `address = addressValues(selectedPatient)`.

**Then** the existing FSN and address fields.

**Save:**
- call `saveNewFamily(draft)`
- toast `"Family created."`
- navigate to `/${role}/families/${householdId}`
- map `error.errors` onto the fields, as the edit mode does

- [ ] **Step 2: Verify**

Run: `npx eslint src/pages/shared/FamilyForm.jsx src/components/features/families/FamilyFields.jsx && npm run build`
Expected: no lint output, `✓ built`.

Browser checks at `/bhc/families/new`:
- Lucas is disabled with "Under 18".
- Roberto Cruz is disabled with "Assign a new head for FSN-00208 first."
- Miguel shows the move notice. After saving, he's head of the new family and FSN-00208 no longer lists him.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/shared/FamilyForm.jsx frontend/src/components/features/families/FamilyFields.jsx
git commit -m "feat(families): add family for a moving-out member"
```

---

### Task 7: Related Families in Family Details

**Files:**
- Create: `frontend/src/pages/shared/RelatedFamilyForm.jsx`
- Modify: `frontend/src/pages/shared/FamilyDetails.jsx`
- Modify: `frontend/src/App.jsx`. Add `<Route key={`${role}-related-new`} path={`/${role}/families/:householdId/related/new`} element={<ProtectedPage allowedRole={role} module="familiesManage"><RelatedFamilyForm role={role} /></ProtectedPage>} />` inside the families `flatMap`.

**Interfaces:**
- Consumes: `RELATED_TYPES`, `relatedConnections`, `saveRelatedLink`, `removeRelatedLink` (Task 4), `familyName`, `patientName`, and `searchHouseholds` (Task 2, which skips archived households).

- [ ] **Step 1: `FamilyDetails.jsx`**

**Archived household:** if `household?.archivedAt`, render only *"This household is archived."* and the existing Back to Families link.

**Related Families section**, below the tree/list block:
- An `h2` "Related Families".
- A **+ Link Related Family** button, only when `canManage`, linking to `${base}/${householdId}/related/new`.
- Rows from `relatedConnections`: **member name** — label — **relative name** · `<Link to={`${base}/${row.relativeHouseholdId}`}>{serial} · {familyName}</Link>`.
- A **Remove link** button per row when `canManage`, which opens a `ModalShell` (`appearance="plain"`) with:
  - title "Remove related family link?"
  - body *"Remove the link between {member} and {relative}? Both patients and their households are unchanged."*
  - confirm calls `removeRelatedLink(row.key)`, then toast `"Related family link removed."`
- Empty state: *"No related families linked."*

- [ ] **Step 2: `RelatedFamilyForm.jsx`**

Follow the `FamilyMemberForm.jsx` layout. Fields:
1. `FamilySelect` "Member of this household", with options from `familyMembers`.
2. `PatientPicker` "Relative in another household", over patients whose `householdId` is set, is not this household, and is in a non-archived household:
   - `describe = p => ({ note: serial of p's household })`
   - `emptyText = "No matching patients in other households."`
3. `FamilySelect` "Relationship", with options from `RELATED_TYPES`.

On save:
- call `saveRelatedLink(householdId, draft)`
- toast `"Related family linked."`
- navigate to Family Details
- map errors to the fields; `errors.form` goes into a `role="alert"` paragraph

- [ ] **Step 3: Verify**

Run: `npx eslint src/pages/shared/RelatedFamilyForm.jsx src/pages/shared/FamilyDetails.jsx src/App.jsx && npm run test:breadcrumbs && npm run build`
Expected: no lint output, PASS, `✓ built`.

Browser checks:
- Link Manuel Santos (FSN-002) as **Child of** Carmen Dela Cruz (FSN-003). The row appears on both families, worded "child of" and "parent of".
- Remove it from FSN-003. It disappears from both families.
- A user without `families.manage` sees the list but no buttons.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/shared/RelatedFamilyForm.jsx frontend/src/pages/shared/FamilyDetails.jsx frontend/src/App.jsx
git commit -m "feat(families): link and view related families"
```

---

### Task 8: Final verification

- [ ] **Step 1:** Run `npm run test:families && npm run test:household-workflow && npm run test:household-parents && npm run test:breadcrumbs && npm run build`. Expected: every suite PASS, `✓ built`.
- [ ] **Step 2:** Run `npx eslint src`. Expected: no new errors in the touched files.
- [ ] **Step 3:** Browser pass on BHC and RHU covering the spec's manual checks. Phone width is checked with DevTools device emulation at 390px: the registration page is one column with no horizontal scroll.
- [ ] **Step 4:** Report the results to the user. List anything not verified.
