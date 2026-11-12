# Remove DS-TB Form 4B Registration Implementation Plan

> **For agentic workers:** Execute inline in this session. No commit/push. User approved cleanup scope in the task prompt.

**Goal:** Remove discontinued Form 4B **CREATE** registration from RHU Health Record Details and exclusive backend/frontend dependencies while preserving existing TB cases, assessment, monitoring, follow-ups, referrals, and prescriptions.

**Architecture:** Delete POST `/tb-registration` and registration UI. Replace GET preview with a read-only linked-case lookup. Keep `TbTreatmentCase` read/ops APIs, card PDF for existing cases, and shared card form in read-only/dots/encode modes.

**Tech Stack:** Laravel PHPUnit, React/Vite, node:test.

## Global Constraints

- Branch `Eric-Manually-Fixer` only; no commit/push/merge/deploy.
- No production DB drops or destructive migration rewrites.
- No new TB treatment activation workflow.
- Preserve historical cases and `tb_form4b_ref` prescriptions.

## Decisions

| Item | Verdict |
|------|---------|
| Register CTA + modal + POST create | DELETE |
| GET eligibility/preview registration payload | DELETE |
| Linked case read for source health record | REFACTOR (new slim GET) |
| Monitoring / follow-up / endorsements / DR referral | KEEP |
| TbTreatmentCardForm read-only / dots / encode | KEEP; strip registration modes |
| TbCaseNumberAllocator + registration request | DELETE |
| `authorizeRead` from registration service | REFACTOR → TbCaseAccessService |
| Assessment `openTreatmentCard` field | KEEP for API compat; remove dead FE gate helpers if unused |
| DB tables / historical rows | KEEP |

## Tasks

1. Backend: move RHU source authorize; add linked-case GET; remove registration CREATE stack; update middleware/routes/tests.
2. Frontend: view-only case panel; remove registration service helpers/UI/copy; trim utils/tests.
3. Verify focused PHPUnit + frontend tests + build; dead-code audit.
