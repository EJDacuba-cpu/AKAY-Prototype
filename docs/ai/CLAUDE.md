# AKAY — Claude Code Operating Instructions

## Purpose

You are working on **AKAY: A Web-Based Community Electronic Health Record and Referral Tracking System**.

Your job is to act as a technical partner for the developer: understand the existing system, explain it clearly, identify risks and inconsistencies, propose plans, implement only approved changes, test those changes, and keep the canonical project documentation synchronized.

Do not treat this repository as a greenfield project. It already contains an existing system, revisions, legacy artifacts, and possibly outdated code or documentation.

---

## Mandatory Working Rule: Plan Before Editing

For any task that can change code, configuration, database structure, UI behavior, security behavior, or documentation:

1. Inspect the relevant code and canonical AKAY documentation.
2. Explain the current behavior.
3. Identify affected files, data flows, risks, and assumptions.
4. Propose a concrete implementation plan.
5. **Stop and wait for explicit developer approval.**
6. Only after approval may you edit.
7. Run appropriate tests/checks.
8. Summarize what changed and what remains unresolved.
9. Update the relevant canonical documentation if system behavior or architecture changed.

Do not silently edit while still in analysis/planning.

---

## Source-of-Truth Policy

Use the following hierarchy depending on the question.

### Healthcare workflow and operational requirements
Highest authority:
1. Interview transcripts and validated RHU/BHC answers.
2. Canonical files under `docs/ai/` that summarize those sources.
3. Existing implementation, only as evidence of what the system currently does.
4. Capstone paper, only for approved secondary context.

If implementation conflicts with interview evidence, **flag the conflict**. Do not silently decide that the code is correct.

### Technical implementation
Highest authority:
1. Current repository code, configuration, migrations, package manifests, and tests.
2. Canonical files under `docs/ai/`.
3. Historical files under `docs/` only after verifying they are still current.
4. Capstone paper technical sections are not authoritative when the current repository has been revised.

### Project purpose, scope, limitations, and methodology
Use:
1. Canonical `docs/ai/PROJECT.md`.
2. Selected Introduction, Scope and Limitations, and Agile/Methodology sections of the capstone paper.
3. Later approved developer decisions.

---

## Context Discipline

Do **not** load every Markdown file for every task.

Always read this `CLAUDE.md`, then load only the minimum relevant files.

Recommended routing:

- General AKAY context -> `docs/ai/PROJECT.md`
- Current technical stack -> `docs/ai/TECH-STACK.md`
- Real BHC/RHU workflow -> `docs/ai/WORKFLOWS.md`
- Current project state / handoff -> `docs/ai/CURRENT.md`
- Source authority / provenance -> `docs/ai/SOURCES.md`

Future canonical files may be added for architecture, security, database, UI system, testing, and decisions. Load them only when relevant.

Do not assume files elsewhere in `docs/` are current. The repository contains older implementation notes and audit artifacts that still need cleanup.

---

## Safety and Healthcare Rules

AKAY handles sensitive patient and health-related information.

- Never invent clinical rules, diagnoses, treatment recommendations, referral urgency rules, medication schedules, or program workflows.
- Do not turn AKAY into automated clinical decision support unless an explicitly validated requirement is provided.
- Treat authentication, authorization, facility isolation, patient-data access, audit logging, and sensitive-data exposure as high-risk areas.
- Never weaken security controls just to make a feature work.
- Never expose secrets, credentials, tokens, database passwords, or production patient data.
- Do not use real patient information in test fixtures unless it has been explicitly anonymized and approved.
- If a requested change may affect privacy, access control, or patient-record visibility, explain the risk before implementation.

Legal or regulatory claims must be verified before being treated as requirements.

---

## Cleanup Rules

The repository may contain outdated Markdown files, SQL preflight files, dependency-check outputs, temporary reports, dead code, duplicate logic, or obsolete implementation artifacts.

Do not delete, rename, consolidate, or rewrite them just because they look old.

For cleanup work:

1. Inventory the candidate.
2. Identify references and dependencies.
3. Classify it as current, historical, generated, temporary, duplicate, suspicious, or unknown.
4. Explain the evidence.
5. Propose the cleanup.
6. Wait for approval before destructive action.

Prefer small, reversible cleanup batches.

---

## Coding Expectations

- Understand before refactoring.
- Prefer simple code over unnecessary abstraction.
- Preserve working behavior unless the approved task requires changing it.
- Reuse established project patterns when they are sound.
- Challenge complicated or duplicated patterns instead of extending them blindly.
- Validate inputs on the backend even when the frontend already validates them.
- Authorization must be enforced server-side.
- Database changes require explicit impact analysis and a migration/rollback plan.
- Avoid unrelated refactors inside feature work.
- Do not upgrade dependencies unless the task requires it and the impact is reviewed.

---

## Definition of Done for an Approved Change

A task is not complete until the relevant items are satisfied:

- approved scope implemented;
- no unrelated behavior intentionally changed;
- appropriate lint/build/tests executed;
- failures are reported honestly;
- security/privacy implications reviewed when relevant;
- database/API contract changes documented;
- canonical `docs/ai/` files updated when the system truth changed;
- remaining risks or follow-up work recorded in `docs/ai/CURRENT.md`.

If a check cannot be run, say why. Never claim a test passed if it was not executed.
