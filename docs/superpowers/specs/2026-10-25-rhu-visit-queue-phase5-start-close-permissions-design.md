# RHU Visit Queue — Phase 5: Start/Resume, Close Visit, Permissions — Design

Date: 2026-10-25 · Status: awaiting spec review
Parent spec: `docs/superpowers/specs/2026-10-24-rhu-visit-queue-design.md` (D8, D10, D13, D14, O1, O5)
Builds on: Phase 1–4 queue service, read/write APIs, and RHU Patients UI

## Goal

RHU staff can close a waiting visit with an audited reason, and start or resume exactly one
consultation identity on a queue visit, without assigning a doctor, creating a health-record
draft, or opening the legacy RHU editor. Encode / finalize / correct become grantable at RHU
(not defaulted). Incoming Referrals and QR Scanner lock for staff without the intake duty.

## Findings that shape this phase

1. Close today is only a direct `closed_at` write in tests. There is no close API, reason, or audit.
2. The visit table has no consultation identity. Drafts are BHC-only (`ensureBhc`, `role:bhc`).
3. `StaffRoles::AVAILABLE[rhu]` rejects `consultations.encode`, so Start cannot be granted per user (O1).
4. Incoming Referrals and QR Scanner lock on `clinical.history`. Default nurse/doctor have
   `rhu.manage`, which still owns the intake APIs (O5 unresolved).
5. `DRAFTS_ENABLED` is false. Flipping it would change BHC behaviour. Phase 5 must not.

## Decisions

| # | Decision |
|---|---|
| P5-1 | Close only while `status = waiting` and `closed_at IS NULL`. Reasons: `left_before_consultation`, `checked_in_by_mistake`, `other`. `other` requires a trimmed note (max 500). Other reasons may send a note; it is stored if non-empty. |
| P5-2 | Close sets `closed_at = now()`, `closed_by`, `close_reason`, `close_note`, and `status = closed`. It never writes referrals, patients, drafts or health records (D13). |
| P5-3 | Close duty is **provisional**: `patients.register` (same queue-desk duty as walk-in check-in). Not in the parent spec; do not treat as MHO-confirmed. |
| P5-4 | `POST /api/rhu-visits/{id}/close` `{reason, note?}`. 200 with the visit payload. 409 `VISIT_NOT_WAITING` if not waiting/active. Other RHU → 404. BHC/admin → 403. Audit `action=visit_closed`, `module=rhu_visit_queue` in the same transaction. |
| P5-5 | Start mints one `consultation_uuid` on the visit, sets `status = in_consultation`, assigns no doctor, creates no draft. Second Start on the same visit is Resume (idempotent, same uuid). Concurrent Starts lock the row; the loser reads the winner. |
| P5-6 | Resume requires `in_consultation` and a uuid; otherwise 409 `VISIT_NOT_IN_CONSULTATION`. Closed Start → 409 `VISIT_CLOSED`. |
| P5-7 | `POST /api/rhu-visits/{id}/start` and `.../resume`. Duty: `consultations.encode`. No navigation to `/rhu/health-records/add`. Phase 6 opens the shared workspace from these actions. |
| P5-8 | Additive visit columns only: `closed_by`, `close_reason`, `close_note`, `consultation_uuid`. Partial unique index on `consultation_uuid` where it is not null. No `health_record_drafts` change. |
| P5-9 | List/show payload gains `consultation_uuid`, `close_reason`, `close_note`. Still no tracking/QR. |
| P5-10 | ⋯ menu (D8, no Discard yet): waiting + encode → **Start consultation**; in consultation + encode → **Resume consultation**; always **Open patient record**; waiting + register → **Close visit**. Hidden items are omitted, not disabled. |
| P5-11 | `consultations.encode`, `consultations.finalize`, `records.correct` join `AVAILABLE[rhu]`. They stay **out** of `RHU_DEFAULTS`. No staff backfill. Existing nurse/doctor accounts cannot Start until an admin grants encode (O1). |
| P5-12 | Do **not** add `items.dispense` (O2). |
| P5-13 | Catalog key `rhu.intake` is added to `ActionPermissions::ALL` and `AVAILABLE[rhu]`, not defaults. Feedback stays on `rhu.manage`. API routes are **not** moved off `rhu.manage` (O5). |
| P5-14 | Incoming Referrals and QR Scanner lock unless the user has `rhu.intake` **or** `rhu.manage` (bridge until O5). History-only staff see Locked / No access (D14) without losing today's default desk access. `/rhu/referrals/:trackingId` stays on `clinical.history`. |
| P5-15 | Visit progress: `waiting` → Waiting / info; `in_consultation` → In Consultation / info; `closed` → Closed / neutral; unknown stays title-case / neutral. |

## Out of scope (Phase 6+)

Shared draft on the visit uuid; `rural_health_unit_id` / visit FK on `health_record_drafts`;
`release_intake` handoff; submitted-intake lock (O3); RHU medicines (O2); Discard and close (D12);
finalize-closes-visit (D11); BHC feedback; opening `RHUAddHealthRecords.jsx` or
`ConsultationWorkspace.jsx`; flipping `DRAFTS_ENABLED`; moving intake APIs off `rhu.manage`.

## Tests

Backend (SQLite): close success / Other without note 422 / in-consultation 409 / other RHU 404 /
BHC+admin 403 / referral status unchanged / audit row / re-check-in after close; Start mints uuid /
second Start same uuid / Resume waiting 409 / closed Start 409 / encode missing 403 / encode
granted 200 / no assigned doctor; defaults omit encode/finalize/correct/intake; those keys are
grantable; `items.dispense` still rejected; RHU GET drafts still 403.

Frontend (`node --test`): menu visibility by status and duties; status chips; dashboardAccess for
intake lock vs `rhu.manage` bridge.

PostgreSQL concurrency remains unverified (O4).
