# RHU Walk-in Check-in UI polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (single tightly coupled UI task) or subagent-driven-development if split.

**Goal:** Compact Walk-in Check-in layout matching AKAY Incoming Referrals / Medicine sheets without changing workflow behavior.

**Architecture:** Move Register CTA into the page header; wrap search/results in a Module-style **Find a Patient** sheet inside `WalkInCheckInPanel`. Reuse `SearchField`, `Button`, and existing check-in logic.

**Tech:** React frontend only.

**Spec:** `docs/superpowers/specs/2026-11-05-rhu-walk-in-check-in-ui-polish-design.md`

## Global Constraints

- Visual layout and styling only. Preserve search, confirm check-in, duplicate handling, registration path, permissions, APIs.
- Do not modify Today's Queue, Patient Details, or unrelated modules.
- Match AKAY: `text-[17px]` page title, brand primary for Register, card `rounded-xl` + hairline + white sheet.

---

### Task 1: Header Register CTA + Find a Patient card

**Files:**
- Modify: `frontend/src/pages/rhu/RhuWalkInCheckIn.jsx`
- Modify: `frontend/src/components/features/rhu-queue/WalkInCheckInPanel.jsx`

**Interfaces:**
- Page owns header + `navigate(registerForWalkInCheckInPath())` brand button.
- Panel prop `showRegisterAction` defaults false (or remove register footer entirely since page-only).
- Card title **Find a Patient**; subtitle **Search existing records before registering a new patient.**
- Idle copy stays ≥2 characters; tighten padding to `py-5` / drop forced `min-h-[200px]`.
- Result details may include `philhealth_number` / `contact_number` when present on the row (display only).

- [ ] **Step 1:** Restructure `RhuWalkInCheckIn.jsx` header row with title/subtitle left and brand **Register New Patient** right (`Button variant="brand"`, `Plus` icon), matching Today's Queue former CTA / Incoming Referrals action alignment (`sm:flex-row sm:items-start sm:justify-between`).
- [ ] **Step 2:** In `WalkInCheckInPanel`, remove the bottom Register button; wrap search + results (not selected sheet) in a card:

```jsx
<section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm shadow-black/[0.02]">
  <div className="border-b border-neutral-100 px-3.5 py-3 sm:px-4">
    <h2 className="text-sm font-semibold text-ink-800">Find a Patient</h2>
    <p className="mt-1 text-xs text-neutral-500">
      Search existing records before registering a new patient.
    </p>
  </div>
  <div className="space-y-3 px-3.5 py-3 sm:px-4">
    <SearchField ... className="max-w-xl" />
    <div aria-live="polite">...</div>
  </div>
</section>
```

- [ ] **Step 3:** Compact state messages (`py-5 text-center text-[13px]`…); keep selected-patient sheet above the Find card.
- [ ] **Step 4:** Run `cd frontend && npm run test:walk-in` — Expected: PASS (utils unchanged).
- [ ] **Step 5: Commit** `fix(rhu-intake): polish Walk-in Check-in page layout`
