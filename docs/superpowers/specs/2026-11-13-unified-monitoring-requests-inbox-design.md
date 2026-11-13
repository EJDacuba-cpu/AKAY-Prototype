# Unified BHC Monitoring Requests Inbox (Option A)

**Date:** 2026-11-13  
**Branch:** Eric-Manually-Fixer  
**Status:** Approved — Option A (unified inbox, dual backends)

## Goal

One BHC **Monitoring Requests** interface. No General Monitoring / TB Endorsements tabs. Handoffs and TB endorsements appear in one list; each row opens its existing review workflow.

## Non-goals

- Option C: do not change `TbMonitoringService` authorization.
- Do not merge or delete backend services, tables, or historical rows.
- No database migrations.
- Do not auto-duplicate or merge patient records.

## Design

### Inbox

- Client merges `GET /monitoring-handoff-requests` and `GET /tb-endorsements` (first page, larger `per_page` for inbox).
- Rows normalized via `pendingHandoffInbox` adapter (`kind`, labels, status, sort key).
- Table columns: Patient / Condition (or case), Request type, Status.
- TB rows only when user has `clinical.history`.

### Navigation

| Action | Destination |
|--------|-------------|
| Open handoff | `/bhc/patients/monitoring-requests/:id` (`MonitoringHandoffReview`) |
| Open TB endorsement | Query params `endorsement` (+ keep `view=monitoring-requests`); render `BhcTbEndorsements` review |
| Legacy `/bhc/patients/tb-endorsements` | Redirect → `?view=monitoring-requests` (unified list) |
| Deep link `tab=tb-endorsements` / `case` / `endorsement` | Compatibility: show existing TB review UI without tab chrome |

### Backends

Unchanged: `MonitoringHandoffService`, `TbCaseEndorsementService`, `TbMonitoringService`.
