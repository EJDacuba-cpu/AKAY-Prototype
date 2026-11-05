# RHU Patient Intake sidebar & Walk-in Check-in — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the RHU sidebar into **Patient Intake** (Incoming Referrals + Walk-in Check-in) and keep **Patients** (Today's Queue + All Patients) as the clinical workspace, with a dedicated Walk-in Check-in page that reuses existing search/check-in/registration APIs.

**Architecture:** Frontend-only navigation and page composition. Extract walk-in search/check-in UI from `WalkInCheckInModal` into a shared panel used by the new page; retarget registration return destinations; leave referral arrival and `POST /rhu-visits` backends unchanged.

**Tech Stack:** React + Vite + React Router; frontend `node --test` utilities; existing Laravel walk-in APIs (no schema changes).

**Spec:** `docs/superpowers/specs/2026-11-05-rhu-patient-intake-sidebar-design.md`

## Global Constraints

- Scope: RHU sidebar + walk-in intake UX only. Do not modify BHC registration, Today's Queue table design, consultation processing, referral status logic, or create a second queue.
- Reuse `searchPatientsForCheckIn`, `checkInExistingPatient`, `RegistrationForm` / `RHUAddPatient`, and queue status `waiting`.
- QR Scanner stays at `/rhu/qr-scanner`; remove from sidebar; keep Incoming Referrals **QR Scan** button.
- `intake_staff` (`patients.register` + `rhu.intake`, no `clinical.history`) must reach Walk-in Check-in and intake arrival without needing Today's Queue.
- Preserve patient profile links; keep profile queue check-in action.
- Frontend tests from `frontend/`; do not run migrations against Supabase.
- Commit messages: concise `feat(rhu-intake): …` / `test(rhu-intake): …` style used in this repo.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `frontend/src/utils/sidebarNavigation.js` (+ test) | Patient Intake parent active matching; optional helpers |
| `frontend/src/utils/dashboardAccess.js` (+ test) | Nav allow for `/rhu/patient-intake` and `/rhu/walk-in-check-in` |
| `frontend/src/components/layout/sidebar/sidebarData.js` | Replace Referrals flat items with Patient Intake children; drop QR from sidebar |
| `frontend/src/utils/walkInRegistration.js` (+ test) | Return URLs, `patient_id` query helpers, register path builder |
| `frontend/src/components/features/rhu-queue/WalkInCheckInPanel.jsx` | Shared search + results + confirm check-in (extracted from modal) |
| `frontend/src/pages/rhu/RhuWalkInCheckIn.jsx` | Dedicated page shell |
| `frontend/src/App.jsx` | Route + redirects |
| `frontend/src/pages/rhu/RhuPatientsWorkspace.jsx` | Remove Check in walk-in button/modal |
| `frontend/src/pages/bhc/AddPatient.jsx` (+ `BhcPatientRegistration.jsx` if needed) | Post-save return to Walk-in Check-in with `patient_id` |
| `frontend/src/pages/bhc/PatientsModule.jsx` | Empty-state copy → Walk-in Check-in |
| `frontend/src/pages/rhu/RHUDashboard.jsx` | Walk-in shortcuts → `/rhu/walk-in-check-in` |
| `frontend/src/components/features/rhu-queue/WalkInCheckInModal.jsx` | Delete after panel extraction (or thin unused stub removed) |

---

### Task 1: Sidebar Patient Intake + navigation helpers

**Files:**
- Modify: `frontend/src/utils/sidebarNavigation.js`
- Modify: `frontend/src/utils/sidebarNavigation.test.js`
- Modify: `frontend/src/utils/dashboardAccess.js`
- Modify: `frontend/src/utils/dashboardAccess.test.js`
- Modify: `frontend/src/components/layout/sidebar/sidebarData.js`
- Modify: `frontend/src/App.jsx` (redirect only for `/rhu/patient-intake`)

**Interfaces:**
- Produces: `RHU_INTAKE_PARENT_PATH = "/rhu/patient-intake"`; `isRhuPatientIntakePath(pathname)` true for `/rhu/patient-intake`, `/rhu/incoming-referrals`, `/rhu/walk-in-check-in`, `/rhu/qr-scanner`, and `/rhu/referrals/:trackingId`; `isSidebarPathActive("/rhu/patient-intake", location, "rhu")` true when `isRhuPatientIntakePath(location.pathname)`.
- Produces sidebar item: label **Patient Intake**, `path` `/rhu/patient-intake`, `defaultPath` `/rhu/incoming-referrals`, children Incoming Referrals + Walk-in Check-in; no QR Scanner sidebar row; Patients children unchanged.
- Produces: `navigationAllowed` true for `/rhu/patient-intake` when `rhu.intake` \| `rhu.manage` \| `patients.register`; for `/rhu/walk-in-check-in` when `patients.register`.

- [ ] **Step 1: Write the failing tests** in `sidebarNavigation.test.js`:

```js
test("RHU Patient Intake sidebar nests Incoming Referrals and Walk-in Check-in", () => {
  const intake = menuByRole.rhu
    .flatMap((section) => section.items)
    .find((item) => item.path === "/rhu/patient-intake");
  assert.ok(intake?.children?.length);
  assert.equal(intake.label, "Patient Intake");
  assert.equal(intake.defaultPath, "/rhu/incoming-referrals");
  assert.deepEqual(
    intake.children.map((c) => c.label),
    ["Incoming Referrals", "Walk-in Check-in"],
  );
  assert.deepEqual(
    intake.children.map((c) => c.path),
    ["/rhu/incoming-referrals", "/rhu/walk-in-check-in"],
  );
  const flatLabels = menuByRole.rhu.flatMap((s) => s.items).map((i) => i.label);
  assert.equal(flatLabels.includes("QR Scanner"), false);
});

test("Patient Intake parent stays active on intake routes including QR Scanner", () => {
  const parent = "/rhu/patient-intake";
  for (const pathname of [
    "/rhu/incoming-referrals",
    "/rhu/walk-in-check-in",
    "/rhu/qr-scanner",
    "/rhu/referrals/TRK-1",
  ]) {
    assert.equal(isSidebarPathActive(parent, { pathname, search: "" }, "rhu"), true);
  }
  assert.equal(isSidebarPathActive(parent, { pathname: "/rhu/patients", search: "" }, "rhu"), false);
  assert.equal(
    isSidebarPathActive("/rhu/walk-in-check-in", { pathname: "/rhu/walk-in-check-in", search: "?patient_id=9" }, "rhu"),
    true,
  );
});
```

Add dashboardAccess tests: intake_staff-style user (`patients.register` + `rhu.intake`) allowed on `/rhu/walk-in-check-in` and `/rhu/patient-intake`; history-only user denied walk-in path; intake-only without register denied walk-in but allowed `/rhu/incoming-referrals`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && node --test src/utils/sidebarNavigation.test.js src/utils/dashboardAccess.test.js`  
Expected: FAIL — missing Patient Intake item / helpers.

- [ ] **Step 3: Implement helpers + sidebar + redirect**

In `sidebarNavigation.js`:

```js
export const RHU_INTAKE_PARENT_PATH = "/rhu/patient-intake";

export function isRhuPatientIntakePath(pathname = "") {
  return (
    pathname === RHU_INTAKE_PARENT_PATH ||
    pathname === "/rhu/incoming-referrals" ||
    pathname === "/rhu/walk-in-check-in" ||
    pathname === "/rhu/qr-scanner" ||
    /^\/rhu\/referrals\/[^/]+$/.test(pathname)
  );
}
```

In `isSidebarPathActive`, before the generic `pathname === location.pathname` check:

```js
  if (pathname === RHU_INTAKE_PARENT_PATH) {
    return isRhuPatientIntakePath(location.pathname);
  }
```

In `sidebarData.js`, replace the RHU `Referrals` section with:

```js
    {
      section: "Patient Intake",
      items: [
        {
          label: "Patient Intake",
          path: "/rhu/patient-intake",
          icon: ClipboardList,
          defaultPath: "/rhu/incoming-referrals",
          children: [
            { label: "Incoming Referrals", path: "/rhu/incoming-referrals" },
            { label: "Walk-in Check-in", path: "/rhu/walk-in-check-in" },
          ],
        },
      ],
    },
```

In `dashboardAccess.js` `navigationAllowed`, extend the RHU intake regex / add branches:

```js
  if (user?.role === "rhu" && /^\/rhu\/patient-intake(?:\/|$)/.test(path)) {
    return permissions.includes("rhu.intake") || permissions.includes("rhu.manage") || permissions.includes("patients.register");
  }
  if (user?.role === "rhu" && /^\/rhu\/walk-in-check-in(?:\/|$)/.test(path)) {
    return permissions.includes("patients.register");
  }
  if (user?.role === "rhu" && /^\/rhu\/(incoming-referrals|qr-scanner|referrals\/[^/]+)(?:\/|$)/.test(path)) {
    return permissions.includes("rhu.intake") || permissions.includes("rhu.manage");
  }
```

In `App.jsx`, add redirect before other RHU routes:

```jsx
<Route path="/rhu/patient-intake" element={<Navigate to="/rhu/incoming-referrals" replace />} />
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && node --test src/utils/sidebarNavigation.test.js src/utils/dashboardAccess.test.js`  
Expected: PASS (existing Patients tests still pass).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/sidebarNavigation.js frontend/src/utils/sidebarNavigation.test.js frontend/src/utils/dashboardAccess.js frontend/src/utils/dashboardAccess.test.js frontend/src/components/layout/sidebar/sidebarData.js frontend/src/App.jsx
git commit -m "$(cat <<'EOF'
feat(rhu-intake): nest Patient Intake sidebar with referrals and walk-in

EOF
)"
```

---

### Task 2: Walk-in registration destination helpers

**Files:**
- Modify: `frontend/src/utils/walkInRegistration.js`
- Modify: `frontend/src/utils/walkInRegistration.test.js`

**Interfaces:**
- Produces:
  - `WALK_IN_CHECK_IN_PATH = "/rhu/walk-in-check-in"`
  - `registerForWalkInCheckInPath()` → `"/rhu/patients/add?check_in=1"`
  - `walkInCheckInPathForPatient(patientId)` → `"/rhu/walk-in-check-in?patient_id={id}"` (string id/number ok)
  - `patientIdFromWalkInSearch(search)` → string id or `null` when missing/blank
  - `postSaveDestination({ checkIn, role, patientsPath, patientId })` when `checkIn` true → `walkInCheckInPathForPatient(patientId)`; when `role === "rhu"` and not checkIn → `patientsPath` (Today's Queue default); BHC unchanged.

- [ ] **Step 1: Failing tests** — update/replace the existing `postSaveDestination` test:

```js
test('check-in flow returns to Walk-in Check-in with the new patient selected', () => {
  assert.equal(
    postSaveDestination({ checkIn: true, patientsPath: '/rhu/patients', patientId: '9' }),
    '/rhu/walk-in-check-in?patient_id=9',
  );
  assert.equal(
    postSaveDestination({ role: 'rhu', patientsPath: '/rhu/patients', patientId: '9' }),
    '/rhu/patients',
  );
  assert.equal(
    postSaveDestination({ checkIn: false, patientsPath: '/bhc/patients', patientId: '9' }),
    '/bhc/patients/9',
  );
});

test('walk-in path helpers round-trip patient_id', () => {
  assert.equal(registerForWalkInCheckInPath(), '/rhu/patients/add?check_in=1');
  assert.equal(walkInCheckInPathForPatient(42), '/rhu/walk-in-check-in?patient_id=42');
  assert.equal(patientIdFromWalkInSearch('?patient_id=42'), '42');
  assert.equal(patientIdFromWalkInSearch(''), null);
  assert.equal(patientIdFromWalkInSearch('?patient_id='), null);
});
```

- [ ] **Step 2: Run** `cd frontend && npm run test:walk-in` — Expected: FAIL on destination assertion.

- [ ] **Step 3: Implement** in `walkInRegistration.js`:

```js
export const WALK_IN_CHECK_IN_PATH = '/rhu/walk-in-check-in';

export function registerForWalkInCheckInPath() {
  return '/rhu/patients/add?check_in=1';
}

export function walkInCheckInPathForPatient(patientId) {
  return `${WALK_IN_CHECK_IN_PATH}?patient_id=${encodeURIComponent(String(patientId))}`;
}

export function patientIdFromWalkInSearch(search) {
  const id = new URLSearchParams(search || '').get('patient_id');
  return id && id.trim() ? id.trim() : null;
}

export function postSaveDestination({ checkIn, role, patientsPath, patientId }) {
  if (checkIn) return walkInCheckInPathForPatient(patientId);
  return role === 'rhu' ? patientsPath : `${patientsPath}/${patientId}`;
}
```

- [ ] **Step 4: Run** `npm run test:walk-in` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(rhu-intake): return check-in registration to Walk-in Check-in`

---

### Task 3: WalkInCheckInPanel + Walk-in Check-in page

**Files:**
- Create: `frontend/src/components/features/rhu-queue/WalkInCheckInPanel.jsx`
- Create: `frontend/src/pages/rhu/RhuWalkInCheckIn.jsx`
- Modify: `frontend/src/App.jsx`
- Delete (after cutover): `frontend/src/components/features/rhu-queue/WalkInCheckInModal.jsx` — do **not** delete until Task 4 removes the queue import (keep modal compiling until then; Task 3 may leave modal as a thin wrapper around the panel **or** keep modal file untouched and only add panel+page; prefer extract shared panel and leave modal temporarily wrapping panel to avoid breakage).

**Interfaces:**
- Produces: `WalkInCheckInPanel({ registerPath, selectedPatientId, onClearedSelection })` — search UI; if `selectedPatientId` set, load identity via existing patient GET used elsewhere (`getPatient` / service already in frontend) or by priming results; show selected card with **Check In** that opens confirm before `checkInExistingPatient`; on success toast + optional `onCheckedIn`; **Register New Patient** button navigates to `registerPath`.
- Produces page: heading **Walk-in Check-in**, subtitle **Search existing patients first so a returning patient keeps one record.**, `DashboardLayout role="rhu"`, reads `patient_id` via `patientIdFromWalkInSearch`.
- Route: `/rhu/walk-in-check-in` → `ProtectedPage allowedRole="rhu" module="patients"` → `RhuWalkInCheckIn`.
- Confirmation copy: title **Check in this patient?**, body uses patient full name, confirm runs POST, cancel closes dialog only.

- [ ] **Step 1: No new pure util test required beyond Task 2.** Manually verify panel states exist in JSX: idle (≥2 chars hint), Searching..., No matching patient, error alert, Already in today's queue, Check in + confirm.

- [ ] **Step 2: Extract panel from `WalkInCheckInModal.jsx`**

Move search effect, result list, and `ResultRow` into `WalkInCheckInPanel.jsx`. Add confirmation state:

```jsx
const [pending, setPending] = useState(null); // patient awaiting confirm

// Check In button sets pending; confirm dialog primary calls checkIn(pending) then clears pending
```

Selected patient bootstrap when `selectedPatientId` is present — call `getRhuPatientById` from `frontend/src/services/patientService.js` (identity payload for register-only users). Present a selected card above search when loaded. Do not invent a new backend endpoint. Map the response into the same shape as search rows (`id`, `full_name`, `birthdate`, `barangay`, `active_visit_id` if present; otherwise treat missing `active_visit_id` as null and rely on check-in 409).

```jsx
useEffect(() => {
  if (!selectedPatientId) return;
  let cancelled = false;
  (async () => {
    try {
      const patient = await getRhuPatientById(selectedPatientId);
      if (!cancelled) setSelected(patient);
    } catch {
      if (!cancelled) setSelectedError("Unable to load the registered patient.");
    }
  })();
  return () => { cancelled = true; };
}, [selectedPatientId]);
```

Update modal to:

```jsx
export default function WalkInCheckInModal({ onClose, registerPath }) {
  return (
    <ModalShell title="Check in walk-in patient" ... onClose={onClose} footer={...}>
      <WalkInCheckInPanel registerPath={registerPath} onCheckedIn={onClose} />
    </ModalShell>
  );
}
```

(Footer Register/Cancel can stay on modal until Task 4 deletes it; panel should also expose Register for the page.)

- [ ] **Step 3: Create `RhuWalkInCheckIn.jsx`**

```jsx
export default function RhuWalkInCheckIn() {
  const [params, setParams] = useSearchParams();
  const selectedId = patientIdFromWalkInSearch(params);
  return (
    <DashboardLayout role="rhu" title="Walk-in Check-in">
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div>
          <h1 className="text-[17px] font-bold tracking-tight text-ink-800">Walk-in Check-in</h1>
          <p className="mt-1 text-[13px] text-neutral-600">
            Search existing patients first so a returning patient keeps one record.
          </p>
        </div>
        <WalkInCheckInPanel
          registerPath={registerForWalkInCheckInPath()}
          selectedPatientId={selectedId}
          onClearedSelection={() => {
            const next = new URLSearchParams(params);
            next.delete("patient_id");
            setParams(next, { replace: true });
          }}
        />
      </div>
    </DashboardLayout>
  );
}
```

Match Incoming Referrals / Today's Queue header typography and spacing (`text-[17px]` title, `text-[13px]` subtitle, `gap-4`).

Wire App route next to other RHU patient routes:

```jsx
<Route
  path="/rhu/walk-in-check-in"
  element={
    <ProtectedPage allowedRole="rhu" module="patients">
      <RhuWalkInCheckIn />
    </ProtectedPage>
  }
/>
```

Change legacy redirect:

```jsx
<Route path="/rhu/walk-in-patients" element={<Navigate to="/rhu/walk-in-check-in" replace />} />
```

- [ ] **Step 4: Run** `cd frontend && npm run test:walk-in && node --test src/utils/sidebarNavigation.test.js` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(rhu-intake): add Walk-in Check-in page with shared panel`

---

### Task 4: Remove queue walk-in CTA; retarget copy and dashboard

**Files:**
- Modify: `frontend/src/pages/rhu/RhuPatientsWorkspace.jsx`
- Modify: `frontend/src/pages/bhc/PatientsModule.jsx`
- Modify: `frontend/src/pages/rhu/RHUDashboard.jsx`
- Modify: `frontend/src/pages/bhc/AddPatient.jsx` (success modal labels for check-in flow)
- Delete: `frontend/src/components/features/rhu-queue/WalkInCheckInModal.jsx` if unused

**Interfaces:**
- Today's Queue header: title + subtitle only; no **Check in walk-in** button; no `WalkInCheckInModal` import/state.
- All Patients empty copy: `Register walk-in patients from Walk-in Check-in.` (link optional to `/rhu/walk-in-check-in`).
- Dashboard walk-in / “Add Walk-in Patient” / direct-visit shortcuts that currently go to `/rhu/patients/add` for intake → `/rhu/walk-in-check-in`.
- Registration success when `walkIn` / check-in flow: primary action navigates via `postSaveDestination` (**Continue to check-in** / close) **without** calling `checkInCreatedPatient` first. Remove or hide the auto **Check In Patient** button that POSTs then goes to queue when `walkIn` is set; secondary “Register another” stays. Duplicate “Use this patient” that currently check-ins then goes to queue should navigate to `walkInCheckInPathForPatient(match.id)` when in check-in flow (explicit check-in on the intake page). Non-check-in RHU registration success behavior can keep queue-oriented actions if already present for desk use — prefer: if `walkIn`, never auto-enqueue from the success modal.

- [ ] **Step 1: Adjust AddPatient check-in success path**

When `walkIn` is truthy:

```jsx
// Success modal primary
<Button type="button" onClick={() => {
  setModals({ confirm: false, success: false });
  navigate(postSaveDestination({ checkIn: true, role, patientsPath, patientId: createdPatientId }));
}}>
  Continue to check-in
</Button>
```

Do not call `checkInCreatedPatient` in that branch. Update duplicate match button similarly to navigate to walk-in path with that patient id when `walkIn` is set (skip immediate `checkInExistingPatient` unless already active — if `activeVisitId`, navigate to Today's Queue `/rhu/patients`).

- [ ] **Step 2: Strip queue CTA**

In `RhuPatientsWorkspace.jsx`: remove `checkInOpen`, `WalkInCheckInModal`, `REGISTER_FOR_CHECK_IN`, Plus import if unused, and the brand button block.

- [ ] **Step 3: PatientsModule + dashboard retarget** as specified; delete unused modal file; grep for `WalkInCheckInModal` and `Check in walk-in` — zero hits except docs/tests.

- [ ] **Step 4: Run**

```bash
cd frontend && npm run test:walk-in && node --test src/utils/sidebarNavigation.test.js src/utils/dashboardAccess.test.js src/utils/patientDirectory.test.js src/utils/rhuQueueView.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit** `feat(rhu-intake): move walk-in entry points off Today's Queue`

---

### Task 5: Spec/docs touch-up + verification checklist

**Files:**
- Modify if needed: empty-state strings / any stale comments referencing “from Today's Queue” for walk-in register.
- Spec already at `docs/superpowers/specs/2026-11-05-rhu-patient-intake-sidebar-design.md` — no code change required unless copy drifted.

- [ ] **Step 1: Grep** for stale UX strings:

```bash
cd frontend && rg -n "Check in walk-in|Register walk-in patients from Today's Queue|WalkInCheckInModal|/rhu/walk-in-patients" src
```

Expected: no modal; legacy path only as Navigate target if still listed; empty-state points at Walk-in Check-in.

- [ ] **Step 2: Manual verification checklist** (report results in commit message body or PR notes; browser if available):

1. Sidebar: Patient Intake expands; children Incoming Referrals + Walk-in Check-in; QR not in sidebar; QR Scan on Incoming Referrals still works.
2. Walk-in: search existing → confirm Check In → appears Waiting on Today's Queue.
3. Walk-in: no match → Register → save → lands on Walk-in with patient selected → confirm Check In → queue.
4. Duplicate active visit: shows already-in-queue; no second visit.
5. Receive referral → same Today's Queue.
6. Soft user with only `patients.register` + `rhu.intake`: Walk-in Check-in + intake pages open; no clinical history required for those pages.
7. Refresh `/rhu/walk-in-check-in?patient_id=…` keeps selection load.
8. `/rhu/patients/:id` profile links still work; All Patients browse-only.

- [ ] **Step 3: Commit** docs-only if any string/docs fix: `docs(rhu-intake): note Patient Intake sidebar verification`

If nothing to commit, skip.

---

## Self-review (plan author)

| Spec requirement | Task |
|------------------|------|
| Patient Intake collapsible + two children | 1 |
| Patients keep Queue + All Patients | 1 (unchanged structure asserted) |
| Dedicated Walk-in page + search + confirm | 3 |
| Register → return with patient selected → explicit check-in | 2, 3, 4 |
| Remove walk-in CTA from Queue / directory focus | 4 |
| QR via Incoming Referrals button; route preserved | 1, 3 |
| Referrals unchanged into same queue | (no code; verify step 5) |
| intake_staff without clinical.history | 1 (nav), 3 (`module="patients"`) |
| No BHC / queue table / referral logic rewrite | Global Constraints |

No TBD placeholders. Backend APIs reused as-is.
