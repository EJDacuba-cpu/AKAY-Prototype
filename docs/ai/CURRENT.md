# AKAY Current State / Handoff

**Status date:** 2026-09-26

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
_Not started_

### Changes made
_None yet_

### Tests/checks run
_None yet_

### Open risks
- Repository has not yet been fully audited.
- Existing `docs/` files may conflict with current implementation.
- Dead/outdated code has not yet been identified systematically.
- Security controls are present but have not yet received an end-to-end audit.

### Next action
Run the read-only repository audit after developer approval.
