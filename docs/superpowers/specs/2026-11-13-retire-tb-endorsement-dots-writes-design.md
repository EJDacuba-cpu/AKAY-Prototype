# Retire TB Endorsement Create + DOTS Writes (Option A)

**Date:** 2026-11-13  
**Branch:** Eric-Manually-Fixer  
**Status:** Approved

## Decision

- New TB monitoring uses `manage_to_bhc` / `MonitoringHandoffService` only.
- **Retire:** `POST /tb-cases/{id}/endorsements` (create), `POST|PATCH .../monitoring` (DOTS writes).
- **Preserve resolution:** `POST /tb-endorsements/{id}/{link|accept|decline|revoke}` for unresolved historical rows.
- **Preserve reads:** cases, PDF, endorsement list/detail, monitoring GET (history).
- After accept, `can_write` stays **false** (DOTS retired).
- No cross-facility dispense; BHC meds via local consultation inventory.
- RHU Rx → RHU To Dispense; handoff Rx informational only.

## Pending endorsements

In-flight `linkage_needed` / `pending_review` remain actionable via link/accept/decline (and RHU revoke). No silent stranding. New creates blocked.
