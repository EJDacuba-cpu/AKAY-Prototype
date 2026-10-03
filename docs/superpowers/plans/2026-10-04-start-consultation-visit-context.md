# Start Consultation Visit Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before the New Consultation workspace opens, a light Start Consultation modal asks for the visit context: **New / General Consultation** or **Follow-up Existing Monitoring**. For a follow-up, the worker picks one or more monitored conditions, and those conditions go into the consultation as conditions addressed in this visit.

**Architecture:** This revises the **existing** `StartConsultationModal` and its "continue" route. It does not add a parallel flow. Today the modal lists pending follow-ups and unscheduled monitoring, and it only opens when one of those exists. After this change it always opens before a new consultation (a draft still resumes directly). It shows the two context choices, and the follow-up choice lists *active monitoring records only*. A follow-up selection navigates to the existing `mode=continue&monitoringIds=…` route. The workspace already seeds Care Plan's "continuing monitoring" rows from that route, and those rows are not diagnoses. Pending follow-up tasks linked to a selected condition are fulfilled by the visit, as they are today. **No backend change**: `GET /patients/{id}/care-overview` already returns every active monitoring record (unscheduled ones, plus the ones attached to pending follow-ups).

**Tech Stack:** React 19 + react-router + TanStack Query (frontend), `node --test` for pure utils, Laravel API unchanged.

**Spec:** the user request of 2026-10-04 (quoted in Global Constraints below).

## Global Constraints

- The modal only establishes visit context. It does **not** replace or duplicate the Barangay Health Services sidebar. That sidebar (Maternal Care, Family Planning, EPI, …) stays unchanged and independently selectable in the workspace.
- Two choices, exact labels: **"New / General Consultation"** (new complaint, concern, or ordinary consultation) and **"Follow-up Existing Monitoring"** (a visit reviewing an already monitored BHC condition).
- The follow-up list shows **only conditions with an active monitoring record** (`condition_monitorings.status = active`). Past Medical History / Current Conditions are never listed.
- Follow-up requires **at least one** selected condition before Start is enabled.
- General needs no condition selection and goes straight to the normal consultation form.
- No clinical recommendations, no disease prioritisation (conditions are listed alphabetically), no auto-selection: neither context is preselected and no condition is pre-ticked.
- Selected conditions are carried as continued monitoring (`care_plan.continued_monitoring_ids`). They are **not** added to `diagnoses`.
- Memory rule: no clinical suggestions. Copy is factual only ("Monitoring since …", "Follow-up due …").
- The working tree has uncommitted WIP in `ConsultationWorkspace.jsx`, `CarePlanSection.jsx`, `carePlanWorkspace.js` and others. Edit those files surgically and stage **only** the hunks this plan adds (`git add -p`). Never `git checkout`/`git stash` them.

## Decisions made (confirm at review)

1. **The modal always opens** for Start Consultation from the patient profile header and the Program Participants tab when there is no draft. Without monitored conditions, "Follow-up Existing Monitoring" is disabled with the hint *"No conditions under active BHC monitoring."* If the care overview fails to load, the modal still opens and the follow-up choice is disabled with *"Monitored conditions could not be loaded."*
2. **AddPatient's post-registration "Start Consultation" keeps going straight to a general consultation.** A just-registered patient cannot have monitoring.
3. **Pending follow-ups:** a pending follow-up task that links a selected condition is fulfilled by this visit, as the old "Continue Selected" did. A follow-up's *other* conditions are **not** pulled in, because that would be auto-selecting. Example: if HTN+DM share a follow-up and only HTN is picked, the follow-up is fulfilled and DM stays active, now without a follow-up. Follow-up tasks with **no** linked condition no longer appear in this modal. They stay reachable from Follow-ups → "Record Visit", which is unchanged.
4. **Visit context is derived, not stored.** "Follow-up" means the consultation has continued monitoring. Drafts already persist `continued_monitoring_ids`, so resume works unchanged. No migration or new field.
5. In the workspace, the Care Plan heading "Continuing monitoring" becomes **"Monitored conditions addressed in this visit"**. A read-only note above the Diagnosis field names those conditions so they are not re-entered as diagnoses.

## Review Focus

- **The overview lists the same monitoring under two pending follow-ups** (overlapping tasks): the condition is listed once, and both tasks are continued. → test in Task 1 (`monitoredConditionOptions` dedupes; `resolveContinuedCare` links both).
- **A selected monitoring is stopped or fulfilled between the modal and the workspace load:** it is dropped with the existing "no longer active" toast, and the consultation still opens as general. → covered by existing `resolveContinuedCare` drop logic; Task 1 adds a linked-follow-up variant.
- **Record Visit from the Follow-ups page** (`followUpIds` only) must behave exactly as before, still pulling in the follow-up's conditions. → regression test in Task 1.
- **The worker switches back from Follow-up to General after ticking conditions:** Start must navigate to the general route with no `monitoringIds`. → test in Task 1 (`visitContextToRoute` ignores ids for general).
- **A double click on Start, or a draft created in another tab:** Resume still wins, because the hook keeps `needsStartModal: !draft`. → test in Task 2 (`startConsultationAction`).

---

### Task 1: Visit-context helpers and linked follow-ups

**Files:**
- Modify: `frontend/src/utils/startConsultation.js`
- Modify: `frontend/src/utils/continuedCare.js`
- Test: `frontend/src/utils/startConsultation.test.js`, `frontend/src/utils/continuedCare.test.js`
- Modify: `frontend/package.json` (add `"test:start-consultation": "node --test src/utils/startConsultation.test.js src/utils/continuedCare.test.js"`)

**Interfaces:**
- Produces (in `startConsultation.js`):
  - `export const VISIT_CONTEXT = { GENERAL: "general", MONITORING: "monitoring_follow_up" }`
  - `monitoredConditionOptions(overview) -> Array<{ monitoringId: number, conditionName: string, startedAt: string, followUp: { dueDate: string, isOverdue: boolean } | null }>`: every active monitoring from `activeMonitoringsFromOverview`, deduped by id and sorted by `conditionName` (`localeCompare`, base sensitivity). `followUp` is the earliest-due pending task linking it, or `null`.
  - `canStartVisit(context, monitoringIds) -> boolean`: `GENERAL` → true; `MONITORING` → `monitoringIds.length > 0`; anything else → false.
  - `visitContextToRoute({ patientId, context, monitoringIds = [] }, basePath = "/bhc") -> string`: `GENERAL` → `buildPatientConsultationPath(patientId, basePath)`; `MONITORING` → `${basePath}/health-records/add?patientId=…&mode=continue&monitoringIds=…` (no `followUpIds`).
  - `needsStartModal` is **removed**. Its only caller is the hook in Task 2.
- Produces (in `continuedCare.js`): `resolveContinuedCare(overview, { …, includeLinkedFollowUps = false })`. When true, every pending task whose `conditions` link any id in the **passed `monitoringIds`** is continued, appended after the explicit `followUpIds`, deduped. There is no cascade through those tasks' other conditions unless `includeFollowUpConditions` also applies to explicitly passed `followUpIds`.

- [ ] **Step 1: Write the failing tests**

In `startConsultation.test.js`, replace the `needsStartModal` test and add:

```js
const overview = {
  pendingFollowUps: [
    { id: 11, dueDate: "2026-10-01", isOverdue: true, sourceHealthRecordId: 90,
      conditions: [{ monitoringId: 4, conditionName: "Hypertension" }, { monitoringId: 5, conditionName: "Diabetes Mellitus" }] },
    { id: 12, dueDate: "2026-10-20", isOverdue: false, sourceHealthRecordId: 91,
      conditions: [{ monitoringId: 4, conditionName: "Hypertension" }] },
  ],
  monitoringWithoutFollowUp: [{ id: 7, conditionName: "Asthma", startedAt: "2026-01-02" }],
};

test("lists each active monitoring once, alphabetically, with its earliest follow-up", () => {
  assert.deepEqual(monitoredConditionOptions(overview).map((o) => [o.monitoringId, o.conditionName, o.followUp?.dueDate ?? null]), [
    [7, "Asthma", null], [5, "Diabetes Mellitus", "2026-10-01"], [4, "Hypertension", "2026-10-01"],
  ]);
  assert.deepEqual(monitoredConditionOptions(null), []);
});

test("follow-up needs a condition; general never does; no context cannot start", () => {
  assert.equal(canStartVisit(VISIT_CONTEXT.GENERAL, []), true);
  assert.equal(canStartVisit(VISIT_CONTEXT.MONITORING, []), false);
  assert.equal(canStartVisit(VISIT_CONTEXT.MONITORING, [4]), true);
  assert.equal(canStartVisit(null, [4]), false);
});

test("visit context becomes a route; general drops any ticked ids", () => {
  assert.equal(visitContextToRoute({ patientId: 17, context: VISIT_CONTEXT.GENERAL, monitoringIds: [4] }),
    "/bhc/health-records/add?patientId=17&mode=new");
  assert.equal(visitContextToRoute({ patientId: 17, context: VISIT_CONTEXT.MONITORING, monitoringIds: [4, 7] }),
    "/bhc/health-records/add?patientId=17&mode=continue&monitoringIds=4%2C7");
});
```

In `continuedCare.test.js` add, using the same `overview` shape:

```js
test("linked follow-ups of selected monitoring are continued without their other conditions", () => {
  const r = resolveContinuedCare(overview, { monitoringIds: [4], includeFollowUpConditions: true, includeLinkedFollowUps: true });
  assert.deepEqual(r.continuedFollowUpTaskIds, [11, 12]);
  assert.deepEqual(r.continuedMonitorings.map((m) => m.id), [4]);   // Diabetes (5) NOT pulled in
});

test("Record Visit (follow-up ids only) still continues the follow-up's conditions", () => {
  const r = resolveContinuedCare(overview, { followUpIds: [11], includeFollowUpConditions: true, includeLinkedFollowUps: true });
  assert.deepEqual(r.continuedFollowUpTaskIds, [11]);
  assert.deepEqual(r.continuedMonitorings.map((m) => m.id).sort(), [4, 5]);
});

test("a selected monitoring that is no longer active is dropped with its links", () => {
  const r = resolveContinuedCare(overview, { monitoringIds: [99], includeLinkedFollowUps: true });
  assert.deepEqual(r.continuedFollowUpTaskIds, []);
  assert.deepEqual(r.droppedMonitoringIds, [99]);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd frontend && npm run test:start-consultation`
Expected: FAIL. `monitoredConditionOptions` / `canStartVisit` / `visitContextToRoute` are not exported, and the linked follow-up is not continued.

- [ ] **Step 3: Implement the helpers in `startConsultation.js` and the `includeLinkedFollowUps` option in `continuedCare.js`**

`startConsultation.js` imports `activeMonitoringsFromOverview` from `./continuedCare.js` and `buildPatientConsultationPath` from `./consultationRoute.js`. Keep `selectionToRoute` and `startConsultationAction` (Follow-ups "Record Visit" still uses `selectionToRoute`).

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd frontend && npm run test:start-consultation`
Expected: PASS, with all existing `continuedCare` tests still green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/startConsultation.js frontend/src/utils/startConsultation.test.js frontend/src/utils/continuedCare.js frontend/src/utils/continuedCare.test.js frontend/package.json
git commit -m "feat(start-consultation): visit-context helpers and linked follow-ups for monitored conditions"
```

---

### Task 2: Revised Start Consultation modal and its two callers

**Files:**
- Rewrite: `frontend/src/components/features/patients/profile/StartConsultationModal.jsx`
- Modify: `frontend/src/hooks/usePatientConsultation.js`
- Modify: `frontend/src/components/features/patients/profile/ConsultationActions.jsx` (`useConsultationActions`, around lines 128-145)
- Modify: `frontend/src/components/features/programs/ParticipantsTab.jsx` (around lines 68-82, plus the doc comment at line 27)
- Test: `frontend/src/utils/startConsultation.test.js` (action test)

**Interfaces:**
- Consumes: `VISIT_CONTEXT`, `monitoredConditionOptions`, `canStartVisit`, `visitContextToRoute` (Task 1).
- Produces: `<StartConsultationModal overview={CareOverview|null} overviewUnavailable={boolean} onStart={({ context, monitoringIds }) => void} onCancel={() => void} />`. Mount it only while open, so each opening starts empty. `onContinue` and `onStartNew` are removed.
- Hook result: `needsStartModal: !draft` (no longer depends on the overview), plus `careOverviewUnavailable: careOverviewQuery.isError || !canReadCareOverview`.

- [ ] **Step 1: Update the action test**

In the existing "what a Start Consultation action does" test, change the comments to say the modal opens for every new consultation. Assertions stay: `needsStartModal: true` → `"modal"`, and a draft (`needsStartModal: false`) → `"link"`. Run `npm run test:start-consultation`. Expected: PASS (the behaviour lives in the hook; this pins the contract).

- [ ] **Step 2: Hook**

In `usePatientConsultation.js`, set `needsStartModal: !draft` and add `careOverviewUnavailable`. Keep `isPending` waiting on the overview, so the modal opens with its list ready. Drop the `needsStartModal` import and update the doc comment.

- [ ] **Step 3: Modal**

Inside `ModalShell` (`title="Start Consultation"`, `size="md"`), render a `role="radiogroup"` with an `aria-label` of "Visit context". It holds two bordered option cards (sharp corners, 1px `#E5E7EB` border, selected = `border-[#DC2626]`, matching the current Row styling and `accent-[#DC2626]`):

| Option | Label | Description |
|---|---|---|
| general | New / General Consultation | A new complaint, concern, or ordinary consultation. |
| monitoring | Follow-up Existing Monitoring | Reviewing a condition already monitored at this BHC. |

- Nothing is preselected.
- The follow-up radio is disabled when `monitoredConditionOptions(overview)` is empty. Its hint is then "No conditions under active BHC monitoring.", or "Monitored conditions could not be loaded." when `overviewUnavailable`.
- When follow-up is selected, reveal under it the heading **"Monitored conditions addressed in this visit"** and one checkbox row per option. The row title is `conditionName`. The secondary lines are `Monitoring since {startedAt}` and `Follow-up due {dueDate}{isOverdue ? " · Overdue" : ""}`. Nothing is pre-ticked.
- If any ticked row has a `followUp`, show one muted line under the list: "Pending follow-ups for the selected conditions are recorded as attended when this consultation is saved."
- If follow-up is chosen with nothing ticked, show the inline helper "Select at least one monitored condition." (`text-xs text-slate-500`, not an error colour until Start is attempted).
- Footer: `Cancel` and primary `Start Consultation`. Start is disabled unless `canStartVisit(context, monitoringIds)`, and on click it calls `onStart({ context, monitoringIds })`.
- Copy must not mention or duplicate Barangay Health Services.

- [ ] **Step 4: Callers**

In `ConsultationActions.jsx` and `ParticipantsTab.jsx`, replace `onStartNew`/`onContinue` with `onStart={({ context, monitoringIds }) => navigate(visitContextToRoute({ patientId, context, monitoringIds }))}` and pass `overviewUnavailable={consultation.careOverviewUnavailable}`. Drop now-unused imports (`buildPatientConsultationPath`, `selectionToRoute`) where they become unused. Update the ParticipantsTab doc comment.

- [ ] **Step 5: Verify**

Run: `cd frontend && npm run lint && npm run build`
Expected: no new lint errors in the touched files, and the build succeeds.

Then run the app (`run` skill) and open a patient with active HTN monitoring:
1. Start Consultation → the modal shows both choices with none selected, and Start is disabled.
2. Pick Follow-up → Hypertension is listed and Start stays disabled until it is ticked.
3. Tick it, then Start → the URL has `mode=continue&monitoringIds=<id>`.

Repeat with a patient who has no monitoring: Follow-up is disabled with its hint, and General → `mode=new`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/features/patients/profile/StartConsultationModal.jsx frontend/src/hooks/usePatientConsultation.js frontend/src/components/features/patients/profile/ConsultationActions.jsx frontend/src/components/features/programs/ParticipantsTab.jsx frontend/src/utils/startConsultation.test.js
git commit -m "feat(start-consultation): choose General or Follow-up Existing Monitoring before the workspace opens"
```

---

### Task 3: Carry the selected conditions into the workspace

**Files:**
- Modify: `frontend/src/pages/bhc/ConsultationWorkspace.jsx`. Line ~1580 is the `resolveContinuedCare` call. Near line ~4665 (`<DiagnosisListField`) goes the read-only note. **WIP file: stage only these hunks.**
- Modify: `frontend/src/components/features/health-records/wizard/CarePlanSection.jsx:115`, heading copy. **WIP file: stage only this hunk.**
- Create: `frontend/src/components/features/health-records/wizard/MonitoredConditionsNote.jsx`

**Interfaces:**
- Consumes: `resolveContinuedCare(..., { includeLinkedFollowUps })` (Task 1); the existing `continuedMonitorings` state (`{ id, conditionName, … }[]`).
- Produces: `<MonitoredConditionsNote conditions={continuedMonitorings} />`. It renders nothing when the list is empty.

- [ ] **Step 1: Seed linked follow-ups**

In `loadContinuedCare`, pass `includeLinkedFollowUps: !selection.restored` next to the existing `includeFollowUpConditions: !selection.restored`. A resumed draft already stored its task ids, so nothing changes there.

- [ ] **Step 2: Read-only note above the diagnosis field**

`MonitoredConditionsNote` is a bordered `bg-[#F9FAFB]` block in the same style as Care Plan's empty-state paragraph. Its text is: **"Follow-up of monitored conditions:"** followed by the condition names joined with ", ", then *"Their care plan is set in Care Plan & Next Steps. Add a diagnosis here only for a new concern."*

- It has no controls, does not suggest anything, and does not change `diagnoses`.
- Render it directly above `<DiagnosisListField` with `conditions={continuedMonitorings}`.

- [ ] **Step 3: Care Plan heading**

At `CarePlanSection.jsx:115`, change "Continuing monitoring" to "Monitored conditions addressed in this visit".

- [ ] **Step 4: Verify**

Run: `cd frontend && npm test --if-present; npm run test:start-consultation && npm run test:consultation-steps && node --test src/utils/carePlan.test.js src/utils/carePlanWorkspace.test.js && npm run build`
Expected: all PASS, and the build succeeds.

Run the app and take the follow-up route from Task 2:
- The Barangay Health Services sidebar is unchanged and every service is still selectable.
- The Assessment step shows the note with "Hypertension".
- Care Plan lists Hypertension under "Monitored conditions addressed in this visit", with no diagnosis row added.
- Saving with zero diagnoses succeeds. The saved record links the monitoring visit, and its pending follow-up shows as fulfilled on the Follow-ups page.
- A general route shows no note.

- [ ] **Step 5: Commit, staging only this task's hunks**

```bash
git add frontend/src/components/features/health-records/wizard/MonitoredConditionsNote.jsx
git add -p frontend/src/pages/bhc/ConsultationWorkspace.jsx frontend/src/components/features/health-records/wizard/CarePlanSection.jsx
git commit -m "feat(consultation): carry monitored conditions from Start Consultation as addressed in this visit"
```

---

### Task 4: Backend regression check (no code change expected)

- [ ] **Step 1:** Run `cd backend && php artisan test --filter="CareOverview|CarePlanSave|CarePlanReferralFollowUp"`.
  Expected: PASS. These tests cover continued monitoring and continued follow-up task fulfilment, which the new route reuses unchanged.
- [ ] **Step 2:** If any fail, stop and debug (superpowers:systematic-debugging). Do not change backend behaviour without coming back to the user.
