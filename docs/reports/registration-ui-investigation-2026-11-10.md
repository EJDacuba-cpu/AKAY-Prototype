# Registration UI investigation — 2026-11-10

Branch: `Eric-Manually-Fixer`; inspected base `a2edb43`. Changes are uncommitted. No push, merge, deployment, production HTTP requests, production secrets, or patient-data access occurred.

## Findings and evidence

### Confirmed browser defect: Illegal invocation

`AddPatient.jsx` opts new live BHC/RHU registrations into `useFormDraft`. The hook constructs `formDraftCoordinator.js`. The coordinator previously assigned the native `setTimeout` and `clearTimeout` functions to `this.schedule` and `this.cancel`, then invoked them as coordinator methods. Browser Web IDL timer functions reject that receiver.

Chromium 156 reproduced `TypeError: Illegal invocation` for `const o = {schedule: setTimeout, cancel: clearTimeout}; o.schedule(() => {}, 10)`. A regression with receiver-checking timers failed at `FormDraftCoordinator.queueAutosave`. Node's native timers and existing injected scheduler fixtures do not detect this bug.

Typing schedules autosave; `prepareCommit()` calls `flush(true)` and clears pending timers before the patient POST. The same invalid receiver therefore affects both editing and saving. The fix wraps only the default timer functions, calling `globalThis.setTimeout/clearTimeout`. Injected schedulers remain supported. The new regression passes, and the actual coordinator completed edit → prepareCommit in Chromium at 390 × 844 using synthetic in-memory API fixtures. This verifies the local defect and fix, not the reported production stack trace, which was not supplied.

### FSN connection error: cause unresolved

Trace: `FamilyRegistryField` Search → `BhcPatientRegistration.search` → `getHouseholds({lookup:true})` → `apiRequest` → `GET /api/bhc/households/lookup` (or RHU namespace) → `HouseholdController.lookup/listing`. The server permits registration lookup with `patients.register`, independently of directory permissions, and scopes households to the working facility.

The API client calls `fetch` directly. The timeout helper calls browser timer functions directly, combines caller cancellation through a new AbortController, and invokes AbortSignal methods on their owning signal. No invalid fetch receiver, malformed signal, or automatic patient-write retry was found in this path. Focused tests cover cancellation, deadlines, auth recovery, lookup, and registration serialization.

`apiClient.js` lines 194–205 map exceptions from the fetch wrapper to the unreachable message. HTTP errors are processed separately afterward. Thus the wording does not establish a database problem, nor conclusively distinguish network/CORS/CSP failures from a local exception within the wrapper. `registrationErrors` also places any otherwise-unmapped save error under Family Serial Number; its location does not prove an FSN allocation defect.

The confirmed coordinator timer defect is outside the lookup path. A shared cause between a genuine lookup connection failure and Illegal invocation is not established. No speculative network, CORS, timeout, database, or migration changes were made. To resolve this remaining issue, capture the failing operation (Search or Save), sanitized request URL and method, HTTP status or browser failure reason, original exception stack, timestamp, frontend/backend deployment IDs, and matching backend request ID if present. Do not share request bodies, authorization headers, cookies, patient identifiers, or an unsanitized HAR.

### Registration integrity

`RegistrationForm` validates, requests confirmation, prepares draft commit metadata, then calls the registration source's save function. `householdPayload` sends `serial_mode:auto` with no predicted serial for a new automatic household; an existing selection sends household ID, relationship, and version. `patientService.toPayload` suppresses the standalone family serial when a household command is present. `PatientController.store` creates the patient, attaches the household, and writes its audit event inside one DB transaction. `Households` and `HouseholdSerialAllocator` retain facility locking, version checks, and PostgreSQL allocation functions. These backend implementation paths were not changed. PostgreSQL concurrency was not exercised locally.

### Husband Information

Removed the panel, Husband Name and Husband Occupation inputs, visibility condition, and sex/civil-status handlers that cleared spouse values. Kept spouse normalization, defaults, recovery compatibility, payload fields, backend validation/storage, and Husband/Wife relationship labels. A UI regression submits a historical married patient's form and confirms spouse values survive. No historical rows are rewritten.

## Changed files

- `frontend/src/pages/bhc/AddPatient.jsx`: remove Husband Information and obsolete clearing logic.
- `frontend/src/services/formDraftCoordinator.js`: preserve the browser timer receiver.
- `frontend/src/services/formDraftCoordinator.test.js`: receiver-sensitive registration commit regression.
- `frontend/src/pages/bhc/RegistrationRegression.test.js`: UI/save, automatic FSN, existing household lookup/confirmation/save regressions; real services with synthetic fetch responses.
- `backend/tests/Feature/BhcHouseholdsTest.php`: add registration without husband fields and failed-attachment rollback regressions.
- This report.

## Validation

Passed:

- 115 focused frontend service/utility tests, including API client, timeout/AbortSignal, draft coordinator, registration payload/draft, household data, and family registry.
- 3 registration UI/service regressions.
- Real Chromium reproduction before fix and actual coordinator prepareCommit after fix, using synthetic fixtures only. This was not a full browser-to-Laravel save.
- Targeted ESLint on all changed frontend JavaScript/JSX files.
- `VITE_API_BASE_URL=/api npm run build`; existing large-chunk warning remains.
- `git diff --check`.

Commands (from `frontend`):

```sh
node --test --test-isolation=none src/services/apiClient.test.js src/services/requestTimeout.test.js src/services/formDraftCoordinator.test.js src/utils/householdData.test.js src/utils/patientRegistrationPayload.test.js src/utils/patientRegistrationDraft.test.js src/services/familyRegistry.test.js
node --test --test-isolation=none src/pages/bhc/RegistrationRegression.test.js
npx eslint src/pages/bhc/RegistrationRegression.test.js src/services/formDraftCoordinator.js src/services/formDraftCoordinator.test.js src/pages/bhc/AddPatient.jsx
VITE_API_BASE_URL=/api npm run build
```

Test isolation was disabled because this environment's default Node test subprocess reporter suppressed individual test output. UI tests run in a separate invocation to isolate their browser globals.

Blocked: Laravel feature tests. PHP and Composer are absent, `backend/vendor` is absent, and no PHP container image is installed. Attempting the following from `backend` returned `php: command not found`:

```sh
php artisan test --filter='BhcHouseholdsTest|RhuHouseholdsTest|PatientRegistrationDraftTest'
```

The added Laravel assertions have not been executed. Before approval to release, run the command in an isolated development/test runtime with dependencies installed, using the repository's testing configuration (SQLite `:memory:`), no production environment or credentials. Do not run project setup scripts or migrations against production. PostgreSQL allocation/concurrency needs a disposable test database for additional confidence.

## Exact mobile verification procedure

Use an approved isolated staging deployment with synthetic data, a test facility, and a test registrar. Use Android Chrome or iPhone Safari in portrait; also test at 390 × 844. Do not create or edit production patients for verification.

1. Sign in to the test facility. Open Patients → Add Patient. Enter Synthetic / Registration, adult DOB 1990-01-01, Female, Married, and a valid synthetic street, barangay, and municipality. Confirm Husband Information and its two inputs are absent.
2. In Family Serial Number, tap Create New Household. Keep Auto-generated selected. Confirm the FSN is a read-only `FSN-YYYY-XXXX` preview and says assignment happens on save. Type another form value; wait at least 2 seconds to exercise device autosave. Tap Save Patient, then Save Patient in the confirmation dialog. Confirm there is no Illegal invocation and the success dialog displays the committed, fully numeric FSN. Record that synthetic FSN.
3. Open the saved synthetic profile and confirm the returned FSN and household membership. Confirm only one patient/household was created for the submission.
4. Start another synthetic adult registration. Tap Search Existing Household. Search for the FSN from step 2, tap the result, select Husband or Wife as appropriate, then Confirm Household. Confirm the selected FSN and inherited address. Complete required fields and confirm Save Patient. Confirm success, the same FSN, and membership in the original household rather than a new household.
5. Start another synthetic registration and keep typed form values. Switch the device offline, tap Search, and confirm a readable connection error. Reconnect, tap Search again, and confirm results return without losing the form. Cancel without saving. If a real save times out, check the synthetic patient list before retrying to avoid duplicates.
6. Edit a seeded synthetic legacy patient containing spouse_name/spouse_occupation. Confirm there are no husband inputs. Change sex or civil status and save. Verify in the isolated test database/API that the historical spouse fields were not cleared by those controls and existing spouse relationship labels remain available.
7. In the isolated Laravel runtime, run the feature-test command above, including the rollback test. Verify a failed household attachment leaves no patient or household row and does not consume the first automatic FSN.
8. After separately approved deployment, production verification is read-only: confirm deployed commit IDs, inspect the registration screen for absent husband inputs and the automatic preview, and observe an authorized household lookup without collecting patient details. Cancel the form. Production patient-save success remains unverified under the no-production-data-modification constraint.

Stop for review/approval. FSN connection root cause and Laravel execution remain open; do not describe this as all three production issues resolved.
