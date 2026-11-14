# Service Manage to BHC + Accept-Only Monitoring Requests

Status: **approved for implementation** (2026-11-14). Locked with product owner during brainstorming.

## Intent

Extend RHU Selected Health Services (Maternal Care, EPI, Family Planning, Nutrition) with one additional Next Action: **Manage to BHC**. Reuse the existing Monitoring Request lifecycle. Do not treat programs as Active/Controlled diseases. Remove BHC **Decline** for all monitoring handoffs (Accept only).

## Locked decisions

1. **Data model (Approach A):** Same `monitoring_handoff_requests` table. Make `patient_condition_id` nullable. Add `handoff_kind` (`condition` | `service`) and `service_key` (`Maternal` | `EPI` | `Family Planning` | `Nutrition`). No fake `PatientCondition` rows.
2. **Decline:** Removed for **all** Monitoring Requests (condition + service). Historical `declined` / `redirected` rows stay readable. New redirects remain disabled.
3. **BHC actions:** **Accept only** (+ existing identity verify / link / register). No Decline UI or create path for new declines.
4. **After Accept:** Start Consultation opens the existing BHC Consultation workspace with the **service pre-selected**. Accept alone does not complete a consultation or set `monitoring_active`.
5. **Eligibility (soft gate):** Manage to BHC is always selectable when the service is selected. Finalize requires catchment receiving BHC + non-empty monitoring recommendation; service continuity uses existing program models (no duplicate maternal/EPI/FP/Nutrition enrollment). Clear validation errors when required clinical continuity data is missing.
6. **Payload:** Diagnosis `manage_to_bhc` stays on `diagnoses[].nextAction`. Services use `care_plan.service_handoffs[]` / draft `carePlan.serviceHandoffs[]` — never confuse with diagnosis handoffs. Do not set visit-level `care_plan.manage_to_bhc` for service-only handoffs.
7. **No commits/pushes** in this implementation pass (per task constraints).

## RHU UI

- Under each selected service on RHU: keep **No additional action** and **Schedule next visit**; add **Manage to BHC** (exact label). Do not show Refer to RHU on RHU (`hideReferToRhu`).
- When Manage to BHC is selected: show receiving BHC select + monitoring recommendation (same patterns as diagnosis cards). Clear handoff fields when switching away; prune when service is deselected.
- Independent state per service; multiple services in one consult may each Manage to BHC.

## Backend finalize

- Validate `care_plan.service_handoffs` on RHU ITR finalize.
- `MonitoringHandoffService::createFromFinalize` (or sibling) creates service handoffs when BHC + recommendation valid; idempotent on patient + service_key + receiving BHC + open statuses.
- Referral-return visits: reuse original BHC patient identity; complete original referral with RHU outcome when service handoffs close the return (same spirit as diagnosis Manage to BHC).
- Walk-in: existing identity linkage statuses (`linkage_needed` vs `pending_review`).

## BHC inbox / details

- Present `handoff_kind`, `service_key` / service label, originating RHU, patient identity, recommendation (after verify).
- Remove Decline button, reason field, and decline API usage from product UI. Decline endpoint returns 410/403 or is removed from routes with tests updated.
- `startPath` for service handoffs: patient + `selectedPrograms` (+ optional `handoffId`); not `startConditionIds`.
- Mark `monitoring_active` when BHC finalizes a consultation that includes the handoff’s `service_key` for the linked patient (analogous to `start_monitoring_condition_ids` for conditions).

## Draft compatibility

- Allowlist `carePlan.serviceHandoffs` in draft schema; legacy drafts without it remain readable (default none).
- Switching action / deselecting service prunes stale handoff rows from draft payload.
- Failed finalize / retry must not duplicate open Monitoring Requests.

## Out of scope

- Parallel handoff tables or fake disease rows
- New Redirect creation
- Changing unrelated modules or design system
- Production DB ops, commits, pushes, merges, deployments
