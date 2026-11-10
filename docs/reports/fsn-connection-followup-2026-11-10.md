# FSN connection error follow-up — 2026-11-10

Branch: `Eric-Manually-Fixer`. Prior timer fix, Husband Information removal, and all prior tests are retained. No production access, production credentials, production patient-data changes, commit, push, merge, or deployment occurred.

## Confirmed defect and minimal fix

New live registration always enables form recovery for BHC and RHU (`registrationRecoveryEnabled`), independently of the general `FORM_DRAFTS_ENABLED` flag. On confirmed Save, `draft.prepareCommit()` returns metadata. `formDraftRequestOptions` adds:

- `X-Form-Draft-Id`
- `X-Form-Draft-Version`
- `X-Form-Draft-Transaction`

None of those headers was present in `backend/config/cors.php`'s explicit allowlist. A browser using separate frontend/API origins must preflight this request. Even if the API server responds successfully to OPTIONS, the browser refuses the POST when its requested headers are absent from Access-Control-Allow-Headers. It exposes a fetch TypeError rather than a readable HTTP response. `apiClient.js` maps that rejection to “We couldn't reach the server.” `registrationErrors()` places an unmapped save error beneath FSN, which makes the failure appear to concern FSN allocation.

**Fix: add exactly those three headers to the existing CORS allowlist.** Origins, methods, credentials, authentication, request contents, draft validation, transactions, and FSN allocation are unchanged. No wildcard or migration was added.

The new Laravel preflight test failed before the change with `Browser preflight would block x-form-draft-id`; the lookup and untrusted-origin tests passed. After the change all three passed. This test uses the actual header allowlist rather than replacing it with test data. The existing ProductionSecurityHeadersTest overrides its allowlist, explaining why that suite alone did not catch this omission.

## Separate path traces

### Household lookup

1. `FamilyRegistryField` stages form state; Search calls `onSearch(query)`.
2. `BhcPatientRegistration` (also used by RHU) uses `useHouseholdScope`; `useSyncExternalStore` tracks account/facility identity and keys the registration subtree and query cache accordingly.
3. Search uses `client.fetchQuery` and a sequence ref to ignore stale results. `getHouseholds({role,lookup:true,...})` makes a GET to `/{bhc|rhu}/households/lookup`. Household details use `useQuery` → `getHouseholdById`.
4. `apiRequest` adds bearer and working-facility headers and calls `fetchWithTimeout`; no draft-commit headers are added to lookup.
5. `routes/api.php` routes GET to `HouseholdController.lookup` → `listing`. The controller authorizes registration lookup with `patients.register`, scopes to the working facility, validates query parameters, and returns paginated household/member identities.
6. Failure is displayed as `searchError`. No patient or FSN is allocated during lookup. The old header allowlist supports the lookup headers, and both BHC/RHU preflight tests pass before and after the fix.

**Conclusion:** missing commit headers explain a cross-origin registration save failure, not an independent lookup failure. A production failure specifically while tapping Search still requires separate evidence.

### Registration save

1. `RegistrationForm` validates and opens confirmation. On confirmation it prepares the form draft commit before calling `savePatient`.
2. `useFormDraft` → `FormDraftCoordinator` flushes the recovery snapshot through `createFormDraftApi` to `/form-drafts`; the descriptor supplies ID, version and transaction UUID. Those draft autosave requests do not carry final commit headers.
3. `BhcPatientRegistration.save` uses `householdPayload`: automatic creation sends `serial_mode:auto` without a predicted serial; selection sends an existing household ID, relationship and version. `useMutation` calls `createPatient` → `createBhcPatient` → `toPayload` → `POST /patients`.
4. `apiClient` invokes `formDraftRequestOptions`, which attaches the three final commit headers. This is the cross-origin request blocked by the old allowlist.
5. Once allowed through CORS, `routes/api.php` applies authentication/facility/action middleware and `CommitFormDraft` to patient store. The commit bridge validates and consumes the parent draft atomically with the domain write.
6. `PatientController.store` creates the patient, calls `Households.attach` and logs the audit event within a database transaction. Household services retain facility scoping, version validation and FSN allocator locking. PostgreSQL allocation functions were not changed.
7. Success uses the saved response's actual FSN. Failure flows through `registrationErrors` to the form; generic errors are shown under FSN. Existing registered-patient edits do not use new-registration recovery commit metadata.

## Browser evidence and runtime-exception distinction

A local Chromium test at 390 × 844 used the real frontend API client and its actual metadata-to-header conversion. Two synthetic loopback HTTP origins returned the exact before/after allowlists from the repository. Normal browser CORS enforcement remained enabled.

Observed before:

- OPTIONS requested authorization, content-type and all three x-form-draft headers.
- Chromium reported that x-form-draft-version was not allowed by Access-Control-Allow-Headers.
- The API client returned `TypeError`, `NETWORK_ERROR`, and the exact unreachable message.
- **Zero POST requests reached the synthetic API.**

Control: household lookup completed OPTIONS → GET using the old allowlist.

Observed after: the same registration call completed OPTIONS → POST and returned the synthetic response. Exactly one POST reached the synthetic API. Separately, real Laravel middleware preflight behavior is covered by the new feature tests; the browser test did not execute a Laravel patient write.

A diagnostic injection of a synchronous `TypeError('Synthetic Illegal invocation')` inside the fetch boundary also produced NETWORK_ERROR and the same text. Thus the client's blanket catch can confuse runtime exceptions inside that boundary with transport failures. The displayed message by itself is not proof of either. Exceptions outside the boundary (for example incomplete draft metadata) retain their original message and are not marked as network failures; a returned Laravel HTTP 500 also remains an HTTP error. New frontend tests cover these distinctions and confirm no automatic patient-write retry.

For the reproduced CORS failure, Chromium's explicit CORS diagnostic and absence of a POST establish a browser transport-policy block, **not** a JavaScript invocation error or a database allocation error. The prior coordinator timer defect is distinct and remains fixed. No speculative fetch, signal, timeout, error-classification, or database refactoring was made in this follow-up.

## Cloud Laravel runtime and results

PHP/Composer are absent on the host, but Docker works. Laravel tests **can run without production credentials**:

- Disposable `composer:2` image, digest `sha256:8de2184c6de224f4689e8f80ed5f5edaf0030b6b8b7839a22a2bcb6722ac87d0`, PHP 8.5.12, PHPUnit 12.5.24.
- Copied backend to `/tmp/akay-fsn-laravel`, excluding `.env*`, vendor, generated bootstrap cache, and logs. Installed locked development dependencies with TLS verification and the environment CA bundle.
- Created an empty `.env` in that temporary copy only. `phpunit.xml` supplies a synthetic application key and SQLite `:memory:`, array cache/session and synchronous queues. Tests fake outbound HTTP.
- Test execution used Docker `--network none` and no production configuration or secret bindings. Migrations/fixture writes ran only against disposable in-memory SQLite. The suite's `URG-DATA-RESET: deleted 0 ...` output refers to that test database.
- No vendor, environment, lockfile, or generated runtime changes were added to the repository.

Commands from `frontend`:

```sh
node --test --test-isolation=none src/services/apiClient.test.js src/services/requestTimeout.test.js src/utils/formDraftRequest.test.js src/services/formDraftCoordinator.test.js src/utils/householdData.test.js src/utils/patientRegistrationPayload.test.js
node --test --test-isolation=none src/pages/bhc/RegistrationRegression.test.js
npx eslint src/services/apiClient.test.js
```

**Results:** 104 service/utility tests passed; 3 prior registration UI/service tests passed; targeted ESLint and `git diff --check` passed.

Laravel command in the temporary copy:

```sh
php vendor/bin/phpunit --filter='RegistrationCorsTest|BhcHouseholdsTest|RhuHouseholdsTest|PatientRegistrationDraftTest|FormDraftCommitBridgeTest|ProductionSecurityHeadersTest' --display-warnings --colors=never
```

**Result:** 59 tests passed, 421 assertions, no warnings. This includes the prior turn's unexecuted household registration and rollback regressions, both BHC/RHU recovery commits, and the new preflight regression. The container was launched with the managed local Docker socket, `--rm --network none --user 1000:1000`, a bind mount of the isolated copy to `/app`, and `/app` as working directory.

The local browser probe was run as `node /tmp/akay-fsn-browser.cjs`; its output is `/tmp/akay-fsn-browser.log`. The probe uses environment-provided Playwright/Chromium, not a new repository dependency. It is a one-off diagnostic, while the committed-file candidates `RegistrationCorsTest.php` and `apiClient.test.js` supply repeatable regressions.

## Changes in this follow-up only

- `backend/config/cors.php`: three explicit final-commit headers.
- `backend/tests/Feature/RegistrationCorsTest.php`: actual-config registration and lookup preflight regressions and untrusted-origin control.
- `frontend/src/services/apiClient.test.js`: real header generation, fetch rejection presentation/no retry, HTTP response distinction, and local draft validation distinction.
- This report. Prior implementation and tests are retained.

## Remaining uncertainty and review boundary

The code defect and its exact browser symptom are reproduced locally. No deployed frontend bundle, Render configuration/cache, production request trace, actual frontend/API origin pairing, or production PostgreSQL state was inspected. Therefore it remains unconfirmed that this is the only cause of the reported production incident. If production uses the inspected cross-origin code/config, this defect blocks new registration commits for both automatic and existing households. Same-origin API routing would not trigger this CORS issue.

A separate Search failure could still involve origin configuration, CSP, connectivity, session refresh or an exception. Do not infer a database problem or change its schema. Safe incident evidence would identify Search versus Confirm Save, sanitized method/path, OPTIONS versus POST/GET, requested/allowed header names, browser CORS/CSP diagnostic, timestamp and deployment IDs; omit tokens, cookies, patient contents and raw HAR files.

Before any release, review the diff. After separately approved staging deployment with synthetic data, repeat the prior report's mobile procedure for automatic and existing households, and inspect OPTIONS /api/patients: all three commit headers must appear in Access-Control-Allow-Headers and one POST must follow. Confirm a committed FSN, household membership and consumed recovery draft. Cancel production forms; no production patient save is authorized. Production success is not claimed.

Stopped for review; nothing committed, pushed, merged or deployed.
