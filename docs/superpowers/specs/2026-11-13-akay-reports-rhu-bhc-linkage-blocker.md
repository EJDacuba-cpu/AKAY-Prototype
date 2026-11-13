# RHU→BHC Morbidity Reconciliation Blocker

**Date:** 2026-11-13  
**Branch:** `Eric-Manually-Fixer`  
**Decision:** Do not invent a workaround. Report the architectural blocker.

## Requested behavior

BHC Morbidity / Notifiable / Surveillance reports should include authorized linked RHU-confirmed outcomes for the same disease episode when identity linkage is verified, without copying RHU health records onto BHC records, without rewriting BHC `reportIn` selections, without double-counting, and without propagating to unrelated BHCs.

## What exists today

| Surface | Capability |
|---|---|
| BHC Reports data load | Facility-scoped `getAllHealthRecords("bhc")` + patients + referrals only |
| RHU confirmation storage | Lives on RHU-owned health records (`rural_health_unit_id`) and/or referral `feedback.conditionConfirmations` |
| BHC Referrals KPIs | `rhuConfirmedNames(referral)` counts confirmation **names** for Referrals category only — not folded into morbidity engines |
| Verified identity linkage | Monitoring handoff / TB endorsement `linked_patient_id` (source and destination patient IDs may differ) |
| Facility access | BHC staff cannot list arbitrary RHU health records through the existing report list APIs |

## Exact blocker

There is **no authorized, facility-scoped reporting feed** that returns RHU-confirmed diagnosis rows to a receiving BHC with all of:

1. Canonical `reportIn` destinations chosen at RHU  
2. Authoritative RHU clinical status (Under Evaluation / Active / Controlled / Resolved / Ruled Out)  
3. Stable disease-episode identity for deduplication against the BHC local checkbox row  
4. Provenance (source RHU record id, referral/handoff id, linked patient ids)  
5. Restriction to the verified receiving BHC only  

Referral feedback confirmation names are insufficient (no `reportIn`, no full status model, no episode key). Pulling RHU records client-side would violate facility isolation. Copying RHU diagnoses onto BHC records is explicitly forbidden. Silently treating referral confirmations as morbidity “confirmed” cases would invent classification.

## Safe behavior retained in this pass

- BHC local counts continue to follow saved BHC `reportIn` and existing clinical data.  
- RHU counts follow RHU-scoped records once RHU `reportIn` is saved (Task 5).  
- Referrals KPIs continue to show RHU-confirmed outcome names separately.  
- No automatic rewrite of BHC reporting selections.  
- No cross-BHC propagation.

## What would unblock a later safe implementation

A dedicated server-side reporting aggregation (or read API) that, for the authenticated BHC, returns linked RHU-confirmed reportable episodes with destinations, status, dates, and dedupe keys — without exposing unrelated facilities’ records and without writing into BHC health records.
