# AKAY Project Context

## Project Identity

**AKAY** is a web-based community electronic health record and referral tracking system for the referral relationship between Barangay Health Centers (BHCs) and Rural Health Unit (RHU) Bulakan, Bulacan.

The central project goal is to **digitize and improve the current paper-based healthcare referral process**, while supporting the patient-record and coordination workflows needed around that referral process.

This document describes the intended identity and boundaries of AKAY. It is not a complete architecture specification.

---

## Why AKAY Exists

The current BHC-to-RHU referral process is primarily paper-based.

Interview evidence confirms that a BHC prepares a referral form, records patient vital signs and an assessment, and gives the paper referral to the patient to carry to the RHU. Paper referrals can be misplaced or become dirty and difficult to read. BHC staff also do not consistently receive timely feedback about what happened after the patient reached the RHU.

AKAY exists to reduce those coordination and documentation gaps by moving the referral process into a shared digital system.

### Core problem areas supported by source evidence

- Paper referral slips can be lost or damaged.
- Referral information is physically carried by the patient.
- BHC staff have limited visibility after a patient leaves for the RHU.
- RHU feedback to the BHC is inconsistent.
- BHC staff want better referral tracking and feedback visibility.
- Referral reporting is currently a recurring operational need.
- Existing health-record work contains manual and duplicated record-keeping.

---

## Primary Users

The current project model uses three main user groups:

### Barangay Health Worker / BHC user

Expected responsibilities include:

- working with patient records relevant to the BHC;
- recording BHC encounters according to approved workflow;
- creating and sending referrals to the RHU;
- monitoring referral progress;
- receiving RHU feedback;
- performing follow-up where applicable;
- viewing information that supports referral coordination.

### RHU Staff

Expected responsibilities include:

- receiving and processing referrals;
- accessing the patient/referral information they are authorized to see;
- recording RHU-side clinical/operational continuation;
- updating referral progress;
- providing referral outcome/feedback;
- managing RHU-side operational information where authorized.

The exact RHU permissions must be derived from the current code and validated requirements. Do not assume every RHU staff member has identical clinical authority.

### Municipal Health Officer / Administrator

The project currently models an administrator role associated with system administration, account/facility management, oversight, and auditability.

Administrative access does **not** automatically imply unrestricted clinical-data access. The current authorization implementation must be audited before this is treated as settled.

---

## Real-World Workflow Principle

AKAY should digitize the **actual current process**, not an imagined ideal process.

When designing or changing workflows:

1. start with interview/transcript evidence;
2. distinguish current practice from proposed digital improvement;
3. do not invent missing clinical or operational rules;
4. when source evidence is weak or contradictory, flag it for validation.

Example: the RHU follow-up answers describe the common service flow as:

`Interview -> Vital Signs -> Consult -> Meds`

However, this is a high-level description and does not justify inventing detailed program-specific clinical workflows.

---

## Referral Context

Confirmed operational evidence includes:

- BHC refers patients to RHU when the BHC cannot handle the case.
- BHC records vital signs and an assessment on the referral form.
- The patient currently carries the paper referral to the RHU.
- RHU generally expects patients to come through the health center/referral process, while interview evidence also indicates that exceptions can occur depending on the situation.
- RHU is described as a non-emergent facility; hospital-level emergencies are outside its role.
- Internal clinical prioritization may still occur at the RHU for certain cases.
- BHC staff value real-time referral status visibility, RHU feedback, and awareness of RHU crowding/volume.
- No-show visibility is useful because some patients do not proceed to the RHU immediately after referral.

See `WORKFLOWS.md` for the source-grounded workflow summary.

---

## Scope

The capstone paper is retained as a **secondary source** for project scope and limitations because the implementation has undergone revisions.

The broad intended scope is:

- community-level patient and health-record support;
- BHC-to-RHU digital referral coordination;
- referral tracking and feedback;
- role-aware access;
- operational modules that directly support the referral/health-record workflow;
- reporting and auditability.

The system is intended for the Bulakan, Bulacan BHC/RHU context described by the project sources.

---

## Important Boundaries

The following come from the project scope/limitations and should remain in force unless the developer explicitly approves a revision:

- AKAY is not an automated diagnosis system.
- AKAY is not a treatment-recommendation engine.
- Clinical decisions remain the responsibility of qualified health professionals.
- The project is focused on the BHC/RHU workflow and is not automatically a referral platform for district or tertiary hospitals.
- Financial transactions, payroll, and PhilHealth billing are outside the stated project purpose.
- The system is web-based and its current design assumes network availability; offline behavior must not be invented.

Any boundary that conflicts with a later validated requirement or approved system revision must be raised explicitly.

---

## Development Approach

The capstone uses an Agile/Scrum approach: iterative development, small increments, review, feedback, and refinement.

For the current stabilization phase, use that principle pragmatically:

- work in small reviewable batches;
- plan before implementation;
- avoid giant refactors;
- test after each approved batch;
- document decisions and current state;
- keep the system usable while it is being improved.

---

## Current Development Goal

The immediate project direction is not a rewrite.

The existing system should be:

1. understood;
2. documented;
3. cleaned up carefully;
4. made visually consistent;
5. simplified where unnecessary complexity exists;
6. checked for stale/dead code and outdated documentation;
7. audited for backend/data-flow quality;
8. hardened for security and privacy;
9. stabilized with tests.

New features should be added only through the same inspect -> plan -> approve -> implement -> test -> document workflow.

---

## Canonical Knowledge Policy

This file is canonical project context for AI agents.

Do not use old files under `docs/` as authoritative without verification. They may contain useful history, but the repository still requires a documentation cleanup.

When this project definition changes through an approved decision, update this file.
