# Patient registration identity and contact updates

Implemented on `Eric-Manually-Fixer`. The earlier medicine inventory work remains intact. RHU and BHC already share `RegistrationForm`, the directory card, and the registration profile sections; these shared implementations were extended. Existing card styling, buttons, date controls, facility ownership, access rules, and registration/draft workflows remain in place.

## Names and suffix

All Patients uses the shared formatter with a display-only middle-initial option. It composes structured first/middle/last/suffix values rather than parsing a full-name string. Reyes becomes R.; Dela Cruz becomes D.; R and R. both become R.; missing middle names add neither a period nor extra spaces. Full middle names remain in editable fields, draft payloads, API responses, and database storage. Directory search accepts full middle names and a single-letter middle initial with a period, plus suffix tokens.

The existing select control beside Last Name offers None, Jr., Sr., II, III, IV, V, and Other (Specify). None stores null. Other exposes a required custom input; the actual trimmed suffix is sent to the API, never the selection marker. Switching to a predefined option clears the unused custom value. Profiles restore saved custom suffixes, support authorized edits, and display the suffix. The name-row grid wraps responsively; the rest of the Personal Information grid is unchanged.

The only new database migration is `2026_11_17_000002_add_patient_suffix.php`: a nullable `patients.suffix` string (maximum 50 characters). No names, contacts, IDs, relationships, or historical records are rewritten. Rollback refuses to drop populated suffix data. Apply this migration with the backend before deploying the updated frontend. It was exercised by SQLite tests but has not been applied to Supabase or any deployed database.

## Contact handling

The Contact Number field now reuses the existing plain FormInput. Its flag, +63 prefix, and decorative prefix container are removed. Both Contact Number and Other Contact Number use text inputs with numeric input mode, maximum length 11, and placeholder 09XXXXXXXXX. The existing parent/guardian helper remains.

Shared input handling removes nondigits and caps newly entered/pasted input at 11 digits without dropping leading zeros. Final frontend and Laravel validation require exactly 11 ASCII digits for either nonempty number, using the requested field-specific messages. Both fields remain optional. There is no additional 09-prefix rule: an 11-digit number such as 12345678901 is valid.

Loading saved records and drafts uses a separate, non-destructive normalization step: complete `639XXXXXXXXX` or `+639XXXXXXXXX` Philippine mobile formats become `09XXXXXXXXX`; valid local values are unchanged. Unrecognized, incomplete, international, or overlong legacy values remain intact on load and must be corrected before a final submission containing them can succeed. No bulk normalization or truncation of stored values occurs. Backend normalization accepts the same complete recognizable legacy mobile forms.

## Existing drafts

The existing frontend and Laravel draft allowlists now include suffix and customSuffix. No draft IDs, schema version, ownership, retention, transaction UUIDs, autosave coordinator, or commit mechanism were replaced. Old nested form snapshots and legacy API-shaped drafts remain supported; missing suffix defaults to None. Empty values normalized to null by Laravel restore as empty form input.

Draft saving accepts partial phone numbers, missing required personal details, and Other with unfinished custom text. Only final registration/editing applies the complete phone validation. Tests verify saved/resumed custom suffix and partial contacts, failed finalization keeping the same draft active, successful completion consuming it, and replay creating exactly one patient. Existing recovery tests also cover delayed saves, discard, session replacement, and preservation of draft identity.

## Executed tests

- Backend: `php vendor/bin/phpunit --filter='PatientRegistrationIdentity|PatientRegistrationDraft|PatientDirectorySearch|PatientCreationPermissions|PatientEducation|FormDraft' --no-progress` ? 56 passed, 763 assertions.
- Frontend: `npm.cmd run test:patient-registration` ? 114 passed. Includes interactive RHU/BHC registration/edit tests, profile sections, directory name formatting, phone handling, suffix switching, old/new draft restoration, payload serialization, and recovery/coordinator regression.
- `npm.cmd run build` ? passed; existing large JavaScript chunk warning remains.
- Targeted ESLint ? passed for the identity helpers/tests, payload and profile helpers, formatter, shared contact/profile components, shared registration page, and both patient profile pages.
- PHP syntax checks ? passed for PatientRequest, Patient, and the suffix migration.
- `git diff --check` ? passed.

Existing RHU tests that supplied household/FSN commands were updated to reflect the API's already-existing RHU restrictions. No permission or ownership rule was relaxed to make these tests pass.

Manual verification remaining: authenticated browser comparison at desktop/mobile sizes, including the four-field name row and resumed registration screens; PostgreSQL deployment/migration verification. Interactive component tests passed, but no live browser session or Supabase database was used. No failing tests remain in the executed focused suites.

## Exact files changed for this request

- `backend/app/Http/Controllers/Api/PatientController.php`
- `backend/app/Http/Requests/PatientRequest.php`
- `backend/app/Models/Patient.php`
- `backend/app/Services/PatientIdentity.php`
- `backend/config/form_drafts.php`
- `backend/database/migrations/2026_11_17_000002_add_patient_suffix.php`
- `backend/tests/Feature/PatientCreationPermissionsTest.php`
- `backend/tests/Feature/PatientRegistrationDraftTest.php`
- `backend/tests/Feature/PatientRegistrationIdentityTest.php`
- `frontend/package.json`
- `frontend/src/components/features/patients/PatientDirectoryCard.jsx`
- `frontend/src/components/features/patients/PatientFormComponents.jsx`
- `frontend/src/components/features/patients/profile/RegistrationSections.jsx`
- `frontend/src/components/features/patients/profile/RegistrationSections.test.js`
- `frontend/src/config/formDraftSchemas.json`
- `frontend/src/pages/bhc/AddPatient.jsx`
- `frontend/src/pages/bhc/PatientDetails.jsx`
- `frontend/src/pages/bhc/RegistrationRegression.test.js`
- `frontend/src/pages/rhu/RHUPatientDetails.jsx`
- `frontend/src/services/patientService.js`
- `frontend/src/utils/formatters.js`
- `frontend/src/utils/patientProfile.js`
- `frontend/src/utils/patientProfile.test.js`
- `frontend/src/utils/patientRegistrationDefaults.js`
- `frontend/src/utils/patientRegistrationIdentity.js`
- `frontend/src/utils/patientRegistrationIdentity.test.js`
- `frontend/src/utils/patientRegistrationPayload.js`
- `frontend/src/utils/patientUtils.js`
- `docs/patient-registration-identity.md`
