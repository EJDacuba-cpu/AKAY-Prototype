# Parent and Guardian Links

Approved scope: Eric's final decisions in this session, 2026-10-27.

Use the existing Families member connections page to explicitly confirm, replace, or remove Mother/Father links, including parents in a different FSN within existing facility access. Keep `patients.mother_patient_id` and `father_patient_id` as the only parent relationship storage. Household membership, FSN selection, spouse/sibling storage, and the registration sequence stay intact.

## Approaches

- Selected hybrid: registered parents use explicit Families connections; unregistered, absent, or unknown parents have optional reported names. Separate Add Patient registration can precede linking.
- Manual names alone cannot reuse registered patient identity or establish a relationship.
- A new relationship table or nested parent registration duplicates existing architecture and is excluded.

## Implementation decisions

Laravel retains patient-edit and facility authorization and requires `families.manage` for actual parent-link changes on existing patients. Validate inside the existing facility transaction after refreshing the patient. Reject self, inactive, descendant/cycle and spouse/sibling conflicts. Reuse the ancestor traversal, failing closed if its bound is exhausted. Record changed parent IDs in the existing audit log. Optional parent-link base values detect concurrent corrections without schema changes.

React uses the existing scoped patient search and PATCH endpoint, with a dedicated serializer sending only the selected parent field and its previous value. Families requires existing family-management and patient-registration duties. TanStack Query refreshes family and patient caches after saving. Never copy linked names into reported-name fields.

Patient Information always shows Parent Information and separate Guardian Information for all ages. Linked patient identity takes display priority; manually reported data stays stored and is labeled separately when present. A linked parent has no duplicate editable name field. Registration keeps optional parent entry for all ages, never clears these values when DOB changes, and never sends parent link IDs. No new migrations, stored procedures, dependencies, or global search.

## Verification

Backend tests cover authorization, cross-FSN preservation, identity reads, cycle/inactive/conflict rejection, stale updates and audit history. Frontend tests cover narrow payloads, optional names, linked display and separated guardian display. Run relevant regressions, frontend build and available browser checks; report unavailable checks honestly.
