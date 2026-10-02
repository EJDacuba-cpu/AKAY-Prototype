# AKAY Current State / Handoff

**Status date:** 2026-10-02

## Current Phase

**Documentation foundation before repository cleanup/audit**

The immediate goal is to establish a small canonical knowledge base for Claude Code before allowing broad cleanup or refactoring.

---

## Completed

- Confirmed that an existing AKAY system is already implemented.
- Confirmed that the repository contains separate `frontend/` and `backend/` areas.
- Confirmed that the existing `docs/` folder contains many older Markdown/SQL/project artifacts that must not automatically be treated as current.
- Established a plan-first workflow for Claude Code.
- Established interview/transcript evidence as the primary source for real BHC/RHU workflow.
- Established the current repository as the primary source for technical implementation.
- Limited use of the capstone paper to project context, scope/limitations, and Agile/methodology unless later approved otherwise.
- Created the first canonical AI-facing documentation set under `docs/ai/`.

---

## Next Recommended Task

### Repository Audit — READ ONLY

Claude Code should inspect the local repository and produce an audit report **without editing or deleting anything**.

The first audit should cover:

1. repository/folder structure;
2. frontend architecture;
3. backend architecture;
4. database/migrations;
5. API/data flow;
6. authentication and authorization structure;
7. tests/build/lint status;
8. existing documentation inventory;
9. temporary/generated artifacts;
10. likely dead/duplicate/outdated code;
11. obvious configuration risks;
12. areas that require deeper security review.

The report should distinguish:

- confirmed current;
- likely current;
- historical;
- generated/temporary;
- duplicate;
- suspicious;
- unknown.

No cleanup should happen until the developer approves a cleanup batch.

---

## Planned Workstreams After Audit

These are directional, not yet approved implementation tasks.

### 1. Documentation and repository cleanup

Goal:
- remove or archive approved obsolete artifacts;
- reduce conflicting documentation;
- identify dead/duplicate code;
- create a clean technical baseline.

### 2. UI consistency

Goal:
- define a minimalist AKAY design system first;
- standardize borders, radius, spacing, typography, cards, forms, tables, buttons, modal patterns, and statuses;
- then apply shared components consistently.

Do not redesign screens independently before the design system is approved.

### 3. Backend/data-flow cleanup

Goal:
- understand React -> API -> Laravel -> database flow;
- simplify unnecessary complexity;
- remove approved dead/duplicate paths;
- improve validation/error handling;
- make important code understandable to the developer.

### 4. Security/privacy review

Goal:
- authentication/session/token behavior;
- authorization/RBAC;
- facility isolation;
- patient-data visibility;
- API permissions;
- validation;
- CORS/CSRF/security headers;
- secrets/configuration;
- auditability;
- sensitive-response handling.

Security changes must be threat/requirement driven, not "add middleware until it looks secure."

### 5. Stabilization and testing

Goal:
- critical workflow tests;
- regression checks;
- build/lint cleanup;
- final documentation synchronization;
- controlled feature freeze before defense/deployment.

---

## Current Non-Negotiable Working Rule

For implementation tasks:

**Inspect -> Explain -> Plan -> Developer Approval -> Edit -> Test -> Document**

Do not skip the approval gate.

---

## Session Handoff Template

At the end of a substantial Claude Code session, update this section.

### Last task
Care Plan & Next Steps (spec: `docs/superpowers/specs/2026-09-30-care-plan-next-steps-design.md`): condition monitoring tables, the care-overview, the Start Consultation modal, one consultation step flow, per-diagnosis surveillance, an optional FBS measurement, and TB identified by data. Before that: per-diagnosis Morbidity / Notifiable reporting (2026-09-29).

### Changes made
- Monitoring: the Care Pathway enrollment layer is replaced by condition monitoring tables (`2026_09_30_000002_create_condition_monitoring_tables`). Follow-up tasks can now be fulfilled by a shared follow-up (`2026_09_30_000003_allow_shared_follow_up_fulfilment`).
- Care overview: one read of what a patient is being monitored for and which follow-ups are open, used by Care & Programs, Monitoring Details and the consultation.
- Start Consultation modal: choose what the visit continues (open follow-ups, monitorings) before the consultation opens; the selection seeds the Care Plan step.
- One step flow: Concern & Vital Signs (with the Barangay Health Services panel), Physical Exam & Assessment, Service Details (only when a service is selected), Actions Taken, Care Plan & Next Steps, Monitoring Details (only when monitoring is continued or started), Review & Confirm. TB is no longer a Visit Service.
- Barangay Health Services panel: Maternal Care, Family Planning and EPI as one flat list. "Primary" and "Make primary" appear only when two or more services are selected.
- Surveillance: per-diagnosis "Include in Surveillance" and a Surveillance Report replace the HFMD surveillance registry.
- FBS: optional Fasting Blood Sugar (mg/dL, 0-1000) under "Additional Measurements" on Concern & Vital Signs. Stored in `vital_signs.fbs`, shown on Review, saved in drafts. Recorded only: nothing is flagged, suggested or derived from it. The range check is `frontend/src/utils/fbs.js`.
- TB is identified by data (`tbRecords.isTbRecord`) everywhere, never by matching text.

### Tests/checks run
- Frontend: 305/305 node tests pass, eslint reports 0 errors and the 1 pre-existing warning (`pages/rhu/RHUAddHealthRecords.jsx`), and the vite build succeeds.
- Backend: not re-run for the FBS/panel change (backend unchanged in that task). Pre-existing failures are listed below.

### Open risks
- Migrations NOT yet run on Supabase: `2026_09_30_000001_drop_care_pathway_tables`, `2026_09_30_000002_create_condition_monitoring_tables`, and `2026_09_30_000003_allow_shared_follow_up_fulfilment` (an index swap). The app expects all three.
- The admin Health Records list (stored function `akay_health_record_list`) filters TB by category only, so it does not match the by-data TB detection used elsewhere.
- Old in-progress drafts that had the HFMD surveillance tick lose it; the worker re-ticks Include in Surveillance.
- The "Start Postpartum Follow-up" CTA on Care & Programs (`focus=deliveryDate`) leads to a consultation that cannot record a delivery date. Product decision needed: restore the delivery date on the Maternal step, or retire the CTA.
- None of the new UI (Care Plan, Monitoring Details, Start Consultation modal, Barangay Health Services panel, FBS, Surveillance checkbox and report) has been exercised in a browser by the implementers. Manual QA is needed.
- The pre-existing 194 backend test failures remain (mostly 403 / permission setup in tests).
- Repository has not yet been fully audited.
- Existing `docs/` files may conflict with current implementation.
- Security controls are present but have not yet received an end-to-end audit.

### Next action
Manual QA of the new Care Plan, monitoring, Start Consultation, Barangay Health Services, FBS and surveillance screens in a browser. Decide the open items above (postpartum CTA, admin TB list). Then run the three pending migrations on Supabase and investigate the pre-existing backend test failures.
