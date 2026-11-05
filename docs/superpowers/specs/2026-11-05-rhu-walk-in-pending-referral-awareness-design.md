# RHU Walk-in Check-in pending referral awareness — Design

Status: approved for planning (GOAL / CONTEXT / OUTPUT from Eric, 2026-11-05).

## Intent

When Walk-in Check-in selects a patient who has a **Pending** referral to this RHU, guide staff to Incoming Referrals arrival verification instead of creating a walk-in visit. Do not change referral statuses from this page.

## Behavior

| Condition | Check-in Details |
|-----------|------------------|
| Active visit | Already Checked In (unchanged) |
| ≥1 Pending referral to this RHU | Notice **Pending BHC Referral** + referring BHC(s); primary action **View Incoming Referral** (not Confirm Check-in) |
| Multiple Pending | List each (tracking ID + BHC); do not pick one silently; each links to `/rhu/referrals/:trackingId` |
| None of the above | Normal Confirm Check-in |

Received / Completed / closed referrals do not block future walk-ins. Patients remain searchable.

## Backend (minimal)

`GET /api/rhu-visits/patients/{patient}/pending-referrals`  
- Scope: same RHU facility as walk-in desk; patient must be walk-in-eligible.  
- Filter: `status = Pending` for this RHU only.  
- Permission: `patients.register` **or** `rhu.intake` **or** `rhu.manage` (register desk can see the notice; intake can open details).  
- Payload: `{ count, referrals: [{ referral_id, tracking_id, status, sending_bhc, referred_at }] }` via `ReferralArrivalSummary` subset — no clinical fields.

## UI

Keep two-panel layout. Compact info notice in Check-in Details; status-dot style consistent with Ready / Already Checked In. Primary CTA becomes a Link/Button to referral workspace.

## Non-goals

Status transitions, QR/manual receive logic, new queue, Today's Queue redesign, clinical history expansion.
