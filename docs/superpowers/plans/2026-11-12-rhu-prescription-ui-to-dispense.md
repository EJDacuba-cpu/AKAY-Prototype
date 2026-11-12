# RHU Prescription UI + To Dispense Focus Plan

> Execute inline; no commit/push. Continue from Form 4B CREATE cleanup.

**Goal:** Clean diagnosis-card prescription editing (no Linked Diagnosis checkbox; stable layout; TB Case Number for TB Disease only) and medicine-focused To Dispense review of structured orders.

**Architecture:** Keep visit-level `monitoring_data.prescriptions[]` with automatic `diagnosisIds` from the card that opened Add. Store optional physician `tbManagement.tbCaseNumber` without creating `TbTreatmentCase`. Extend To Dispense queue with structured medicine lines only (no disease chrome).

## Task 1
1. Remove Linked Diagnosis checkbox; keep auto-link + multi-link data.
2. Span prescription editor full-width under evidence grid when open; tighten editor CSS.
3. Add optional TB Case Number for `tb_disease` in assessment; BE validate format/duplicates; drafts + finalize.

## Task 2
1. Extend `prescriptionDisplayText` / queue payload with structured medicine summaries.
2. Review modal shows medicine fields only.
3. Preserve Confirm Given / FEFO / permissions.
