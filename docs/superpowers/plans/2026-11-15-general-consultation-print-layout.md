# General Consultation Print Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a B&W A4 General Consultation print layout (RHU + BHC same structure; Diagnosis RHU-only), first as a standalone HTML preview, then wired into the React print document without changing other service prints.

**Architecture:** Phase 1 is a self-contained HTML proof. Phase 2 branches inside `BhcHealthRecordPrintDocument.jsx` when the record is General Consultation, rendering the approved markup/CSS; maternal/EPI/FP/TB paths stay as today.

**Tech Stack:** HTML/CSS print (`@page`, `@media print`); React JSX + existing print helpers in Phase 2.

---

## File map

| File | Responsibility |
|------|----------------|
| `docs/print-previews/general-consultation-record-print.html` | Phase 1 preview (RHU + BHC samples) |
| `docs/superpowers/specs/2026-11-15-general-consultation-print-layout-design.md` | Locked design |
| `frontend/src/components/features/health-records/BhcHealthRecordPrintDocument.jsx` | Phase 2 GC branch |
| `frontend/src/components/features/health-records/HealthRecordDetailsView.test.js` | Phase 2 print assertions |

---

### Task 1: Standalone HTML preview (Phase 1)

**Files:**
- Create: `docs/print-previews/general-consultation-record-print.html`

**Steps:**
1. Build one stylesheet: A4 18mm, black/white only, 11pt Arial/Helvetica, section keep-together, uppercase underlined headings, bordered vitals table, writing lines, signature footer.
2. RHU sample article: include Diagnosis with sample text; comment insertion points for facility, record, diagnosis, clinical fields.
3. BHC sample article: same layout without Diagnosis section.
4. Open in browser / Print Preview to verify margins and page breaks.

**Done when:** HTML opens, RHU shows Diagnosis, BHC does not, empty fields are blank/lines, no “Not recorded” or brand colors.

---

### Task 2: React GC print branch (Phase 2 — after HTML approval)

**Files:**
- Modify: `BhcHealthRecordPrintDocument.jsx`
- Modify: `HealthRecordDetailsView.test.js`

**Steps:**
1. Detect General Consultation; render GC layout (Diagnosis only when source role is RHU).
2. Leave non-GC / program sections on the existing path.
3. Update tests: GC print no longer requires “Medical EHR and Referral System”; RHU includes Diagnosis; BHC does not; empty ≠ “Not recorded” in GC path.

**Done when:** GC print matches HTML; other service prints unchanged; tests pass.
