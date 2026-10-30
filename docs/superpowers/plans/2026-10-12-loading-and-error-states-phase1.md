# Loading and Error States — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plain-language error messages everywhere, and one consistent loading and failure state for every full page: an explicitly chosen skeleton on the page background, an in-place error with Retry, no toast for a failed first load, no background cards, and an offline banner.

**Architecture:** A pure helper decides the user-facing message for each request failure and `apiClient` uses it. The shared loading pieces (`PageStateWrapper` → `PageLoadingFallback`, `SoftLoadingArea` → `SoftLoadingOverlay` → `PageSkeletonLoader`) take an explicit `skeleton` and a `bodyOnly` flag and stop guessing from text; their wrappers lose their tinted/white backgrounds. Pages then pass their skeleton, and the few pages with their own error blocks or no loading state move onto `ConnectionErrorState` / `PageStateWrapper`.

**Tech Stack:** React 19 + React Router + TanStack Query, Tailwind, react-hot-toast, `node --test` for pure helpers.

**Spec:** `docs/superpowers/specs/2026-10-12-loading-and-error-states-design.md`

## Global Constraints

- Copy (exact): timeout "The server is taking too long to respond. Please try again in a moment."; unreachable "We couldn't reach the server. Please check your connection and try again."; no server message "Something went wrong. Please try again."; offline unchanged "You are offline. Please reconnect and try again."; offline banner "You're offline. Changes can't be saved until the connection returns."
- A failed first load never toasts; a page never shows a toast and an in-place error for the same failure.
- No loading or error state draws a card, a white panel, or a tinted rounded wrapper; it sits on the page background (`bg-gray-50`, the `DashboardLayout` colour).
- Skeleton names allowed: `dashboard`, `table`, `details`, `form`, `module`, `follow-ups`, `medicine`, `reports`, `patient-details`, `health-records`, `facilities`. Anything else falls back to `module`.
- Keep `error.isNetworkError`, `error.code = "NETWORK_ERROR"`, `error.isTimeout`, `error.isOffline`, `error.status` exactly as today; only `error.message` changes.
- Validation errors stay inline; sign-in and password pages are untouched; form-heavy screens keep their own save-failure handling.

## Review Focus

1. A server error that carries its own message (422 "Email is already taken.") must keep that message, not the generic one. Pinned in Task 1 tests.
2. Retry after a blocked first load must recover the page (not stay on the error, not double-toast). Pinned in Task 5/6 browser steps.
3. Pages whose toolbar stays on screen (Password & Invites, Programs) must not draw a second toolbar inside the skeleton. Pinned in Task 4 browser step.
4. A skeleton name passed by mistake (typo) must still render something (`module`), never a blank area. Pinned in Task 2 test.
5. Staff Assignments must keep its validation message ("Select at least one permitted duty.") inline while load failures go to the in-place state. Pinned in Task 5 browser step.

---

### Task 1: Plain-language request errors

**Files:**
- Create: `frontend/src/services/apiErrorMessages.js`, `frontend/src/services/apiErrorMessages.test.js`
- Modify: `frontend/src/services/apiClient.js` (`createTimeoutError`, the network-error `catch`, the `!response.ok` branch)
- Modify: `frontend/package.json` (`"test:errors": "node --test src/services/apiErrorMessages.test.js"`)

**Interfaces:**
- Produces: `API_ERROR_MESSAGES = { offline, timeout, unreachable, generic }` (the Global Constraints copy) and `serverErrorMessage(payload) -> string` (payload `message`, else the first validation error, else `generic`).

- [ ] **Step 1: Write the failing tests**

```js
test("each cause has its plain message", () => {
  assert.equal(API_ERROR_MESSAGES.timeout, "The server is taking too long to respond. Please try again in a moment.");
  assert.equal(API_ERROR_MESSAGES.unreachable, "We couldn't reach the server. Please check your connection and try again.");
  assert.equal(API_ERROR_MESSAGES.generic, "Something went wrong. Please try again.");
  assert.equal(API_ERROR_MESSAGES.offline, "You are offline. Please reconnect and try again.");
});
test("a server message wins", () => {
  assert.equal(serverErrorMessage({ message: "Email is already taken." }), "Email is already taken.");
  assert.equal(serverErrorMessage({ errors: { email: ["Email is already taken."] } }), "Email is already taken.");
});
test("no server message falls back to the generic text", () => {
  assert.equal(serverErrorMessage({}), "Something went wrong. Please try again.");
  assert.equal(serverErrorMessage(null), "Something went wrong. Please try again.");
});
```

- [ ] **Step 2:** Run `cd frontend && npm run test:errors` — Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `apiErrorMessages.js`; in `apiClient.js` use `API_ERROR_MESSAGES.offline` / `.timeout`, set `error.message = API_ERROR_MESSAGES.unreachable` in the network-error catch (keep the flags), and build the `!response.ok` error with `serverErrorMessage(payload)`.
- [ ] **Step 4:** Run `npm run test:errors && npx eslint src/services --quiet` — Expected: PASS, clean. `grep -rn "API connection\|API request failed" src` returns nothing.
- [ ] **Step 5:** Commit — `fix(api): plain-language messages for request failures`.

### Task 2: Shared loading and error pieces

**Files:**
- Modify: `frontend/src/components/common/loading/SkeletonLoaders.jsx`, `SoftLoadingOverlay.jsx`, `frontend/src/components/common/PageLoadingFallback.jsx`, `PageStateWrapper.jsx`, `ConnectionErrorState.jsx`
- Create: `frontend/src/components/common/loading/skeletonVariant.js`, `skeletonVariant.test.js`; add to `package.json` `"test:skeleton": "node --test src/components/common/loading/skeletonVariant.test.js"`

**Interfaces:**
- Produces: `resolveSkeletonVariant(name) -> one of the allowed names` (`module` for unknown/empty) in `skeletonVariant.js`.
- Produces: `PageSkeletonLoader({ message, skeleton, bodyOnly })`, `SoftLoadingArea({ ..., skeleton, bodyOnly })`, `PageLoadingFallback({ message, skeleton, bodyOnly, minHeight })`, `PageStateWrapper({ ..., skeleton, bodyOnly })`. The old `variant` prop on these is renamed `skeleton`; callers that passed `variant` are updated in Task 4. `inferLoadingSkeletonVariant` is deleted.
- Produces: `ConnectionErrorState({ ..., size = "page" | "compact" })`.

- [ ] **Step 1: Failing test** `skeletonVariant.test.js`: `resolveSkeletonVariant("table") === "table"`; `resolveSkeletonVariant("tabel") === "module"`; `resolveSkeletonVariant(undefined) === "module"`; every allowed name maps to itself.
- [ ] **Step 2:** Run `npm run test:skeleton` — Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `skeletonVariant.js` with the allowed list; `PageSkeletonLoader` uses it.
  - `bodyOnly`: a `SkeletonBodyOnlyContext` in `SkeletonLoaders.jsx`; `SkeletonHeader` and `ToolbarSkeleton` return `null` when it is true; `PageSkeletonLoader` provides it.
  - `PageLoadingFallback`: wrapper class becomes `relative ${minHeight} overflow-hidden` (no `rounded-xl bg-[#F8FAFC]`).
  - `SoftLoadingOverlay`: area scope uses `bg-gray-50` and no `rounded-xl` (viewport scope unchanged); pass `skeleton`/`bodyOnly` down; remove the import of the inference function.
  - `PageStateWrapper` passes `skeleton`/`bodyOnly` to `PageLoadingFallback`.
  - `ConnectionErrorState` `size="compact"`: wrapper `flex min-h-[160px] items-center justify-center px-4 py-6`, icon circle `h-9 w-9` with icon 16, title `text-sm`, no "Your saved records are safe." line, same Retry button.
- [ ] **Step 4:** Run `npm run test:skeleton && npx eslint src/components/common --quiet` — Expected: PASS, clean. (The build may fail until Task 4 renames `variant` at call sites; that is expected — do not run the build here.)
- [ ] **Step 5:** Commit — `feat(ui): explicit skeletons, no background behind loading and error states`.

### Task 3: Offline banner

**Files:** Modify `frontend/src/components/common/network/ConnectionStatusBanner.jsx`

- [ ] **Step 1:** While `!isOnline`, render a full-width bar (not fixed; it sits under the header in `DashboardLayout`): `role="status"`, `bg-amber-50 border-b border-amber-200 text-amber-800 text-xs font-semibold px-4 py-2`, a `WifiOff` icon and the Global Constraints copy. Keep the "Back online" pill as is.
- [ ] **Step 2:** Verify — `npx eslint src/components/common/network --quiet`; in the browser toggle the tab offline (`window.dispatchEvent(new Event("offline"))`) → the bar shows; `online` → the bar goes and "Back online" appears for 4 s.
- [ ] **Step 3:** Commit — `feat(ui): show an offline banner while the device is offline`.

### Task 4: Every full page names its skeleton

**Files (modify):** the 11 `PageStateWrapper` callers and 20 `SoftLoadingArea` callers listed below, plus `pages/bhc/PatientDetails.jsx` (drop `bg-white` from the loading placeholder `div`).

| File | Prop |
|---|---|
| `admin/AdminDashboard.jsx`, `bhc/BHCDashboard.jsx`, `rhu/RHUDashboard.jsx` | `skeleton="dashboard"` |
| `admin/UserManagement.jsx`, `rhu/IncomingReferrals.jsx`, `rhu/RHUPatientsModule.jsx`, `bhc/PatientsModule.jsx`, `bhc/Referrals.jsx`, `admin/AuditLogs.jsx` | `skeleton="table"` |
| `admin/Facilities.jsx` | `skeleton="facilities"` |
| `bhc/BHCReports.jsx`, `shared/FamilyPlanningList.jsx` | `skeleton="reports"` |
| `bhc/MedicineAvailability.jsx`, `rhu/MedicineManagement.jsx` | `skeleton="medicine"` |
| `bhc/HealthRecords.jsx`, `rhu/RHUHealthRecords.jsx`, `rhu/RHUPatientDetails.jsx` (records tab area) | `skeleton="health-records"` |
| `bhc/FollowUps.jsx` | `skeleton="follow-ups"` |
| `bhc/FollowUpDetails.jsx`, `bhc/HealthRecordDetails.jsx`, `rhu/RHURecordDetails.jsx`, `bhc/ReferralDetails.jsx`, `rhu/ReferralDetails.jsx`, `bhc/ProgramDetails.jsx` | `skeleton="details"` |
| `bhc/CreateReferral.jsx` (both), `rhu/FeedbackReturnSlip.jsx` | `skeleton="form"` |
| `bhc/PatientDetails.jsx`, `rhu/RHUPatientDetails.jsx` (page) | `skeleton="patient-details"` |
| `rhu/RHUPatientDetails.jsx` (referrals tab area) | `skeleton="table"` |
| `bhc/Programs.jsx` | `skeleton="module" bodyOnly` |
| `features/password-access/AccessRequestTable.jsx` | `skeleton="table" bodyOnly` |
| `features/patients/profile/FollowUpsAndReferrals.jsx`, `RecordsTimeline.jsx` | leave as is (Phase 2 replaces them with `SectionSkeleton`); they now get `module` |

- [ ] **Step 1:** Add the props; rename any remaining `variant=` on these components to `skeleton=` (`grep -rn "<SoftLoadingArea[^>]*variant=\|<PageStateWrapper[^>]*variant=" src` must return nothing).
- [ ] **Step 2:** Verify — `npx eslint src --quiet && npx vite build && npm run test:skeleton && npm run test:errors && npm run test:accounts` — Expected: clean.
- [ ] **Step 3:** Browser (seeded test admin from `backend/database/seeders/DatabaseSeeder.php`; slow API makes loads visible): Users, Facilities, Password & Invites (switch tabs), Admin Dashboard show their skeleton on the grey page with no white panel; Password & Invites shows only the table shape under its toolbar (no second toolbar).
- [ ] **Step 4:** Commit — `feat(ui): every page names its loading skeleton`.

### Task 5: Pages that had no loading or failure state

**Files:** Modify `frontend/src/pages/admin/AdminReports.jsx`, `frontend/src/pages/rhu/RHUReports.jsx`, `frontend/src/pages/admin/StaffAssignments.jsx`

- [ ] **Step 1: Reports.** Replace the toast-on-failure with state: `loading` (true until the first load settles), `loadError` (the error object). Wrap the page body in `PageStateWrapper` (`isLoading={loading}`, `isError={Boolean(loadError)}`, `hasData={!loading && !loadError}`, `error={loadError}`, `onRetry={() => setDataVersion((v) => v + 1)}`, `skeleton="reports"`, `loadingMessage="Loading reports..."`). Later reloads (data events) keep the current figures; a failed later reload toasts `loadError.message` instead. Remove `useNotification` only if nothing else uses it.
- [ ] **Step 2: Staff Assignments.** Split the load failure from the form's validation message: `loading`, `loadError` for `load()`, `error` stays for the form. Wrap the page body in `PageStateWrapper` (`skeleton="table"`, `loadingMessage="Loading staff assignments..."`, `onRetry={load}` which resets `loadError` and `loading`).
- [ ] **Step 3: Verify.** `npx eslint src --quiet && npx vite build`. Browser: block the page's requests with a `fetch` patch (`/referrals`, `/patients` for Reports; `/staff-assignments` for Staff Assignments), then open the page from the sidebar (in-app navigation keeps the patch) → in-place "Unable to Load Data", no toast; lift the patch, Retry → the page loads. Staff Assignments: submit with no duty → "Select at least one permitted duty." still shows inline.
- [ ] **Step 4:** Commit — `fix(ui): reports and staff assignments show loading and failure in place`.

### Task 6: Own error blocks move to the shared state

**Files:** Modify `frontend/src/pages/admin/AuditLogs.jsx`, `frontend/src/pages/bhc/FollowUpDetails.jsx`, `frontend/src/pages/rhu/RHUPatientDetails.jsx`, `frontend/src/pages/bhc/NotificationsPage.jsx`, `frontend/src/pages/rhu/ReferralDetails.jsx`, `frontend/src/components/features/password-access/useAccessRows.js`, `AccessRequestTable.jsx`

- [ ] **Step 1:** Audit Logs: the in-table load error becomes `ConnectionErrorState` (page size, `variant` from the error as other pages do, `onRetry` reloads) in place of the table.
- [ ] **Step 2:** Follow-up Details: the visit-chain and recorded-visit red cards become `ConnectionErrorState size="compact" variant="error"` with their existing retry handlers.
- [ ] **Step 3:** RHU Patient Details: `TabErrorState` uses `ConnectionErrorState size="compact"` (pass the tab's refetch as `onRetry` where available); delete `TabErrorState` if unused.
- [ ] **Step 4:** Notifications: `NotificationErrorState` is replaced by `ConnectionErrorState` (page size, `onRetry={handleRefresh}`, `retrying={viewLoading}`); its inbox skeleton stays.
- [ ] **Step 5:** RHU Referral Details: a load failure (not not-found, not restricted) renders `ConnectionErrorState` with Retry inside `DashboardLayout`; not-found and restricted keep `ReferralUnavailableState`.
- [ ] **Step 6:** Password & Invites: `useAccessRows` toasts a failed load only when rows are already on screen (`rows.length > 0` at the time of failure, tracked with a ref); a failed first load only sets `loadError`. `AccessRequestTable` keeps `ConnectionErrorState` for `rows.length === 0 && error`.
- [ ] **Step 7: Verify.** `npx eslint src --quiet && npx vite build`. Browser: Password & Invites with `/account-invites` blocked on a fresh tab switch → in-place error, **no toast**; Retry recovers; with rows on screen, block then trigger a reload (Decline or a search) → toast, rows stay. Notifications with `/notifications` blocked → shared error, Retry recovers.
- [ ] **Step 8:** Commit — `fix(ui): pages use the shared failure state instead of their own error blocks`.

### Task 7: Final verification

- [ ] **Step 1:** `cd frontend && npm run lint && npm run test:errors && npm run test:skeleton && npm run test:accounts && npx vite build` — Expected: clean (the one pre-existing `RHUAddHealthRecords` warning aside).
- [ ] **Step 2:** `grep -rn "inferLoadingSkeletonVariant\|API connection\|API request failed\|NotificationErrorState\|TabErrorState" src` — Expected: nothing.
- [ ] **Step 3:** Walk each Review Focus item once more in the browser.
