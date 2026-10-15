# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are staff at two kinds of facility in one municipality's health system:

- **Barangay Health Center (BHC) staff**: barangay health workers (BHW), midwives, nurses, and encoders. They register households and patients, run consultations, record Health Concerns, make referrals, and do follow-ups across 14 barangays.
- **Rural Health Unit (RHU) clinicians and staff**: doctors and RHU staff. They receive referrals, assess and confirm conditions, return feedback, and manage medicine inventory and doctor schedules.

Secondary users are the Municipal Health Office (MHO) and admins, who use the dashboard, reports, accounts, facilities, and audit logs.

Staff work mostly at a desktop or laptop inside their facility, sometimes on an unreliable connection. Tablet and phone must remain usable when needed, but are not the primary device.

## Product Purpose

AKAY is a BHC-RHU electronic health record and referral system. It replaces paper records and ad-hoc referral slips with one shared patient record, a referral flow between barangay and municipal facilities, and the reports the MHO needs for surveillance and program monitoring. Success means a BHC worker can record a visit and refer a patient quickly, the RHU can act on the referral with full context, and the patient's history stays trustworthy across both facilities.

## Positioning

AKAY is built around the real BHC-to-RHU clinical boundary: BHC detects and refers, RHU confirms, and only then does BHC monitor. A generic EHR does not encode that split, and it does not take households and related families as the unit of registration.

## Operating Context

- The care workflow is BHC detects and refers, RHU assesses and confirms, AKAY activates the condition, and BHC may then monitor it.
- Patients are registered under households, and households can be linked as related families.
- Referrals carry a printable slip with a QR code; the RHU has a QR scanner for incoming referrals.
- Consultations run as a multi-step workspace with saved drafts. An open consultation is protected against connection loss, but new consultations and server-backed modules do not work offline.
- Programs include maternal care (with episode tracking), family planning, and general consultation. Demographics include PhilHealth and NHTS status.
- Accounts are provisioned by an admin through invite links, with five staff roles (midwife, bhw, encoder, nurse, doctor) and three account roles (`admin`, `bhc`, `rhu`).

## Capabilities and Constraints

- AKAY is not a diagnosis or treatment-recommendation system. Clinical fields are manual text with no suggestions. BHWs record Health Concerns and a next action; they never diagnose.
- Only authorized RHU staff set a condition's status (Under Evaluation, Active, Controlled, Resolved, Ruled Out). Legacy records stay labeled "Unverified" or "Legacy BHC Monitoring" and never get invented provenance.
- Saved health records are immutable. There is no edit feature; a correction is a new or follow-up record.
- The Patient Background tab is read-only; clinical changes happen only through a finalized consultation. Family relationships are identity data and may save directly.
- Role and facility decide access. Locked modules stay visible with a lock indicator and show a "No access" state or placeholder, never blurred real data.
- All UI copy, labels, and code are in English.
- Stack: React (Vite) frontend, Laravel backend, PostgreSQL in production.
- Undecided: whether a trusted role (for example an encoder) may be delegated to create accounts; Locked UI is the next planned access work.

## Brand Commitments

- Name: AKAY, with the red wordmark and logo mark ("Medical EHR and Referral System", Bulakan, Bulacan).
- Standing visual preference (confirmed 2026-10-16): a modern medical SaaS that combines clinical SaaS (Healthie, Elation, Canvas Medical) with modern productivity tools (Linear, Notion, Vercel). Their craft level is the bar.
- Red stays the brand color but is used sparingly; it no longer carries most of the interface.
- The previous flat, square, dense "EHR minimalism" look is being replaced. The user found it boxy, too dense, too red, and dated.

## Evidence on Hand

- Design and workflow specs in `docs/superpowers/specs/` and plans in `docs/superpowers/plans/`.
- Operations and security notes in `docs/` (authentication, deployment, production security).
- Reference material from the project documents, including `AKAY (1).pdf`, which describes the 14-barangay BHC-RHU scope.
- No real patient data, usage metrics, or user testimonials exist yet. Future work must not fabricate any.

## Product Principles

1. **Record, don't decide.** The system captures what a trained person observed or confirmed. It never suggests a diagnosis or treatment.
2. **Trust over speed of edit.** Saved clinical history is permanent and attributable, so the interface makes the moment of saving deliberate and corrections explicit.
3. **Clear authority at every step.** Who may act, at which facility, and in what role is always visible, and what a user cannot do is shown plainly instead of hidden.
4. **Built for the busy health center.** Dense, scannable, task-first screens for repeated daily work, with calm handling of slow or lost connections.
5. **Households first.** People are understood in their household and family context, not as isolated rows.

## Accessibility & Inclusion

Staff vary in digital confidence and may work long shifts on shared facility computers. Plain English labels, clear error and loading states, and legible dense data matter more than novelty. Target WCAG 2.1 AA for contrast, keyboard operation, and focus visibility.
