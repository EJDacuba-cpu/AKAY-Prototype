# AKAY Reports Rework Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`) syntax. **Do not commit, push, merge, or deploy** (user constraint).

**Goal:** Four-item Reports nav, Morbidity/TCL filters, Clinic Ledger layout, RHU `reportIn`, ownership/linkage without data loss.

**Architecture:** Keep `buildBhcReport` / `buildRhuReport` engines. Add sidebar nav constants + URL alias normalization. Pages apply in-page Filter popovers that select the engine category. Enable RHU ITR `reportIn` validation + UI. Attempt RHU→BHC linked inclusion only on existing referral/verified-link surfaces; stop and report blockers rather than invent feeds.

**Tech Stack:** React (Vite), Laravel, existing `ListFilterPopover`, `ReportingEntries`, Jest/node:test + PHPUnit Feature tests.

## Global Constraints

- Preserve clinical and report data; no destructive migrations.
- Exact sidebar order: Referrals, Overview, TCL, Morbidity.
- Canonical `reportIn` only; no parallel reporting model.
- Do not redesign Referrals/Overview/TCL program fields or unrelated consultation behavior.
- No inventing disease classification or silent confirmation labels.
- No git commit/push/merge/deploy.

---

### Task 1: Reports navigation constants + sidebar + aliases

**Files:**
- Modify: `frontend/src/utils/bhcReporting.js`
- Modify: `frontend/src/utils/rhuReporting.js`
- Modify: `frontend/src/components/layout/sidebar/sidebarData.js`
- Modify: `frontend/src/utils/sidebarNavigation.js` (if active-match needs new keys)
- Modify: `frontend/src/utils/sidebarNavigation.test.js`
- Test: `frontend/src/utils/bhcReporting.test.js`, `rhuReporting.test.js`

- [ ] Add `REPORT_SIDEBAR_ITEMS` / `RHU_REPORT_SIDEBAR_ITEMS` (4 children).
- [ ] Add `normalizeReportNav` / program + morbidity filter helpers; map legacy types → nav + engine category.
- [ ] Point sidebar children at new items; default paths Overview.
- [ ] Update active-match + tests for order, aliases, no Notifiable/Surveillance children.
- [ ] Run focused frontend nav/reporting unit tests.

### Task 2: Morbidity + TCL Filter popovers on BHC/RHU report pages

**Files:**
- Create: `frontend/src/components/features/reports/ReportCategoryFilter.jsx` (or extend period filter pattern)
- Modify: `frontend/src/pages/bhc/BHCReports.jsx`
- Modify: `frontend/src/pages/rhu/RHUReports.jsx`
- Modify/create tests for filter Apply/Reset/dismiss behavior

- [ ] Morbidity Filter popover (All / Notifiable / Surveillance).
- [ ] TCL Filter popover (EPI / Maternal / Nutrition / FP).
- [ ] Wire applied filter → existing report builders; seed from URL aliases.
- [ ] Preserve Referrals + Overview without these filters (period/export/print only).

### Task 3: Layout polish (Clinic Ledger)

**Files:**
- Modify: `BHCReports.jsx`, `RHUReports.jsx`, `BhcReportCharts.jsx` as needed
- Follow root `DESIGN.md` + Impeccable craft floor

- [ ] Confirm 4 KPI row, 8/4 chart split, full-width summary + TCL/table.
- [ ] Compact pill controls; rectangular cards; responsive stack.

### Task 4: RHU Diagnosis `reportIn` checkboxes + backend allow

**Files:**
- Modify: `RhuDiagnosisCarePlanSection.jsx` (+ tests)
- Modify: RHU consultation draft/save/restore paths that strip `reportIn`
- Modify: `HealthRecordRequest.php` (allow `reportIn` on RHU ITR with destination rules)
- Modify: controller normalize path if RHU create skips `normalizeForSave`
- Feature/unit tests for save, draft, finalize

- [ ] UI checkboxes under each diagnosis.
- [ ] Persist through draft recovery and finalization.
- [ ] Do not weaken unrelated RHU prohibited fields.

### Task 5: Ownership / linkage / dedup

**Files:** reporting builders + any referral/link helpers; Feature tests

- [ ] Document or implement BHC inclusion of authorized linked RHU outcomes.
- [ ] If blocked by missing authorized cross-facility reporting feed, record exact blocker — do not invent workaround.
- [ ] Ensure no double-count when local + linked episode overlap (if implementable).

### Task 6: Verification

- [ ] Frontend unit tests (nav, filters, TCL, reportIn helpers, reporting).
- [ ] Backend Feature/Unit tests (RHU reportIn, drafts, facility isolation where covered).
- [ ] `npm run build` (frontend production).
- [ ] Screenshots BHC/RHU Morbidity + TCL at desktop and mobile widths.
- [ ] Final deliverable summary for user.
