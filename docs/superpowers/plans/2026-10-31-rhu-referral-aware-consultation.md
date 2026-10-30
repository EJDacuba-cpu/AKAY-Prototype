# RHU Referral-Aware Consultation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give RHU staff a referral-aware ITR and clearer patient-profile referral details for BHC-referred visits, without building a second consultation system.

**Architecture:** Reuse the existing RHU ITR (`RhuConsultationWorkspace`), referral records, visit queue, `BhcReferralSlip`, Return Slip display, and Health Record columns. Identify a referred visit by `visit.referral.id` (not `source === "referral"` alone). Keep BHC observations read-only reference; persist only today's RHU interview, vitals, and an optional additional concern in `monitoring_data`.

**Tech Stack:** React + Vite, Laravel, PostgreSQL/SQLite tests, existing shadcn `Card`/`Button`, existing `ModalShell`. Frontend tests: `node --test`. Backend tests: `php artisan test --filter=...` from `backend/`.

## Global Constraints

- Stay on `itr-patient-history`. Do not switch to `main`. Do not create a worktree unless the user asks.
- Plan and implement locally. Do not commit, push, or merge unless the user explicitly asks.
- Do not create a separate referral consultation system, nested referral tabs, or new referral modules.
- No schema change. No unrelated migrations. No new shadcn `Dialog`/`Field`/`Alert`/`Empty`/`Badge` installs.
- Reuse `Card`, `Button`, `ModalShell`, `BhcReferralSlip`, `PreviousBodyFindings`, `getReferralById`, `getHealthRecordById`.
- New UI uses `flex` + `gap-*`, semantic tokens, and `Button` variants. Do not use `space-y-*` in **new** files. Do not rewrite the whole ITR to FieldGroup.
- Never copy BHC vitals, HPI, or findings into today's RHU `chief_complaint`, `history_of_present_illness`, or vital-sign columns.
- Keep official referral status (Pending / Received / Completed / No-Show) separate from queue visit status (waiting / in_consultation / closed).
- Preserve BHC consultation, referral submit, RHU Start/Resume, encode/finalize, Health Record history, diagnosis/prescription, Return Slip, and facility access.
- Backend tests from `backend/`. Frontend tests from `frontend/` with `node --test`.
- Commit steps below are optional: skip them unless the user asks.

---

## 1. Verified existing architecture

Legend: **Verified** = read from the current working tree. **Assumed** = not proven from code.

### Visit queue and referred-visit identity

| Fact | Evidence |
|---|---|
| Queue rows live in `rhu_visit_queue_entries` with `source` `referral` or `walk_in`, statuses `waiting` / `in_consultation` / `closed`, `consultation_uuid`, optional `referral_id`. | `backend/app/Models/RhuVisitQueueEntry.php` |
| Visit API `present()` returns `referral: { id, sending_bhc }` only. No chief complaint, HPI, vitals, tracking id, or health record id. | `backend/app/Http/Controllers/Api/RhuVisitController.php` `present()` |
| Walk-in check-in `POST /api/rhu-visits` never accepts `referral_id`; comment says a referral is never accepted here. | `RhuVisitController::store` |
| `checkIn(..., referralId=null)` always sets `SOURCE_WALK_IN` and `referral_id = null`. | `RhuVisitQueueService::performCheckIn` |
| Receiving a referral enqueues `SOURCE_REFERRAL` with key `referral-{id}`, or links an **active** walk-in by writing `referral_id` **without** changing `source`. | `recordReferralArrival`, `linkActiveVisit`; `RhuReferralArrivalTest` |
| Close is waiting-only. `in_consultation` cannot be closed through this path. Close does not change referral status. | `RhuVisitQueueService::close` |
| Unique key is `(rural_health_unit_id, check_in_key)`. `referral_id` is indexed, not unique. Multiple visits may share one referral. CHECK: `source = 'walk_in' OR referral_id IS NOT NULL`. | migrations `2026_10_24_000001`, `2026_10_25_000002` |
| No-Show late arrival is a separate receive-with-remarks path and stays No-Show until received. | `ReferralController::reschedule` comment; `RhuReferralArrivalTest::test_late_arrival_from_no_show_enqueues_the_visit` |

**Verified gap for return visits:** Received → waiting → close (`left_before_consultation`) → patient returns via profile/walk-in check-in → new visit is `walk_in` with `referral_id = null`. ITR then cannot see a BHC referral.

**Verified: this dependency is not a blocker for first-arrival referred visits** (Incoming Referrals / QR receive already set `referral_id`). **It is a blocker** for the return-after-close path. Fix check-in **before** treating referral-aware ITR as complete for returning patients. ITR UI can still use `visit.referral.id` for currently linked visits.

**Verified: do not infer referral at ITR time from the patient's latest referral.** That would attach a BHC slip to a true walk-in. Re-link at check-in instead.

### RHU ITR

| Fact | Evidence |
|---|---|
| Workspace: `frontend/src/pages/rhu/RhuConsultationWorkspace.jsx`. Interview is a Card with required Chief Complaint and optional HPI. | interview fieldset ~1142 |
| Save requires `chiefComplaint`. Maps to Health Record `chief_complaint` / `history_of_present_illness`. | `HealthRecordRequest` `chief_complaint` required on POST; workspace `createRhuHealthRecord` |
| Draft restore writes `chiefComplaint` and `summaryOfPresentIllness` from payload. | `restoreDraft` |
| Care-plan flag `isReferralVisit` is `visit?.source === "referral"`. Misses walk-ins that later gained `referral_id`. | workspace ~640, ~874, ~1404 |
| Assessment has editable RHU vitals. `PreviousBodyFindings` already exists. No BHC vitals reference. | assessment Card ~1219–1288 |
| Overlay primitive is `ModalShell` (Escape, focus restore, `size="wide"`, body scroll). shadcn `Dialog` is not installed. | `frontend/src/components/common/modals/ModalShell.jsx` |
| Installed shadcn UI: `button`, `card`, `input`, `select`, `popover`, `accordion`, `dropdown-menu`, `tooltip`, `chart`. Not installed: `dialog`, `field`, `alert`, `empty`, `badge`, `separator`, `skeleton`. | `frontend/src/components/ui/` |

### Referral slip and profile

| Fact | Evidence |
|---|---|
| Full slip UI: `BhcReferralSlip` + `referralSlipModel(referral, record)`. Clinical values from referral snapshot + linked BHC health record. | `frontend/src/components/features/patients/profile/BhcReferralSlip.jsx`, `frontend/src/utils/referralSlipView.js` |
| Standalone route `/rhu/patients/:patientId/referrals/:referralId` loads `getReferralById` + `getHealthRecordById`, gated by `clinical.history`. | `RhuReferralSlip.jsx`, `App.jsx` |
| Profile tab is already named Referrals. Action copy is **View Referral Slip**. Navigates away from the profile. | `PatientReferralsTab.jsx` |
| Tab status chip uses `ProfileStatusChip` → `normalizeHealthRecordStatus`. That helper maps `"received"` to **"Referred/Pending"**. | `ProfileChip.jsx`, `formatters.js` lines 250–252 |
| Official referral formatter `formatReferralStatus` already maps receive → **Received**. List payloads already expose `statusDisplay` via `formatReferralStatus`. | `formatters.js`, `services/referrals.js` |
| BHC Referral Details already has a read-only Return Slip section and pending copy ("Awaiting RHU feedback..."). | `frontend/src/pages/bhc/ReferralDetails.jsx` `ReturnSlip` |
| RHU Return Slip **form** remains `/rhu/feedback/:trackingId`. | `FeedbackReturnSlip.jsx` |

### Persistence columns (no new tables)

- Referral: `chief_complaint`, `reason_for_referral`, `initial_diagnosis`, `status`, `health_record_id`.
- Health Record: `chief_complaint`, `history_of_present_illness`, vital columns, `physical_exam`, `body_findings`, JSON `monitoring_data`.
- `HealthRecordRequest` already validates `monitoring_data.followUpSchedules` for `rhu_itr_v1`. Extra JSON keys currently persist if sent; this plan adds explicit nullable rules for `additionalConcern` so the contract is tested.

---

## 2. Confirmed gaps versus the approved design

| # | Design | Current | Schema change? |
|---|---|---|---|
| 1 | Compact read-only BHC Referral above RHU interview | Missing | No |
| 1 | View Full Referral Slip without leaving ITR | Navigates to standalone route | No |
| 1 | Today's RHU history/update + optional + Add Another Concern | Single CC + HPI; no additional concern | No (JSON only) |
| 1 | Do not auto-classify BHC observations as RHU findings | Not copied today (good). Risk is future prefills | No |
| 2 | Overlay reusing `BhcReferralSlip` | Page-only | No |
| 3 | Previous BHC vitals as labeled reference | Missing; PreviousBodyFindings exists | No |
| 3 | Never auto-copy old vitals | Inputs start empty (good). Must not prefill | No |
| 4 | Tab name Referrals | Already Referrals | No |
| 4 | View Details instead of View Referral Slip | Wrong copy | No |
| 4 | Details = BHC slip + Return Slip / pending | Slip only | No |
| 4 | Received shown as Received | Shown as Referred/Pending | No |
| 4 | Official status ≠ queue progress | Table does not show queue status (good) | No |
| 5 | Return after close stays linked to the referral | Walk-in with null `referral_id` | No (service inference) |
| 5 | Preserve in-progress ITR | Close blocked once `in_consultation`; Resume exists | No discontinue workflow in this plan |

---

## 3. Recommended UI and interactions

### 3.1 Referred ITR — Interview

Show only when `isReferredRhuVisit(visit)` is true (`Boolean(visit?.referral?.id \|\| visit?.referral_id)`). Walk-in ITR stays unchanged.

```
[Card: BHC Referral — read-only]
  Originating BHC
  Original Chief Complaint
  HPI (when recorded; else "Not recorded")
  Referred Concerns
  Reason for Referral
  [Button secondary] View Full Referral Slip

[Card: Today's RHU interview]
  Chief Complaint *          ← existing required field, relabeled for referred visits
  Today's clinical history / update  ← existing HPI field
  [Button ghost] + Add Another Concern
    → optional Chief Complaint + HPI (not required)
```

No radio buttons. No complaint-status controls. BHC text is never editable and never copied into the RHU fields.

**View Full Referral Slip:** `setReferralSlipOpen(true)`. Do not `navigate()`. Step, draft, `consultation_uuid`, and visit id stay mounted.

### 3.2 Overlay

`ModalShell` `size="wide"` title "BHC Referral Slip". Body scrolls. Close, backdrop, Escape. Reuse `BhcReferralSlip`. Keep `/rhu/patients/:patientId/referrals/:referralId` for profile/history.

### 3.3 Referred ITR — Physical examination

Above today's vital inputs:

```
[read-only reference]
  Previous BHC vital signs
  Source: {BHC name} · Recorded {date}
  BP / Temp / Pulse / RR / SpO2 / Weight / Height from linked BHC record
  Empty values: Not recorded
```

Today's RHU inputs stay empty. `PreviousBodyFindings` stays. Optional one-line caption: "Previous BHC findings are listed below. New findings for this RHU visit are recorded on the body map and examination fields."

### 3.4 Profile Referrals tab

Keep the tab name. Keep columns: date/tracking, referring BHC, referred concerns, official status, actions.

- Status: `formatReferralStatus` + `ProfileChip` (not `ProfileStatusChip`).
- Action: **View Details** → same URL.
- Details page: keep URL. Stack (1) `BhcReferralSlip` (2) shared read-only Return Slip. Pending: "Pending feedback. The return slip will appear here once submitted." No nested tabs. Do not embed the writable `FeedbackReturnSlip` form.

---

## 4. Minimum frontend / backend changes

**Do not change** visit `present()` clinical payload unless Task 3 tests prove a second fetch is unsafe. ITR already has `visit.referral.id` and can reuse `getReferralById` / `getHealthRecordById` (same access rules as the standalone slip).

**Backend (service + request rules only):**

1. `RhuVisitQueueService::checkIn` with `referralId === null` infers **at most one** eligible Received referral for this patient/RHU whose latest visit was closed before consultation (or who has no visit). Creates a **new** `SOURCE_REFERRAL` row with the client walk-in `check_in_key` (new unique key) and that `referral_id`.
2. Do not accept `referral_id` from the walk-in HTTP body (clients cannot pick a referral).
3. `HealthRecordRequest` `rhu_itr_v1`: nullable `monitoring_data.additionalConcern.{chiefComplaint,historyOfPresentIllness}`.

**Frontend:**

1. `isReferredRhuVisit(visit)` shared helper; use it for ITR referral UI **and** care-plan `isReferralVisit`.
2. Compact reference + additional-concern UI; overlay; previous vitals reference.
3. Profile status + View Details; details page Return Slip section.
4. Draft keys `showAdditionalConcern`, `additionalChiefComplaint`, `additionalHistoryOfPresentIllness`.

**Do not:** new routes, new tables, Dialog install, auto-prefill vitals/CC, discontinue-ITR workflow, change No-Show reschedule, change `linkActiveVisit` walk-in+receive race (`source` stays `walk_in` there — ITR uses `referral.id`, so that visit still counts as referred).

---

## 5. Data persistence and clinical provenance

| Data | Source | Write target | Provenance rule |
|---|---|---|---|
| BHC CC, reason, concerns | Referral row | none | Display only |
| BHC HPI, vitals, exam, body findings | Linked BHC health record | none | Display only |
| Today's RHU CC | Interview | `health_records.chief_complaint` | Required; never prefilled from BHC |
| Today's RHU history/update | Interview HPI | `health_records.history_of_present_illness` | Optional; never prefilled |
| Additional concern | Revealed fields | `monitoring_data.additionalConcern` | Omit if hidden or both blank. Not a diagnosis. Not BHC snapshot |
| Today's vitals / PE / body map | Assessment | existing RHU columns | Start empty |
| Previous body findings decisions | Existing reassessment | `monitoring_data.bodyFindingReassessments` | Unchanged |
| Official referral status | `referrals.status` | unchanged by this work | Never display via `normalizeHealthRecordStatus` |
| Queue progress | visit `status` | unchanged | Not shown as referral status |

Draft restore must not copy BHC snapshot into RHU fields. Overlay must not write.

---

## 6. File structure

| File | Responsibility |
|---|---|
| `frontend/src/utils/rhuVisitReferral.js` | `isReferredRhuVisit`, additional-concern helpers |
| `frontend/src/utils/rhuVisitReferral.test.js` | unit tests |
| `frontend/src/components/features/health-records/wizard/RhuBhcReferralReference.jsx` | compact read-only interview panel + View Full Referral Slip |
| `frontend/src/components/features/health-records/wizard/RhuPreviousVitalsReference.jsx` | read-only previous BHC vitals |
| `frontend/src/hooks/useRhuReferralSlipData.js` | shared referral+linked-record query (page + overlay) |
| `frontend/src/components/features/patients/profile/ReferralReturnSlipSection.jsx` | extract BHC Return Slip display; pending copy |
| `frontend/src/pages/rhu/RhuConsultationWorkspace.jsx` | compose reference, overlay, additional concern, vitals reference |
| `frontend/src/pages/rhu/RhuReferralSlip.jsx` | Referral Details layout: slip + return slip |
| `frontend/src/components/features/patients/profile/PatientReferralsTab.jsx` | View Details + official status |
| `frontend/src/components/features/patients/profile/BhcReferralSlip.jsx` | official status chip (not health-record mapper) |
| `frontend/src/pages/bhc/ReferralDetails.jsx` | import shared Return Slip section |
| `backend/app/Services/RhuVisitQueueService.php` | infer eligible referral on walk-in check-in |
| `backend/app/Http/Requests/HealthRecordRequest.php` | additionalConcern rules |
| `backend/tests/Feature/RhuVisitReturnCheckInTest.php` | new |
| `backend/tests/Feature/RhuItrConsultationTest.php` | additionalConcern persistence |
| Existing frontend tests listed per task | source-string + render tests |

---

## Phased tasks

Phase A (Tasks 1–2) unblocks correct referred-visit identity, including returns.  
Phase B (Tasks 3–6) is the referral-aware ITR.  
Phase C (Task 7) is profile details.  
Phase D (Task 8) is focused regression.

---

### Task 1: Official referral status on RHU referral surfaces

**Files:**
- Modify: `frontend/src/components/features/patients/profile/PatientReferralsTab.jsx`
- Modify: `frontend/src/components/features/patients/profile/BhcReferralSlip.jsx`
- Modify: `frontend/src/components/features/patients/profile/ProfileChip.jsx` (add `ReferralStatusChip` only; do not change `ProfileStatusChip` behavior)
- Test: `frontend/src/components/features/patients/profile/PatientReferralsTab.test.js` (create)
- Test: `frontend/src/components/features/patients/profile/BhcReferralSlip.test.js` (extend if present)

**Interfaces:**
- Consumes: `formatReferralStatus(status)` from `frontend/src/utils/formatters.js`
- Produces: `ReferralStatusChip({ status })` rendering official Pending / Received / Completed / No-Show

- [ ] **Step 1: Write the failing tab test**

Create `frontend/src/components/features/patients/profile/PatientReferralsTab.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tab = readFileSync(join(here, "PatientReferralsTab.jsx"), "utf8");
const chip = readFileSync(join(here, "ProfileChip.jsx"), "utf8");

test("Referrals tab uses official referral status, not health-record Referred/Pending", () => {
  assert.match(tab, /ReferralStatusChip/);
  assert.match(tab, /View Details/);
  assert.doesNotMatch(tab, /View Referral Slip/);
  assert.doesNotMatch(tab, /ProfileStatusChip/);
  assert.match(chip, /formatReferralStatus/);
  assert.match(chip, /export function ReferralStatusChip/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/components/features/patients/profile/PatientReferralsTab.test.js`  
Working directory: `frontend`  
Expected: FAIL (`ReferralStatusChip` / `View Details` missing)

- [ ] **Step 3: Add `ReferralStatusChip` and switch referral UIs**

In `ProfileChip.jsx` add:

```js
import { formatDisplayValue, formatReferralStatus, normalizeHealthRecordStatus } from "../../../../utils/formatters";

export function ReferralStatusChip({ status }) {
  const label = formatReferralStatus(formatDisplayValue(status, "Pending"), "Pending");
  return <ProfileChip tone={statusTone(label)} dot>{label}</ProfileChip>;
}
```

Keep `ProfileStatusChip` on `normalizeHealthRecordStatus` (health records only).

In `PatientReferralsTab.jsx`:
- Import `ReferralStatusChip`.
- Replace `ProfileStatusChip` in row and card.
- Replace link text `View Referral Slip` with `View Details` (same `reviewReferralSlipPath`).

In `BhcReferralSlip.jsx` header: use `ReferralStatusChip` instead of `ProfileStatusChip`. Keep the `Field label="Referral status"` raw value or also format it with `formatReferralStatus` so overlay and details agree.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/components/features/patients/profile/PatientReferralsTab.test.js src/components/features/patients/profile/BhcReferralSlip.test.js`  
Working directory: `frontend`  
Expected: PASS

- [ ] **Step 5: Commit only if the user asks**

```bash
git add frontend/src/components/features/patients/profile/ProfileChip.jsx frontend/src/components/features/patients/profile/PatientReferralsTab.jsx frontend/src/components/features/patients/profile/BhcReferralSlip.jsx frontend/src/components/features/patients/profile/PatientReferralsTab.test.js
git commit -m "fix: show official referral status on RHU referral surfaces"
```

---

### Task 2: Returning referred patient check-in (identity dependency)

**Files:**
- Modify: `backend/app/Services/RhuVisitQueueService.php`
- Test: Create `backend/tests/Feature/RhuVisitReturnCheckInTest.php`
- Do not modify: `RhuVisitController::store` request body (still `patient_id` + `check_in_key` only)

**Interfaces:**
- Consumes: `checkIn(User $user, int $patientId, ?int $referralId, string $checkInKey)`
- Produces: when `$referralId === null`, server may attach exactly one eligible Received referral and set `source = referral`

**Eligibility (verified constraints + this design):**

Attach referral R when **all** are true:

1. `R.patient_id` is this patient and `R.rural_health_unit_id` is this RHU.
2. `R.status === Received` (not Pending, Completed, or No-Show).
3. There is no active visit for this patient (existing duplicate-active throw still applies).
4. Among visits with `referral_id = R.id`, either none exist, or the latest is `closed` with `close_reason` in `left_before_consultation`, `checked_in_by_mistake`, `other`.
5. Do **not** attach if the latest visit for R is `in_consultation`, or `closed` with `consultation_completed`.
6. If **more than one** Received referral passes 1–5, attach none (true walk-in). Do not guess.

No-Show stays on the existing receive-with-remarks path.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/Feature/RhuVisitReturnCheckInTest.php` using the same facility/user helpers as `RhuReferralArrivalTest`. Include:

```php
public function test_walk_in_check_in_after_left_before_consultation_reuses_the_received_referral(): void
{
    // receive → waiting referral visit → close left_before_consultation
    // POST /api/rhu-visits { patient_id, check_in_key: 'walk-in-return-1' }
    // assert 201, source=referral, same referral_id, new visit id, old visit remains closed
    // assert same tracking referral row (status still Received)
}

public function test_walk_in_check_in_does_not_attach_a_completed_referral(): void { /* source=walk_in, referral_id null */ }

public function test_walk_in_check_in_does_not_attach_no_show(): void { /* source=walk_in */ }

public function test_walk_in_check_in_does_not_attach_when_two_received_referrals_are_eligible(): void { /* source=walk_in */ }

public function test_duplicate_active_visit_still_rejected(): void { /* existing waiting visit → 409/duplicate */ }

public function test_true_walk_in_without_received_referral_stays_walk_in(): void { /* unchanged */ }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --filter=RhuVisitReturnCheckInTest`  
Working directory: `backend`  
Expected: FAIL (new visit is `walk_in` with null `referral_id`)

- [ ] **Step 3: Infer eligible referral inside `performCheckIn`**

When `$referralId === null` after patient authorization, call a private `eligibleReturnReferralId(int $rhuId, int $patientId): ?int` and if non-null set `$referralId` and `$source = SOURCE_REFERRAL`. Keep the client's `check_in_key` (do not reuse `referral-{id}`, which would unique-conflict with the closed visit).

Do not change `linkActiveVisit` (active walk-in + receive race). Do not accept client `referral_id`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `php artisan test --filter=RhuVisitReturnCheckInTest`  
Then: `php artisan test --filter=RhuReferralArrivalTest`  
Then: `php artisan test --filter=RhuVisitApiTest`  
Working directory: `backend`  
Expected: PASS. Arrival tests still: receive enqueues once; late No-Show still needs remarks; linking an **active** walk-in still keeps `source=walk_in` with `referral_id` set.

- [ ] **Step 5: Commit only if the user asks**

```bash
git add backend/app/Services/RhuVisitQueueService.php backend/tests/Feature/RhuVisitReturnCheckInTest.php
git commit -m "fix: relink Received referrals when a closed referred visit returns"
```

---

### Task 3: Referred-visit helper and shared slip data hook

**Files:**
- Create: `frontend/src/utils/rhuVisitReferral.js`
- Create: `frontend/src/utils/rhuVisitReferral.test.js`
- Create: `frontend/src/hooks/useRhuReferralSlipData.js`
- Modify: `frontend/src/pages/rhu/RhuReferralSlip.jsx` to use the hook
- Modify: `frontend/src/pages/rhu/RhuConsultationWorkspace.jsx` to use `isReferredRhuVisit` for care-plan `isReferralVisit`

**Interfaces:**
- Produces:

```js
export function isReferredRhuVisit(visit) {
  return Boolean(visit?.referral?.id || visit?.referral_id);
}

export function additionalConcernPayload({ show, chiefComplaint, historyOfPresentIllness }) {
  if (!show) return undefined;
  const chief = String(chiefComplaint || "").trim();
  const hpi = String(historyOfPresentIllness || "").trim();
  if (!chief && !hpi) return undefined;
  return { chiefComplaint: chief, historyOfPresentIllness: hpi };
}
```

`useRhuReferralSlipData({ patientId, referralId, enabled })` returns `{ patient, referral, record, loading, unauthorized, missing, loadError, retry }` using the same queries as `RhuReferralSlip.jsx` (`clinical.history`, `getReferralById`, `getHealthRecordById`, `referralBelongsToPatient`).

- [x] **Step 1: Write the failing helper tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { additionalConcernPayload, isReferredRhuVisit } from "./rhuVisitReferral.js";

test("referred visit is identified by referral id even when source is walk_in", () => {
  assert.equal(isReferredRhuVisit({ source: "walk_in", referral: { id: 9 } }), true);
  assert.equal(isReferredRhuVisit({ source: "referral", referral: { id: 9 } }), true);
  assert.equal(isReferredRhuVisit({ source: "walk_in" }), false);
  assert.equal(isReferredRhuVisit(null), false);
});

test("additional concern is omitted when hidden or blank", () => {
  assert.equal(additionalConcernPayload({ show: false, chiefComplaint: "x", historyOfPresentIllness: "y" }), undefined);
  assert.equal(additionalConcernPayload({ show: true, chiefComplaint: " ", historyOfPresentIllness: "" }), undefined);
  assert.deepEqual(
    additionalConcernPayload({ show: true, chiefComplaint: "Fever", historyOfPresentIllness: "Since dawn" }),
    { chiefComplaint: "Fever", historyOfPresentIllness: "Since dawn" },
  );
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test src/utils/rhuVisitReferral.test.js`  
Working directory: `frontend`  
Expected: FAIL (module missing)

- [x] **Step 3: Implement helper + extract hook + switch ITR `isReferralVisit`**

Replace `visit?.source === "referral"` in `RhuConsultationWorkspace.jsx` (all three sites) with `isReferredRhuVisit(visit)`.

Move query logic out of `RhuReferralSlip.jsx` into `useRhuReferralSlipData`. Page behavior and permission gating stay identical.

- [x] **Step 4: Run tests**

Run: `node --test src/utils/rhuVisitReferral.test.js src/pages/rhu/RhuConsultationWorkspace.test.js`  
Working directory: `frontend`  
Expected: PASS. Add a source-string assertion in `RhuConsultationWorkspace.test.js`:

```js
test("RHU ITR treats a linked referral id as a referred visit", () => {
  assert.match(workspace, /isReferredRhuVisit/);
  assert.doesNotMatch(workspace, /visit\?\.source === "referral"/);
});
```

- [x] **Step 5: Commit only if the user asks** ? Skipped; no commit requested.

---

### Task 4: Compact BHC Referral interview section + additional concern

**Files:**
- Create: `frontend/src/components/features/health-records/wizard/RhuBhcReferralReference.jsx`
- Create: `frontend/src/components/features/health-records/wizard/RhuBhcReferralReference.test.js`
- Modify: `frontend/src/pages/rhu/RhuConsultationWorkspace.jsx`
- Modify: `backend/app/Http/Requests/HealthRecordRequest.php` (`rhu_itr_v1` branch)
- Modify: `backend/tests/Feature/RhuItrConsultationTest.php`

**Interfaces:**
- Consumes: `useRhuReferralSlipData`, `referralSlipModel`, `isReferredRhuVisit`, `additionalConcernPayload`
- Produces: read-only panel props `{ slip, sendingBhc, onViewFullSlip }`; save payload `monitoring_data.additionalConcern`

UI copy:

- Panel title: `BHC Referral`
- Today's CC label (referred only): `Today's RHU chief complaint`
- Today's HPI label (referred only): `Today's clinical history / update`
- Button: `+ Add Another Concern` (`Button variant="ghost"`)
- Overlay trigger: `View Full Referral Slip` (`Button variant="secondary"`)

Walk-in labels stay `Chief Complaint *` / `History of Present Illness`.

- [x] **Step 1: Write failing render/source tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "RhuBhcReferralReference.jsx"), "utf8");
const workspace = readFileSync(join(here, "../../../pages/rhu/RhuConsultationWorkspace.jsx"), "utf8");

test("BHC referral reference is read-only and offers the full slip action", () => {
  assert.match(source, /BHC Referral/);
  assert.match(source, /View Full Referral Slip/);
  assert.match(source, /Originating BHC|Referring BHC/);
  assert.doesNotMatch(source, /type="radio"/);
  assert.doesNotMatch(source, /<textarea/);
});

test("referred ITR keeps required chief complaint and optional additional concern", () => {
  assert.match(workspace, /RhuBhcReferralReference/);
  assert.match(workspace, /Add Another Concern/);
  assert.match(workspace, /additionalConcernPayload/);
  assert.match(workspace, /chiefComplaint/);
});
```

Add PHPUnit in `RhuItrConsultationTest.php`:

```php
public function test_rhu_itr_stores_additional_concern_in_monitoring_data_not_chief_complaint(): void
{
    // existing referred ITR save helper, plus
    // monitoring_data.additionalConcern.chiefComplaint = 'Second concern'
    // assert record.chief_complaint is today's RHU complaint
    // assert monitoring_data additionalConcern matches
    // assert referral.chief_complaint unchanged
}
```

In `HealthRecordRequest` `elseif ($rhuItr)` add:

```php
$rules['monitoring_data.additionalConcern'] = ['nullable', 'array:chiefComplaint,historyOfPresentIllness'];
$rules['monitoring_data.additionalConcern.chiefComplaint'] = ['nullable', 'string', 'max:2000'];
$rules['monitoring_data.additionalConcern.historyOfPresentIllness'] = ['nullable', 'string', 'max:5000'];
```

- [x] **Step 2: Run tests to verify they fail**

Run: `node --test src/components/features/health-records/wizard/RhuBhcReferralReference.test.js` (frontend)  
Run: `php artisan test --filter=test_rhu_itr_stores_additional_concern` (backend)  
Expected: FAIL

- [x] **Step 3: Implement the panel and wire save/draft**

`RhuBhcReferralReference`:
- `Card` + `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`.
- Definition list of originating BHC, original CC, HPI, referred concerns, reason.
- Values from `referralSlipModel(referral, record)` plus `sending_bhc`.
- No inputs.

Workspace:
- If `isReferredRhuVisit(visit)`, render the panel **above** the interview Card.
- Fetch slip data with `useRhuReferralSlipData({ patientId, referralId: visit.referral.id, enabled: isReferred && canViewHistory })`. Missing linked record: show HPI as Not recorded (existing `referralSlipModel` copy).
- State: `showAdditionalConcern`, `additionalChiefComplaint`, `additionalHistoryOfPresentIllness`.
- Restore those keys in `restoreDraft`; include them in `draftPayload`.
- On save, merge `additionalConcern: additionalConcernPayload(...)` into the object already sent as monitoring data (follow-up schedules path). If the workspace sends schedules via top-level `followUpSchedules`, add `additionalConcern` as a sibling field that `toPayload` already folds into `monitoring_data` **or** pass `monitoringData: { additionalConcern }` only if `toPayload` merges it. Verify `toPayload` in `healthRecordService.js` (`monitoring_data: { ... }`). If it builds `monitoring_data` from known keys, add `additionalConcern` there — do not drop follow-up schedules.

Do **not** set `chiefComplaint` from BHC CC. Do **not** auto-open additional concern.

- [x] **Step 4: Run tests to verify they pass**

Run the Task 4 frontend tests and `php artisan test --filter=RhuItrConsultationTest`  
Expected: PASS. Existing required-chief-complaint test still fails closed if CC blank.

- [x] **Step 5: Commit only if the user asks** ? Skipped; no commit requested.

---

### Task 5: In-ITR full referral slip overlay

**Files:**
- Modify: `frontend/src/pages/rhu/RhuConsultationWorkspace.jsx`
- Modify: `frontend/src/pages/rhu/RhuConsultationWorkspace.test.js`
- Reuse: `ModalShell`, `BhcReferralSlip`, `useRhuReferralSlipData`

**Interfaces:**
- Consumes: same slip query as Task 4 (one query, two views)
- Produces: overlay open/close; no route change

- [x] **Step 1: Write the failing source test**

```js
test("referred ITR opens the BHC slip in ModalShell without navigating to the slip route", () => {
  assert.match(workspace, /ModalShell/);
  assert.match(workspace, /BhcReferralSlip/);
  assert.match(workspace, /View Full Referral Slip/);
  assert.doesNotMatch(workspace, /reviewReferralSlipPath/);
  assert.doesNotMatch(workspace, /navigate\(.*referrals/);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test src/pages/rhu/RhuConsultationWorkspace.test.js`  
Working directory: `frontend`  
Expected: FAIL on `ModalShell` / `BhcReferralSlip`

- [x] **Step 3: Implement overlay**

```jsx
{referralSlipOpen && (
  <ModalShell
    open
    size="wide"
    title="BHC Referral Slip"
    onClose={() => setReferralSlipOpen(false)}
    bodyClassName="max-h-[min(80vh,720px)] overflow-y-auto"
  >
    <BhcReferralSlip referral={referral} record={record} patient={patient} />
  </ModalShell>
)}
```

`RhuBhcReferralReference` calls `onViewFullSlip`. Overlay stays mounted inside the workspace so `consultationUuid`, visit id, step, and draft are untouched. Keep the standalone route.

- [x] **Step 4: Run tests**

Run: `node --test src/pages/rhu/RhuConsultationWorkspace.test.js src/pages/rhu/RhuReferralSlip.test.js` (add a source test on `RhuReferralSlip.jsx` that it still renders `BhcReferralSlip` and `DashboardLayout` if that file exists; otherwise add `RhuReferralSlip.test.js` asserting the route page still imports `BhcReferralSlip` and the back link to Referrals)

- [x] **Step 5: Commit only if the user asks** ? Skipped; no commit requested.

---

### Task 6: Previous BHC vitals on referred Physical Examination

**Files:**
- Create: `frontend/src/components/features/health-records/wizard/RhuPreviousVitalsReference.jsx`
- Create: `frontend/src/components/features/health-records/wizard/RhuPreviousVitalsReference.test.js`
- Modify: `frontend/src/pages/rhu/RhuConsultationWorkspace.jsx`

**Interfaces:**
- Consumes: `referralSlipModel(referral, record).vitals`, BHC name, linked record `date_recorded`
- Produces: read-only reference; does not call `setSystolicBp` / other vital setters

- [x] **Step 1: Write the failing tests**

```js
test("previous BHC vitals are read-only and never rendered as named RHU vital inputs", () => {
  assert.match(source, /Previous BHC vital signs/);
  assert.doesNotMatch(source, /name="systolicBp"/);
  assert.doesNotMatch(source, /onChange/);
  assert.match(source, /Not recorded/);
});
```

Workspace test:

```js
test("referred assessment shows previous BHC vitals without prefilling today's inputs", () => {
  assert.match(workspace, /RhuPreviousVitalsReference/);
  assert.match(workspace, /PreviousBodyFindings/);
});
```

- [x] **Step 2: Run tests to verify they fail**

- [x] **Step 3: Implement and compose above today's vital grid**

Use `referralSlipModel(...).vitals`. Caption includes source BHC and recording date from the linked record (`date_recorded` / `created_at`). Render only when `isReferredRhuVisit(visit)`. Do not `useEffect` copy vitals into RHU state.

Keep `PreviousBodyFindings` with title `Previous Findings Reassessment`. Add the caption that BHC findings are previous and today's findings are the RHU exam/body map.

- [x] **Step 4: Run tests**

- [x] **Step 5: Commit only if the user asks** ? Skipped; no commit requested.

---

### Task 7: Referral Details = BHC slip + Return Slip

**Files:**
- Create: `frontend/src/components/features/patients/profile/ReferralReturnSlipSection.jsx`
- Create: `frontend/src/components/features/patients/profile/ReferralReturnSlipSection.test.js`
- Modify: `frontend/src/pages/rhu/RhuReferralSlip.jsx`
- Modify: `frontend/src/pages/bhc/ReferralDetails.jsx` (replace local `ReturnSlip` with the shared section; keep BHC pending sentence compatible)
- Modify: `frontend/src/pages/bhc/ReferralDetails.test.js` if pending copy assertions exist — update RHU page tests, keep BHC tests green

**Interfaces:**
- Consumes: `referral.feedback || referral.returnSlip`
- Produces: read-only Return Slip; pending state when feedback missing

Pending copy for RHU details: `Pending feedback. The return slip will appear here once submitted.`  
BHC can keep `Awaiting RHU feedback. The return slip will appear here once submitted.` via an optional `pendingMessage` prop defaulting to the BHC sentence so BHC tests stay stable.

- [x] **Step 1: Write failing tests**

```js
test("RHU referral details page stacks the BHC slip and return slip without nested tabs", () => {
  assert.match(page, /BhcReferralSlip/);
  assert.match(page, /ReferralReturnSlipSection/);
  assert.doesNotMatch(page, /<Tabs/);
  assert.doesNotMatch(page, /FeedbackReturnSlip/);
});
```

```js
test("return slip section shows pending feedback when empty", () => {
  assert.match(section, /Pending feedback|Awaiting RHU feedback/);
});
```

- [x] **Step 2: Run tests to verify they fail**

- [x] **Step 3: Extract `ReferralReturnSlipSection` from BHC `ReturnSlip`**

Move the existing `dl` field mapping (snake_case and camelCase) unchanged. RHU details page:

```jsx
<h1 className="text-lg font-semibold">Referral Details</h1>
<BhcReferralSlip ... />
<ReferralReturnSlipSection referral={referral} pendingMessage="Pending feedback. The return slip will appear here once submitted." />
```

Keep back link `Back to Patient Profile → Referrals`. Keep permission gating. Do not add queue status to this page.

- [x] **Step 4: Run** `node --test src/pages/bhc/ReferralDetails.test.js src/pages/rhu/RhuReferralSlip.test.js src/components/features/patients/profile/ReferralReturnSlipSection.test.js src/components/features/patients/profile/PatientReferralsTab.test.js`

Expected: PASS

- [x] **Step 5: Commit only if the user asks** ? Skipped; no commit requested.

---

### Task 8: Focused regression and browser acceptance

**Files:** none except test additions required to close gaps found while running.

- [x] **Step 1: Backend regression**

Working directory: `backend`

```
php artisan test --filter=RhuVisitReturnCheckInTest
php artisan test --filter=RhuReferralArrivalTest
php artisan test --filter=RhuVisitApiTest
php artisan test --filter=RhuVisitCloseTest
php artisan test --filter=RhuVisitStartTest
php artisan test --filter=RhuItrConsultationTest
```

Expected: PASS. Close still waiting-only. Start/Resume still mint/keep `consultation_uuid`. Arrival still one visit per receive. Additional concern isolated from `chief_complaint`.

- [x] **Step 2: Frontend regression**

Working directory: `frontend`

```
node --test src/utils/rhuVisitReferral.test.js src/pages/rhu/RhuConsultationWorkspace.test.js src/components/features/health-records/wizard/RhuBhcReferralReference.test.js src/components/features/health-records/wizard/RhuPreviousVitalsReference.test.js src/components/features/patients/profile/PatientReferralsTab.test.js src/pages/bhc/ReferralDetails.test.js src/utils/referralSlipView.test.js src/utils/rhuCarePlan.test.js
```

Expected: PASS. `rhuCarePlan.test.js` still covers referred vs walk-in next actions; referred identity now includes linked `referral.id`.

- [x] **Step 3: Production build**

Working directory: `frontend`  
Run: `npm run build`  
Expected: PASS (existing large-bundle warning allowed)

- [ ] **Step 4: Browser acceptance (required before calling UI done)**

**Session verification note (2026-10-31):** Browser inventory has no apps or browsers. Live desktop/mobile interactions and actual draft-resume round-trip remain unverified; do not call this step done. Automated API/render tests passed; see `docs/rhu-referral-aware-progress.md`.

Use the Cursor browser against local `php artisan serve` + Vite. Do not finish on screenshots alone.

1. **First-arrival referred ITR:** Receive BHC referral → Start Consultation → Interview shows BHC panel + empty today's CC. Type CC. Open View Full Referral Slip. Confirm overlay, Escape closes, step/draft remain. Save still requires CC.
2. **Walk-in ITR:** No BHC panel. CC/HPI labels unchanged.
3. **Assessment:** Previous BHC vitals visible and not copied into inputs. PreviousBodyFindings still works. Enter new RHU BP.
4. **+ Add Another Concern:** Hidden until clicked; optional; appears in saved record monitoring data only.
5. **Profile Referrals:** Received chip says Received. View Details opens slip + pending/complete Return Slip. Writable feedback form still only at `/rhu/feedback/:trackingId`.
6. **Return path:** Receive → close Left before consultation → check in from patient profile → new waiting visit `source=referral` with same referral → Start Consultation shows BHC panel. Closed visit remains in history.
7. **True walk-in:** Patient with no Received referral checks in as `walk_in`.
8. **No-Show:** Late arrival still requires remarks; reschedule does not become Received.
9. **In-progress ITR:** Start Consultation then leave the page and Resume — same visit id and `consultation_uuid`. Close from queue while `in_consultation` still refused.
10. **Permissions:** User without `clinical.history` does not see clinical slip fields (existing RestrictedArea).
11. **Desktop and ~375px:** overlay scrolls; Referrals tab cards still show View Details.

If browser tools are unavailable, say so and keep curl/PHPUnit/node coverage; do not claim UI verification.

- [x] **Step 5: Commit only if the user asks** ? Skipped; no commit requested.

---

## 7. Focused tests and browser scenarios

Covered in Tasks 1–8. Highest-risk regressions:

- `normalizeHealthRecordStatus` still used for **health records**, not referrals.
- Walk-in check-in of a patient with no Received referral stays walk-in.
- Two eligible Received referrals → no silent pick.
- `referral-{id}` unique key not reused on return (new check_in_key).
- ITR overlay does not unmount the wizard.
- Additional concern never written to `chief_complaint` or the BHC referral row.
- BHC vitals never assigned to RHU vital state.
- Return Slip form not duplicated on details.
- `linkActiveVisit` race test still keeps `source=walk_in` when receive links an **active** walk-in; ITR still treats it as referred via `referral.id`.

---

## 8. Complexity, risks, blockers

| Item | Level | Notes |
|---|---|---|
| Overall | Medium | Mostly compose existing slip/ITR/queue. Check-in inference is the only behavioral backend change |
| Schema | None recommended | Flag any request to add `additional_concern` columns or a discontinue-ITR audit table — out of scope |
| Return check-in | Medium-high | Wrong eligibility would mis-label true walk-ins or skip referred returns |
| Multiple Received referrals | Product | **Assumed** rare; this plan leaves them as walk-in rather than picking one. Confirm if staff should choose |
| `source=walk_in` + `referral_id` set | Low | Existing receive-links-active-walk-in. ITR uses `referral.id`, so the BHC panel still appears |
| Workspace size | Medium | `RhuConsultationWorkspace.jsx` is already large; new UI goes in extracted components |
| shadcn Field/Dialog | Avoid | Not installed; ModalShell and Card are enough. Do not `npx shadcn add dialog` |
| Discontinue in-progress ITR | Out of scope | Close is waiting-only; Resume preserves uuid/draft. An audited discontinue would be a later spec |
| Uncommitted prior work on this branch | Process | Do not revert BHC→RHU stabilization or waiting-referral work while implementing this plan |

**Blocker for complete referred ITR identity:** Task 2. Without it, return visits look like walk-ins and skip the BHC panel. First-arrival referred visits do not need Task 2.

**Assumptions (call out if wrong before coding):**

1. Today's required RHU field remains `chief_complaint` (relabeled), not a new column.
2. Optional additional concern belongs in `monitoring_data`, not a second health record.
3. Staff should not pick among multiple eligible Received referrals in this iteration.
4. Overlay uses `ModalShell`, not a new Dialog package.
5. Execution stays on `itr-patient-history` without commit unless asked.

---

## Spec coverage checklist

1. Referral-aware interview — Task 4  
2. Full slip overlay — Task 5  
3. Physical examination previous vitals — Task 6  
4. Profile Referrals tab / details — Tasks 1 and 7  
5. Returning referred patient — Task 2 (before ITR identity is complete)  
6. Preserve existing workflows — Task 8 + constraints  
7. Smallest persistence — Task 4 additionalConcern rules; no schema  
8. `chiefComplaint` required / drafts — Task 4 restore + existing validation  
)
</manually_attached_skills>
</think>

The plan is saved. Presenting it for review without implementing.