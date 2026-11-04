# Other Contact Number

Status: approved by Eric ("approve goa ahead na"), 2026-11-04.

## Intent and confirmed scope

Eric wants one optional alternate phone number usable for a mother, father, or guardian. Move the existing Guardian contact input below the main Contact Number and label it Other Contact Number. Keep Father Name, Mother Name, Guardian Name, and Guardian Relationship in their existing sections. Minimize changes and preserve saved numbers.

## Approaches

- Separate mother, father, and guardian phone inputs: captures several numbers but adds fields and maintenance. Not selected.
- One alternate contact with its own name and relationship: identifies the number's owner but adds duplicate entry. Not selected.
- Selected in conversation: relocate and relabel the existing number, using the existing parent/guardian name fields. One alternate number, no additional contact-person fields.

## Behavior

- Registration: show optional Other Contact Number immediately below Contact Number, with helper text "Contact number of a mother, father, or guardian." Remove the old Guardian contact input from Guardian Information.
- Patient Information: display and edit the same value under Contact & Address, directly after the main number. Remove its old guardian-section row and editor.
- Move guardianContactNumber from the profile's family field group to its contact field group, so section validation/error routing follows the input's location. Existing profile saves send the full form; preserve that save contract and the loaded number when editing family information.
- Apply consistently to the existing shared BHC/RHU registration and profile components. Preserve the existing main contact, parent names, guardian name, relationship, access rules, and unrelated work.
- The number is optional. Existing values remain visible and editable in the new location. Clearing it through the contact editor is an explicit clear.

## Architecture and constraints

React changes placement, labels, field error display, and section payload ownership using existing shadcn/ui Input components and Tailwind styling. Keep guardianContactNumber in frontend state and guardian_contact_number in the API/database for compatibility. Preserve existing number input behavior and backend validation; do not introduce a new phone format restriction as part of relocation.

Laravel continues existing authorization, validation, and persistence. No controller behavior or database schema changes are needed. No PostgreSQL stored procedure is needed because no transactional business rule changes. TanStack Query continues existing save invalidation and patient refresh behavior; no new query is required.

No notifications, new relationship model, emergency-contact workflow, additional name fields, database migration, or deletion of saved data is in scope. Existing parent/guardian names provide context but do not identify which named person's number is stored when several people are listed; this limited change must not infer ownership or legal guardianship.

## Verification and builder decisions

Use relevant existing profile/payload checks to verify that the number belongs to the contact field group and stored values and explicit clears survive existing save serialization. Check registration and profile labels/placement, run the frontend build and scoped lint. Reuse existing components and validation patterns; document any unavailable browser verification. Preserve unrelated modified files.

## Evidence

- frontend/src/pages/bhc/AddPatient.jsx and frontend/src/pages/rhu/RHUAddPatient.jsx: shared registration and existing contact/guardian inputs.
- frontend/src/components/features/patients/profile/RegistrationSections.jsx: shared profile display/editor.
- frontend/src/utils/patientProfile.js: current guardianContactNumber ownership in the family field group.
- frontend/src/utils/patientRegistrationPayload.js: existing API mapping.
- backend/app/Http/Requests/PatientRequest.php: optional guardian_contact_number, string, max 50.
- This is a presentation change requested by Eric. No new clinical or local BHC workflow is inferred from a reference form.
