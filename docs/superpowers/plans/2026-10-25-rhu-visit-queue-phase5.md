# RHU Visit Queue — Phase 5 (Start/Resume, Close, Permissions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** RHU staff can close a waiting visit with an audited reason, and start or resume one consultation identity per visit, with encode/finalize/correct grantable at RHU and Locked intake nav for staff without the intake duty.

**Architecture:** One additive migration on `rhu_visit_queue_entries`. `RhuVisitQueueService` gains `close`, `start`, `resume` with row locks. Thin controller actions. Queue ⋯ menu and a close-reason modal. Permission catalog gains grantable RHU clinical keys plus `rhu.intake`. No drafts, no legacy editor, no BHC workspace change.

**Tech Stack:** Laravel 13 / PHP 8.5 / PHPUnit 12 (SQLite); React + Vite, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-25-rhu-visit-queue-phase5-start-close-permissions-design.md` (P5-1..P5-15); parent D8, D10, D13, D14, O1, O5.

## Global Constraints

- Additive schema only. Never run migrations or tests against Supabase.
- Do not call `HealthRecordDraftService`. Do not open `RHUAddHealthRecords.jsx`. Do not flip `DRAFTS_ENABLED`.
- Do not add `items.dispense` to RHU. Do not put encode/finalize/correct/intake in `RHU_DEFAULTS`.
- Do not move referral/feedback APIs off `rhu.manage`.
- Backend: `php artisan test --filter=<Name>` from `backend/`. Frontend: `node --test` from `frontend/`.
- Commit only when the user asks.

## File Structure

| File | Change |
|---|---|
| `backend/database/migrations/2026_10_25_000003_add_close_and_consultation_to_rhu_visit_queue_entries.php` | new columns + partial unique uuid |
| `backend/app/Models/RhuVisitQueueEntry.php` | status constants, fillable, `closedBy()` |
| `backend/app/Exceptions/RhuVisitStateException.php` | 409 with named `code` |
| `backend/app/Services/RhuVisitQueueService.php` | `close`, `start`, `resume` |
| `backend/app/Http/Controllers/Api/RhuVisitController.php` | close/start/resume + present fields |
| `backend/routes/api.php` | three POST routes |
| `backend/app/Http/Middleware/EnforceActionPermissions.php` | start/resume → encode |
| `backend/app/Services/StaffRoles.php`, `ActionPermissions.php` | grantable keys + `rhu.intake` |
| `backend/tests/Feature/RhuVisitCloseTest.php`, `RhuVisitStartTest.php` | new |
| `backend/tests/Feature/StaffRoleAccountTest.php`, `RhuVisitQueueMigrationTest.php` | update |
| `frontend/src/utils/rhuQueueView.js` (+ test) | chips, `queueRowActions` |
| `frontend/src/services/rhuVisitService.js` | close/start/resume |
| `frontend/src/components/features/rhu-queue/*` | menu + close modal |
| `frontend/src/utils/actionPermissions.js`, `dashboardAccess.js`, `accessModules.js` | catalog + lock |
| `frontend/src/App.jsx` | intake module on Incoming Referrals / QR Scanner |

## Tasks

1. Migration, model, `RhuVisitStateException`.
2. Service close/start/resume + controller/routes/middleware.
3. Grantable permissions and `rhu.intake` catalog (backend + frontend).
4. Queue UI: actions util, close modal, Start/Resume (no editor navigation).
5. Locked intake nav bridge (`rhu.intake` or `rhu.manage`).
6. Tests listed in the spec; BHC draft 403 regression; grep guards.
