# Household-First Registration and Related Families — Design

Date: 2026-10-15
Status: Draft, awaiting review
Scope: Frontend prototype only (mock family registry). No API or database work.

## 1. Purpose

Two problems:

1. **Registration.** Creating a household from Patient Registration sends staff to a
   separate Create Household page that asks for the address a second time. Patients
   can also be saved with no household at all.
2. **Families.** Relatives often live in separate households with separate Family
   Serial Numbers (FSNs). The Families module can't show that two households are
   related.

Success means:

- Every newly registered patient belongs to exactly one household.
- The address is typed once.
- Staff can explicitly link relatives who live in different households and see
  those links from both families.

## 2. Basis (research findings supplied by the user)

| Finding (PSA / FHSIS) | Design consequence |
|---|---|
| A household may be one person. | A single-person household replaces "no household". |
| A household need not be a nuclear family. | Relationship-to-head options stay broad, including non-relatives. |
| Two households may share a housing unit. | The same address never implies the same FSN. |
| Membership follows usual residence and food arrangements, not surname. | Nothing is grouped or linked by surname or address. All links are explicit. |
| The FSN references a family folder. Numbering convention varies by facility. | The FSN is auto-suggested and always editable by staff. |

## 3. Decisions

| # | Decision |
|---|---|
| D1 | Household-first: every patient saved from registration must have a household. "Continue without household" is removed. |
| D2 | A new household is created inline in registration. The registering patient is its head and the registration address becomes the household address. The separate Create Household page is removed. |
| D3 | The FSN is auto-generated as `FSN-YYYY-NNNN` and editable. It must be unique, including against archived households. |
| D4 | A patient under 18 cannot head a new household, in registration or in Add Family. |
| D5 | A household left with no members is archived automatically. |
| D6 | Related families are cross-household **person-to-person connections**, stored in the existing `registry.connections`. No household-to-household entity. |
| D7 | Cross-household linking happens only in Family Details, not in registration. |
| D8 | Moving a patient to another household keeps their connections. They become related-family links. |

## 4. Baseline already in place (uncommitted, 2026-10-15)

The registration layout has already been reworked in the medical-ehr-minimalism style:

- Two-column layout.
- FSN search with an explicit Search button and Enter.
- A "No household found" state with "+ Add" and "Continue without household".
- The pre-search "Create New Household" and "Continue without household" buttons are removed.

This design builds on that state.

## 5. Section 1 — Registration (household-first)

### 5.1 FSN field behavior (`FamilyRegistryField.jsx`)

1. **Search** works on FSN, household head, member name or address, and runs on the Search button or Enter.
2. **Match found:** the existing confirmation review is unchanged.
   - The patient joins the household.
   - The address panel becomes read-only and is filled from the household.
   - A relationship to the head is required.
3. **No match:** the "No household found" box shows **+ Create New Household** with
   the helper text *"This patient will be the household head. The address on this form will be used."*
   - The patient's connection becomes `{ kind: "new", headPatientId: "self", household: { serialNumber, address } }`.
   - The field shows the suggested FSN in an editable input, with **Cancel** to return to search.
   - Relationship is fixed to `Household head`.
   - The Address Information panel **stays editable**. The household address is copied from the form at save time.
4. **Minor block (D4).**
   - If the patient's age is under 18, the create button is not shown. The box shows instead:
     *"A patient under 18 can't be a household head. Register the parent or guardian first, then add this child to their household."*
   - If no date of birth is entered yet, the button is disabled with *"Enter the date of birth first."*
5. **Removed:**
   - The "Continue without household" button.
   - The "Remove Connection" button. A patient can change households but can't be left without one.
6. **Kept:** "Change Household", including the existing head-replacement review when a head leaves a household that still has members.

### 5.2 Address panel

The panel is read-only only when `connection.kind === "existing"`. For a new household it stays editable.

### 5.3 Save validation (`AddPatient.jsx` → `validateForm`)

- No connection → error on the FSN field: *"Search for a household or create a new one."*
  This also applies when editing a legacy patient who has no household.
- New household with a blank FSN → *"Family Serial Number is required."*
- New household with a duplicate FSN → *"This Family Serial Number already exists."*
- New household while the patient is under 18 → the D4 message above. This catches a date-of-birth change made after the household was created.

### 5.4 Removed code

- The `CreateHouseholdPage.jsx` file and its four routes in `App.jsx`:
  - `/bhc/patients/add/household/new`
  - `/bhc/patients/:patientId/household/new`
  - the two `/rhu/...` equivalents
- `handleCreateHousehold` and the `onCreateHousehold` prop.
- `patientRegistrationDrafts.js` and its test. Their only purpose was to keep the form while visiting that page.
  The only other importer is the `registrationDrafts.clear()` call in `App.jsx`'s sensitive-session handler, which is removed as well.
- Any breadcrumb entries for those routes.

### 5.5 Registry changes (`mockFamilyRegistry.js`)

- **New `nextSerialNumber(registry, date = new Date())`.**
  Returns `FSN-<year>-<NNNN>`, where `NNNN` is one more than the highest `NNNN` among
  all households (archived included) whose serial matches `FSN-<year>-\d{4}`, zero-padded,
  starting at `0001`. Other serial formats (for example the seeded `FSN-001`) are ignored when counting.
- **`validateConnection`.**
  - For `kind: "new"` with `headPatientId: "self"`, it validates the address passed in at save time.
  - The "existing unlinked patient as head" branch is no longer reachable from registration. It stays for Add Family (Section 2).
- **Minor check.** A shared helper, `canHeadHousehold(patientLike)`, returns `{ ok, reason }` from `birthDate` using the existing `calculateAge`. Used by registration and Add Family.
- **`commitMockPatient` connection handling (D8):**
  - Stop dropping cross-household edges. Keep every edge whose endpoints both still exist.
  - When a `motherPatientId` or `fatherPatientId` would be cleared because the parent is no longer in the same household, first add an explicit `{ from: parentId, to: childId, type: "parent" }` edge, unless an equivalent edge already exists. Then clear the field as today.
- **Archive (D5).**
  - After any commit that moves a patient out, a household with zero members gets `archivedAt` (ISO timestamp) and `headPatientId: null`.
  - `searchHouseholds` and the Families directory exclude archived households.
  - FSN uniqueness checks include them.
  - Opening an archived household's Family Details shows *"This household is archived."* with a link back to Families.

## 6. Section 2 — Add Family (Families module)

The main use case is a member moving out to form their own household, for example a married child. It also serves legacy patients who have no household.

### 6.1 Form (`FamilyForm.jsx`, new mode only)

1. **Household head.** Search all registered patients.
   - The head must pass `canHeadHousehold`. Ineligible patients are listed but can't be selected, and the reason is shown.
   - If the patient belongs to another household, show the notice *"Currently in FSN-001 (Son / Daughter). They will move to this new household."*
   - If the patient heads another household that still has members, block with *"Assign a new head for FSN-001 first."*
   - If the patient heads a single-person household, allow it. The old household is archived after save (D5).
2. **Family Serial Number.** Prefilled from `nextSerialNumber`, editable, and checked for uniqueness.
3. **Address.** Prefilled from the selected head's current address and editable.
4. **Save.**
   - A new pure function, `commitNewFamily(registry, draft)`, validates the draft. It then reuses
     `commitMockPatient` with `{ kind: "new", headPatientId: "self", household }` for the head,
     so registration and Add Family share one creation path.
   - The head's address is updated to the household address.
   - The user is redirected to the new Family Details page.

Edit Family (address correction and head change) is unchanged.

### 6.2 Add Member and member removal

- **Add Member** is unchanged. It adds legacy unlinked patients. Linked patients still move via Change Household or Add Family.
- **"Remove Connection" in `FamilyMemberForm.jsx`** is removed, because it would leave a patient without a household.
  It is replaced by the text *"To move this member, use Change Household in Edit Patient or Add Family."*
  `commitRemoveMember` and `removeFamilyMember` are deleted, and so are their tests in `mockFamilyWorkflows.test.js`. `FamilyMemberForm.jsx` is their only caller.

## 7. Section 3 — Related Families (Family Details)

### 7.1 Display

- A **Related Families** section appears in `FamilyDetails.jsx` below the tree and list tabs.
- Each row is one cross-household connection, worded from this household's member. For example:
  **Miguel Cruz** — child of — **Roberto Cruz** · `FSN-00208 · Cruz family` (linked to that family).
- Rows are derived, so the same link appears on both families.
- If there are none: *"No related families linked."*
- Visible with `families.view`.

### 7.2 New service functions (`mockFamilyWorkflows.js`)

- **`relatedConnections(registry, householdId)`.** Returns edges with exactly one endpoint in the household. Each row includes the other patient and the other household. Edges touching archived households or missing patients are skipped.
- **`commitRelatedLink(registry, householdId, { memberId, relativeId, type })`.**
  - `type` is one of `parent-of`, `child-of`, `spouse`, `sibling`, `relative`. `child-of` is stored as a reversed `parent` edge.
  - Validates that:
    - the member is in this household,
    - the relative is in a different, non-archived household,
    - the type is valid.
  - Then runs `graphErrors` over the union of both households' members and their edges, including all cross-household edges among them, plus the new edge.
- **`commitRemoveRelatedLink(registry, edgeKey)`.** Removes one edge by `connectionKey`.
- **`graphErrors` member-check message.** Currently *"Choose two different members of this household."* It gets a cross-household wording when called for related links. Implementation detail for the plan.

### 7.3 Link Related Family form

- Opened from a **+ Link Related Family** button. It needs `families.manage`.
- Route: `/<role>/families/:householdId/related/new`. Same `ProtectedPage module="familiesManage"` guard as the other manage routes.
- Fields:
  1. **Member of this household** — select.
  2. **Relative in another household** — search by name or FSN. Results come only from other non-archived households, and each shows its FSN.
  3. **Relationship** — Parent of / Child of / Spouse / Partner / Sibling / Other relative.
- Save returns to Family Details with the toast *"Related family linked."*

### 7.4 Remove link

- Each row has **Remove link** (needs `families.manage`). It opens a `ModalShell` confirmation:
  *"Remove the link between Miguel Cruz and Roberto Cruz? Both patients and their households are unchanged."*

### 7.5 Fix to existing member-connection save (D8)

`commitFamilyMember` currently replaces every edge touching any household member. That would delete related-family links. It must replace only edges whose **both** endpoints are members of this household, and keep cross-household edges.

## 8. Error handling

- All commits stay pure and validate before mutation. A thrown `MockRegistryError` leaves the store unchanged, as today.
- Field errors appear inline next to their field. Form-level errors use the existing `errors.form` alert.
- **Stale data.** If a selected patient or household no longer exists or is archived at save time, show *"This patient or household is no longer available. Search again."*

## 9. Testing

`node --test` unit tests, added to the existing `test:families` and `test:household-workflow` scripts:

**`nextSerialNumber`**
- empty registry → `FSN-2026-0001`
- increments past the highest same-year serial
- ignores other formats
- counts archived households

**`canHeadHousehold`**
- 17 → blocked
- 18 → allowed
- no date of birth → blocked with the "enter date of birth" reason

**Registration commit**
- a new self-headed household uses the form address
- saving without a connection is rejected
- a duplicate FSN is rejected
- a minor head is rejected

**`commitMockPatient` connection handling**
- moving a patient keeps their edges
- a cleared `motherPatientId` becomes an explicit parent edge
- no duplicate edge is created

**Archive**
- the last member moving out archives the old household
- archived households are excluded from search
- an archived FSN still blocks reuse

**`commitNewFamily`**
- a member moves to the new household as head
- a head of a multi-member household is blocked
- a single-person head moves and the old household is archived

**Related links**
- `commitRelatedLink` creates the right edge for each type, including reversed `child-of`
- it rejects same-household, archived and duplicate targets
- it rejects a cross-household parent cycle

**Member-connection save**
- `relatedConnections` returns links from both sides
- `commitFamilyMember` keeps cross-household edges

**Existing test updates**
- Existing tests that assert the old drop-cross-household-edges behavior are updated to the new rule.

Manual browser checks (BHC and RHU):
- adult registers with a new household
- minor sees the block message
- joining an existing FSN
- Add Family for a moving-out member
- linking and unlinking related families, verified on both families
- phone-width layout

## 10. Out of scope

- Drawing relatives from other households in the Family Tree.
- Marking registration Mother/Father fields as "Linked to registered patient" from a cross-household link.
- Backend/API persistence, and any facility-specific FSN convention beyond the editable suggestion.
- Restyling the Families module pages to medical-ehr-minimalism. That is a separate task.
- Bulk migration of legacy patients who have no household. They are handled one at a time, when they are next edited or added as a head.
