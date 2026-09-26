# AKAY Sources and Authority

## Purpose

This file tells AI agents **which evidence to trust for which type of decision**.

Not every existing document in the repository is authoritative.

---

## Primary Operational Sources

These are the preferred sources for real BHC/RHU workflow and user needs.

### `Barangay Pitpitan Health Center Transcript.pdf`

Use for:

- BHC referral process;
- paper referral handling;
- BHC-recorded vital signs and assessment;
- referral form problems;
- referral tracking/feedback needs;
- RHU crowding visibility need;
- referral reporting needs;
- no-show/follow-through context.

Authority: **Primary workflow evidence**

### `rural health unit bulakan Transcript.pdf`

Use for:

- RHU referral expectations;
- walk-in/direct-patient exceptions;
- RHU prioritization context;
- RHU logbook/digital-record practices at interview time;
- doctor availability context;
- follow-up existence.

Authority: **Primary workflow evidence**

### `RHU-Interview-Answers.pdf`

Use for:

- RHU patient registration fields;
- consultation information;
- RHU services/programs;
- current record-keeping responses;
- provider availability;
- medicine inventory;
- BHC/RHU medication-coordination responses.

Authority: **Primary structured RHU evidence**

### `Follow-Up-Answers.pdf`

Use for:

- general service flow;
- follow-up timing and monitoring;
- ITR / iClinicSys / logbook relationship;
- reporting needs;
- medicine inventory details;
- doctor schedule/specialization follow-up;
- clarification that RHU is non-emergent.

Authority: **Primary structured follow-up evidence**

---

## Secondary Project Source

### `AKAY (1).pdf`

Use selectively for:

- Introduction / project context;
- broad purpose;
- Scope and Limitations;
- Agile/Scrum methodology;
- historical project rationale.

Do **not** automatically use it as authority for:

- current framework/library versions;
- current backend architecture;
- current database/authentication implementation;
- current route behavior;
- revised workflows that have changed since the paper was written.

Authority: **Secondary project context**

The codebase has undergone revisions, so technical claims in the paper must be checked against the repository.

---

## Technical Source of Truth

Repository files are authoritative for **what the current software actually contains**, including:

- `frontend/package.json`
- `backend/composer.json`
- backend configuration
- routes
- controllers/services/models/policies/middleware
- migrations/schema
- frontend components/hooks/services
- tests
- deployment configuration

Important distinction:

> Code is authoritative for current implementation, but not automatically authoritative for business correctness.

Vibe-coded or legacy behavior may exist. If code conflicts with primary interview evidence, surface the conflict.

---

## Existing Repository Documentation

Files currently under `docs/` should be treated as **unverified historical/project artifacts until audited**.

They may contain:

- old implementation plans;
- prior fixes;
- temporary audit findings;
- preflight SQL;
- deprecated architecture assumptions;
- completed remediation notes.

Do not delete or trust them blindly.

Canonical AI-facing documentation belongs under:

`docs/ai/`

---

## Conflict Handling

When sources disagree:

1. State the conflict explicitly.
2. Identify the source on each side.
3. Separate:
   - confirmed fact;
   - current implementation;
   - historical statement;
   - inference;
   - recommendation;
   - unknown.
4. Do not silently reconcile contradictory requirements.
5. Ask the developer for a decision when the conflict affects behavior.

---

## Updating This File

Add a source only when its authority and intended use are known.

Do not promote a generated AI summary into a primary source.
